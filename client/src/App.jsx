import { useEffect, useRef, useState } from 'react'
import { Drill, Star } from 'lucide-react'
import { Link, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, Rectangle, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import Search from './components/Search'
import './App.css'

const cactusLakeQuestion = 'How are the wells in the Cactus Lake area doing?'
const cactusLakeArea = 'Cactus Lake'
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
  'What are the most common causes of rod failure?',
  'How have equipment failures changed month by month?',
  cactusLakeQuestion,
]

const mockPumpFailures = [
  { area: 'Cactus Lake', failures: 24, fatigue: 9, abrasion: 6, corrosion: 3, otherOrUnknown: 6 },
  { area: 'Winter', failures: 17, fatigue: 7, abrasion: 4, corrosion: 2, otherOrUnknown: 4 },
  { area: 'Court', failures: 11, fatigue: 4, abrasion: 3, corrosion: 1, otherOrUnknown: 3 },
  { area: 'Bodo East', failures: 6, fatigue: 2, abrasion: 1, corrosion: 1, otherOrUnknown: 2 },
]

const mockDowntime = [
  { area: 'Court', downtimeHours: 480, affectedWells: 18 },
  { area: 'Winter', downtimeHours: 360, affectedWells: 14 },
  { area: 'Cactus Lake', downtimeHours: 290, affectedWells: 12 },
  { area: 'Bodo East', downtimeHours: 150, affectedWells: 7 },
]

const mockRodFailureCauses = [
  { cause: 'Fatigue', failures: 36 },
  { cause: 'Corrosion', failures: 25 },
  { cause: 'Load / Excess Stress', failures: 14 },
  { cause: 'Abrasion', failures: 8 },
  { cause: 'Other / unknown', failures: 7 },
]

const mockMonthlyFailures = [
  { month: 'Jan 2026', rods: 12, pumps: 5, tubing: 3 },
  { month: 'Feb 2026', rods: 18, pumps: 7, tubing: 4 },
  { month: 'Mar 2026', rods: 15, pumps: 4, tubing: 6 },
  { month: 'Apr 2026', rods: 23, pumps: 9, tubing: 5 },
]

function makeDemoWell(id, { oil, ...well }) {
  return {
    ...well,
    id: `DEMO-CL-${id}`,
    oilTodayM3: oil[6],
    oilYesterdayM3: oil[5],
    productionHistory: oil.map((oilM3, index) => ({ date: `2026-10-${21 + index}`, oilM3 })),
  }
}

const mockCactusLakeWells = [
  makeDemoWell('001', {
    status: 'producing', x: 1, y: 1, oil: [19, 20, 21, 20, 19, 20, 21],
    recentAverageOilM3: 20, hoursDown: 0, downtimeReason: null,
    latestFailure: { description: 'Pump seal wear', date: 'Sep 12, 2026' },
    latestJob: { description: 'Replaced pump seal', date: 'Sep 13, 2026' },
  }),
  makeDemoWell('002', {
    status: 'producing', x: 3, y: 1, oil: [15, 16, 15, 17, 16, 16, 17],
    recentAverageOilM3: 16, hoursDown: 0, downtimeReason: null,
    latestFailure: null,
    latestJob: { description: 'Routine pump inspection', date: 'Oct 8, 2026' },
  }),
  makeDemoWell('003', {
    status: 'reducedOutput', x: 2, y: 2, oil: [16, 17, 16, 15, 14, 12, 9],
    recentAverageOilM3: 16, hoursDown: 0, downtimeReason: null,
    latestFailure: { description: 'Tubing leak', date: 'Aug 21, 2026' },
    latestJob: { description: 'Replaced tubing section', date: 'Aug 23, 2026' },
  }),
  makeDemoWell('004', {
    status: 'down', x: 4, y: 2, oil: [14, 15, 14, 13, 12, 8, 0],
    recentAverageOilM3: 14, hoursDown: 24, downtimeReason: 'Shut in after pump trip',
    latestFailure: { description: 'Pump motor trip', date: 'Oct 26, 2026' },
    latestJob: { description: 'Electrical inspection', date: 'Oct 27, 2026' },
  }),
  makeDemoWell('005', {
    status: 'producing', x: 1, y: 3, oil: [10, 11, 10, 12, 11, 12, 11],
    recentAverageOilM3: 11, hoursDown: 0, downtimeReason: null,
    latestFailure: null,
    latestJob: { description: 'Lubricated drive assembly', date: 'Oct 12, 2026' },
  }),
  makeDemoWell('006', {
    status: 'down', x: 3, y: 3, oil: [10, 11, 10, 9, 4, 0, 0],
    recentAverageOilM3: 10, hoursDown: 24, downtimeReason: 'Awaiting replacement rod',
    latestFailure: { description: 'Rod parted', date: 'Oct 25, 2026' },
    latestJob: { description: 'Inspected rod string', date: 'Oct 26, 2026' },
  }),
  makeDemoWell('007', {
    status: 'reducedOutput', x: 4, y: 3, oil: [12, 13, 12, 11, 10, 9, 7],
    recentAverageOilM3: 12, hoursDown: 0, downtimeReason: null,
    latestFailure: { description: 'Worn pump valve', date: 'Sep 30, 2026' },
    latestJob: { description: 'Replaced pump valve', date: 'Oct 1, 2026' },
  }),
  makeDemoWell('008', {
    status: 'noData', x: 2, y: 1, oil: [8, 9, null, 8, 9, 8, null],
    recentAverageOilM3: null, hoursDown: null, downtimeReason: null,
    latestFailure: null, latestJob: null,
  }),
]

