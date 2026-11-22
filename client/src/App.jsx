import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, Star, X } from 'lucide-react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import FieldMap from './components/FieldMap'
import { locate } from './components/survey'
import Search from './components/Search'
import './App.css'

const savedViewsKey = 'wellsearch.savedViews'
const api = 'http://localhost:8000/search'

const exampleQuestions = [
  'Where are pump failures most common?',
  'Which operating areas have the most downtime?',
  'How are the wells in the Cactus Lake area doing?',
  'Top 5 wells by rod failures in Winter',
  'Rod parted after a torque increase',
]

const wellStatuses = {
  producing: 'Producing',
  reducedOutput: 'Reduced output',
  down: 'Down',
  noData: 'No data',
}
const statusOrder = ['producing', 'reducedOutput', 'down', 'noData']

// analytics.py answers with these when a question describes a failure instead of asking for a chart.
const noChartMessage = 'This query does not match a supported chart.'
const incidentScope = 'Matching incidents'

// A canvas cannot read a CSS variable for each mark, so the cause colours live here for the map and the charts.
const causeColors = {
  fatigue: '#FF7A5C',
  corrosion: '#3FE0C0',
  'load / excess stress': '#C39BFF',
  erosion: '#FF9ED2',
  abrasion: '#B5E655',
  unknown: '#8FA9AB',
}
const spareColors = ['#7FB6FF', '#FFC78F', '#F2EDDC']
const restColor = '#5F8589'
const statusColors = { producing: '#3FE0C0', reducedOutput: '#FFD21F', down: '#FF7A5C', noData: '#5F8589' }
const stackSize = 6

// Colours for a result's six largest causes: the common ones keep theirs and the others take the spare colours
// in order. Every smaller cause gets the colour of the "Other causes" bar, on the chart and on the map beside it.
function causePalette(series = []) {
  let spare = 0
  const colors = new Map(series.slice(0, stackSize).map(({ name }) =>
    [name, causeColors[name.toLowerCase()] ?? spareColors[spare++ % spareColors.length]]))
  return (name) => colors.get(name) ?? restColor
}

// The home map has one colour for every cause outside the common six, to match its legend.
function commonCauseColor(name = '') {
  return causeColors[name.toLowerCase()] ?? spareColors[2]
}

