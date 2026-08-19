import type { AppState } from '../../types'
import { MONTHS } from '../../utils/date'
import InfoIcon from '../InfoIcon'
import {
  classColorOf, classLabelOf, fmtMins, intervalIn,
  type IntervalData, type IntervalKey, type Unit,
} from './insightsData'
import { buildClassStacks, shortDate } from './chartsData'

/**
 * Study time by class, one stacked bar per day.
 *
 * The same per-class totals as the pie above, but unrolled over time, so a
 * class that was dropped halfway through the interval reads as a gap rather
 * than just a smaller slice. Segments stack in the pie's order (busiest at the
 * bottom), which keeps the colours in the same vertical order on every bar.
 *
 * "Past day" is deliberately not rendered — a single bar says nothing the pie
 * has not already said. "Past year" and "All time" aggregate to one bar per
 * month; when all-time spans more months than fit at a readable width the chart
 * keeps the width and scrolls sideways rather than squeezing the bars to threads.
 */

/** The chart's natural width — it only grows past this to keep bars readable. */
const BASE_W = 620
const H = 216
const PAD_L = 46
const PAD_R = 14
const PAD_T = 12
const PAD_B = 28
const INNER_H = H - PAD_T - PAD_B
/** Narrowest band a monthly bar may sit in before the chart starts scrolling. */
const MIN_MONTH_BAND = 30

const NOTE =
  'The interval broken up day by day, each bar split into the classes studied that day (grey is time not assigned to a class). Bar heights use the same scale as the axis on the left. Past year and All time are grouped into calendar months, since a bar per day would be unreadable — and a long all-time history scrolls sideways rather than thinning its bars away.'

export default function ClassDayBars({ state, data, ival, unit }: {
  state: AppState
  data: IntervalData
  ival: IntervalKey
  unit: Unit
}) {
  // One bar is not a distribution — the pie above already covers a single day.
  if (ival === 'day') return null

  const buckets = buildClassStacks(data, ival)
  const monthly = ival === 'year' || ival === 'all'
  const n = Math.max(buckets.length, 1)
  // Only All time can outgrow the card; everything else keeps the fixed width.
  const W = ival === 'all'
    ? Math.max(BASE_W, PAD_L + PAD_R + n * MIN_MONTH_BAND)
    : BASE_W
  const INNER_W = W - PAD_L - PAD_R
  const wide = W > BASE_W
  const band = INNER_W / n
  const barW = Math.max(Math.min(band * (monthly ? 0.6 : 0.66), 34), 2)
  const maxY = Math.max(...buckets.map((b) => b.total), 1)
  const base = PAD_T + INNER_H

  const cx = (i: number) => PAD_L + i * band + band / 2
  const hOf = (mins: number) => (mins / maxY) * INNER_H
  // Tooltips name every bucket in full, including the months whose axis label
  // was thinned away — "August 2026" rather than a blank.
  const bucketName = (key: string) =>
    monthly ? `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}` : shortDate(key)

  return (
    <>
      <div className="ins2-sub-head">
        <h3>Study time by class, per {monthly ? 'month' : 'day'}</h3>
        <InfoIcon text={NOTE} />
      </div>

      {data.totalMin <= 0 ? (
        <div className="ins2-empty">
          No study time {intervalIn(ival)} to break down by {monthly ? 'month' : 'day'}.
        </div>
      ) : (
        <>
        <div className={wide ? 'ins2-xscroll' : undefined}>
          <svg className="ins2-line" viewBox={`0 0 ${W} ${H}`} role="img"
            style={wide ? { width: `${W}px` } : undefined}
            aria-label={`Study time per ${monthly ? 'month' : 'day'}, stacked by class`}>
            {[0, 0.5, 1].map((f) => {
              const gy = PAD_T + INNER_H - f * INNER_H
              return (
                <g key={f}>
                  <line x1={PAD_L} y1={gy} x2={W - PAD_R} y2={gy} className="ins2-axis-grid" />
                  <text x={PAD_L - 6} y={gy + 3} textAnchor="end" className="ins2-axis-tick">
                    {f === 0 ? '0' : fmtMins(maxY * f, unit)}
                  </text>
                </g>
              )
            })}

            {buckets.map((b, i) => {
              // Stack upward from the axis, busiest class first.
              let y = base
              return (
                <g key={b.key}>
                  {b.parts.map((p) => {
                    if (p.mins <= 0) return null
                    const h = Math.max(hOf(p.mins), 0.8)
                    y -= h
                    return (
                      <rect key={String(p.id)} x={cx(i) - barW / 2} y={y} width={barW} height={h}
                        fill={classColorOf(state, p.id)} className="ins2-stack-seg">
                        <title>
                          {`${bucketName(b.key)} · ${classLabelOf(state, p.id)} — ${fmtMins(p.mins, unit)}`}
                        </title>
                      </rect>
                    )
                  })}
                </g>
              )
            })}

            {buckets.map((b, i) =>
              b.label ? (
                <text key={`t-${b.key}`} x={cx(i)} y={H - 9} textAnchor="middle" className="ins2-axis-tick">
                  {b.label}
                </text>
              ) : null,
            )}
          </svg>
        </div>

        <div className="ins2-stack-legend">
          {data.classOrder.map((id) => (
            <span key={String(id)} className="ins2-stack-key">
              <span className="ins2-dot" style={{ background: classColorOf(state, id) }} />
              {classLabelOf(state, id)}
            </span>
          ))}
        </div>
        </>
      )}
    </>
  )
}
