import { useMemo, useState } from 'react'
import { useStore } from '../../store'
import { nowMinutes } from '../../utils/date'
import BreakAnalytics from './BreakAnalytics'
import CoreStats from './CoreStats'
import HeatmapsCard from './HeatmapsCard'
import SubjectBreakdown from './SubjectBreakdown'
import TimelinePatterns from './TimelinePatterns'
import WeeklyMomentum from './WeeklyMomentum'
import { INTERVALS, buildIntervalData, intervalMeta, type IntervalKey, type Unit } from './insightsData'

/**
 * Study-time analytics.
 *
 * Two controls at the top drive the whole page: the interval (a rolling window
 * ending today) and the unit every duration below is printed in. Everything is
 * derived from state.studySessions on the fly — no stored aggregates, so the
 * numbers always match the source, and calendars never enter into it.
 */

const UNITS: { key: Unit; label: string }[] = [
  { key: 'hrs', label: 'hrs' },
  { key: 'mins', label: 'mins' },
]

export default function InsightsPage() {
  const { state } = useStore()
  const nowMin = nowMinutes()
  const [ival, setIval] = useState<IntervalKey>('week')
  const [unit, setUnit] = useState<Unit>('hrs')

  const data = useMemo(() => buildIntervalData(state, ival, nowMin), [state, ival, nowMin])
  const meta = intervalMeta(ival)

  return (
    <div className="insights-page">
      <div className="ins2-wrap">
        <header className="ins2-head">
          <div className="ins2-title">
            <h1>Insights</h1>
            <span className="ins2-sub">Study sessions · {meta.noun}</span>
          </div>
          <div className="ins2-controls">
            <div className="ins2-seg" role="tablist" aria-label="Interval">
              {INTERVALS.map((i) => (
                <button key={i.key} type="button" role="tab" aria-selected={ival === i.key}
                  className={ival === i.key ? 'active' : ''} onClick={() => setIval(i.key)}>
                  {i.label}
                </button>
              ))}
            </div>
            <div className="ins2-seg ins2-seg-unit" role="tablist" aria-label="Duration unit">
              {UNITS.map((u) => (
                <button key={u.key} type="button" role="tab" aria-selected={unit === u.key}
                  className={unit === u.key ? 'active' : ''} onClick={() => setUnit(u.key)}
                  title={u.key === 'hrs' ? 'Show durations as hours and minutes' : 'Show durations in minutes'}>
                  {u.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* The grids lead: they are the one view of the whole span at a glance,
            and they take their range from the interval toggle right above. */}
        <HeatmapsCard ival={ival} unit={unit} />
        <CoreStats data={data} ival={ival} unit={unit} />
        <SubjectBreakdown state={state} data={data} ival={ival} unit={unit} />
        {/* Calendar-week card — only meaningful next to the 7-day interval. It sits
            below the breakdown so its height never buries the sections every
            interval shares (the user read that as "breakdown missing in week"). */}
        {ival === 'week' && <WeeklyMomentum state={state} unit={unit} nowMin={nowMin} />}
        <TimelinePatterns state={state} data={data} ival={ival} unit={unit} />
        <BreakAnalytics data={data} ival={ival} unit={unit} />
      </div>
    </div>
  )
}
