import { useEffect, useMemo, useState } from 'react'
import { classById, classColorGroups, useStore } from '../../store'
import ColorSelect, { type ColorGroup } from '../ColorSelect'
import InfoIcon from '../InfoIcon'
import { fromISO, MONTHS, nowMinutes, addDays, toISO, todayISO, WEEKDAYS } from '../../utils/date'
import { hexToRgba } from '../../utils/color'
import { dailyClassMinutes, earliestStudyDate, fmtMins, type Unit } from './insightsData'
import {
  daysBetween, heatmapRangeDays, LEVELS, level, monthChunks, monthLabels, streakOf, weekColumns,
  type HeatmapRange,
} from './heatmapGrid'

/**
 * Contribution heatmap of daily studied minutes — the study-time twin of the
 * flashcard tracker, deliberately built on the same grid helpers and the same
 * .ak-* markup so the two tabs of the card feel like one thing.
 *
 * How far back the grid reaches is NOT chosen here: the span comes down from
 * the Insights page's own interval toggle (see `heatmapRangeFor`), so the grid
 * and the charts above it always cover the same stretch of time. The layout and
 * scope controls below stay local — they are about how this one grid is drawn,
 * not about which days it covers.
 *
 * The scope dropdown narrows the grid to a single class, in which case the
 * cells shade in that class's own colour instead of the accent.
 */

/** Dropdown value for "every class plus unassigned time". */
const OVERALL_KEY = 'overall'
/** "All" always covers at least this far back, even with no sessions that old. */
const EARLIEST_ALL = '2026-01-01'

type Layout = 'strip' | 'months'

/** A cell's fill: the class colour, or the theme accent for the overall scope. */
function rampFill(color: string | null, alpha: number): string {
  return color
    ? hexToRgba(color, alpha)
    : `color-mix(in srgb, var(--accent) ${Math.round(alpha * 100)}%, transparent)`
}

