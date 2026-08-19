import { useMemo } from 'react'
import type { AppState } from '../../types'
import { fmtTime } from '../../utils/date'
import InfoIcon from '../InfoIcon'
import QuarterWeeks from './QuarterWeeks'
import {
  buildWeekMomentum, fmtDelta, fmtMins,
  type Unit, type WeekMomentum,
} from './insightsData'

/**
 * Section 2 — weekly momentum, shown only under "Past week".
 *
 * The rest of the page reports on a rolling window ending today; this one card
 * deliberately reports on the *calendar* week (starting on state.weekStart), so
 * "this week" lines up with the calendar and with last week for comparison.
 * Every duration still obeys the page's hrs/mins toggle.
 */

const WEEK_NOTE =
  'Unlike the rest of this page, which reports on a rolling 7-day window ending today, this card covers the current calendar week — the week starting on your chosen first weekday and containing today.'

export default function WeeklyMomentum({ state, unit, nowMin }: {
  state: AppState
  unit: Unit
  nowMin: number
}) {
  const m = useMemo(() => buildWeekMomentum(state, nowMin), [state, nowMin])
  const empty = !m.hasThis && !m.hasPrev

  return (
    <section className="ins2-card">
      <div className="ins2-wm-head">
        <h2 className="ins2-h2">Weekly momentum</h2>
        <span className="ins2-wm-range">
          {m.rangeLabel}
          <InfoIcon text={WEEK_NOTE} />
        </span>
      </div>

      {empty ? (
        <div className="ins2-empty">
          Nothing logged this calendar week or the one before it — start a session in the study
          timer and this week's progress will show up here.
        </div>
      ) : (
        <>
          <div className="ins2-tiles ins2-tiles-two ins2-wm-tiles">
            <div className="ins2-tile">
              <div className="ins2-tile-label">
                Total time
                <InfoIcon text="Time studied so far this calendar week, breaks excluded. Time not assigned to a class still counts." />
              </div>
              <div className="ins2-tile-value">{fmtMins(m.totalMin, unit)}</div>
              <div className="ins2-tile-sub">so far this week</div>
            </div>
            <div className="ins2-tile">
              <div className="ins2-tile-label">
                Daily average
                <InfoIcon text={`This week's total divided by the ${m.daysElapsed} ${m.daysElapsed === 1 ? 'day' : 'days'} elapsed so far — today included, the days still to come are not.`} />
              </div>
              <div className="ins2-tile-value">{fmtMins(m.dailyAvgMin, unit)}</div>
              <div className="ins2-tile-sub">
                over {m.daysElapsed} {m.daysElapsed === 1 ? 'day' : 'days'} so far
              </div>
            </div>
          </div>

          <CumulativeCompare m={m} unit={unit} />
          <DailyBars m={m} unit={unit} />
        </>
      )}

      {/* Outside the empty branch on purpose: the quarter can hold plenty of
          study time even when this week and last week are both blank. */}
      <QuarterWeeks state={state} unit={unit} nowMin={nowMin} />
    </section>
  )
}

/* ---------- cumulative step comparison ---------- */

const C_W = 620
const C_H = 178
const C_L = 48
const C_R = 14
const C_T = 14
const C_B = 24
const C_IW = C_W - C_L - C_R
const C_IH = C_H - C_T - C_B

const CUM_NOTE =
  "Study time added up as the week goes: each step is one day's running total. Grey is last week, all seven days; the accent line is this week and stops at today. The figure above is the gap between the two at the same point in the week."