// The question whose answer holds every failed well with its events; the home map is drawn from it.
const fieldQuestion = 'Where are failures most common?'
const day = 86400000
const lapseSeconds = 45
const monthYear = new Intl.DateTimeFormat('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const rankingRows = 30
const previewRows = 8
const chartMargin = { top: 4, right: 24, bottom: 24, left: 0 }
const hoverCursor = { fill: 'var(--ink)', fillOpacity: 0.06 }
const axisTick = { fill: 'var(--ink-soft)', fontSize: 11 }
// Names on a bar chart are read, not scanned, so they get full ink.
const nameTick = { fill: 'var(--ink)', fontSize: 12 }
const tooltipStyle = {
  backgroundColor: 'var(--surface)',
  border: '1px solid var(--ink)',
  borderRadius: 0,
  padding: '8px 12px',
  fontSize: 13,
}
const tooltipText = { color: 'var(--ink)' }
const whole = new Intl.NumberFormat('en-CA')
const short = new Intl.NumberFormat('en-CA', { notation: 'compact', maximumFractionDigits: 1 })

// Western Canada survey form, 191/14-06-037-28W3/00. Ids from any other grid are shown as stored.
const surveyUwi = /^(\w{3})(\d{2})(\d{2})(\d{3})(\d{2})W(\d)(\d{2})$/

function uwiText(id) {
  const part = surveyUwi.exec(id)
  return part ? `${part[1]}/${part[2]}-${part[3]}-${part[4]}-${part[5]}W${part[6]}/${part[7]}` : id
}

// Chart labels are area names, well ids, or a well id followed by a position.
function chartLabel(label) {
  return String(label).replace(/^\w{16}\b/, uwiText)
}

// Room for the longest label at the axis type size, so long cause names are not cut off.
function labelWidth(labels, compact) {
  const longest = Math.max(...labels.map((label) => chartLabel(label).length))
  return Math.min(compact ? 130 : 250, Math.round(longest * 7.3) + 12)
}

function WellTag({ id, large }) {
  const part = surveyUwi.exec(id)
  return (
    <span className={large ? 'uwi large' : 'uwi'}>
      {part ? (
        <>
          <span className='edge'>{part[1]}/</span>
          {part[2]}-{part[3]}-{part[4]}-{part[5]}W{part[6]}
          <span className='edge'>/{part[7]}</span>
        </>
      ) : id}
    </span>
  )
}

function ChartFrame({ title, scope, note, legend, children, compact, height = compact ? 200 : 320, emptyMessage }) {
  const Heading = compact ? 'h4' : 'h2'
  return (
    <section className='frame' aria-label={title}>
      <div className='frame-head'>
        <Heading>{title}</Heading>
        {scope && <p className='scope'>{scope}</p>}
      </div>
      {note && <p className='muted'>{note}</p>}
      {legend}
      {emptyMessage ? (
        <div className='empty' role='status'>{emptyMessage}</div>
      ) : (
        <div className='chart' style={{ height }}>
          <ResponsiveContainer width='100%' height='100%'>{children}</ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

function FailureBreakdownTooltip({ active, payload, series }) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null

  return (
    <div className='tooltip'>
      <strong>{row.area}</strong>
      {series.filter(({ key }) => row[key] > 0).map(({ key, name }) => <div key={key}>{name}: {row[key]}</div>)}
      <div>Total failures: {row.failures}</div>
    </div>
  )
}

// A stack of two dozen causes cannot be read, so the smaller ones share one segment.
function stackSeries(series, rows) {
  if (series.length <= stackSize + 1) return { shown: series, data: rows }
  const rest = series.slice(stackSize)
  return {
    shown: [...series.slice(0, stackSize), { key: 'other', name: 'Other causes' }],
    data: rows.map((row) => ({ ...row, other: rest.reduce((sum, { key }) => sum + (row[key] ?? 0), 0) })),
  }
}

function FailureBreakdownChart({ data, title, scope, series, onSelectArea, compact }) {
  const { shown, data: rows } = stackSeries(series, compact ? data.slice(0, previewRows) : data)
  const colorOf = causePalette(series)
  const fill = (index) => shown[index].key === 'other' ? restColor : colorOf(shown[index].name)
  const legend = !compact && (
    <ul className='legend' aria-label='Recorded causes'>
      {shown.map(({ key, name }, index) => (
        <li key={key}><span className='swatch' style={{ backgroundColor: fill(index) }} />{name}</li>
      ))}
    </ul>
  )

  return (
    <ChartFrame title={title} scope={scope} legend={legend} compact={compact} height={rows.length * (compact ? 20 : 30) + 56}
      note={onSelectArea && !compact ? 'Select a bar, or pick an area below, to see its wells.' : undefined}>
      <BarChart data={rows} layout='vertical' margin={chartMargin} barCategoryGap='24%'>
        <CartesianGrid horizontal={false} />
        <XAxis type='number' tick={axisTick} allowDecimals={false} tickFormatter={short.format}
          label={{ value: 'Failures', position: 'insideBottom', offset: -12 }} />
        <YAxis type='category' dataKey='area' tick={nameTick} tickLine={false} interval={0}
          width={labelWidth(rows.map(({ area }) => area), compact)} />
        <Tooltip content={<FailureBreakdownTooltip series={series} />} cursor={hoverCursor} />
        {shown.map(({ key, name }, index) => (
          <Bar
            key={key}
            dataKey={key}
            name={name}
            fill={fill(index)}
            stackId='causes'
            isAnimationActive={false}
            onClick={onSelectArea ? ({ payload }) => onSelectArea(payload.area) : undefined}
            style={onSelectArea ? { cursor: 'pointer' } : undefined}
          />
        ))}
      </BarChart>
    </ChartFrame>
  )
}

function RankingChart({ data, title, scope, unit, compact, onSelectArea, note }) {
  // The table under an area lists every well; the chart only needs the top of the ranking.
  const rows = data.slice(0, compact ? previewRows : rankingRows)
  const cut = !compact && rows.length < data.length
    ? `The chart shows the ${rows.length} highest of ${whole.format(data.length)}.`
    : null
  const hint = onSelectArea && !compact ? 'Select a bar, or pick an area below, to see its wells.' : null

  return (
    <ChartFrame title={title} scope={scope} compact={compact} height={rows.length * (compact ? 20 : 28) + 56}
      note={[note, cut, hint].filter(Boolean).join(' ') || undefined}>
      <BarChart data={rows} layout='vertical' margin={chartMargin} barCategoryGap='24%'>
        <CartesianGrid horizontal={false} />
        <XAxis type='number' tick={axisTick} allowDecimals={unit !== 'Failures'} tickFormatter={short.format}
          label={{ value: unit, position: 'insideBottom', offset: -12 }} />
        <YAxis type='category' dataKey='label' tick={nameTick} tickLine={false} tickFormatter={chartLabel} interval={0}
          width={labelWidth(rows.map(({ label }) => label), compact)} />
        <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipText} labelStyle={tooltipText} cursor={hoverCursor}
          separator=': ' labelFormatter={chartLabel} formatter={(value) => [whole.format(value), unit]} />
        <Bar
          dataKey='value'
          name={unit}
          fill='var(--signal)'
          maxBarSize={28}
          isAnimationActive={false}
          onClick={onSelectArea ? ({ payload }) => onSelectArea(payload.label) : undefined}
          style={onSelectArea ? { cursor: 'pointer' } : undefined}
        />
      </BarChart>
    </ChartFrame>
  )
}

function MonthlyFailuresChart({ data, title, scope, compact, note }) {
  return (
    <ChartFrame title={title} scope={scope} compact={compact} note={note}>
      <LineChart data={data} margin={{ ...chartMargin, bottom: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey='month' tick={axisTick} minTickGap={28} padding={{ left: 8, right: 8 }} />
        <YAxis domain={note ? [0, 1] : undefined} tick={axisTick} allowDecimals={false} width={40} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipText} labelStyle={tooltipText} separator=': ' />
        <Line type='linear' dataKey='failures' name='Failures' stroke='var(--signal)' strokeWidth={2}
          dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
      </LineChart>
    </ChartFrame>
  )
}

function measurement(value, unit) {
  return value == null ? 'No reading' : `${whole.format(value)} ${unit}`
}

function StatusStrip({ wells }) {
  const counts = { producing: 0, reducedOutput: 0, down: 0, noData: 0 }
  for (const { status } of wells) counts[status] += 1
  const spoken = statusOrder.map((key) => `${counts[key]} ${wellStatuses[key].toLowerCase()}`).join(', ')

  return (
    <>
      <div className='strip' role='img' aria-label={`${wells.length} wells: ${spoken}`}>
        {statusOrder.filter((key) => counts[key] > 0).map((key) => (
          <span key={key} className={key} style={{ flex: `${counts[key]} 1 0` }} />
        ))}
      </div>
      <dl className='strip-key'>
        {statusOrder.map((key) => (
          <div key={key}>
            <dt className={`status ${key}`}>{wellStatuses[key]}</dt>
            <dd>{whole.format(counts[key])}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}

function AreaFigures({ wells }) {
  const recordedToday = wells.filter((well) => well.oilTodayM3 != null)
  const comparable = recordedToday.filter((well) => well.oilYesterdayM3 != null)
  const totalToday = recordedToday.reduce((sum, well) => sum + well.oilTodayM3, 0)
  const comparableToday = comparable.reduce((sum, well) => sum + well.oilTodayM3, 0)
  const comparableYesterday = comparable.reduce((sum, well) => sum + well.oilYesterdayM3, 0)
  const change = comparableYesterday > 0 ? (comparableToday / comparableYesterday - 1) * 100 : null
  const changeLabel = change == null ? 'Unavailable' : `${change > 0 ? '+' : ''}${change.toFixed(1)}%`
  const comparisonNote = comparable.length === 0
    ? 'No wells have readings on both days.'
    : comparableYesterday === 0
      ? 'The comparable wells recorded 0 m³ yesterday.'
      : `${comparable.length} of ${wells.length} wells have readings on both days.`
  const figures = [
    {
      label: 'Recorded oil output on snapshot date',
      value: measurement(recordedToday.length ? Math.round(totalToday * 10) / 10 : null, 'm³'),
      note: `${recordedToday.length} of ${wells.length} wells have a reading.`,
    },
    { label: 'Change from previous day', value: changeLabel, note: comparisonNote },
  ]

  return (
    <dl className='pairs'>
      {figures.map(({ label, value, note }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
          <dd className='note'>{note}</dd>
        </div>
      ))}
    </dl>
  )
}

function productionDate(date) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function WellProductionChart({ data, compact }) {
  const missingDates = data.filter(({ oilM3 }) => oilM3 == null).map(({ date }) => productionDate(date))
  return (
    <div className='stack'>
      <h4>Seven-day oil production (m³)</h4>
      {missingDates.length > 0 && <p className='muted'>No reading for {missingDates.join(', ')}.</p>}
      <div className='chart' style={{ height: compact ? 150 : 220 }}>
        <ResponsiveContainer width='100%' height='100%'>
          <LineChart data={data} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey='date' tick={axisTick} tickFormatter={productionDate} minTickGap={20} padding={{ left: 8, right: 8 }} />
            <YAxis width={40} tick={axisTick} tickLine={false} axisLine={false} />
            <Tooltip
              filterNull={false}
              separator=': '
              contentStyle={tooltipStyle}
              itemStyle={tooltipText}
              labelStyle={tooltipText}
              labelFormatter={productionDate}
              formatter={(value) => [measurement(value, 'm³'), 'Oil']}
            />
            <Line type='linear' dataKey='oilM3' stroke='var(--signal)' strokeWidth={2} connectNulls={false}
              dot={{ r: 3, fill: 'var(--signal)', strokeWidth: 0 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function WellRecords({ wells, metric, selectedWell, onViewWell }) {
  const [ascending, setAscending] = useState(false)
  const [filter, setFilter] = useState('')
  const term = filter.trim().toLowerCase()
  const filtered = wells.filter(({ id, causes }) =>
    id.toLowerCase().includes(term) || uwiText(id).toLowerCase().includes(term)
    || causes?.some(({ name }) => name.toLowerCase().includes(term))
  ).sort((first, second) => {
    if (!Number.isFinite(first.value)) return Number.isFinite(second.value) ? 1 : first.id.localeCompare(second.id)
    if (!Number.isFinite(second.value)) return -1
    return (ascending ? first.value - second.value : second.value - first.value) || first.id.localeCompare(second.id)
  })

  return (
    <section className='stack' aria-labelledby='well-records-heading'>
      <h3 id='well-records-heading'>Well records</h3>
      <div className='controls'>
        <label className='field'>
          <span className='label'>Sort wells</span>
          <select className='control' value={ascending ? 'asc' : 'desc'} onChange={(event) => setAscending(event.target.value === 'asc')}>
            <option value='desc'>{metric.descending}</option>
            <option value='asc'>{metric.ascending}</option>
          </select>
        </label>
        <label className='field'>
          <span className='label'>{metric.causes ? 'Filter by well or recorded cause' : 'Filter by well'}</span>
          <input className='control' type='search' value={filter} onChange={(event) => setFilter(event.target.value)} />
        </label>
      </div>
      <p className='muted' role='status'>Showing {whole.format(filtered.length)} of {whole.format(wells.length)} wells.</p>
      {filtered.length > 0 && <div className='table-scroll' role='region' aria-label='Affected wells table' tabIndex={0}>
        <table aria-label='Affected wells'>
          <thead>
            <tr>
              <th scope='col'>Well</th>
              <th scope='col' className='number'>{metric.unit}</th>
              {metric.causes && <th scope='col'>Most common recorded cause</th>}
              {onViewWell && <th scope='col'>Details</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((well) => {
              const highest = Math.max(...(well.causes ?? []).map(({ count }) => count))
              const topCauses = well.causes?.filter(({ count }) => count === highest).map(({ name }) => name) ?? []
              const isOpen = selectedWell?.id === well.id

              return (
                <tr key={well.id}>
                  <th scope='row'><WellTag id={well.id} /></th>
                  <td className='number'>{Number.isFinite(well.value) ? whole.format(well.value) : 'Unavailable'}</td>
                  {metric.causes && <td>{topCauses.join(', ') || 'Unavailable'}{topCauses.length > 1 && ' (tie)'}</td>}
                  {onViewWell && <td>
                    <button
                      type='button'
                      className='button'
                      aria-label={`View well ${uwiText(well.id)}`}
                      aria-expanded={isOpen}
                      aria-controls={isOpen ? 'pump-well-details' : undefined}
                      onClick={(event) => onViewWell(well, event.currentTarget)}
                    >
                      View well
                    </button>
                  </td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>}
    </section>
  )
}

function FailureWellDetails({ well, onClose }) {
  const heading = useRef(null)

  useEffect(() => {
    heading.current.focus({ preventScroll: true })
    heading.current.closest('section').scrollIntoView({ block: 'start' })
  }, [well.id])

  return (
    <section id='pump-well-details' className='panel' aria-labelledby='pump-well-heading'>
      <div className='well-head'>
        <h3 id='pump-well-heading' ref={heading} tabIndex={-1}><WellTag id={well.id} large /></h3>
        <span className='muted'>{well.area} · {well.failureCount} recorded {well.failureCount === 1 ? 'failure' : 'failures'}</span>
        <button type='button' className='button' onClick={onClose}>Close well details</button>
      </div>
      <h4>Recorded cause breakdown</h4>
      <dl className='pairs inline'>
        {well.causes.map(({ name, count }) => (
          <div key={name}><dt>{name}</dt><dd className='data'>{count}</dd></div>
        ))}
      </dl>
      {well.productionHistory.length > 0 && <WellProductionChart data={well.productionHistory} />}
      <h4>Recorded failures</h4>
      <ol className='events'>
        {well.events.map((event, index) => (
          <li key={index}>
            <strong>{event.date || 'Date unavailable'} · {event.cause}</strong>
            {event.description && <p>{event.description}</p>}
          </li>
        ))}
      </ol>
    </section>
  )
}

// The failure log spells some causes two ways ("Sand" and "sand"). Count each pair as one cause.
function mergeCauseSpellings(result) {
  if (result.type !== 'area_breakdown') return result
  const spelling = (name) => name.toLowerCase().replaceAll('-', ' ')
  const kept = new Map()
  for (const item of result.series) if (!kept.has(spelling(item.name))) kept.set(spelling(item.name), item)
  const merge = (counts) => {
    const totals = new Map()
    for (const { name, count } of counts) {
      const { name: keptName } = kept.get(spelling(name)) ?? { name }
      totals.set(keptName, (totals.get(keptName) ?? 0) + count)
    }
    return [...totals].map(([name, count]) => ({ name, count })).sort((first, second) => second.count - first.count)
  }

  const rows = result.rows.map((row) => {
    const merged = { area: row.area, failures: row.failures }
    for (const { key, name } of result.series) {
      const target = kept.get(spelling(name)).key
      merged[target] = (merged[target] ?? 0) + (row[key] ?? 0)
    }
    return merged
  })
  const total = ({ key }) => rows.reduce((sum, row) => sum + row[key], 0)

  return {
    ...result,
    rows,
    series: [...kept.values()].sort((first, second) => total(second) - total(first)),
    wells: result.wells.map((well) => ({
      ...well,
      causes: merge(well.causes),
      events: well.events.map((event) => ({ ...event, cause: kept.get(spelling(event.cause))?.name ?? event.cause })),
    })),
  }
}

function operatingAreas(result) {
  if (result?.type === 'area_breakdown') return result.rows.map(({ area }) => area)
  return Object.keys(result?.groups ?? {})
}

function areaFocus(result, area) {
  const scope = result.period ?? result.scope
  if (result.type === 'area_breakdown') {
    const totals = result.rows.find((row) => row.area === area)
    return {
      title: `Recorded failure causes in ${area}`,
      scope,
      note: `${totals.failures.toLocaleString()} recorded failures.`,
      data: result.series.map(({ name, key }) => ({ label: name, value: totals[key] }))
        .filter(({ value }) => value > 0).sort((first, second) => second.value - first.value),
      wells: result.wells.filter((well) => well.area === area).map((well) => ({ ...well, value: well.failureCount })),
      metric: { unit: 'Failures', descending: 'Most failures first', ascending: 'Fewest failures first', causes: true },
    }
  }

  const wells = result.groups[area]
  const total = result.rows.find(({ label }) => label === area).value
  return {
    title: `Downtime by well in ${area}`,
    scope,
    note: `${total.toLocaleString()} recorded downtime hours.`,
    data: wells.filter(({ value }) => Number.isFinite(value))
      .map(({ id, value }) => ({ label: id, value })).sort((first, second) => second.value - first.value),
    wells,
    metric: { unit: result.unit, descending: 'Most downtime first', ascending: 'Least downtime first' },
  }
}

function GroupedChart({ result, selection, onSelectionChange, compact }) {
  const viewButton = useRef(null)
  const areaSelect = useRef(null)
  const { area, well: selectedWell } = selection
  const areas = operatingAreas(result)
  const focused = area ? areaFocus(result, area) : null
  const placed = useMemo(() => fieldWells(result.wells ?? [], causePalette(result.series)), [result])
  const mapWells = area ? placed.filter((well) => well.area === area) : placed

  function selectArea(nextArea) {
    if (nextArea === area) return
    viewButton.current = null
    onSelectionChange(nextArea)
  }

  function closeWell() {
    onSelectionChange(area)
    const focusTarget = viewButton.current?.isConnected ? viewButton.current : areaSelect.current
    focusTarget?.focus()
  }

  const Overview = result.type === 'area_breakdown' ? FailureBreakdownChart : RankingChart
  let chart = <Overview data={result.rows} title={result.title} scope={result.scope} series={result.series}
    unit={result.unit} onSelectArea={onSelectionChange ? selectArea : undefined} compact={compact} />
  if (focused) {
    const { data, title, scope, note, metric } = focused
    chart = data.length
      ? <RankingChart data={data} title={title} scope={scope} note={note} unit={metric.unit} compact={compact} />
      : <ChartFrame title={title} scope={scope} emptyMessage='No data for this period.' compact={compact} />
  }
  if (!onSelectionChange) return chart

  return (
    <section className={mapWells.length ? 'split' : 'stack'} aria-label='Operating area drill-down'>
      {mapWells.length > 0 && (
        <div className='map-frame'>
          <FieldMap wells={mapWells} selectedId={selectedWell?.id} describe={describeWell}
            onSelect={(well) => onSelectionChange(well.area, well.id)}
            label='Map of the wells in this result, placed from their survey addresses' />
        </div>
      )}
      <div className='stack'>
      {chart}
      <div className='controls'>
        <label className='field'>
          <span className='label'>Operating area</span>
          <select className='control' ref={areaSelect} value={area ?? ''} onChange={(event) => selectArea(event.target.value)}>
            <option value=''>All operating areas</option>
            {areas.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
        {area && (
          <button type='button' className='button' onClick={() => {
            selectArea('')
            areaSelect.current?.focus()
          }}>Back to all areas</button>
        )}
      </div>
      {focused?.wells.length > 0 && (
        <WellRecords key={area} wells={focused.wells} metric={focused.metric} selectedWell={selectedWell}
          onViewWell={focused.metric.causes ? (well, button) => {
            viewButton.current = button
            onSelectionChange(area, well.id)
          } : undefined}
        />
      )}
      {selectedWell && <FailureWellDetails well={selectedWell} onClose={closeWell} />}
      </div>
    </section>
  )
}

function SelectedWellDetails({ well }) {
  const details = [
    ['Oil output on snapshot date', measurement(well.oilTodayM3, 'm³')],
    ['Recent average oil output', measurement(well.recentAverageOilM3, 'm³')],
    ['Downtime on snapshot date', measurement(well.hoursDown, 'hours')],
    ['Recorded downtime reason', well.downtimeReason ?? 'No recorded reason'],
  ]

  return (
    <section id='selected-well-details' className='panel' aria-labelledby='selected-well-heading'>
      <div className='well-head'>
        <h3 id='selected-well-heading' aria-live='polite'><WellTag id={well.id} large /></h3>
        <span className={`status ${well.status}`}>{wellStatuses[well.status]}</span>
      </div>
      <dl className='pairs'>
        {details.map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <WellProductionChart data={well.productionHistory} />
    </section>
  )
}

function AreaOverview({ data, title, scope, selectedWell, onSelectionChange, area, compact }) {
  const mapWells = useMemo(() => compact ? [] : data.flatMap((well) => {
    const place = locate(well.id)
    return place ? [{ ...well, ...place, area: '', size: 1, color: statusColors[well.status] }] : []
  }), [data, compact])
  if (compact) {
    return (
      <section className='frame' aria-label={title}>
        <div className='frame-head'>
          <h4>{title}</h4>
          <p className='scope'>{scope}</p>
        </div>
        <StatusStrip wells={data} />
        <p><WellTag id={selectedWell.id} /></p>
        <WellProductionChart data={selectedWell.productionHistory} compact />
      </section>
    )
  }

  return (
    <section className={mapWells.length ? 'split' : 'stack'} aria-label={title}>
      {mapWells.length > 0 && (
        <div className='map-frame'>
          <FieldMap wells={mapWells} selectedId={selectedWell.id} onSelect={(well) => onSelectionChange(area, well.id)}
            describe={(well) => <><WellTag id={well.id} /><span className={`status ${well.status}`}>{wellStatuses[well.status]}</span></>}
            label='Map of the wells in this area, coloured by status' />
        </div>
      )}
      <div className='stack'>
      <div className='frame'>
        <div className='frame-head'>
          <h2>{title}</h2>
          <p className='scope'>{scope}</p>
        </div>
        <StatusStrip wells={data} />
        <AreaFigures wells={data} />
      </div>
      <label className='field'>
        <span className='label'>Well</span>
        <select className='control data' value={selectedWell.id} onChange={(event) => onSelectionChange(area, event.target.value)}>
          {statusOrder.map((key) => {
            const group = data.filter(({ status }) => status === key)
            return group.length > 0 && (
              <optgroup key={key} label={`${wellStatuses[key]} (${group.length})`}>
                {group.map(({ id }) => <option key={id} value={id}>{uwiText(id)}</option>)}
              </optgroup>
            )
          })}
        </select>
      </label>
      <SelectedWellDetails well={selectedWell} />
      <p className='fineprint'>Down means 24 recorded downtime hours on the snapshot date. Reduced output means no oil, or less than 75% of the well&rsquo;s recorded average over the previous 30 days. A well has no status when either daily reading is missing.</p>
      </div>
    </section>
  )
}

function TopBar({ savedCount }) {
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const question = searchParams.get('q') ?? ''

  return (
    <header className={pathname === '/' ? 'bar over' : 'bar'}>
      <div className='bar-inner'>
        <Link className='wordmark' to='/'>WellSearch</Link>
        {/* Keyed so the box follows the address bar when a saved view opens another question. */}
        {pathname !== '/' && <BarSearch key={question} initial={question} />}
        <nav className='bar-nav' aria-label='Main'>
          <NavLink to='/dashboard'>
            Saved views{savedCount > 0 && <span className='count'>{savedCount}</span>}
          </NavLink>
        </nav>
      </div>
    </header>
  )
}

function useSubmitQuestion() {
  const navigate = useNavigate()
  return (question) => {
    const trimmed = question.trim()
    if (trimmed) navigate({ pathname: '/results', search: new URLSearchParams({ q: trimmed }).toString() })
  }
}

function BarSearch({ initial }) {
  const [question, setQuestion] = useState(initial)
  const submit = useSubmitQuestion()

  return (
    <Search value={question} onChange={setQuestion} onSubmit={(event) => {
      event.preventDefault()
      submit(question)
    }} />
  )
}

// Wells from an area breakdown, placed on the map, with their events in time order.
function fieldWells(wells, colorOf) {
  return wells.flatMap((well) => {
    const place = locate(well.id)
    if (!place) return []
    const events = well.events.filter(({ date }) => date)
      .map((event) => ({ ...event, t: Date.parse(event.date), color: colorOf(event.cause) }))
      .sort((first, second) => first.t - second.t)
    const top = well.causes.reduce((best, cause) => cause.count > (best?.count ?? 0) ? cause : best, null)
    return [{ ...well, ...place, events, size: well.failureCount, color: colorOf(top?.name), topCause: top?.name }]
  })
}

function describeWell(well) {
  return (
    <>
      <WellTag id={well.id} />
      <span>{well.area}</span>
      <span className='muted'>{well.failureCount} {well.failureCount === 1 ? 'failure' : 'failures'}{well.topCause && `, mostly ${well.topCause.toLowerCase()}`}</span>
    </>
  )
}

function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 900px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(min-width: 900px)')
    const update = () => setWide(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return wide
}

// Plays the failure record from start to end once; a reader who asked for less motion gets the end state.
function useLapse(start, end) {
  const [time, setTime] = useState(null)
  const [playing, setPlaying] = useState(false)
  const clock = useRef(null)

  useEffect(() => {
    if (!end) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    clock.current = still ? end : start
    setTime(clock.current)
    setPlaying(!still)
  }, [start, end])

  useEffect(() => {
    if (!playing) return
    let frame
    let last = performance.now()
    const step = (now) => {
      clock.current = Math.min(end, clock.current + (end - start) * (now - last) / (lapseSeconds * 1000))
      last = now
      setTime(clock.current)
      if (clock.current >= end) setPlaying(false)
      else frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [playing, start, end])

  return {
    time,
    playing,
    seek(next) {
      clock.current = next
      setTime(next)
    },
    toggle() {
      if (!playing && clock.current >= end) clock.current = start
      setPlaying(!playing)
    },
  }
}

function FieldWell({ well, onClose }) {
  const record = new URLSearchParams({ q: fieldQuestion, area: well.area, well: well.id })
  return (
    <aside className='hud well-card' aria-label='Selected well'>
      <div className='well-head'>
        <h2><WellTag id={well.id} large /></h2>
        <button type='button' className='button icon' aria-label='Close well' onClick={onClose}><X size={16} aria-hidden='true' /></button>
      </div>
      <p className='muted'>{well.area} · {well.failureCount} recorded {well.failureCount === 1 ? 'failure' : 'failures'}</p>
      <ol className='events'>
        {well.events.map((event, index) => (
          <li key={index}>
            <strong><span className='swatch' style={{ backgroundColor: event.color }} />{event.date} · {event.cause}</strong>
            {event.description && <p>{event.description}</p>}
          </li>
        ))}
      </ol>
      <Link className='button' to={`/results?${record}`}>Open the full record</Link>
    </aside>
  )
}

function Home() {
  const [question, setQuestion] = useState('')
  const [selected, setSelected] = useState(null)
  const submit = useSubmitQuestion()
  const wide = useWide()
  const { result, failed } = useSearchResult(fieldQuestion)
  const wells = useMemo(() => fieldWells(result?.wells ?? [], commonCauseColor), [result])
  const { start, end, last, causes, total } = useMemo(() => {
    const events = wells.flatMap((well) => well.events).sort((first, second) => first.t - second.t)
    if (!events.length) return {}
    const totals = new Map()
    for (const { cause } of events) totals.set(cause, (totals.get(cause) ?? 0) + 1)
    return {
      // Nearly every record is from May 2025 on; the few older ones count as already there when the clock starts.
      start: events[Math.floor(events.length / 100)].t - day,
      // The clock runs a little past the last record so its ring has time to fade.
      last: events[events.length - 1].t,
      end: events[events.length - 1].t + 14 * day,
      causes: [...totals].sort((first, second) => second[1] - first[1]).slice(0, stackSize).map(([name]) => name),
      total: events.length,
    }
  }, [wells])
  const lapse = useLapse(start, end)

  const counts = new Map()
  let soFar = 0
  if (lapse.time != null) {
    for (const well of wells) {
      for (const event of well.events) {
        if (event.t > lapse.time) break
        soFar += 1
        const name = causes.includes(event.cause) ? event.cause : 'Other causes'
        counts.set(name, (counts.get(name) ?? 0) + 1)
      }
    }
  }

  return (
    <main className='home'>
      {/* First in the page, so the keyboard reaches the question before the map's zoom buttons. */}
      <section className='ask'>
        <h1>What failed, where, and what fixed it.</h1>
        <p className='lede'>Ask about a well, an area or a failure. The answer comes from the failure log, the service jobs and daily production.</p>
        <Search large value={question} onChange={setQuestion} onSubmit={(event) => {
          event.preventDefault()
          submit(question)
        }} />
        <ul className='examples' aria-label='Questions to start from'>
          {exampleQuestions.map((question) => (
            <li key={question}><button type='button' className='example' onClick={() => submit(question)}>{question}</button></li>
          ))}
        </ul>
      </section>
      <div className='home-map'>
        <FieldMap wells={wells} time={lapse.time} selectedId={selected?.id} onSelect={setSelected} describe={describeWell}
          label='Map of every well with a recorded failure, placed from its survey address'
          inset={wide ? { left: 500, top: 56, right: 368 } : undefined} />
        {!result && !failed && <p className='map-status status-line' role='status'>Reading the failure record…</p>}
        {failed && <p className='map-status' role='alert'>The map did not load. Check that the backend is running on port 8000.</p>}
      </div>
      {lapse.time != null && (
        <section className='hud lapse' aria-label='Failures over time'>
          <p className='lapse-date'>{monthYear.format(Math.min(lapse.time, last))}</p>
          <p className='muted'>{whole.format(soFar)} of {whole.format(total)} recorded failures</p>
          <div className='lapse-controls'>
            <button type='button' className='button icon play' aria-label={lapse.playing ? 'Pause' : 'Play'} onClick={lapse.toggle}>
              {lapse.playing ? <Pause size={16} aria-hidden='true' /> : <Play size={16} aria-hidden='true' />}
            </button>
            <input type='range' aria-label='Date' min={start} max={end} step={day} value={lapse.time}
              aria-valuetext={monthYear.format(Math.min(lapse.time, last))} onChange={(event) => lapse.seek(Number(event.target.value))} />
          </div>
          <ul className='legend causes' aria-label='Recorded causes so far'>
            {[...causes, 'Other causes'].map((name) => (
              <li key={name}>
                <span className='swatch' style={{ backgroundColor: commonCauseColor(name) }} />
                {name}
                <span className='data'>{whole.format(counts.get(name) ?? 0)}</span>
              </li>
            ))}
          </ul>
          <p className='fineprint'>Each dot is a well, placed from its survey address. Select one to read its record.</p>
        </section>
      )}
      {selected && <FieldWell well={selected} onClose={() => setSelected(null)} />}
    </main>
  )
}

// Answers by view and question, so the field map and a repeated question load once per visit.
const answers = new Map()

function useSearchResult(question, view = 'chart') {
  const [state, setState] = useState({})
  const key = `${view}:${question}`

  useEffect(() => {
    if (!question || answers.has(key)) return
    const controller = new AbortController()
    const { signal } = controller
    // Let React's development effect replay clean up before starting the request.
    const start = setTimeout(async () => {
      try {
        const response = await fetch(api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: question, view }),
          signal,
        })
        if (!response.ok) throw new Error(`Search failed (${response.status})`)
        const result = await response.json()
        if (view === 'chart' ? !result?.type : !Array.isArray(result?.results)) throw new Error('Unexpected search result')
        answers.set(key, view === 'chart' ? mergeCauseSpellings(result) : result)
        if (!signal.aborted) setState({ question, result: answers.get(key) })
      } catch {
        if (!signal.aborted) setState({ question, failed: true })
      }
    }, 0)
    return () => {
      clearTimeout(start)
      controller.abort()
    }
  }, [question, view, key])

  if (answers.has(key)) return { question, result: answers.get(key) }
  return state.question === question ? state : {}
}

const searchCharts = {
  ranking: RankingChart,
  monthly: MonthlyFailuresChart,
  area_status: AreaOverview,
}

function resolveViewSelection(result, area, wellId) {
  if (result?.type === 'area_breakdown') {
    const well = result.wells.find((row) => row.id === wellId && (!area || row.area === area))
    return { area: well?.area ?? result.rows.find((row) => row.area === area)?.area, well }
  }
  if (result?.type === 'area_status') {
    const well = result.rows.find((row) => row.id === wellId)
      ?? result.rows.find((row) => row.status === 'down') ?? result.rows[0]
    return { area: result.area, well }
  }
  if (operatingAreas(result).includes(area)) return { area }
  return {}
}

function SearchVisualization({ result, failed, selection, onSelectionChange, compact }) {
  if (failed) return <p role='alert'>This result did not load. Check that the backend is running on port 8000, then search again.</p>
  if (!result) return <p className='status-line' role='status'>Reading the record…</p>
  if (result.type === 'message') return <p role='status'>{result.message}</p>
  if (!result.rows?.length) {
    return <ChartFrame title={result.title} scope={result.scope} compact={compact}
      emptyMessage={result.emptyMessage ?? 'No data for this period.'} />
  }
  if (operatingAreas(result).length) {
    return <GroupedChart result={result} selection={selection} onSelectionChange={onSelectionChange} compact={compact} />
  }
  const Chart = searchCharts[result.type]
  if (!Chart) return <p role='alert'>This result has an unsupported chart type.</p>
  return (
    <Chart
      data={result.rows}
      title={result.title}
      scope={result.scope}
      unit={result.unit}
      note={result.note}
      area={selection.area}
      selectedWell={selection.well}
      onSelectionChange={onSelectionChange}
      compact={compact}
    />
  )
}

// The backend stores efficiency as a fraction: 0.69 means 69%.
function percent(value) {
  return value == null ? 'Not recorded' : `${Math.round(value * 100)}%`
}

function CaseSummary({ text }) {
  // The summary arrives as plain lines; a line that starts with "- " is one past case.
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  const cases = lines.filter((line) => line.startsWith('- '))
  const [lead, ...notes] = lines.filter((line) => !line.startsWith('- '))

  return (
    <div className='summary'>
      {lead && <p>{lead}</p>}
      {cases.length > 0 && (
        <ul>
          {cases.map((line) => <li key={line}>{line.slice(2).replace(/^\w{16}\b/, uwiText)}</li>)}
        </ul>
      )}
      {notes.map((line) => <p className='muted' key={line}>{line}</p>)}
    </div>
  )
}

function SimilarCases({ question, fallback }) {
  const { result, failed } = useSearchResult(question, 'summary')
  const records = result?.results ?? []

  if (!result && !failed) return <p className='status-line' role='status'>Looking for similar past failures…</p>
  if (records.length === 0) return fallback ? <p role='status'>{fallback}</p> : null

  return (
    <section className='frame cases' aria-labelledby='cases-heading'>
      <div className='frame-head'>
        <h2 id='cases-heading'>Similar past failures</h2>
        <p className='scope'>{records.length} closest of 2,873 records</p>
      </div>
      {result.answer
        ? <CaseSummary text={result.answer} />
        : <p className='muted'>The written summary is unavailable right now. The matching records are below.</p>}
      <div className='table-scroll' role='region' aria-label='Similar past failures table' tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope='col'>Well</th>
              <th scope='col'>Failure</th>
              <th scope='col'>Cause</th>
              <th scope='col' className='number'>Pump efficiency</th>
              <th scope='col' className='number'>Similarity</th>
              <th scope='col'>Repair job</th>
            </tr>
          </thead>
          <tbody>
            {records.map((item) => (
              <tr key={item.id}>
                <th scope='row'><WellTag id={item.uwi} /></th>
                <td>{item.failure_type}</td>
                <td>{item.cause}</td>
                <td className='number'>{percent(item.avg_30d_pump_efficiency_pct)}</td>
                <td className='number'>{item.similarity.toFixed(2)}</td>
                <td>
                  <details>
                    <summary>{item.job_type}</summary>
                    <p>{item.job_summary}</p>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className='fineprint'>Pump efficiency is the average over the 30 days before the failure. Similarity runs from 0 to 1 and only orders the results. The summary is written by a language model from these records alone.</p>
    </section>
  )
}

function Results({ savedViews, onToggleView }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const question = searchParams.get('q')?.trim()
  const { result, failed } = useSearchResult(question)
  const selection = resolveViewSelection(result, searchParams.get('area'), searchParams.get('well'))
  const currentView = { question, area: searchParams.get('area'), wellId: searchParams.get('well') }
  const noChart = result?.type === 'message' && result.message.startsWith(noChartMessage)
  const incident = result?.scope === incidentScope
  // The similar cases say more than an empty chart of their readings.
  const emptyIncidentChart = incident && !result.rows?.length

  useEffect(() => {
    document.title = question ? `${question} · WellSearch` : 'WellSearch'
    return () => { document.title = 'WellSearch' }
  }, [question])

  function updateSelection(nextArea, wellId) {
    const params = new URLSearchParams(searchParams)
    params.delete('area')
    params.delete('well')
    if (nextArea) params.set('area', nextArea)
    if (wellId) params.set('well', wellId)
    setSearchParams(params, { replace: true })
  }

  if (!question) {
    return (
      <main className='page'>
        <h1>No question yet</h1>
        <p>Type a question in the box above, or <Link to='/'>start from an example</Link>.</p>
      </main>
    )
  }

  return (
    <main className='page'>
      <div className='question-row'>
        <h1 className='question'>{question}</h1>
        <SaveViewStar labelled view={currentView} savedViews={savedViews} onToggleView={onToggleView} />
      </div>
      {!noChart && !emptyIncidentChart && (
        <SearchVisualization result={result} failed={failed} selection={selection} onSelectionChange={updateSelection} />
      )}
      {(noChart || incident) && <SimilarCases question={question} fallback={noChart ? result.message : null} />}
    </main>
  )
}

function resultsViewUrl({ question, area, wellId }) {
  const params = new URLSearchParams({ q: question })
  if (area) params.set('area', area)
  if (wellId) params.set('well', wellId)
  return `/results?${params}`
}

function savedViewIdentity({ question, area, wellId }) {
  return JSON.stringify([question.trim().toLowerCase(), area ?? '', wellId ?? ''])
}

function loadSavedViews() {
  let raw
  try {
    raw = window.localStorage.getItem(savedViewsKey)
  } catch {
    return { views: [], persistenceIssue: true }
  }

  let stored
  try {
    stored = JSON.parse(raw ?? '[]')
  } catch {
    return { views: [], persistenceIssue: false }
  }

  const views = []
  const ids = new Set()
  const identities = new Set()
  if (Array.isArray(stored)) {
    for (const entry of stored) {
      if (!entry || typeof entry.id !== 'string' || !entry.id.trim()
        || typeof entry.question !== 'string' || !entry.question.trim()
        || typeof entry.title !== 'string' || !entry.title.trim()
        || typeof entry.savedAt !== 'string' || !Number.isFinite(Date.parse(entry.savedAt))) continue

      const { id, question, title, savedAt } = entry
      const area = typeof entry.area === 'string' ? entry.area : undefined
      const wellId = typeof entry.wellId === 'string' ? entry.wellId : undefined
      const view = { id, question, title, savedAt, area, wellId }
      const identity = savedViewIdentity(view)
      if (ids.has(id) || identities.has(identity)) continue
      ids.add(id)
      identities.add(identity)
      views.push(view)
    }
  }
  return { views, persistenceIssue: false }
}

function SaveViewStar({ view, savedViews, onToggleView, labelled }) {
  const saved = savedViews.some((entry) => savedViewIdentity(entry) === savedViewIdentity(view))

  return (
    <button
      type='button'
      className={labelled ? 'button' : 'button icon'}
      aria-label={labelled ? undefined : `${saved ? 'Remove from' : 'Add to'} saved views: ${view.question}`}
      aria-pressed={saved}
      onClick={() => onToggleView(view)}
    >
      <Star aria-hidden='true' size={18} />
      {labelled && (saved ? 'Saved' : 'Save view')}
    </button>
  )
}

function SavedViewPreview({ view }) {
  const { result, failed } = useSearchResult(view.question)
  const selection = resolveViewSelection(result, view.area, view.wellId)
  return <SearchVisualization result={result} failed={failed} selection={selection} compact />
}

function SavedViewCard({ view, onRename, onRemove }) {
  const [draft, setDraft] = useState(null)
  const renameButton = useRef(null)

  function finishRename() {
    setDraft(null)
    renameButton.current?.focus()
  }

  return (
    <article className='panel' aria-label={view.title}>
      <div className='stack'>
        <h3>{view.title}</h3>
        {view.title !== view.question && <p className='muted'>{view.question}</p>}
        {view.area && <p className='label'>{view.area}</p>}
        {view.wellId && !view.wellId.startsWith('DEMO-') && <p><WellTag id={view.wellId} /></p>}
      </div>
      {draft !== null && (
        <form
          className='stack'
          onSubmit={(event) => {
            event.preventDefault()
            if (!draft.trim()) return
            onRename(view.id, draft.trim())
            finishRename()
          }}
        >
          <label className='field'>
            <span className='label'>Display title</span>
            <input className='control' autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} />
          </label>
          <div className='actions'>
            <button type='submit' className='button' disabled={!draft.trim()}>Save title</button>
            <button type='button' className='button quiet' onClick={finishRename}>Cancel</button>
          </div>
        </form>
      )}
      <SavedViewPreview view={view} />
      <div className='actions'>
        <Link className='button' to={resultsViewUrl(view)}>Open view</Link>
        <button ref={renameButton} type='button' className='button quiet' onClick={() => setDraft(view.title)}>Rename</button>
        <button type='button' className='button quiet' onClick={() => onRemove(view.id)}>Remove</button>
      </div>
    </article>
  )
}

function Dashboard({ savedViews, onRename, onRemove }) {
  useEffect(() => {
    document.title = 'Saved views · WellSearch'
    return () => { document.title = 'WellSearch' }
  }, [])

  return (
    <main className='page'>
      <header className='stack'>
        <h1>Saved views</h1>
        <p className='muted'>Kept in this browser only.</p>
      </header>
      {savedViews.length === 0 ? (
        <div className='empty'>
          <div className='stack'>
            <p>Nothing is saved yet. Star a question or a result and it stays here.</p>
            <p><Link className='button' to='/'>Search the record</Link></p>
          </div>
        </div>
      ) : (
        <section className='saved' aria-label='Saved views'>
          {savedViews.map((view) => <SavedViewCard key={view.id} view={view} onRename={onRename} onRemove={onRemove} />)}
        </section>
      )}
    </main>
  )
}

export default function App() {
  const [{ views: savedViews, persistenceIssue }, setSavedState] = useState(loadSavedViews)

  function saveViews(views) {
    let persistenceIssue = false
    try {
      window.localStorage.setItem(savedViewsKey, JSON.stringify(views))
    } catch {
      persistenceIssue = true
    }
    setSavedState({ views, persistenceIssue })
  }

  function toggleView(view) {
    const identity = savedViewIdentity(view)
    const existing = savedViews.find((entry) => savedViewIdentity(entry) === identity)
    if (existing) {
      removeView(existing.id)
      return
    }

    const savedAt = new Date().toISOString()
    const id = globalThis.crypto.randomUUID?.() ?? globalThis.crypto.getRandomValues(new Uint32Array(4)).join('-')
    saveViews([...savedViews, { ...view, id, title: view.question, savedAt }])
  }

  function removeView(id) {
    saveViews(savedViews.filter((view) => view.id !== id))
  }

  function renameView(id, title) {
    saveViews(savedViews.map((view) => view.id === id ? { ...view, title } : view))
  }

  return (
    <div className='shell'>
      {persistenceIssue && (
        <p className='notice' role='status'>
          Browser storage is unavailable. Saved views may be lost when you leave or refresh.
        </p>
      )}
      <TopBar savedCount={savedViews.length} />
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/results' element={<Results savedViews={savedViews} onToggleView={toggleView} />} />
        <Route path='/dashboard' element={<Dashboard savedViews={savedViews} onRename={renameView} onRemove={removeView} />} />
      </Routes>
    </div>
  )
}
