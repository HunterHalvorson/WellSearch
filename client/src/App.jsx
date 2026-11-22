import { useEffect, useRef, useState } from 'react'
import { Star } from 'lucide-react'
import { Link, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, Rectangle,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import Search from './components/Search'
import './App.css'

const cactusLakeQuestion = 'How are the wells in the Cactus Lake area doing?'
const savedViewsKey = 'wellsearch.savedViews'
const dashboardLinkStyle = { color: '#93c5fd' }
const resultPageStyle = {
  width: '100%',
  justifyContent: 'flex-start',
  padding: 'clamp(12px, 4vw, 40px)',
  gap: '16px',
  color: '#f1f5f9',
  textAlign: 'center',
}

const exampleQuestions = [
  'Where are pump failures most common?',
  'Which operating areas have the most downtime?',
  cactusLakeQuestion,
]

const wellStatuses = {
  producing: { label: 'Producing', color: '#6ee7b7' },
  reducedOutput: { label: 'Reduced output', color: '#fcd34d' },
  down: { label: 'Down', color: '#fda4af' },
  noData: { label: 'No data', color: '#cbd5e1' },
}

const wellPanelStyle = {
  backgroundColor: '#151e30',
  border: '1px solid #334155',
  borderRadius: '12px',
  padding: 'clamp(12px, 2.5vw, 24px)',
  minWidth: 0,
}
const wellGridStyle = { display: 'grid', gap: '12px' }

const pumpControlStyle = {
  backgroundColor: '#0b1120',
  color: '#f1f5f9',
  border: '1px solid #94a3b8',
  borderRadius: '6px',
  padding: '8px 10px',
  font: 'inherit',
}
const axisTick = { fill: '#cbd5e1', fontSize: 12 }
const tooltipStyle = {
  backgroundColor: '#0b1120',
  border: '1px solid #64748b',
  borderRadius: '8px',
  color: '#f1f5f9',
  padding: '10px',
}
const chartMargin = { top: 12, right: 16, bottom: 12, left: 0 }
const failureAxisLabel = { value: 'Failures', angle: -90, position: 'insideLeft', fill: axisTick.fill }

function ChartFrame({ title, scope, children, compact, height = 370, note, emptyMessage }) {
  return (
    <section aria-label={title} style={{
      width: '100%',
      maxWidth: '900px',
      padding: 'clamp(8px, 2vw, 20px)',
      backgroundColor: '#151e30',
      border: '1px solid #334155',
      borderRadius: '12px',
    }}>
      <h2 style={{ fontSize: '1.125rem', marginBottom: '8px' }}>{title}</h2>
      {scope && <p style={{ color: '#cbd5e1' }}>{scope}</p>}
      {note && <p style={{ color: '#cbd5e1' }}>{note}</p>}
      <div style={{ maxHeight: compact ? 210 : 530, overflowY: height > 530 ? 'auto' : undefined }}>
        {emptyMessage ? (
          <div role='status' style={{
            height: compact ? 150 : 250, display: 'grid', placeItems: 'center',
            border: '1px solid #334155', marginTop: '12px', color: '#cbd5e1',
          }}>
            {emptyMessage}
          </div>
        ) : (
          <div style={{ height: compact ? 210 : height, minWidth: 0 }}>
            <ResponsiveContainer width='100%' height='100%'>{children}</ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  )
}

function FailureBreakdownTooltip({ active, payload, series }) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null

  return (
    <div style={tooltipStyle}>
      <strong>{row.area}</strong>
      {series.filter(({ key }) => row[key] > 0).map(({ key, name }) => <div key={key}>{name}: {row[key]}</div>)}
      <div>Total failures: {row.failures}</div>
    </div>
  )
}

const seriesColors = ['#60a5fa', '#34d399', '#fbbf24', '#c4b5fd', '#fda4af', '#67e8f9']

function FailureBreakdownChart({ data, title, scope, series, onSelectArea, compact }) {
  return (
    <ChartFrame title={title} scope={scope} compact={compact}>
      <BarChart data={data} margin={chartMargin}>
        <CartesianGrid stroke='#475569' strokeDasharray='3 3' vertical={false} />
        <XAxis dataKey='area' tick={axisTick} minTickGap={4} />
        <YAxis allowDecimals={false} width={48} tick={axisTick} label={failureAxisLabel} />
        <Tooltip content={<FailureBreakdownTooltip series={series} />} cursor={{ fill: '#94a3b8', fillOpacity: 0.12 }} />
        <Legend />
        {series.map(({ key, name }, index) => (
          <Bar
            key={key}
            dataKey={key}
            name={name}
            fill={seriesColors[index] ?? `hsl(${index * 137.5 % 360} 64% 66%)`}
            stackId='causes'
            isAnimationActive={false}
            onClick={onSelectArea ? ({ payload }) => onSelectArea(payload.area) : undefined}
            shape={(props) => (
              <Rectangle
                {...props}
                style={{ cursor: onSelectArea ? 'pointer' : undefined }}
              />
            )}
          />
        ))}
      </BarChart>
    </ChartFrame>
  )
}

function RankingChart({ data, title, scope, unit, compact, onSelectArea, note }) {
  return (
    <ChartFrame title={title} scope={scope} compact={compact} note={note} height={Math.max(260, data.length * 26 + 85)}>
      <BarChart data={data} layout='vertical' margin={{ ...chartMargin, bottom: 24 }}>
        <CartesianGrid stroke='#475569' strokeDasharray='3 3' horizontal={false} />
        <XAxis
          type='number'
          allowDecimals={unit !== 'Failures'}
          tick={axisTick}
          label={{ value: unit, position: 'insideBottom', offset: -8, fill: axisTick.fill }}
        />
        <YAxis type='category' dataKey='label' width={compact ? 92 : 186} tick={axisTick} interval={compact ? undefined : 0} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#94a3b8', fillOpacity: 0.12 }} />
        <Legend />
        <Bar
          dataKey='value'
          name={unit}
          fill='#38bdf8'
          maxBarSize={40}
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
      <LineChart data={data} margin={chartMargin}>
        <CartesianGrid stroke='#475569' strokeDasharray='3 3' />
        <XAxis dataKey='month' tick={axisTick} minTickGap={4} padding={{ left: 12, right: 16 }} />
        <YAxis domain={note ? [0, 1] : undefined} allowDecimals={false} width={48} tick={axisTick} label={failureAxisLabel} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend />
        <Line type='linear' dataKey='failures' name='Failures' stroke='#60a5fa' strokeWidth={2} isAnimationActive={false} />
      </LineChart>
    </ChartFrame>
  )
}

function measurement(value, unit) {
  return value == null ? 'No reading' : `${value} ${unit}`
}

function WellSummaryCards({ wells, producing, down }) {
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
  const cards = [
    { label: 'Wells with recent records', value: wells.length },
    { label: 'Wells producing', value: producing, note: 'Includes wells with reduced output.' },
    { label: 'Wells down', value: down },
    {
      label: 'Recorded oil output on snapshot date',
      value: measurement(recordedToday.length ? totalToday : null, 'm³'),
      note: `${recordedToday.length} of ${wells.length} wells have a reading.`,
    },
    { label: 'Change from previous day', value: changeLabel, note: comparisonNote },
  ]

  return (
    <section aria-labelledby='well-summary-heading' style={wellGridStyle}>
      <h3 id='well-summary-heading'>Area summary</h3>
      <dl style={{ ...wellGridStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))' }}>
        {cards.map(({ label, value, note }) => (
          <div key={label} style={wellPanelStyle}>
            <dt>{label}</dt>
            <dd style={{ fontSize: '1.4rem', fontWeight: 700 }}>{value}</dd>
            {note && <dd style={{ color: '#cbd5e1', fontSize: '0.875rem' }}>{note}</dd>}
          </div>
        ))}
      </dl>
    </section>
  )
}

function productionDate(date) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function WellProductionChart({ data, compact }) {
  const missingDates = data.filter(({ oilM3 }) => oilM3 == null).map(({ date }) => productionDate(date))
  return (
    <div style={wellGridStyle}>
      <h4>Seven-day oil production (m³)</h4>
      {missingDates.length > 0 && <p>No reading for {missingDates.join(', ')}.</p>}
      <div style={{ height: compact ? '150px' : '250px', minWidth: 0 }}>
        <ResponsiveContainer width='100%' height='100%'>
          <LineChart data={data} margin={{ top: 10, right: 18, bottom: 0, left: 0 }}>
            <CartesianGrid stroke='#475569' strokeDasharray='3 3' />
            <XAxis dataKey='date' tick={axisTick} tickFormatter={productionDate} minTickGap={7} />
            <YAxis width={45} tick={axisTick} label={{ value: 'm³', angle: -90, position: 'insideLeft', fill: axisTick.fill }} />
            <Tooltip
              filterNull={false}
              contentStyle={tooltipStyle}
              labelFormatter={productionDate}
              formatter={(value) => [measurement(value, 'm³'), 'Oil']}
            />
            <Line type='linear' dataKey='oilM3' stroke='#60a5fa' strokeWidth={2} connectNulls={false} isAnimationActive={false} />
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
    id.toLowerCase().includes(term) || causes?.some(({ name }) => name.toLowerCase().includes(term))
  ).sort((first, second) => {
    if (!Number.isFinite(first.value)) return Number.isFinite(second.value) ? 1 : first.id.localeCompare(second.id)
    if (!Number.isFinite(second.value)) return -1
    return (ascending ? first.value - second.value : second.value - first.value) || first.id.localeCompare(second.id)
  })
  const cellStyle = { padding: '10px 8px', borderBottom: '1px solid #475569', textAlign: 'left' }

  return (
    <section aria-labelledby='well-records-heading' style={{ ...wellPanelStyle, ...wellGridStyle }}>
      <h3 id='well-records-heading'>Well records</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
        <label style={{ display: 'grid', gap: '4px' }}>
          Sort wells
          <select value={ascending ? 'asc' : 'desc'} onChange={(event) => setAscending(event.target.value === 'asc')} style={pumpControlStyle}>
            <option value='desc'>{metric.descending}</option>
            <option value='asc'>{metric.ascending}</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: '4px' }}>
          {metric.causes ? 'Filter wells by ID or recorded cause' : 'Filter wells by ID'}
          <input type='search' value={filter} onChange={(event) => setFilter(event.target.value)} style={pumpControlStyle} />
        </label>
      </div>
      <p role='status'>Showing {filtered.length} of {wells.length} wells. The filter applies to the list below.</p>
      {filtered.length > 0 && <div role='region' aria-label='Affected wells table' tabIndex={0} style={{ overflowX: 'auto' }}>
        <table aria-label='Affected wells' style={{ width: '100%', minWidth: '420px', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Well ID', metric.unit, ...(metric.causes ? ['Most common recorded cause'] : []), ...(onViewWell ? ['Details'] : [])].map((label) => (
                <th key={label} scope='col' style={cellStyle}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((well) => {
              const highest = Math.max(...(well.causes ?? []).map(({ count }) => count))
              const topCauses = well.causes?.filter(({ count }) => count === highest).map(({ name }) => name) ?? []
              const isOpen = selectedWell?.id === well.id

              return (
                <tr key={well.id}>
                  <th scope='row' style={cellStyle}>{well.id}</th>
                  <td style={cellStyle}>{well.value ?? 'Unavailable'}</td>
                  {metric.causes && <td style={cellStyle}>{topCauses.join(', ') || 'Unavailable'}{topCauses.length > 1 && ' (tie)'}</td>}
                  {onViewWell && <td style={cellStyle}>
                    <button
                      type='button'
                      aria-label={`View well ${well.id}`}
                      aria-expanded={isOpen}
                      aria-controls={isOpen ? 'pump-well-details' : undefined}
                      style={{ ...pumpControlStyle, cursor: 'pointer', whiteSpace: 'nowrap' }}
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
    <section id='pump-well-details' aria-labelledby='pump-well-heading' style={{ ...wellPanelStyle, ...wellGridStyle }}>
      <h3 id='pump-well-heading' ref={heading} tabIndex={-1}>{well.id} · {well.area}</h3>
      <button type='button' onClick={onClose} style={{ ...pumpControlStyle, justifySelf: 'start', cursor: 'pointer' }}>
        Close well details
      </button>
      <p>{well.failureCount} recorded failures</p>
      <h4>Recorded cause breakdown</h4>
      <dl style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px' }}>
        {well.causes.map(({ name, count }) => (
          <div key={name}><dt>{name}</dt><dd>{count}</dd></div>
        ))}
      </dl>
      {well.productionHistory.length > 0 && <WellProductionChart data={well.productionHistory} />}
      <h4>Recorded failures</h4>
      <ol style={{ ...wellGridStyle, paddingLeft: '24px' }}>
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
      note: `${totals.failures.toLocaleString()} recorded failures`,
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
    note: `${total.toLocaleString()} recorded downtime hours`,
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
    <section aria-label='Operating area drill-down' style={{ ...wellGridStyle, textAlign: 'left', width: '100%', maxWidth: '900px' }}>
      {chart}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'end' }}>
        <label style={{ display: 'grid', gap: '4px' }}>
          Operating area
          <select ref={areaSelect} value={area ?? ''} onChange={(event) => selectArea(event.target.value)} style={pumpControlStyle}>
            <option value=''>All operating areas</option>
            {areas.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
        {area && (
          <button type='button' style={pumpControlStyle} onClick={() => {
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
    </section>
  )
}

function SelectedWellDetails({ well }) {
  const { color, label } = wellStatuses[well.status]
  const details = [
    ['Oil output on snapshot date', measurement(well.oilTodayM3, 'm³')],
    ['Recent average oil output', measurement(well.recentAverageOilM3, 'm³')],
    ['Downtime on snapshot date', measurement(well.hoursDown, 'hours')],
    ['Recorded downtime reason', well.downtimeReason ?? 'No recorded reason'],
  ]

  return (
    <section id='selected-well-details' aria-labelledby='selected-well-heading' style={{ ...wellPanelStyle, ...wellGridStyle }}>
      <h3 id='selected-well-heading' aria-live='polite'>{well.id} <span style={{ color }}>· {label}</span></h3>
      <dl style={{ ...wellGridStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))' }}>
        {details.map(([name, value]) => (
          <div key={name}>
            <dt style={{ fontWeight: 700 }}>{name}</dt>
            <dd style={{ color: '#cbd5e1' }}>{value}</dd>
          </div>
        ))}
      </dl>
      <WellProductionChart data={well.productionHistory} />
    </section>
  )
}

function countWellStatuses(wells) {
  const counts = { producing: 0, reducedOutput: 0, down: 0, noData: 0 }
  for (const { status } of wells) counts[status] += 1
  return counts
}

function AreaOverview({ data, title, scope, selectedWell, onSelectionChange, area, compact }) {
  const counts = countWellStatuses(data)
  return (
    <section aria-label={title} style={{ ...wellGridStyle, maxWidth: '900px', width: '100%', textAlign: 'left' }}>
      <header style={wellGridStyle}>
        <h2>{title}</h2>
        <p>{scope}</p>
      </header>
      {compact ? (
        <WellProductionChart data={selectedWell.productionHistory} compact />
      ) : (
        <>
          <WellSummaryCards wells={data} producing={counts.producing + counts.reducedOutput} down={counts.down} />
          <label style={{ ...wellGridStyle, justifySelf: 'start' }}>
            Well
            <select value={selectedWell.id} onChange={(event) => onSelectionChange(area, event.target.value)} style={pumpControlStyle}>
              {data.map(({ id, status }) => <option key={id} value={id}>{id} · {wellStatuses[status].label}</option>)}
            </select>
          </label>
          <SelectedWellDetails well={selectedWell} />
          <p>Down indicates 24 recorded downtime hours. Reduced output indicates nonpositive oil output or less than 75% of the recorded average over the previous 30 days. Status is unavailable when either daily reading is missing.</p>
        </>
      )}
    </section>
  )
}

function Home({ savedViews, onToggleView }) {
  const [question, setQuestion] = useState('')
  const searchInput = useRef(null)
  const navigate = useNavigate()

  function fillSearch(question) {
    setQuestion(question)
    searchInput.current?.focus()
  }

  function submitSearch(event) {
    event.preventDefault()
    const trimmedQuestion = question.trim()
    if (trimmedQuestion) {
      navigate({ pathname: '/results', search: new URLSearchParams({ q: trimmedQuestion }).toString() })
    }
  }

  return (
    <div
      className='App'
      style={{
        width: '100%',
        padding: '24px',
        background: 'linear-gradient(rgba(11, 17, 32, 0.72), rgba(11, 17, 32, 0.72)), url(/oilfield.png) center / cover no-repeat',
      }}
    >
      <h1><span className = 't1'>Well</span> <span className = 't2'>Search</span></h1>
      <div style={{ display: 'grid', gap: '12px', width: 'min(100%, 500px)' }}>
        <Link to='/dashboard' style={{ ...dashboardLinkStyle, justifySelf: 'center' }}>My Dashboard</Link>
        <Search
          inputRef={searchInput}
          value={question}
          onChange={setQuestion}
          onSubmit={submitSearch}
        />
        <ul aria-label='Example questions' style={{ display: 'grid', gap: '8px', listStyle: 'none' }}>
          {exampleQuestions.map((question) => (
            <li key={question} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '8px' }}>
              <button
                type='button'
                onClick={() => fillSearch(question)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #64748b',
                  borderRadius: '8px',
                  backgroundColor: '#151e30',
                  color: '#f1f5f9',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                {question}
              </button>
              <SaveViewStar view={{ question }} savedViews={savedViews} onToggleView={onToggleView} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function useSearchResult(question) {
  const [state, setState] = useState({})

  useEffect(() => {
    if (!question) return
    const controller = new AbortController()
    const { signal } = controller
    // Let React's development effect replay clean up before starting the request.
    const start = setTimeout(async () => {
      try {
        const response = await fetch('http://localhost:8000/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: question, view: 'chart' }),
          signal,
        })
        if (!response.ok) throw new Error(`Search failed (${response.status})`)
        const result = await response.json()
        if (!result?.type) throw new Error('Missing search result type')
        if (!signal.aborted) setState({ question, result })
      } catch {
        if (!signal.aborted) setState({ question, failed: true })
      }
    }, 0)
    return () => {
      clearTimeout(start)
      controller.abort()
    }
  }, [question])

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
  if (failed) return <p role='alert'>Could not load this result. Try again or search for “Downtime by operating area”.</p>
  if (!result) return <p role='status'>Loading search result…</p>
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

function Results({ savedViews, onToggleView }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const question = searchParams.get('q')?.trim()
  const { result, failed } = useSearchResult(question)
  const selection = resolveViewSelection(result, searchParams.get('area'), searchParams.get('well'))
  const currentView = { question, area: searchParams.get('area'), wellId: searchParams.get('well') }

  function updateSelection(nextArea, wellId) {
    const params = new URLSearchParams(searchParams)
    params.delete('area')
    params.delete('well')
    if (nextArea) params.set('area', nextArea)
    if (wellId) params.set('well', wellId)
    setSearchParams(params, { replace: true })
  }

  return (
    <main className='App' style={resultPageStyle}>
      <h1>Search results</h1>
      <Link to='/dashboard' style={dashboardLinkStyle}>My Dashboard</Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '100%' }}>
        <p style={{ overflowWrap: 'anywhere' }}>{question || 'No question submitted.'}</p>
        {question && <SaveViewStar view={currentView} savedViews={savedViews} onToggleView={onToggleView} />}
      </div>
      {question && <SearchVisualization result={result} failed={failed} selection={selection} onSelectionChange={updateSelection} />}
      <Link to='/' style={dashboardLinkStyle}>Back to homepage</Link>
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

function SaveViewStar({ view, savedViews, onToggleView }) {
  const saved = savedViews.some((entry) => savedViewIdentity(entry) === savedViewIdentity(view))

  return (
    <button
      type='button'
      aria-label={`${saved ? 'Remove from' : 'Save to'} My Dashboard: ${view.question}`}
      aria-pressed={saved}
      onClick={() => onToggleView(view)}
      style={{ ...pumpControlStyle, color: '#fcd34d', cursor: 'pointer', lineHeight: 0, minHeight: '40px', flexShrink: 0 }}
    >
      <Star aria-hidden='true' size={18} fill={saved ? 'currentColor' : 'none'} />
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
    <article aria-label={view.title} style={{ ...wellPanelStyle, ...wellGridStyle, alignContent: 'start', overflowWrap: 'anywhere' }}>
      <h3>{view.title}</h3>
      <p style={{ color: '#cbd5e1' }}>{view.question}</p>
      {view.area && <p>Operating area: {view.area}</p>}
      {view.wellId && !view.wellId.startsWith('DEMO-') && <p>Well: {view.wellId}</p>}
      <button ref={renameButton} type='button' onClick={() => setDraft(view.title)} style={{ ...pumpControlStyle, justifySelf: 'start' }}>
        Rename
      </button>
      {draft !== null && (
        <form
          style={wellGridStyle}
          onSubmit={(event) => {
            event.preventDefault()
            if (!draft.trim()) return
            onRename(view.id, draft.trim())
            finishRename()
          }}
        >
          <label style={{ ...wellGridStyle, gap: '4px' }}>
            Display title
            <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} style={{ ...pumpControlStyle, minWidth: 0 }} />
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type='submit' disabled={!draft.trim()} style={pumpControlStyle}>Save</button>
            <button type='button' onClick={finishRename} style={pumpControlStyle}>Cancel</button>
          </div>
        </form>
      )}
      <SavedViewPreview view={view} />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
        <Link to={resultsViewUrl(view)} style={dashboardLinkStyle}>Open view</Link>
        <button type='button' onClick={() => onRemove(view.id)} style={pumpControlStyle}>Remove</button>
      </div>
    </article>
  )
}

function Dashboard({ savedViews, onRename, onRemove }) {
  return (
    <main className='App' style={{ ...resultPageStyle, textAlign: 'left' }}>
      <header style={{ ...wellGridStyle, width: 'min(100%, 1000px)' }}>
        <h1>My Dashboard</h1>
        <p>Saved on this browser.</p>
        <Link to='/' style={{ ...dashboardLinkStyle, justifySelf: 'start' }}>Back to homepage</Link>
      </header>
      <section aria-labelledby='saved-views-heading' style={{ ...wellGridStyle, width: 'min(100%, 1000px)' }}>
        <h2 id='saved-views-heading'>Saved views</h2>
        {savedViews.length === 0
          ? <p>Star a question or result to save it here.</p>
          : (
            <div style={{ ...wellGridStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))' }}>
              {savedViews.map((view) => <SavedViewCard key={view.id} view={view} onRename={onRename} onRemove={onRemove} />)}
            </div>
          )}
      </section>
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
    <div className='wellsearch-shell'>
      <style>{`
        .wellsearch-shell :is(a, button, select, input, [tabindex="0"]):focus-visible {
          outline: 2px solid #f8fafc;
          outline-offset: 2px;
        }
      `}</style>
      {persistenceIssue && (
        <p role='status' style={{ padding: '10px', textAlign: 'center', backgroundColor: '#422b13', color: '#fef3c7' }}>
          Browser storage is unavailable. Dashboard changes may be lost when you leave or refresh.
        </p>
      )}
      <Routes>
        <Route path='/' element={<Home savedViews={savedViews} onToggleView={toggleView} />} />
        <Route path='/results' element={<Results savedViews={savedViews} onToggleView={toggleView} />} />
        <Route path='/dashboard' element={<Dashboard savedViews={savedViews} onRename={renameView} onRemove={removeView} />} />
      </Routes>
    </div>
  )
}