const wellStatuses = {
  producing: { label: 'Producing', color: '#6ee7b7', rule: 'Recorded production, zero downtime, and output at least 75% of the recent average.' },
  reducedOutput: { label: 'Reduced output', color: '#fcd34d', rule: 'Recorded production, zero downtime, and output below 75% of the recent average.' },
  down: { label: 'Down', color: '#fda4af', rule: '24 hours of downtime and zero oil output.' },
  noData: { label: 'No data', color: '#cbd5e1', rule: 'Current production or downtime readings are unavailable.' },
}

const wellPanelStyle = {
  backgroundColor: '#151e30',
  border: '1px solid #334155',
  borderRadius: '12px',
  padding: 'clamp(12px, 2.5vw, 24px)',
  minWidth: 0,
}
const wellGridStyle = { display: 'grid', gap: '12px' }

const pumpCauses = [
  { key: 'fatigue', name: 'Fatigue', color: '#60a5fa' },
  { key: 'abrasion', name: 'Abrasion', color: '#34d399' },
  { key: 'corrosion', name: 'Corrosion', color: '#fbbf24' },
  { key: 'otherOrUnknown', name: 'Other / unknown', color: '#c4b5fd' },
]

const pumpFailureObservations = {
  fatigue: 'Inspection recorded a fatigue crack in a pump component.',
  abrasion: 'Inspection recorded abrasive wear on the pump barrel.',
  corrosion: 'Inspection recorded corrosion pitting on the pump assembly.',
  otherOrUnknown: 'The pump stopped delivering oil. The cause was recorded as undetermined.',
}

const pumpMaintenanceActions = {
  fatigue: 'Replaced the cracked component and tested the pump.',
  abrasion: 'Replaced the worn barrel and flushed the assembly.',
  corrosion: 'Replaced the pitted components and tested pump operation.',
  otherOrUnknown: 'Swapped the pump assembly and tested it before restart.',
}

const earlierPumpFailureDates = [
  '2025-04-09', '2025-06-18', '2025-08-11', '2025-10-07',
  '2025-12-02', '2026-02-16', '2026-04-13', '2026-07-20',
]

function makePumpWell(id, area, { earlierCauses, recentCause, oil, estimatedCostCad }) {
  const earlierFailures = earlierCauses.map((cause, index) => ({
    type: 'failure', date: earlierPumpFailureDates[index], cause,
    description: pumpFailureObservations[cause],
  }))
  const events = [
    ...earlierFailures,
    { type: 'failure', date: '2026-10-23', cause: recentCause, description: pumpFailureObservations[recentCause] },
    { type: 'maintenance', date: '2026-10-24', description: pumpMaintenanceActions[recentCause], estimatedCostCad },
  ]
  const failures = events.filter((event) => event.type === 'failure')
  return {
    id: `DEMO-${id}`,
    area,
    failureCount: failures.length,
    causes: pumpCauses.map(({ key, name }) => ({
      name, count: failures.filter((event) => event.cause === key).length,
    })),
    productionHistory: oil.map((oilM3, index) => ({ date: `2026-10-${21 + index}`, oilM3 })),
    events,
  }
}

