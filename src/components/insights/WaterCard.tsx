import { useMemo } from 'react'
import { t } from '../../i18n'
import { useStore } from '../../store'
import InfoIcon from '../InfoIcon'
import { todayISO } from '../../utils/date'
import { heatmapRangeNoun, type HeatmapRange } from './heatmapGrid'
import { fill, intervalMeta, type IntervalKey } from './insightsData'
import { WATER_TARGET, journalSpan, waterBuckets, waterStats } from './journalData'

/**
 * Section 8 — glasses of water, against the eight-glass target.
 *
 * A bar per day for the short spans; a bar per week (holding that week's mean
 * per logged day) once the span reaches a year, where 365 hairlines would say
 * nothing. Averaging inside the bucket rather than summing is what keeps the
 * target line meaning the same thing in both views.
 *
 * Only days that carry a daily-log record count. A day you never opened the log
 * on is unknown and leaves a gap; a day you logged but drank nothing on is a
 * real zero and pulls the average down.
 */

const BASE_W = 620
const H = 168
const PAD_L = 30
const PAD_R = 12
const PAD_T = 12
const PAD_B = 24
const INNER_H = H - PAD_T - PAD_B
/** Narrowest band a bar may sit in before the chart starts scrolling. */
const MIN_BAND = 7

export default function WaterCard({ ival, range }: { ival: IntervalKey; range: HeatmapRange }) {
  const { state } = useStore()
  const today = todayISO()

  const days = useMemo(() => journalSpan(state, range), [state, range])
  const stats = useMemo(() => waterStats(state, days), [state, days])

  // A year of daily bars is a comb; fold those spans into weeks.
  const weekly = range === 'year' || range === 'all'
  const buckets = useMemo(
    () => waterBuckets(days, stats.series, weekly ? 7 : 1),
    [days, stats.series, weekly],
  )

  const note =
    fill(t('Glasses of water crossed off in the daily log over {span} — the span follows the interval at the top of the page ("{ival}").'),
      { span: heatmapRangeNoun(range), ival: t(intervalMeta(ival).label) }) + ' ' +
    t("Only days with a log entry count: a day you never opened leaves a gap and is left out of the average, while a logged day with no glasses is a real zero. Past year and All time show one bar per week, holding that week's average per logged day, so the eight-glass target line still reads the same way.")

  const n = Math.max(buckets.length, 1)
  const W = Math.max(BASE_W, PAD_L + PAD_R + n * MIN_BAND)
  const wide = W > BASE_W
  const INNER_W = W - PAD_L - PAD_R
  const band = INNER_W / n
  const barW = Math.max(Math.min(band * 0.66, 22), 1.5)

  const maxVal = Math.max(...buckets.map((b) => b.value ?? 0), 0)
  const top = Math.max(WATER_TARGET, Math.ceil(maxVal))
  const base = PAD_T + INNER_H
  const cx = (i: number) => PAD_L + i * band + band / 2
  const yOf = (v: number) => base - (v / top) * INNER_H
  const targetY = yOf(WATER_TARGET)

  const fmtGlasses = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

  return (
    <section className="ins2-card">
      <div className="ins2-card-head">
        <h2 className="ins2-h2">{t('Water')}</h2>
        <InfoIcon text={note} />
      </div>

      <div className="ins2-tiles ins2-tiles-two">
        <div className="ins2-tile">
          <div className="ins2-tile-label">{t('Average per day')}</div>
          <div className={`ins2-tile-value ${stats.loggedDays ? '' : 'na'}`}>
            {stats.loggedDays ? `${stats.avg.toFixed(1)} / ${WATER_TARGET}` : t('n/a')}
          </div>
          <div className="ins2-tile-sub">
            {stats.loggedDays
              ? fill(t('across {n} logged {days}'), { n: stats.loggedDays, days: t(stats.loggedDays === 1 ? 'day' : 'days') })
              : t('no days logged yet')}
          </div>
        </div>
        <div className="ins2-tile">
          <div className="ins2-tile-label">{t('Target hit')}</div>
          <div className={`ins2-tile-value ${stats.loggedDays ? '' : 'na'}`}>
            {stats.loggedDays ? stats.targetDays : t('n/a')}
          </div>
          <div className="ins2-tile-sub">
            {stats.loggedDays
              ? fill(t('{days} at {n} glasses'), { days: t(stats.targetDays === 1 ? 'day' : 'days'), n: WATER_TARGET })
              : heatmapRangeNoun(range)}
          </div>
        </div>
      </div>

      {stats.loggedDays === 0 ? (
        <div className="ins2-empty">
          {t('No water logged in this range yet — cross off a glass in the daily log and the bars appear here.')}
        </div>
      ) : (
        <div className={wide ? 'ins2-xscroll' : undefined}>
          <svg className="ins2-line" viewBox={`0 0 ${W} ${H}`} role="img"
            style={wide ? { width: `${W}px` } : undefined}
            aria-label={t(weekly ? 'Glasses of water per week' : 'Glasses of water per day')}>
            {[0, top / 2, top].map((v) => (
              <g key={v}>
                <line x1={PAD_L} y1={yOf(v)} x2={W - PAD_R} y2={yOf(v)} className="ins2-axis-grid" />
                <text x={PAD_L - 6} y={yOf(v) + 3} textAnchor="end" className="ins2-axis-tick">
                  {fmtGlasses(v)}
                </text>
              </g>
            ))}

            {buckets.map((b, i) => {
              if (b.value === null) return null
              const h = Math.max((b.value / top) * INNER_H, b.value > 0 ? 1 : 0)
              const isToday = !weekly && b.key === today
              return (
                <rect key={b.key} x={cx(i) - barW / 2} y={base - h} width={barW} height={h}
                  rx={Math.min(2, barW / 2)}
                  className={`ins2-water-bar ${b.value >= WATER_TARGET ? 'full' : ''} ${isToday ? 'today' : ''}`}>
                  <title>
                    {`${b.label} — ${fmtGlasses(b.value)} ${t(b.value === 1 ? 'glass' : 'glasses')}` +
                      (weekly ? ' ' + fill(t('avg over {n} logged {days}'), { n: b.days, days: t(b.days === 1 ? 'day' : 'days') }) : '')}
                  </title>
                </rect>
              )
            })}

            {/* The eight-glass target, drawn over the bars so a full day's bar
                stops exactly on it. */}
            <line x1={PAD_L} y1={targetY} x2={W - PAD_R} y2={targetY} className="ins2-water-target" />
            <text x={W - PAD_R - 2} y={targetY - 4} textAnchor="end" className="ins2-water-target-label">
              {t('target')} {WATER_TARGET}
            </text>

            <text x={PAD_L} y={H - 7} className="ins2-axis-tick">{buckets[0]?.label.split(' – ')[0]}</text>
            <text x={W - PAD_R} y={H - 7} textAnchor="end" className="ins2-axis-tick">
              {t(weekly ? 'this week' : 'today')}
            </text>
          </svg>
        </div>
      )}
    </section>
  )
}