function CumulativeCompare({ m, unit }: { m: WeekMomentum; unit: Unit }) {
  const band = C_IW / 7
  const maxY = Math.max(...m.cumThis.slice(0, m.todayIdx + 1), ...m.cumPrev, 1)
  const x = (i: number) => C_L + i * band
  const y = (v: number) => C_T + C_IH - (v / maxY) * C_IH
  const base = y(0)

  // Both series are step functions: a day's running total holds flat across the
  // day's band, then jumps at the boundary.
  const stepPts = (cum: number[], upto: number) => {
    let d = `M ${x(0)} ${base}`
    for (let i = 0; i <= upto; i++) d += ` L ${x(i)} ${y(cum[i])} L ${x(i + 1)} ${y(cum[i])}`
    return d
  }
  const prevPath = `${stepPts(m.cumPrev, 6)} L ${x(7)} ${base} Z`
  const thisPath = stepPts(m.cumThis, m.todayIdx)
  const tipX = x(m.todayIdx + 1)
  const tipY = y(m.cumThis[m.todayIdx])
  const up = m.deltaMin > 0

  return (
    <>
      <div className="ins2-sub-head">
        <h3>Cumulative vs last week</h3>
        <InfoIcon text={CUM_NOTE} />
      </div>

      <div className="ins2-wm-delta">
        <span className="ins2-wm-delta-label">As of {m.todayName}</span>
        <span className="ins2-wm-delta-row">
          <span className={`ins2-wm-delta-value ${up ? 'up' : 'down'}`}>{fmtDelta(m.deltaMin, unit)}</span>
          <span className="ins2-wm-delta-note">vs last week</span>
        </span>
      </div>

      <svg className="ins2-line" viewBox={`0 0 ${C_W} ${C_H}`} role="img"
        aria-label="Cumulative study time this calendar week compared with last week">
        {[0, 0.5, 1].map((f) => {
          const gy = C_T + C_IH - f * C_IH
          return (
            <g key={f}>
              <line x1={C_L} y1={gy} x2={C_W - C_R} y2={gy} className="ins2-axis-grid" />
              <text x={C_L - 6} y={gy + 3} textAnchor="end" className="ins2-axis-tick">
                {f === 0 ? '0' : fmtMins(maxY * f, unit)}
              </text>
            </g>
          )
        })}

        <path d={prevPath} className="ins2-wm-prev-fill" />
        <path d={`${stepPts(m.cumPrev, 6)}`} className="ins2-wm-prev-line" fill="none" />
        <path d={thisPath} className="ins2-wm-this-line" fill="none" />
        <circle cx={tipX} cy={tipY} r="3.6" className="ins2-wm-this-dot" />

        {m.labels.map((lab, i) => (
          <text key={i} x={x(i) + band / 2} y={C_H - 7} textAnchor="middle"
            className={`ins2-axis-tick ${i === m.todayIdx ? 'today' : ''}`}>
            {lab}
          </text>
        ))}
      </svg>

      <div className="ins2-wm-legend">
        <span className="ins2-wm-key"><i className="k-this" />This week</span>
        <span className="ins2-wm-key"><i className="k-prev" />Last week</span>
      </div>
    </>
  )
}

/* ---------- daily bars with start / finish annotations ---------- */

const B_W = 620
const B_H = 214
const B_L = 48
const B_R = 14
const B_T = 16
const B_B = 26
const B_IW = B_W - B_L - B_R
const B_IH = B_H - B_T - B_B
/** The start/finish dots keep clear of the axis so their labels stay inside. */
const T_TOP = B_T + 12
const T_BOT = B_T + B_IH - 42

const BARS_NOTE =
  "Bars are the minutes studied each day of this calendar week. Over them, two dot-to-dot lines track when each day began and ended: the first session's start and the last session's finish. Later times sit higher, so the gap between the lines is the span of the day. Days with nothing logged get no dots."

interface Anno {
  i: number
  cx: number
  startY: number | null
  endY: number | null
  startLabel: string
  endLabel: string
}

