import { useState } from 'react'
import type { AppState } from '../../types'
import InfoIcon from '../InfoIcon'
import ClassDayBars from './ClassDayBars'
import ClassDonut from './ClassDonut'
import ClassPie, { type PieSlice } from './ClassPie'
import {
  classColorOf, classLabelOf, fmtMins, intervalIn, pct,
  type IntervalData, type IntervalKey, type Unit,
} from './insightsData'

/**
 * Section 2 — where the time went. The pie/donut, the list below it and the
 * per-day stacks all read off the same per-class totals, so a slice, a row and
 * a bar segment can never disagree.
 */

type Chart = 'pie' | 'donut'

const CHARTS: { key: Chart; label: string }[] = [
  { key: 'pie', label: 'Pie' },
  { key: 'donut', label: 'Donut' },
]

export default function SubjectBreakdown({ state, data, ival, unit }: {
  state: AppState
  data: IntervalData
  ival: IntervalKey
  unit: Unit
}) {
  // View preference only — nothing derived hangs off it, so it stays local and
  // resets with the page rather than being persisted.
  const [chart, setChart] = useState<Chart>('pie')

  const slices: PieSlice[] = data.classOrder.map((id) => ({
    id,
    label: classLabelOf(state, id),
    color: classColorOf(state, id),
    mins: data.perClass.get(id) ?? 0,
  }))

  const todo = data.tasksInRange.length

  return (
    <section className="ins2-card">
      <div className="ins2-card-head">
        <h2 className="ins2-h2">Subject &amp; Task Breakdown</h2>
        <div className="ins2-tabs" role="tablist" aria-label="Chart style">
          {CHARTS.map((c) => (
            <button key={c.key} type="button" role="tab" aria-selected={chart === c.key}
              className={chart === c.key ? 'active' : ''} onClick={() => setChart(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ins2-pie-wrap">
        {chart === 'pie'
          ? <ClassPie slices={slices} total={data.totalMin} unit={unit} />
          : <ClassDonut slices={slices} total={data.totalMin} unit={unit} />}
      </div>

      {slices.length > 0 && (
        <div className="ins2-rows">
          <div className="ins2-row ins2-row-head">
            <span className="ins2-row-name">Class</span>
            <span className="ins2-row-num">Total</span>
            <span className="ins2-row-num">Daily avg</span>
            <span className="ins2-row-num">Share</span>
          </div>
          {slices.map((s) => (
            <div key={String(s.id)} className="ins2-row">
              <span className="ins2-row-name">
                <span className="ins2-dot" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="ins2-row-num">{fmtMins(s.mins, unit)}</span>
              <span className="ins2-row-num">{fmtMins(s.mins / data.days.length, unit)}</span>
              <span className="ins2-row-num">{pct(s.mins, data.totalMin)}%</span>
            </div>
          ))}
        </div>
      )}

      <ClassDayBars state={state} data={data} ival={ival} unit={unit} />

      <div className="ins2-tiles ins2-tiles-one">
        <div className="ins2-tile">
          <div className="ins2-tile-label">
            To-do completion rate
            <InfoIcon text={`Tasks scheduled on a day ${intervalIn(ival)} — how many of them are ticked off. Tasks with no date, and tasks scheduled outside the interval, are not counted.`} />
          </div>
          <div className={`ins2-tile-value ${todo ? '' : 'na'}`}>
            {todo ? `${data.tasksDone} / ${todo} (${pct(data.tasksDone, todo)}%)` : 'n/a'}
          </div>
          <div className="ins2-tile-sub">
            {todo ? 'planned tasks checked off' : 'no tasks planned in this interval'}
          </div>
        </div>
      </div>
    </section>
  )
}
