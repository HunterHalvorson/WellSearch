import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Minus, Plus } from 'lucide-react'
import { baseLine, meridianOffset } from './survey'

const day = 86400000
const pulseDays = 14

function quantile(sorted, share) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(share * (sorted.length - 1))))]
}

// How many of a well's events have happened by this moment; events are sorted by time.
function happened(events, time) {
  let count = 0
  while (count < events.length && events[count].t <= time) count += 1
  return count
}

function draw(canvas, { view, wells, time, hoverId, selectedId, labels }) {
  const ratio = window.devicePixelRatio || 1
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (canvas.width !== Math.round(width * ratio)) canvas.width = Math.round(width * ratio)
  if (canvas.height !== Math.round(height * ratio)) canvas.height = Math.round(height * ratio)
  const context = canvas.getContext('2d')
  const style = getComputedStyle(canvas)
  const token = (name) => style.getPropertyValue(name).trim()
  const sx = (x) => (x - view.x) * view.k + width / 2
  const sy = (y) => height / 2 - (y - view.y) * view.k
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, width, height)

  // Township grid, with the jog the real survey has at its correction lines.
  const cell = view.k * 6
  context.strokeStyle = token('--grid')
  context.fillStyle = token('--grid-text')
  const south = Math.floor((view.y - height / 2 / view.k) / 6)
  const north = Math.ceil((view.y + height / 2 / view.k) / 6)
  const left = view.x - width / 2 / view.k
  const right = view.x + width / 2 / view.k
  context.lineWidth = 1
  context.font = `500 10px ${token('--font-data')}`
  context.textBaseline = 'top'
  if (cell > 9) {
    for (let row = Math.max(0, south); row < north; row += 1) {
      for (const meridian of [4, 3]) {
        const origin = meridianOffset(meridian, baseLine(row + 1))
        const first = Math.max(1, Math.ceil((origin - right) / 6))
        // Ranges stop where the next meridian to the west begins.
        const last = Math.floor((origin - Math.max(left, meridianOffset(meridian + 1, baseLine(row + 1)))) / 6) + 1
        for (let range = first; range <= last; range += 1) {
          // Whole pixels, so neighbouring townships share one line instead of drawing two.
          const x = Math.round(sx(origin - range * 6))
          const y = Math.round(sy((row + 1) * 6))
          context.strokeRect(x + 0.5, y + 0.5, Math.round(sx(origin - range * 6 + 6)) - x, Math.round(sy(row * 6)) - y)
          if (cell > 86) context.fillText(`T${row + 1} R${range} W${meridian}`, x + 6, y + 6)
        }
      }
    }
  }

  // The 4th meridian is the provincial border.
  const border = Math.round(sx(0)) + 0.5
  if (border > 0 && border < width) {
    context.strokeStyle = token('--border-line')
    context.setLineDash([6, 6])
    context.beginPath()
    context.moveTo(border, 0)
    context.lineTo(border, height)
    context.stroke()
    context.setLineDash([])
    context.fillStyle = token('--ink-soft')
    context.font = `500 10px ${token('--font-data')}`
    context.textBaseline = 'bottom'
    context.textAlign = 'right'
    context.fillText('ALBERTA', border - 10, height - 12)
    context.textAlign = 'left'
    context.fillText('SASKATCHEWAN', border + 10, height - 12)
  }

  // Wells, each with a thin edge in the ground colour so neighbours on a crowded lease stay apart.
  const zoom = Math.min(2.4, Math.max(0.75, view.k / 9))
  const ground = token('--ground')
  let marked = null
  for (const well of wells) {
    const x = sx(well.x)
    const y = sy(well.y)
    if (x < -30 || x > width + 30 || y < -30 || y > height + 30) continue
    let { size, color } = well
    if (time != null) {
      const count = happened(well.events, time)
      size = count
      color = count ? well.events[count - 1].color : token('--idle')
      for (let index = count - 1; index >= 0 && time - well.events[index].t < pulseDays * day; index -= 1) {
        const age = (time - well.events[index].t) / (pulseDays * day)
        context.globalAlpha = 0.65 * (1 - age)
        context.strokeStyle = well.events[index].color
        context.lineWidth = 1.5
        context.beginPath()
        context.arc(x, y, (3 + 13 * age) * zoom, 0, Math.PI * 2)
        context.stroke()
      }
    }
    const radius = (size ? 1.4 + 0.9 * Math.sqrt(size) : 1.2) * zoom
    context.globalAlpha = size ? 0.92 : 0.5
    context.fillStyle = color
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fill()
    context.lineWidth = 1
    context.strokeStyle = ground
    context.stroke()
    if (well.id === hoverId || well.id === selectedId) marked = { x, y, radius }
  }
  context.globalAlpha = 1

  // Area names sit above their wells; a name that would run into one already drawn is left out.
  context.font = `600 11px ${token('--font-body')}`
  context.textAlign = 'center'
  context.textBaseline = 'bottom'
  const taken = []
  for (const { name, x, top } of labels) {
    const px = sx(x)
    const py = sy(top) - 10
    const half = context.measureText(name.toUpperCase()).width / 2 + 6
    if (px < half || px > width - half || py < 16 || py > height) continue
    if (taken.some((box) => Math.abs(box.x - px) < box.half + half && Math.abs(box.y - py) < 16)) continue
    taken.push({ x: px, y: py, half })
    context.lineWidth = 4
    context.strokeStyle = ground
    context.strokeText(name.toUpperCase(), px, py)
    context.fillStyle = token('--ink')
    context.fillText(name.toUpperCase(), px, py)
  }

  if (marked) {
    context.strokeStyle = token('--ink')
    context.lineWidth = 2
    context.beginPath()
    context.arc(marked.x, marked.y, marked.radius + 4, 0, Math.PI * 2)
    context.stroke()
  }
}

