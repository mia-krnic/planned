import { fmtTime } from '../../utils/date'
import InfoIcon from '../InfoIcon'
import { fmtMins, intervalIn, type IntervalData, type IntervalKey, type Unit } from './insightsData'
import { dayExtents, meanOf, shortDate } from './chartsData'

/**
 * When the day starts and when it stops.
 *
 * One dot per ACTIVE day, twice over: the day's first session start and its
 * last session end, both plotted against how much was studied that day. Read
 * horizontally it answers "do I start early?", read vertically "do the early
 * days end up being the long ones?".
 *
 * Two dashed guides mark the mean start and the mean end across the interval.
 */

const W = 620
const H = 210
const PAD_L = 44
const PAD_R = 16
const PAD_T = 26
const PAD_B = 26
const INNER_W = W - PAD_L - PAD_R
const INNER_H = H - PAD_T - PAD_B
const DAY = 24 * 60
/** Sparse enough that the labels never touch, even on a phone. */
const X_TICKS: { min: number; label: string }[] = [
  { min: 0, label: '12am' },
  { min: 6 * 60, label: '6am' },
  { min: 12 * 60, label: 'noon' },
  { min: 18 * 60, label: '6pm' },
  { min: DAY, label: '12am' },
]

const NOTE =
  'One pair of dots per day that has study time on it: the grey dot is when the first session of that day began, the accent dot when the last one ended. Left to right is the time of day; up the chart is how much was studied that day, so a dot high up is a long day. The dashed lines are the mean start and the mean end across the interval. Days with nothing logged are not plotted.'

export default function StartEndScatter({ data, ival, unit }: {
  data: IntervalData
  ival: IntervalKey
  unit: Unit
}) {
  const pts = dayExtents(data)

  const maxY = Math.max(...pts.map((p) => p.studiedMin), 1)
  const x = (min: number) => PAD_L + (Math.min(Math.max(min, 0), DAY) / DAY) * INNER_W
  const y = (v: number) => PAD_T + INNER_H - (v / maxY) * INNER_H

  const avgStart = meanOf(pts.map((p) => p.firstStartMin))
  const avgEnd = meanOf(pts.map((p) => p.lastEndMin))

  return (
    <>
      <div className="ins2-sub-head">
        <h3>Start &amp; end times</h3>
        <InfoIcon text={NOTE} />
      </div>

      {!pts.length ? (
        <div className="ins2-empty">
          No day {intervalIn(ival)} has study time on it yet, so there are no start or end times to plot.
        </div>
      ) : (
        <>
          <svg className="ins2-line" viewBox={`0 0 ${W} ${H}`} role="img"
            aria-label="First session start and last session end per day, against that day's study time">
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

            {/* Mean guides. Their labels hug the side of the line with more room. */}
            {[
              { at: avgStart, cls: 'start', text: (t: string) => `avg start ${t}`, ty: PAD_T - 13 },
              { at: avgEnd, cls: 'end', text: (t: string) => `avg end ${t}`, ty: PAD_T - 3 },
            ].map((g, i) =>
              g.at === null ? null : (
                <g key={i}>
                  <line x1={x(g.at)} y1={PAD_T - 16} x2={x(g.at)} y2={PAD_T + INNER_H}
                    className={`ins2-sc-mean ${g.cls}`} />
                  <text
                    x={x(g.at) + (x(g.at) > PAD_L + INNER_W / 2 ? -5 : 5)}
                    y={g.ty}
                    textAnchor={x(g.at) > PAD_L + INNER_W / 2 ? 'end' : 'start'}
                    className={`ins2-sc-mean-label ${g.cls}`}
                  >
                    {g.text(fmtTime(Math.round(g.at)))}
                  </text>
                </g>
              ),
            )}

            {pts.map((p) => (
              <circle key={`s-${p.date}`} cx={x(p.firstStartMin)} cy={y(p.studiedMin)} r="3.4"
                className="ins2-sc-dot start">
                <title>{`${shortDate(p.date)} — started ${fmtTime(p.firstStartMin)} · ${fmtMins(p.studiedMin, unit)} studied`}</title>
              </circle>
            ))}
            {pts.map((p) => (
              <circle key={`e-${p.date}`} cx={x(p.lastEndMin)} cy={y(p.studiedMin)} r="3.4"
                className="ins2-sc-dot end">
                <title>{`${shortDate(p.date)} — ended ${fmtTime(p.lastEndMin)} · ${fmtMins(p.studiedMin, unit)} studied`}</title>
              </circle>
            ))}

            {X_TICKS.map((t) => (
              <text key={t.min} x={x(t.min)} y={H - 8}
                textAnchor={t.min === 0 ? 'start' : t.min === DAY ? 'end' : 'middle'}
                className="ins2-axis-tick">
                {t.label}
              </text>
            ))}
          </svg>

          <div className="ins2-wm-legend">
            <span className="ins2-wm-key"><i className="k-sc-start" />First start</span>
            <span className="ins2-wm-key"><i className="k-sc-end" />Last end</span>
            <span className="ins2-wm-key">
              {pts.length} {pts.length === 1 ? 'day' : 'days'} with study time
            </span>
          </div>
        </>
      )}
    </>
  )
}