const mockPumpWells = [
  makePumpWell('CL-101', 'Cactus Lake', {
    earlierCauses: ['fatigue', 'abrasion', 'otherOrUnknown', 'fatigue', 'corrosion', 'abrasion', 'fatigue', 'otherOrUnknown'],
    recentCause: 'fatigue', oil: [19, 20, 3, 0, 13, 18, 19], estimatedCostCad: 4200,
  }),
  makePumpWell('CL-102', 'Cactus Lake', {
    earlierCauses: ['fatigue', 'abrasion', 'otherOrUnknown', 'corrosion', 'fatigue', 'otherOrUnknown', 'fatigue'],
    recentCause: 'abrasion', oil: [15, 14, 4, 2, 10, 13, 15], estimatedCostCad: 3500,
  }),
  makePumpWell('CL-103', 'Cactus Lake', {
    earlierCauses: ['abrasion', 'fatigue', 'otherOrUnknown', 'abrasion', 'fatigue', 'otherOrUnknown'],
    recentCause: 'corrosion', oil: [12, 11, 2, 0, 7, 10, 11], estimatedCostCad: null,
  }),
  makePumpWell('WI-101', 'Winter', {
    earlierCauses: ['fatigue', 'abrasion', 'fatigue', 'corrosion', 'otherOrUnknown', 'abrasion'],
    recentCause: 'fatigue', oil: [17, 18, 5, 0, 12, 16, 17], estimatedCostCad: 3900,
  }),
  makePumpWell('WI-102', 'Winter', {
    earlierCauses: ['fatigue', 'abrasion', 'otherOrUnknown', 'fatigue'],
    recentCause: 'corrosion', oil: [14, 14, 3, 1, 10, 12, 14], estimatedCostCad: 2800,
  }),
  makePumpWell('WI-103', 'Winter', {
    earlierCauses: ['fatigue', 'otherOrUnknown', 'abrasion', 'fatigue'],
    recentCause: 'otherOrUnknown', oil: [10, 9, 0, 0, 5, 8, 9], estimatedCostCad: 5100,
  }),
  makePumpWell('CO-101', 'Court', {
    earlierCauses: ['fatigue', 'otherOrUnknown', 'fatigue'],
    recentCause: 'abrasion', oil: [13, 13, 3, 2, 8, 11, 12], estimatedCostCad: 3100,
  }),
  makePumpWell('CO-102', 'Court', {
    earlierCauses: ['fatigue', 'otherOrUnknown', 'abrasion'],
    recentCause: 'corrosion', oil: [16, 15, 1, 0, 9, 13, 15], estimatedCostCad: null,
  }),
  makePumpWell('CO-103', 'Court', {
    earlierCauses: ['otherOrUnknown', 'abrasion'],
    recentCause: 'fatigue', oil: [9, 10, 2, 0, 6, 8, 9], estimatedCostCad: 2700,
  }),
  makePumpWell('BE-101', 'Bodo East', {
    earlierCauses: ['fatigue'],
    recentCause: 'otherOrUnknown', oil: [8, 8, 0, 1, 4, 6, 8], estimatedCostCad: 4600,
  }),
  makePumpWell('BE-102', 'Bodo East', {
    earlierCauses: ['abrasion'],
    recentCause: 'fatigue', oil: [11, 10, 2, 0, 6, 9, 10], estimatedCostCad: 3300,
  }),
  makePumpWell('BE-103', 'Bodo East', {
    earlierCauses: ['otherOrUnknown'],
    recentCause: 'corrosion', oil: [7, 7, 1, 0, 4, 6, 7], estimatedCostCad: null,
  }),
]

const pumpControlStyle = {
  backgroundColor: '#0b1120',
  color: '#f1f5f9',
  border: '1px solid #94a3b8',
  borderRadius: '6px',
  padding: '8px 10px',
  font: 'inherit',
}
const pumpEventTypes = {
  failure: { label: 'Failure', color: '#fda4af', dash: '4 3' },
  maintenance: { label: 'Maintenance', color: '#6ee7b7', dash: '8 3' },
}
const maintenanceCost = new Intl.NumberFormat('en-CA', {
  style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
})

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

function ChartFrame({ title, children, compact }) {
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
      <div style={{ height: compact ? '210px' : '370px', minWidth: 0 }}>
        <ResponsiveContainer width='100%' height='100%'>{children}</ResponsiveContainer>
      </div>
    </section>
  )
}

