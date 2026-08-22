import { useMemo, useState } from 'react'
import { t } from '../../i18n'
import { useStore } from '../../store'
import InfoIcon from '../InfoIcon'
import { todayISO } from '../../utils/date'
import { fmtWeight } from '../../utils/daylog'
import { shortDate } from './chartsData'
import { heatmapRangeNoun, type HeatmapRange } from './heatmapGrid'
import { fill, intervalMeta, type IntervalKey } from './insightsData'
import { dayLabel, fmtHourTick, fmtSleep, journalSpan, sleepStats } from './journalData'

/**
 * Section 7 — hours slept, night by night, with the morning's weight one tab
 * over (the same two-tab pattern the Heatmaps card uses for study time/Anki).
 *
 * Both draw as condensed dot-to-dot lines: each is a level that drifts, not a
 * quantity that accumulates, and the eye reads drift off a line. The span comes
 * from the page interval through the heatmap mapping, so "Past day" shows the
 * last 30 entries — one dot would be a number, not a chart.
 *
 * Days with nothing logged BREAK the line rather than dropping it, and never
 * enter the average: an unrecorded day is unknown, not zero.
 *
 * Sleep's axis starts at zero and always reaches eight hours. Weight's axis
 * hugs the data (a couple of kilos either side) — against a zero axis a
 * person's weight is a flat line, and the drift is the entire point.
 *
 * Read-only: both are entered in the daily log under each day.
 */

/** The chart's natural width — it only grows past this to keep dots readable. */
const BASE_W = 620
const H = 190
const PAD_L = 40
const PAD_R = 12
const PAD_T = 12
const PAD_B = 26
const INNER_H = H - PAD_T - PAD_B
/** Narrowest band a day may sit in before the chart starts scrolling. */
const MIN_BAND = 9
/** The sleep axis always reaches at least eight hours, so a bad week still reads as bad. */
const MIN_TOP_MIN = 8 * 60

type Mode = 'sleep' | 'weight'

