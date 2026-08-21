import { useMemo } from 'react'
import { useStore } from '../../store'
import InfoIcon from '../InfoIcon'
import { todayISO } from '../../utils/date'
import { shortDate } from './chartsData'
import { heatmapRangeNoun, type HeatmapRange } from './heatmapGrid'
import { intervalMeta, type IntervalKey } from './insightsData'
import { dayLabel, fmtHourTick, fmtSleep, journalSpan, sleepStats } from './journalData'

/**
 * Section 7 — hours slept, night by night.
 *
 * A condensed dot-to-dot line rather than bars: sleep is a level that drifts,
 * not a quantity that accumulates, and the eye reads the drift off a line. The
 * span comes from the page interval through the heatmap mapping, so "Past day"
 * shows the last 30 nights — one dot would be a number, not a chart.
 *
 * Nights with nothing logged BREAK the line rather than dropping it to zero, and
 * never enter the average: an unrecorded night is unknown, not sleepless.
 *
 * The y-axis is in hours whatever the page's duration unit says. The unit toggle
 * governs study durations, and nobody reads a night's sleep in minutes.
 *
 * Read-only: sleep is entered in the daily log under each day (Journal tab).
 */

/** The chart's natural width — it only grows past this to keep dots readable. */
const BASE_W = 620
const H = 190
const PAD_L = 40
const PAD_R = 12
const PAD_T = 12
const PAD_B = 26
const INNER_H = H - PAD_T - PAD_B
/** Narrowest band a night may sit in before the chart starts scrolling. */
const MIN_BAND = 9
/** The axis always reaches at least eight hours, so a bad week still reads as bad. */
const MIN_TOP_MIN = 8 * 60

export default function SleepChart({ ival, range }: { ival: IntervalKey; range: HeatmapRange }) {
  const { state } = useStore()
  const today = todayISO()

  const days = useMemo(() => journalSpan(state, range), [state, range])
  const stats = useMemo(() => sleepStats(state, days), [state, days])

  const note =
    `Hours slept the night into each day over ${heatmapRangeNoun(range)} — the span follows the ` +
    `interval at the top of the page ("${intervalMeta(ival).label}"), so a single day shows the last ` +
    '30 nights instead of one dot. Nights you did not log break the line and are left out of the ' +
    'average, rather than counting as zero. Always drawn in hours: the hrs/mins toggle applies to ' +
    'study durations only. Sleep is recorded in the daily log — this chart just reads it.'

  const n = Math.max(days.length, 1)
  const W = Math.max(BASE_W, PAD_L + PAD_R + n * MIN_BAND)
  const wide = W > BASE_W
  const INNER_W = W - PAD_L - PAD_R
  const band = INNER_W / n

  // Round the ceiling up to a whole hour so the ticks are hours, not oddities.
  const topMin = Math.max(MIN_TOP_MIN, Math.ceil(stats.maxMin / 60) * 60)
  const cx = (i: number) => PAD_L + i * band + band / 2
  const cy = (mins: number) => PAD_T + INNER_H - (mins / topMin) * INNER_H

  // Contiguous runs of logged nights — each becomes its own polyline, so a gap
  // in the log is a gap in the line.
  const runs = useMemo(() => {
    const out: { i: number; min: number }[][] = []
    let cur: { i: number; min: number }[] = []
    stats.series.forEach((v, i) => {
      if (v === null) {
        if (cur.length) out.push(cur)
        cur = []
        return
      }
      cur.push({ i, min: v })
    })
    if (cur.length) out.push(cur)
    return out
  }, [stats.series])

  // Roughly eight labels, whatever the span — enough to place a dot in time.
  const labelEvery = Math.max(1, Math.ceil(n / 8))
  const avgY = cy(stats.avgMin)
  // Keep the average's label inside the plot when the mean sits near the top.
  const avgLabelY = avgY < PAD_T + 12 ? avgY + 11 : avgY - 4

  return (
    <section className="ins2-card">
      <div className="ins2-card-head">
        <h2 className="ins2-h2">Sleep</h2>
        <InfoIcon text={note} />
      </div>

      <div className="ins2-tiles ins2-tiles-two">
        <div className="ins2-tile">
          <div className="ins2-tile-label">Average night</div>
          <div className={`ins2-tile-value ${stats.logged ? '' : 'na'}`}>
            {stats.logged ? fmtSleep(stats.avgMin) : 'n/a'}
          </div>
          <div className="ins2-tile-sub">
            {stats.logged
              ? `over ${stats.logged} logged ${stats.logged === 1 ? 'night' : 'nights'}`
              : 'no nights logged yet'}
          </div>
        </div>
        <div className="ins2-tile">
          <div className="ins2-tile-label">Shortest / longest</div>
          <div className={`ins2-tile-value ${stats.logged ? '' : 'na'}`}>
            {stats.logged ? `${fmtSleep(stats.minMin)} – ${fmtSleep(stats.maxMin)}` : 'n/a'}
          </div>
          <div className="ins2-tile-sub">{heatmapRangeNoun(range)}</div>
        </div>
      </div>

      {stats.logged === 0 ? (
        <div className="ins2-empty">
          No sleep logged in this range yet — add hours under ☾ in the daily log and the line appears here.
        </div>
      ) : (
        <div className={`ins2-sleep-wrap ${wide ? 'ins2-xscroll' : ''}`}>
          <svg className="ins2-line" viewBox={`0 0 ${W} ${H}`} role="img"
            style={wide ? { width: `${W}px` } : undefined}
            aria-label="Hours slept per night">
            {[0, 0.5, 1].map((f) => {
              const gy = PAD_T + INNER_H - f * INNER_H
              return (
                <g key={f}>
                  <line x1={PAD_L} y1={gy} x2={W - PAD_R} y2={gy} className="ins2-axis-grid" />
                  <text x={PAD_L - 6} y={gy + 3} textAnchor="end" className="ins2-axis-tick">
                    {f === 0 ? '0' : fmtHourTick(topMin * f)}
                  </text>
                </g>
              )
            })}

            {/* The average, dashed and labelled, so every dot has something to
                be read against rather than just the axis. */}
            <line x1={PAD_L} y1={avgY} x2={W - PAD_R} y2={avgY} className="ins2-sleep-avg" />
            <text x={PAD_L + 4} y={avgLabelY} className="ins2-sleep-avg-label">
              avg {fmtSleep(stats.avgMin)}
            </text>

            {runs.map((run, ri) => (
              run.length > 1 ? (
                <polyline key={`r-${ri}`} className="ins2-sleep-line" fill="none"
                  points={run.map((p) => `${cx(p.i)},${cy(p.min)}`).join(' ')} />
              ) : null
            ))}

            {stats.series.map((v, i) =>
              v === null ? null : (
                <circle key={days[i]} cx={cx(i)} cy={cy(v)} r={band < 6 ? 1.7 : 2.4}
                  className={`ins2-sleep-dot ${days[i] === today ? 'today' : ''}`}>
                  <title>{`${dayLabel(days[i])} — ${fmtSleep(v)}`}</title>
                </circle>
              ),
            )}

            {days.map((iso, i) =>
              i % labelEvery === 0 ? (
                <text key={`t-${iso}`} x={cx(i)} y={H - 8} textAnchor="middle" className="ins2-axis-tick">
                  {shortDate(iso)}
                </text>
              ) : null,
            )}
          </svg>
        </div>
      )}
    </section>
  )
}