function PumpFailuresTooltip({ active, payload }) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null

  return (
    <div style={tooltipStyle}>
      <strong>{row.area}</strong>
      {pumpCauses.map(({ key, name }) => <div key={key}>{name}: {row[key]}</div>)}
      <div>Total failures: {row.failures}</div>
    </div>
  )
}

function DowntimeTooltip({ active, payload }) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null

  return (
    <div style={tooltipStyle}>
      <strong>{row.area}</strong>
      <div>Downtime: {row.downtimeHours} hours</div>
      <div>Affected wells: {row.affectedWells}</div>
    </div>
  )
}

function PumpFailuresChart({ data, selectedArea, onSelectArea, compact }) {
  return (
    <ChartFrame title='Pump failures by operating area' compact={compact}>
      <BarChart data={data} margin={chartMargin}>
        <CartesianGrid stroke='#475569' strokeDasharray='3 3' vertical={false} />
        <XAxis dataKey='area' tick={axisTick} minTickGap={4} />
        <YAxis allowDecimals={false} width={48} tick={axisTick} label={failureAxisLabel} />
        <Tooltip content={<PumpFailuresTooltip />} cursor={{ fill: '#94a3b8', fillOpacity: 0.12 }} />
        <Legend />
        {pumpCauses.map(({ key, name, color }) => (
          <Bar
            key={key}
            dataKey={key}
            name={name}
            fill={color}
            stackId='causes'
            isAnimationActive={false}
            onClick={onSelectArea ? ({ payload }) => onSelectArea(payload.area) : undefined}
            shape={(props) => (
              <Rectangle
                {...props}
                fillOpacity={selectedArea && props.payload.area !== selectedArea ? 0.4 : 1}
                style={{ cursor: onSelectArea ? 'pointer' : undefined }}
              />
            )}
          />
        ))}
      </BarChart>
    </ChartFrame>
  )
}

function DowntimeChart({ data, compact }) {
  return (
    <ChartFrame title='Downtime by operating area' compact={compact}>
      <BarChart data={data} layout='vertical' margin={chartMargin}>
        <CartesianGrid stroke='#475569' strokeDasharray='3 3' horizontal={false} />
        <XAxis
          type='number'
          allowDecimals={false}
          tick={axisTick}
          label={{ value: 'Downtime (hours)', position: 'insideBottom', offset: -6, fill: axisTick.fill }}
        />
        <YAxis type='category' dataKey='area' width={84} tick={axisTick} />
        <Tooltip content={<DowntimeTooltip />} cursor={{ fill: '#94a3b8', fillOpacity: 0.12 }} />
        <Bar dataKey='downtimeHours' name='Downtime (hours)' fill='#38bdf8' maxBarSize={40} />
      </BarChart>
    </ChartFrame>
  )
}

function RodFailureCausesChart({ data, compact }) {
  return (
    <ChartFrame title='Recorded rod failure causes' compact={compact}>
      <BarChart data={data} layout='vertical' margin={chartMargin}>
        <CartesianGrid stroke='#475569' strokeDasharray='3 3' horizontal={false} />
        <XAxis
          type='number'
          allowDecimals={false}
          tick={axisTick}
          label={{ value: 'Failures', position: 'insideBottom', offset: -6, fill: axisTick.fill }}
        />
        <YAxis type='category' dataKey='cause' width={132} tick={axisTick} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#94a3b8', fillOpacity: 0.12 }} />
        <Bar dataKey='failures' name='Failures' fill='#c4b5fd' maxBarSize={40} />
      </BarChart>
    </ChartFrame>
  )
}

function MonthlyFailuresChart({ data, compact }) {
  return (
    <ChartFrame title='Monthly equipment failures' compact={compact}>
      <LineChart data={data} margin={chartMargin}>
        <CartesianGrid stroke='#475569' strokeDasharray='3 3' />
        <XAxis dataKey='month' tick={axisTick} minTickGap={4} padding={{ left: 12, right: 16 }} />
        <YAxis allowDecimals={false} width={48} tick={axisTick} label={failureAxisLabel} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend />
        <Line type='linear' dataKey='rods' name='Rods' stroke='#60a5fa' strokeWidth={2} />
        <Line type='linear' dataKey='pumps' name='Pumps' stroke='#34d399' strokeWidth={2} />
        <Line type='linear' dataKey='tubing' name='Tubing' stroke='#fbbf24' strokeWidth={2} />
      </LineChart>
    </ChartFrame>
  )
}