export default function StudyHeatmap({ unit, range }: { unit: Unit; range: HeatmapRange }) {
  const { state } = useStore()
  const today = todayISO()
  const nowMin = nowMinutes()

  const [layout, setLayout] = useState<Layout>('strip')
  const [scope, setScope] = useState<string>(OVERALL_KEY)

  // A scope pointing at a class that has since been deleted falls back to overall.
  useEffect(() => {
    if (scope !== OVERALL_KEY && !classById(state, scope)) setScope(OVERALL_KEY)
  }, [scope, state])

  const byDay = useMemo(() => dailyClassMinutes(state, nowMin), [state, nowMin])

  /** date → studied minutes, already narrowed to the chosen scope. */
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const [date, perClass] of byDay) {
      let n = 0
      for (const [cid, mins] of perClass) {
        if (scope !== OVERALL_KEY && cid !== scope) continue
        n += mins
      }
      if (n > 0) m.set(date, n)
    }
    return m
  }, [byDay, scope])

  const scopeColor = scope === OVERALL_KEY ? null : classById(state, scope)?.color ?? null

  const start = useMemo(() => {
    const days = heatmapRangeDays(range)
    if (days) return toISO(addDays(fromISO(today), -(days - 1)))
    const earliest = earliestStudyDate(state)
    return earliest && earliest < EARLIEST_ALL ? earliest : EARLIEST_ALL
  }, [range, state, today])

  const days = useMemo(() => daysBetween(start, today), [start, today])
  const stats = useMemo(() => {
    let total = 0
    let best = 0
    let bestDay = ''
    for (const iso of days) {
      const n = counts.get(iso) ?? 0
      total += n
      if (n > best) {
        best = n
        bestDay = iso
      }
    }
    return { total, best, bestDay, avg: days.length ? total / days.length : 0 }
  }, [days, counts])
  const max = Math.max(1, stats.best)
  const streak = useMemo(() => streakOf(counts, today), [counts, today])

  const scopeGroups: ColorGroup[] = [
    { options: [{ value: OVERALL_KEY, label: 'Overall' }] },
    ...classColorGroups(state),
  ]

  const tooltip = (iso: string, n: number) => {
    const d = fromISO(iso)
    const when = `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`
    return n > 0 ? `${when} — ${fmtMins(n, unit)}` : `${when} — no study time`
  }

  const cell = (iso: string | null, key: string) => {
    if (!iso) return <span key={key} className="ak-cell blank" />
    const n = counts.get(iso) ?? 0
    const lv = level(n, max)
    return (
      <span
        key={key}
        className={`ak-cell ${iso === today ? 'today' : ''}`}
        title={tooltip(iso, n)}
        style={lv ? { background: rampFill(scopeColor, LEVELS[lv - 1]) } : undefined}
      />
    )
  }

  const weeks = weekColumns(days)
  const labels = monthLabels(weeks)
  const months = monthChunks(days)

  return (
    <div className="ins2-hm">
      <div className="ak-stats">
        <div className="ak-stat"><b>{fmtMins(stats.total, unit)}</b><span>studied</span></div>
        <div className="ak-stat"><b>{streak}</b><span>day streak</span></div>
        <div className="ak-stat" title={stats.bestDay ? tooltip(stats.bestDay, stats.best) : undefined}>
          <b>{fmtMins(stats.best, unit)}</b><span>best day</span>
        </div>
        <div className="ak-stat"><b>{fmtMins(stats.avg, unit)}</b><span>daily avg</span></div>
      </div>

      {/* No range pills: the span follows the page interval. Only the layout
          choice is this grid's own, so it keeps the row to itself. */}
      <div className="ak-controls">
        <div className="ak-pills right">
          <button type="button" className={layout === 'strip' ? 'active' : ''}
            title="Continuous strip" onClick={() => setLayout('strip')}>▤ Strip</button>
          <button type="button" className={layout === 'months' ? 'active' : ''}
            title="Separate month blocks" onClick={() => setLayout('months')}>▥ Months</button>
        </div>
      </div>

      <div className="ak-scroll">
        {layout === 'strip' ? (
          <div className="ak-strip">
            <div className="ak-dows">
              <span />{['Mon', 'Wed', 'Fri'].map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="ak-cols">
              <div className="ak-months" style={{ gridTemplateColumns: `repeat(${weeks.length}, 13px)` }}>
                {labels.map((l, i) => <span key={i}>{l}</span>)}
              </div>
              <div className="ak-grid" style={{ gridTemplateColumns: `repeat(${weeks.length}, 13px)` }}>
                {weeks.map((wk, wi) => wk.map((iso, di) => cell(iso, `${wi}-${di}`)))}
              </div>
            </div>
          </div>
        ) : (
          <div className="ak-months-wrap">
            {months.map((m) => (
              <div key={m.key} className="ak-month">
                <div className="ak-month-label">{m.label}</div>
                <div className="ak-grid" style={{ gridTemplateColumns: `repeat(${m.weeks.length}, 13px)` }}>
                  {m.weeks.map((wk, wi) => wk.map((iso, di) => cell(iso, `${wi}-${di}`)))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ak-legend">
        <div className="ak-filter">
          <ColorSelect value={scope} groups={scopeGroups} onChange={setScope} title="Scope" />
        </div>
        <span className="ak-scale">
          less
          <span className="ak-cell tiny" />
          {LEVELS.map((a, i) => (
            <span key={i} className="ak-cell tiny" style={{ background: rampFill(scopeColor, a) }} />
          ))}
          more
        </span>
      </div>

      <div className="ak-hint">
        Minutes studied per day, breaks excluded.
        <InfoIcon text="Built from your study sessions only — a session split across classes counts towards each class for the part it covered. Pick a class above to shade the grid in its colour." />
      </div>

      {stats.total === 0 && (
        <div className="ins2-empty">No study time in this range yet — the grid fills in as you use the timer.</div>
      )}
    </div>
  )
}