function DailyBars({ m, unit }: { m: WeekMomentum; unit: Unit }) {
  const band = B_IW / 7
  const barW = Math.min(band * 0.46, 34)
  const maxMin = Math.max(...m.days.map((d) => d.studiedMin), 1)
  const cx = (i: number) => B_L + i * band + band / 2
  const barY = (v: number) => B_T + B_IH - (v / maxMin) * B_IH
  const base = B_T + B_IH

  const withTimes = m.days.filter((d) => d.firstStartMin !== null && d.lastEndMin !== null)
  const tLo = withTimes.length ? Math.min(...withTimes.map((d) => d.firstStartMin as number)) : 0
  const tHi = withTimes.length ? Math.max(...withTimes.map((d) => d.lastEndMin as number)) : 0
  // A single logged day (or one that started and ended in the same minute) would
  // otherwise divide by zero; pad the range so it always has extent.
  const lo = tHi - tLo < 60 ? tLo - 30 : tLo
  const hi = tHi - tLo < 60 ? tHi + 30 : tHi
  const ty = (t: number) => T_BOT - ((t - lo) / Math.max(hi - lo, 1)) * (T_BOT - T_TOP)

  const annos: Anno[] = m.days.map((d, i) => ({
    i,
    cx: cx(i),
    startY: d.firstStartMin === null ? null : ty(d.firstStartMin),
    endY: d.lastEndMin === null ? null : ty(d.lastEndMin),
    startLabel: d.firstStartMin === null ? '' : fmtTime(d.firstStartMin),
    endLabel: d.lastEndMin === null ? '' : fmtTime(d.lastEndMin),
  }))

  // Finish labels sit above their dot and start labels below, so the two never
  // collide with each other; when the dots are nearly on top of one another the
  // labels are nudged a little further apart still.
  const gapOf = (a: Anno) => (a.startY !== null && a.endY !== null && a.startY - a.endY < 16 ? 5 : 0)

  // A single logged day gives one point and so no line — only the dot is drawn.
  const poly = (pick: (a: Anno) => number | null) => {
    const pts = annos.filter((a) => pick(a) !== null).map((a) => `${a.cx},${pick(a) as number}`)
    return pts.length > 1 ? pts.join(' ') : ''
  }

  const startPts = poly((a) => a.startY)
  const endPts = poly((a) => a.endY)
  const anyTimes = withTimes.length > 0

  return (
    <>
      <div className="ins2-sub-head">
        <h3>Daily total, start &amp; finish</h3>
        <InfoIcon text={BARS_NOTE} />
      </div>

      <svg className="ins2-line" viewBox={`0 0 ${B_W} ${B_H}`} role="img"
        aria-label="Study minutes per day this calendar week, with each day's first start and last finish time">
        {[0, 0.5, 1].map((f) => {
          const gy = B_T + B_IH - f * B_IH
          return (
            <g key={f}>
              <line x1={B_L} y1={gy} x2={B_W - B_R} y2={gy} className="ins2-axis-grid" />
              <text x={B_L - 6} y={gy + 3} textAnchor="end" className="ins2-axis-tick">
                {f === 0 ? '0' : fmtMins(maxMin * f, unit)}
              </text>
            </g>
          )
        })}

        {m.days.map((d, i) =>
          d.isFuture || d.studiedMin <= 0 ? null : (
            <rect key={d.date} x={cx(i) - barW / 2} y={barY(d.studiedMin)} width={barW}
              height={Math.max(base - barY(d.studiedMin), 1.5)} rx="3" className="ins2-wm-bar">
              <title>{`${d.label} — ${fmtMins(d.studiedMin, unit)}`}</title>
            </rect>
          ),
        )}

        {anyTimes && (
          <>
            {endPts && <polyline points={endPts} className="ins2-wm-endline" fill="none" />}
            {startPts && <polyline points={startPts} className="ins2-wm-startline" fill="none" />}
            {annos.map((a) => (
              <g key={a.i}>
                {a.endY !== null && (
                  <>
                    <circle cx={a.cx} cy={a.endY} r="3.2" className="ins2-wm-enddot" />
                    <text x={a.cx} y={a.endY - 7 - gapOf(a)} textAnchor="middle" className="ins2-wm-tlabel end">
                      {a.endLabel}
                    </text>
                  </>
                )}
                {a.startY !== null && (
                  <>
                    <circle cx={a.cx} cy={a.startY} r="3.2" className="ins2-wm-startdot" />
                    <text x={a.cx} y={a.startY + 12 + gapOf(a)} textAnchor="middle" className="ins2-wm-tlabel start">
                      {a.startLabel}
                    </text>
                  </>
                )}
              </g>
            ))}
          </>
        )}

        {m.labels.map((lab, i) => (
          <text key={i} x={cx(i)} y={B_H - 8} textAnchor="middle"
            className={`ins2-axis-tick ${i === m.todayIdx ? 'today' : ''}`}>
            {lab}
          </text>
        ))}
      </svg>

      <div className="ins2-wm-legend">
        <span className="ins2-wm-key"><i className="k-start" />Start time</span>
        <span className="ins2-wm-key"><i className="k-end" />Finish time</span>
        <span className="ins2-wm-key"><i className="k-bar" />Studied</span>
      </div>
      {!anyTimes && (
        <div className="ins2-empty">No sessions logged yet this calendar week, so there are no start or finish times to plot.</div>
      )}
    </>
  )
}