function largestRow(data, valueOf) {
  return data.reduce((largest, row) => valueOf(row) > valueOf(largest) ? row : largest)
}

function monthlyTotal({ rods, pumps, tubing }) {
  return rods + pumps + tubing
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
    { label: 'Total example wells', value: wells.length },
    { label: 'Wells producing', value: producing, note: 'Includes wells with reduced output.' },
    { label: 'Wells down', value: down },
    {
      label: 'Recorded oil output today',
      value: measurement(recordedToday.length ? totalToday : null, 'm³'),
      note: `${recordedToday.length} of ${wells.length} wells have a reading.`,
    },
    { label: 'Change from yesterday', value: changeLabel, note: comparisonNote },
  ]

  return (
    <section aria-labelledby='well-summary-heading' style={wellGridStyle}>
      <h3 id='well-summary-heading'>Summary for the {wells.length} example wells</h3>
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

function WellLayout({ wells, selectedId, onSelect }) {
  const layoutOrder = [...wells].sort((first, second) => first.y - second.y || first.x - second.x)

  return (
    <section aria-labelledby='well-layout-heading' style={{ ...wellPanelStyle, ...wellGridStyle }}>
      <style>{`
        .cactus-well-layout {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }
        .cactus-well-button:focus-visible {
          outline: 2px solid #f8fafc;
          outline-offset: 3px;
        }
        .cactus-well-pulse {
          border-radius: 50%;
          animation: cactus-well-pulse 2.6s ease-out infinite;
        }
        @keyframes cactus-well-pulse {
          0% { box-shadow: 0 0 0 0 rgb(253 164 175 / 45%); }
          75%, 100% { box-shadow: 0 0 0 7px rgb(253 164 175 / 0%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .cactus-well-pulse { animation: none; }
        }
        @media (max-width: 680px) {
          .cactus-well-layout { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .cactus-well-layout > .cactus-well-button { grid-area: auto !important; }
        }
      `}</style>
      <h3 id='well-layout-heading'>Illustrative well layout</h3>
      <p style={{ color: '#cbd5e1' }}>Positions are schematic. Select a well to view its readings and history.</p>
      <ul aria-label='Well status legend' style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', listStyle: 'none' }}>
        {Object.values(wellStatuses).map(({ label, color }) => (
          <li key={label}><span aria-hidden='true' style={{ color }}>● </span>{label}</li>
        ))}
      </ul>
      <div className='cactus-well-layout'>
        {layoutOrder.map((well) => {
          const { color, label } = wellStatuses[well.status]
          const selected = selectedId === well.id

          return (
            <button
              key={well.id}
              type='button'
              className='cactus-well-button'
              aria-label={`${well.id}, ${label}`}
              aria-pressed={selected}
              aria-controls='selected-well-details'
              onClick={() => onSelect(well.id)}
              style={{
                gridArea: `${well.y} / ${well.x}`,
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '6px 10px',
                padding: '10px',
                minWidth: 0,
                border: `2px solid ${selected ? '#93c5fd' : '#64748b'}`,
                borderRadius: '8px',
                backgroundColor: selected ? '#233b59' : '#0b1120',
                color: '#f1f5f9',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span
                className={well.status === 'down' ? 'cactus-well-pulse' : undefined}
                style={{ display: 'inline-flex', padding: '4px', color }}
              >
                <Drill aria-hidden='true' size={20} />
              </span>
              <span style={{ overflowWrap: 'anywhere' }}>
                <strong>{well.id}</strong>
                <span style={{ display: 'block', color }}>{label}</span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function productionDate(date) {
  return `Oct ${date.slice(-2)}`
}

function WellProductionChart({ data, events = [], compact }) {
  const missingDates = data.filter(({ oilM3 }) => oilM3 == null).map(({ date }) => productionDate(date))
  const chartEvents = events.filter((event) => data.some(({ date }) => date === event.date))

  return (
    <div style={wellGridStyle}>
      <h4>Seven-day oil production (m³)</h4>
      {missingDates.length > 0 && <p>No reading for {missingDates.join(', ')}.</p>}
      {chartEvents.length > 0 && (
        <ul aria-label='Production chart markers' style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', listStyle: 'none' }}>
          {chartEvents.map(({ date, type }) => (
            <li key={`${date}-${type}`}>
              <span aria-hidden='true' style={{ color: pumpEventTypes[type].color }}>│ </span>
              {pumpEventTypes[type].label} · <time dateTime={date}>{productionDate(date)}</time>
            </li>
          ))}
        </ul>
      )}
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
            {chartEvents.map(({ date, type }) => (
              <ReferenceLine
                key={`${date}-${type}`}
                x={date}
                stroke={pumpEventTypes[type].color}
                strokeWidth={2}
                strokeDasharray={pumpEventTypes[type].dash}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function PumpWellTable({ area, wells, selectedWell, onViewWell }) {
  const cellStyle = { padding: '10px 8px', borderBottom: '1px solid #475569', textAlign: 'left' }

  return (
    <section aria-labelledby='pump-area-heading' style={{ ...wellPanelStyle, ...wellGridStyle }}>
      <h3 id='pump-area-heading'>{area.area}</h3>
      <p>{area.failures} total recorded mock pump failures</p>
      <div role='region' aria-label='Affected wells table' tabIndex={0} style={{ overflowX: 'auto' }}>
        <table aria-label='Affected wells' style={{ width: '100%', minWidth: '420px', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Well ID', 'Pump failures', 'Most common recorded cause', 'Details'].map((label) => (
                <th key={label} scope='col' style={cellStyle}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {wells.map((well) => {
              const highest = largestRow(well.causes, (cause) => cause.count)
              const topCauses = well.causes.filter(({ count }) => count === highest.count).map(({ name }) => name)
              const isOpen = selectedWell?.id === well.id

              return (
                <tr key={well.id}>
                  <th scope='row' style={cellStyle}>{well.id}</th>
                  <td style={cellStyle}>{well.failureCount}</td>
                  <td style={cellStyle}>{topCauses.join(', ')}{topCauses.length > 1 && ' (tie)'}</td>
                  <td style={cellStyle}>
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
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function PumpWellDetails({ well, onClose }) {
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
      <p>{well.failureCount} recorded pump failures</p>
      <h4>Recorded cause breakdown</h4>
      <dl style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px' }}>
        {well.causes.map(({ name, count }) => (
          <div key={name}><dt>{name}</dt><dd>{count}</dd></div>
        ))}
      </dl>
      <WellProductionChart data={well.productionHistory} events={well.events} />
      <h4>Recorded failure and maintenance history</h4>
      <ol style={{ ...wellGridStyle, paddingLeft: '24px' }}>
        {well.events.map((event) => (
          <li key={`${event.date}-${event.type}`}>
            <strong><time dateTime={event.date}>{event.date}</time> · {pumpEventTypes[event.type].label}</strong>
            {event.cause && <> · {pumpCauses.find(({ key }) => key === event.cause).name}</>}
            <p>{event.description}</p>
            {event.type === 'maintenance' && (
              <p>Field-estimated maintenance cost: {event.estimatedCostCad == null
                ? 'No estimate recorded'
                : `${maintenanceCost.format(event.estimatedCostCad)} CAD`}</p>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

function PumpFailureDrillDown({ data, wells, selectedArea, selectedWell, onSelectionChange }) {
  const viewButton = useRef(null)
  const areaSelect = useRef(null)
  const area = data.find((row) => row.area === selectedArea)
  const highest = largestRow(data, (row) => row.failures)

  function selectArea(nextArea) {
    if (nextArea === selectedArea) return
    viewButton.current = null
    onSelectionChange(nextArea)
  }

  function closeWell() {
    onSelectionChange(selectedArea)
    const focusTarget = viewButton.current?.isConnected ? viewButton.current : areaSelect.current
    focusTarget?.focus()
  }

  return (
    <section aria-label='Pump failure drill-down' style={{ ...wellGridStyle, textAlign: 'left', width: '100%', maxWidth: '900px' }}>
      <style>{`
        .pump-drill-down :is(button, select, [tabindex="0"]):focus-visible {
          outline: 2px solid #f8fafc;
          outline-offset: 2px;
        }
      `}</style>
      <p><strong>Demo data — fictional wells and readings</strong></p>
      <PumpFailuresChart data={data} selectedArea={selectedArea} onSelectArea={selectArea} />
      <p>{highest.area} had the most mock pump failures, with {highest.failures} recorded.</p>
      <div className='pump-drill-down' style={wellGridStyle}>
        {!area && <p>Select an operating area using a bar segment or the dropdown to see its affected wells.</p>}
        <label style={{ justifySelf: 'start', display: 'grid', gap: '4px' }}>
          Operating area
          <select ref={areaSelect} value={selectedArea ?? ''} onChange={(event) => selectArea(event.target.value)} style={pumpControlStyle}>
            <option value=''>Select an operating area</option>
            {data.map(({ area }) => <option key={area}>{area}</option>)}
          </select>
        </label>
        {area && (
          <PumpWellTable
            area={area}
            wells={wells.filter((well) => well.area === selectedArea)}
            selectedWell={selectedWell}
            onViewWell={(well, button) => {
              viewButton.current = button
              onSelectionChange(selectedArea, well.id)
            }}
          />
        )}
        {selectedWell && <PumpWellDetails well={selectedWell} onClose={closeWell} />}
      </div>
    </section>
  )
}

function wellEvent(event) {
  return event ? `${event.description} (${event.date})` : 'No recorded entry'
}

function SelectedWellDetails({ well }) {
  const { color, label } = wellStatuses[well.status]
  const details = [
    ['Oil output today', measurement(well.oilTodayM3, 'm³')],
    ['Recent average oil output', measurement(well.recentAverageOilM3, 'm³')],
    ['Downtime today', measurement(well.hoursDown, 'hours')],
    ['Recorded downtime reason', well.downtimeReason ?? 'No recorded reason'],
    ['Latest recorded failure', wellEvent(well.latestFailure)],
    ['Latest maintenance job', wellEvent(well.latestJob)],
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
      <p style={{ color: '#cbd5e1' }}>Failure and maintenance entries provide historical context. Current status uses the snapshot’s production and downtime readings.</p>
      <WellProductionChart data={well.productionHistory} />
    </section>
  )
}

function countWellStatuses(wells) {
  const counts = { producing: 0, reducedOutput: 0, down: 0, noData: 0 }
  for (const { status } of wells) counts[status] += 1
  return counts
}

function CactusLakeOverview({ wells, selectedWell, onSelectWell }) {
  const counts = countWellStatuses(wells)

  return (
    <section aria-labelledby='cactus-lake-heading' style={{ ...wellGridStyle, maxWidth: '900px', width: '100%', textAlign: 'left' }}>
      <header style={wellGridStyle}>
        <h2 id='cactus-lake-heading'>Cactus Lake well status</h2>
        <p><strong>Demo data — fictional wells and readings</strong></p>
        <p><strong>As of <time dateTime='2026-10-27'>October 27, 2026</time></strong></p>
        <p>{counts.producing} wells are producing at or above the demo threshold, {counts.reducedOutput} show reduced output, {counts.down} are down, and {counts.noData} has missing data.</p>
      </header>
      <WellSummaryCards wells={wells} producing={counts.producing + counts.reducedOutput} down={counts.down} />
      <WellLayout wells={wells} selectedId={selectedWell.id} onSelect={onSelectWell} />
      <SelectedWellDetails well={selectedWell} />
      <section aria-labelledby='well-rules-heading' style={{ ...wellPanelStyle, ...wellGridStyle }}>
        <h3 id='well-rules-heading'>Demo status definitions</h3>
        <p>The 75% threshold is an illustrative demo assumption.</p>
        <ul style={{ paddingLeft: '20px', lineHeight: 1.5 }}>
          {Object.values(wellStatuses).map(({ label, rule }) => (
            <li key={label}><strong>{label}.</strong> {rule}</li>
          ))}
        </ul>
      </section>
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

function Results({ savedViews, onToggleView }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const question = searchParams.get('q')?.trim()
  const exampleIndex = questionIndex(question)
  const { area, well } = resolveViewSelection(exampleIndex, searchParams.get('area'), searchParams.get('well'))
  const cactusWell = exampleIndex === 4 ? well ?? mockCactusLakeWells.find(({ status }) => status === 'down') : null
  const currentView = { question, area: cactusWell ? cactusLakeArea : area, wellId: (cactusWell ?? well)?.id }
  let chart
  let explanation

  function updateSelection(nextArea, wellId) {
    const params = new URLSearchParams(searchParams)
    params.delete('area')
    params.delete('well')
    if (nextArea) params.set('area', nextArea)
    if (wellId) params.set('well', wellId)
    setSearchParams(params, { replace: true })
  }

  switch (exampleIndex) {
    case 1: {
      const highest = largestRow(mockDowntime, (row) => row.downtimeHours)
      chart = <DowntimeChart data={mockDowntime} />
      explanation = `${highest.area} had the most mock downtime, at ${highest.downtimeHours} hours.`
      break
    }
    case 2: {
      const highest = largestRow(mockRodFailureCauses, (row) => row.failures)
      chart = <RodFailureCausesChart data={mockRodFailureCauses} />
      explanation = `${highest.cause} was the most frequent recorded cause in the mock data, with ${highest.failures} rod failures.`
      break
    }
    case 3: {
      const highest = largestRow(mockMonthlyFailures, monthlyTotal)
      chart = <MonthlyFailuresChart data={mockMonthlyFailures} />
      explanation = `${highest.month} had the most mock failures across rods, pumps, and tubing, with ${monthlyTotal(highest)} combined.`
      break
    }
  }

  return (
    <main className='App' style={resultPageStyle}>
      <h1>Search results</h1>
      <Link to='/dashboard' style={dashboardLinkStyle}>My Dashboard</Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '100%' }}>
        <p style={{ overflowWrap: 'anywhere' }}>{question || 'No question submitted.'}</p>
        {question && <SaveViewStar view={currentView} savedViews={savedViews} onToggleView={onToggleView} />}
      </div>
      {chart && (
        <>
          <p style={{ color: '#cbd5e1' }}>Demo data — illustrative counts</p>
          {chart}
          <p>{explanation}</p>
        </>
      )}
      {exampleIndex === 0 && (
        <PumpFailureDrillDown
          data={mockPumpFailures}
          wells={mockPumpWells}
          selectedArea={area}
          selectedWell={well}
          onSelectionChange={updateSelection}
        />
      )}
      {cactusWell && (
        <CactusLakeOverview
          wells={mockCactusLakeWells}
          selectedWell={cactusWell}
          onSelectWell={(wellId) => updateSelection(cactusLakeArea, wellId)}
        />
      )}
      {question && exampleIndex === -1 && <p>Choose one of the five example questions to preview a result.</p>}
      <Link to='/' style={dashboardLinkStyle}>Back to homepage</Link>
    </main>
  )
}

function questionIndex(question) {
  const normalized = question?.trim().toLowerCase()
  return exampleQuestions.findIndex((example) => example.toLowerCase() === normalized)
}

function resolveViewSelection(index, area, wellId) {
  if (index === 0) {
    const validArea = mockPumpFailures.find((row) => row.area === area)?.area
    const well = mockPumpWells.find((row) => row.id === wellId && (!area || row.area === validArea))
    return { area: validArea ?? well?.area, well }
  }
  if (index === 4 && (!area || area === cactusLakeArea)) {
    const well = mockCactusLakeWells.find((row) => row.id === wellId)
    return { area: area || (well && cactusLakeArea), well }
  }
  return {}
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
      const { area, well } = resolveViewSelection(questionIndex(question), entry.area, entry.wellId)
      const view = { id, question, title, savedAt, area, wellId: well?.id }
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
  const index = questionIndex(view.question)
  const { area, well } = resolveViewSelection(index, view.area, view.wellId)

  if (well) {
    const status = wellStatuses[well.status]
    return (
      <div style={{ ...wellGridStyle, minWidth: 0 }}>
        {status
          ? <p style={{ color: status.color }}>{status.label}</p>
          : <p>{well.failureCount} recorded pump failures</p>}
        <WellProductionChart data={well.productionHistory} compact />
      </div>
    )
  }

  switch (index) {
    case 0:
      return <PumpFailuresChart data={mockPumpFailures} selectedArea={area} compact />
    case 1:
      return <DowntimeChart data={mockDowntime} compact />
    case 2:
      return <RodFailureCausesChart data={mockRodFailureCauses} compact />
    case 3:
      return <MonthlyFailuresChart data={mockMonthlyFailures} compact />
    case 4: {
      const counts = countWellStatuses(mockCactusLakeWells)
      return (
        <dl style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}>
          {Object.entries(wellStatuses).map(([key, { label, color }]) => (
            <div key={key}><dt style={{ color }}>{label}</dt><dd>{counts[key]}</dd></div>
          ))}
        </dl>
      )
    }
    default:
      return <p style={{ color: '#cbd5e1' }}>No demo preview for this question.</p>
  }
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
      {view.wellId && <p>Well: {view.wellId}</p>}
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
        <p>Saved on this browser. All displayed readings are demo data.</p>
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