/*
  wells: [{ id, area, x, y, size, color, events? }], with x and y from locate().
  time: when set, each well shows the events that have happened by then and recent ones ring out.
  inset: screen space covered by panels, kept clear when the map frames the wells.
*/
export default function FieldMap({ wells, time, selectedId, onSelect, describe, label, inset }) {
  const canvas = useRef(null)
  const view = useRef(null)
  const drag = useRef(null)
  const [hover, setHover] = useState(null)
  const [, repaint] = useState(0)
  const { left = 0, right = 0, top = 0, bottom = 0 } = inset ?? {}

  const labels = useMemo(() => {
    const areas = new Map()
    for (const well of wells) {
      const area = areas.get(well.area) ?? { name: well.area, x: 0, top: -Infinity, count: 0 }
      area.x += well.x
      area.top = Math.max(area.top, well.y)
      area.count += 1
      areas.set(well.area, area)
    }
    return [...areas.values()].filter(({ name }) => name).sort((first, second) => second.count - first.count)
      .map((area) => ({ ...area, x: area.x / area.count }))
  }, [wells])

  // A few far-off leases would shrink the field to a dot, so the frame leaves them out when that at least doubles the scale.
  function frame(everything) {
    const element = canvas.current
    if (!element || wells.length === 0) return
    const xs = wells.map(({ x }) => x).sort((first, second) => first - second)
    const ys = wells.map(({ y }) => y).sort((first, second) => first - second)
    const box = (cut) => [quantile(xs, cut), quantile(xs, 1 - cut), quantile(ys, cut), quantile(ys, 1 - cut)]
    const all = box(0)
    const core = box(0.05)
    const far = all[1] - all[0] > 2 * (core[1] - core[0]) || all[3] - all[2] > 2 * (core[3] - core[2])
    const [x0, x1, y0, y1] = far && !everything ? core : all
    const width = Math.max(80, element.clientWidth - left - right - 72)
    const height = Math.max(80, element.clientHeight - top - bottom - 72)
    const k = Math.min(width / Math.max(x1 - x0, 3), height / Math.max(y1 - y0, 3), 60)
    view.current = { k, x: (x0 + x1) / 2 - (left - right) / 2 / k, y: (y0 + y1) / 2 - (top - bottom) / 2 / k }
    repaint((count) => count + 1)
  }

  // A new set of wells, or one narrowed to an area, gets its own framing.
  const wellKey = wells.length ? `${wells.length}:${wells[0].id}:${wells[wells.length - 1].id}` : ''
  useEffect(() => {
    frame(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wellKey])

  useEffect(() => {
    const element = canvas.current
    const observer = new ResizeObserver(() => repaint((count) => count + 1))
    observer.observe(element)
    // React registers wheel listeners as passive, and the page must not scroll while the map zooms.
    const wheel = (event) => {
      if (!view.current) return
      event.preventDefault()
      zoomAt(event.offsetX, event.offsetY, Math.exp(-event.deltaY * 0.0015))
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => {
      observer.disconnect()
      element.removeEventListener('wheel', wheel)
    }
  }, [])

  useEffect(() => {
    if (view.current) draw(canvas.current, { view: view.current, wells, time, hoverId: hover?.well.id, selectedId, labels })
  })

  function zoomAt(px, py, factor) {
    const element = canvas.current
    const current = view.current
    const k = Math.min(140, Math.max(1.2, current.k * factor))
    const worldX = (px - element.clientWidth / 2) / current.k + current.x
    const worldY = current.y - (py - element.clientHeight / 2) / current.k
    view.current = { k, x: worldX - (px - element.clientWidth / 2) / k, y: worldY + (py - element.clientHeight / 2) / k }
    repaint((count) => count + 1)
  }

  function wellAt(px, py) {
    const element = canvas.current
    const current = view.current
    let best = null
    let nearest = 14
    for (const well of wells) {
      const dx = (well.x - current.x) * current.k + element.clientWidth / 2 - px
      const dy = element.clientHeight / 2 - (well.y - current.y) * current.k - py
      const distance = Math.hypot(dx, dy)
      if (distance < nearest) {
        nearest = distance
        best = well
      }
    }
    return best
  }

  function pointerMove(event) {
    if (!view.current) return
    const { offsetX, offsetY } = event.nativeEvent
    if (drag.current) {
      const moved = Math.hypot(event.clientX - drag.current.startX, event.clientY - drag.current.startY)
      if (moved > 4) drag.current.moved = true
      view.current = {
        ...view.current,
        x: view.current.x - (event.clientX - drag.current.x) / view.current.k,
        y: view.current.y + (event.clientY - drag.current.y) / view.current.k,
      }
      drag.current.x = event.clientX
      drag.current.y = event.clientY
      setHover(null)
      repaint((count) => count + 1)
      return
    }
    const well = wellAt(offsetX, offsetY)
    setHover(well ? { well, x: offsetX, y: offsetY } : null)
  }

  function pointerUp(event) {
    const moved = drag.current?.moved
    drag.current = null
    if (moved || !onSelect || !view.current) return
    const well = wellAt(event.nativeEvent.offsetX, event.nativeEvent.offsetY)
    if (well) onSelect(well)
  }

  return (
    <div className='fieldmap'>
      <canvas
        ref={canvas}
        role='img'
        aria-label={label}
        className={hover && onSelect ? 'pointing' : undefined}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY }
        }}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerLeave={() => setHover(null)}
      />
      {hover && describe && (
        <div className='fieldmap-card' style={{ left: hover.x, top: hover.y }}>{describe(hover.well)}</div>
      )}
      <div className='fieldmap-tools' style={{ right: right + 16, bottom: bottom + 16 }}>
        <button type='button' className='button icon' aria-label='Zoom in'
          onClick={() => zoomAt(canvas.current.clientWidth / 2, canvas.current.clientHeight / 2, 1.5)}>
          <Plus size={16} aria-hidden='true' />
        </button>
        <button type='button' className='button icon' aria-label='Zoom out'
          onClick={() => zoomAt(canvas.current.clientWidth / 2, canvas.current.clientHeight / 2, 1 / 1.5)}>
          <Minus size={16} aria-hidden='true' />
        </button>
        <button type='button' className='button icon' aria-label='Show every well' onClick={() => frame(true)}>
          <Maximize2 size={16} aria-hidden='true' />
        </button>
      </div>
    </div>
  )
}