export default function SleepChart({ ival, range }: { ival: IntervalKey; range: HeatmapRange }) {
  const { state } = useStore()
  const today = todayISO()
  const [mode, setMode] = useState<Mode>('sleep')

  const days = useMemo(() => journalSpan(state, range), [state, range])
  const sleep = useMemo(() => sleepStats(state, days), [state, days])
  const weight = useMemo(() => {
    const series = days.map((iso) => {
      const v = state.dayLogs[iso]?.weightKg
      return typeof v === 'number' && v > 0 ? v : null
    })
    let sum = 0
    let logged = 0
    let max = -Infinity
    let min = Infinity
    for (const v of series) {
      if (v === null) continue
      logged++
      sum += v
      if (v > max) max = v
      if (v < min) min = v
    }
    return { series, logged, avg: logged ? sum / logged : 0, min, max }
  }, [state, days])

  const note = mode === 'sleep'
    ? fill(t('Hours slept the night into each day over {span} — the span follows the interval at the top of the page ("{ival}"), so a single day shows the last 30 nights instead of one dot.'),
        { span: heatmapRangeNoun(range), ival: t(intervalMeta(ival).label) }) + ' '
      + t('Nights you did not log break the line and are left out of the average, rather than counting as zero. Always drawn in hours: the hrs/mins toggle applies to study durations only. Sleep is recorded in the daily log — this chart just reads it.')
    : fill(t('Morning weight over {span}, from the scale field beside the sleep input in the daily log.'),
        { span: heatmapRangeNoun(range) }) + ' '
      + t('The axis hugs your numbers a couple of kilos either side — against a zero axis the line would be flat, and the drift is what this chart is for. Unlogged days break the line and are left out of the average.')

  // One shape for both series: a value per day (null = unlogged) and a y-domain.
  const series = mode === 'sleep' ? sleep.series : weight.series
  const logged = mode === 'sleep' ? sleep.logged : weight.logged
  const lo = mode === 'sleep' ? 0 : Math.max(30, Math.floor(weight.min) - 2)
  const hi = mode === 'sleep'
    ? Math.max(MIN_TOP_MIN, Math.ceil(sleep.maxMin / 60) * 60)
    : Math.min(150, Math.ceil(weight.max) + 2)
  const avg = mode === 'sleep' ? sleep.avgMin : weight.avg
  const fmtVal = mode === 'sleep' ? fmtSleep : (v: number) => `${fmtWeight(v)} kg`
  const fmtTick = mode === 'sleep'
    ? (f: number) => (f === 0 ? '0' : fmtHourTick(hi * f))
    : (f: number) => `${Math.round(lo + (hi - lo) * f)}`

  const n = Math.max(days.length, 1)
  const W = Math.max(BASE_W, PAD_L + PAD_R + n * MIN_BAND)
  const wide = W > BASE_W
  const INNER_W = W - PAD_L - PAD_R
  const band = INNER_W / n

  const cx = (i: number) => PAD_L + i * band + band / 2
  const cy = (v: number) => PAD_T + INNER_H - ((v - lo) / Math.max(hi - lo, 1e-9)) * INNER_H

  // Contiguous runs of logged days — each becomes its own polyline, so a gap
  // in the log is a gap in the line.
  const runs = useMemo(() => {
    const out: { i: number; v: number }[][] = []
    let cur: { i: number; v: number }[] = []
    series.forEach((v, i) => {
      if (v === null) {
        if (cur.length) out.push(cur)
        cur = []
        return
      }
      cur.push({ i, v })
    })
    if (cur.length) out.push(cur)
    return out
  }, [series])

  // Roughly eight labels, whatever the span — enough to place a dot in time.
  const labelEvery = Math.max(1, Math.ceil(n / 8))
  const avgY = cy(avg)
  // Keep the average's label inside the plot when the mean sits near the top.
  const avgLabelY = avgY < PAD_T + 12 ? avgY + 11 : avgY - 4

  return (
    <section className="ins2-card">
      <div className="ins2-card-head">
        <h2 className="ins2-h2">{t(mode === 'sleep' ? 'Sleep' : 'Body weight')}</h2>
        <InfoIcon text={note} />
        <div className="ins2-tabs" role="tablist" aria-label={t('Sleep or weight')}>
          {(['sleep', 'weight'] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m}
              className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
              {t(m === 'sleep' ? 'Sleep' : 'Body weight')}
            </button>
          ))}
        </div>
      </div>

      {mode === 'sleep' ? (
        <div className="ins2-tiles ins2-tiles-two">
          <div className="ins2-tile">
            <div className="ins2-tile-label">{t('Average night')}</div>
            <div className={`ins2-tile-value ${sleep.logged ? '' : 'na'}`}>
              {sleep.logged ? fmtSleep(sleep.avgMin) : t('n/a')}
            </div>
            <div className="ins2-tile-sub">
              {sleep.logged
                ? fill(t('over {n} logged {nights}'), { n: sleep.logged, nights: t(sleep.logged === 1 ? 'night' : 'nights') })
                : t('no nights logged yet')}
            </div>
          </div>
          <div className="ins2-tile">
            <div className="ins2-tile-label">{t('Shortest / longest')}</div>
            <div className={`ins2-tile-value ${sleep.logged ? '' : 'na'}`}>
              {sleep.logged ? `${fmtSleep(sleep.minMin)} – ${fmtSleep(sleep.maxMin)}` : t('n/a')}
            </div>
            <div className="ins2-tile-sub">{heatmapRangeNoun(range)}</div>
          </div>
        </div>
      ) : (
        <div className="ins2-tiles ins2-tiles-two">
          <div className="ins2-tile">
            <div className="ins2-tile-label">{t('Average')}</div>
            <div className={`ins2-tile-value ${weight.logged ? '' : 'na'}`}>
              {weight.logged ? `${fmtWeight(weight.avg)} kg` : t('n/a')}
            </div>
            <div className="ins2-tile-sub">
              {weight.logged
                ? fill(t('over {n} logged {days}'), { n: weight.logged, days: t(weight.logged === 1 ? 'day' : 'days') })
                : t('no weigh-ins logged yet')}
            </div>
          </div>
          <div className="ins2-tile">
            <div className="ins2-tile-label">{t('Lightest / heaviest')}</div>
            <div className={`ins2-tile-value ${weight.logged ? '' : 'na'}`}>
              {weight.logged ? `${fmtWeight(weight.min)} – ${fmtWeight(weight.max)} kg` : t('n/a')}
            </div>
            <div className="ins2-tile-sub">{heatmapRangeNoun(range)}</div>
          </div>
        </div>
      )}

      {logged === 0 ? (
        <div className="ins2-empty">
          {t(mode === 'sleep'
            ? 'No sleep logged in this range yet — add hours under ☾ in the daily log and the line appears here.'
            : 'No weigh-ins in this range yet — add kilograms beside the ☾ sleep field in the daily log.')}
        </div>
      ) : (
        <div className={`ins2-sleep-wrap ${wide ? 'ins2-xscroll' : ''}`}>
          <svg className="ins2-line" viewBox={`0 0 ${W} ${H}`} role="img"
            style={wide ? { width: `${W}px` } : undefined}
            aria-label={t(mode === 'sleep' ? 'Hours slept per night' : 'Weight per day')}>
            {[0, 0.5, 1].map((f) => {
              const gy = PAD_T + INNER_H - f * INNER_H
              return (
                <g key={f}>
                  <line x1={PAD_L} y1={gy} x2={W - PAD_R} y2={gy} className="ins2-axis-grid" />
                  <text x={PAD_L - 6} y={gy + 3} textAnchor="end" className="ins2-axis-tick">
                    {fmtTick(f)}
                  </text>
                </g>
              )
            })}

            {/* The average, dashed and labelled, so every dot has something to
                be read against rather than just the axis. */}
            <line x1={PAD_L} y1={avgY} x2={W - PAD_R} y2={avgY} className="ins2-sleep-avg" />
            <text x={PAD_L + 4} y={avgLabelY} className="ins2-sleep-avg-label">
              {t('avg')} {fmtVal(avg)}
            </text>

            {runs.map((run, ri) => (
              run.length > 1 ? (
                <polyline key={`r-${ri}`} className="ins2-sleep-line" fill="none"
                  points={run.map((p) => `${cx(p.i)},${cy(p.v)}`).join(' ')} />
              ) : null
            ))}

            {series.map((v, i) =>
              v === null ? null : (
                <circle key={days[i]} cx={cx(i)} cy={cy(v)} r={band < 6 ? 1.7 : 2.4}
                  className={`ins2-sleep-dot ${days[i] === today ? 'today' : ''}`}>
                  <title>{`${dayLabel(days[i])} — ${fmtVal(v)}`}</title>
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
