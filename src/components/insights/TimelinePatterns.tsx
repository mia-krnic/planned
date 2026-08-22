import { t } from '../../i18n'
import type { AppState } from '../../types'
import { fmtHourLabel } from '../../utils/date'
import { hexToRgba } from '../../utils/color'
import InfoIcon from '../InfoIcon'
import StartEndScatter from './StartEndScatter'
import {
  classColorOf, classLabelOf, fill, fmtMins, intervalIn,
  type IntervalData, type IntervalKey, type Unit,
} from './insightsData'

/**
 * Section 3 — when the studying happened.
 *
 * The day timeline is the calendar's study stripe folded into a compact grid:
 * one row per hour, six square ten-minute boxes each. The boxes are only a
 * backdrop to read times off; the time itself is drawn as continuous strips
 * over them, cut to the minute. It only makes sense for a single day, so it is
 * only rendered for "Past day".
 */

/* ---------- hour-profile chart geometry ---------- */
const W = 620
const H = 190
const PAD_L = 40
const PAD_R = 14
const PAD_T = 12
const PAD_B = 26
const INNER_W = W - PAD_L - PAD_R
const INNER_H = H - PAD_T - PAD_B
const X_TICKS = [0, 4, 8, 12, 16, 20]

export default function TimelinePatterns({ state, data, ival, unit }: {
  state: AppState
  data: IntervalData
  ival: IntervalKey
  unit: Unit
}) {
  const nDays = data.days.length
  const means = data.perHour.map((m) => (nDays ? m / nDays : 0))
  const peak = Math.max(...means, 0)
  const maxY = Math.max(peak, 1)
  const hasStudy = data.totalMin > 0

  const px = (h: number) => PAD_L + (h / 23) * INNER_W
  const py = (v: number) => PAD_T + INNER_H - (v / maxY) * INNER_H
  const line = means.map((v, h) => `${px(h)},${py(v)}`).join(' ')

  return (
    <section className="ins2-card">
      <h2 className="ins2-h2">{t('Timeline & Patterns')}</h2>

      {ival === 'day' && <DayTimeline state={state} data={data} unit={unit} />}

      <div className="ins2-sub-head">
        <h3>{t('Peak productivity hours')}</h3>
        <InfoIcon text={fill(t('For each hour of the day, the mean number of minutes studied in that hour across all {n} {days} of the interval — days with nothing logged pull the mean down.'), { n: nDays, days: t(nDays === 1 ? 'day' : 'days') })} />
      </div>

      {!hasStudy ? (
        <div className="ins2-empty">{fill(t('No study time {span}, so there is no hourly pattern yet.'), { span: intervalIn(ival) })}</div>
      ) : (
        <svg className="ins2-line" viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={t('Mean study minutes by hour of day')}>
          {[0, 0.5, 1].map((f) => {
            const y = PAD_T + INNER_H - f * INNER_H
            return (
              <g key={f}>
                <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} className="ins2-axis-grid" />
                <text x={PAD_L - 6} y={y + 3} textAnchor="end" className="ins2-axis-tick">
                  {f === 0 ? '0' : fmtMins(maxY * f, unit)}
                </text>
              </g>
            )
          })}
          <polyline points={line} className="ins2-line-path" fill="none" />
          {means.map((v, h) => (
            <circle key={h} cx={px(h)} cy={py(v)} r={v > 0 ? 2.8 : 1.8}
              className={`ins2-line-dot ${v > 0 ? '' : 'zero'}`}>
              <title>{`${fmtHourLabel(h)} — ${fmtMins(v, unit)} ${t('on average')}`}</title>
            </circle>
          ))}
          {X_TICKS.map((h) => (
            <text key={h} x={px(h)} y={H - 8} textAnchor="middle" className="ins2-axis-tick">
              {fmtHourLabel(h)}
            </text>
          ))}
        </svg>
      )}

      <StartEndScatter data={data} ival={ival} unit={unit} />
    </section>
  )
}

/* ---------- the 24-row day timeline ---------- */

/* Six ten-minute cells per hour row, and the boundaries labelled above them. */
const CELLS = [0, 1, 2, 3, 4, 5]
const MIN_TICKS = [0, 10, 20, 30, 40, 50, 60]

/**
 * Minute-within-the-hour → x offset across the row, expressed against the cell
 * metrics so the CSS stays the one source of geometry.
 *
 * The mapping is piecewise rather than a flat minute/60: whole cells advance by
 * a full cell-plus-gap pitch while a part cell advances by a fraction of the
 * cell alone. That puts every ten-minute boundary exactly on a cell edge, and
 * so exactly under its label. (The grid is drawn as hairlines, so --tl-gap is
 * currently 0 and the mapping collapses to a plain minute/60 — the piecewise
 * form is kept so a spaced-out grid would still snap correctly.)
 *
 * A strip still runs continuously over the gaps it
 * crosses, because only its two ends are snapped — and the two ends snap to
 * opposite sides of a gap ("start" to the following cell's left edge, "end" to
 * the preceding cell's right edge) so a span that fills a cell fills it flush.
 */
function xAt(min: number, edge: 'start' | 'end'): { cells: number; frac: number } {
  const raw = edge === 'end' ? Math.ceil(min / 10) - 1 : Math.floor(min / 10)
  const cells = Math.min(Math.max(raw, 0), 5)
  return { cells, frac: (min - cells * 10) / 10 }
}

const xCalc = (cells: number, frac: number) =>
  `calc(${cells} * (var(--tl-cell) + var(--tl-gap)) + ${frac.toFixed(6)} * var(--tl-cell))`

function DayTimeline({ state, data, unit }: { state: AppState; data: IntervalData; unit: Unit }) {
  const hours = Array.from({ length: 24 }, (_, h) => h)
  const any = data.pieces.length > 0

  return (
    <>
      <div className="ins2-sub-head">
        <h3>{t('Chronological timeline')}</h3>
        <InfoIcon text={t('Today, hour by hour: each row is one hour, with a box per ten minutes to read the times off. Each stretch of time is drawn as one strip over that grid, starting and ending at the exact minute — solid in the class colour for studying, faded for a break.')} />
      </div>
      {!any ? (
        <div className="ins2-empty">{t('Nothing logged today yet.')}</div>
      ) : (
        <div className="ins2-tl-wrap">
          <div className="ins2-tl-mins" aria-hidden="true">
            {MIN_TICKS.map((m) => <span key={m}>{m}</span>)}
          </div>
          <div className="ins2-tl">
            {hours.map((h) => {
              const hourFrom = h * 60
              const inHour = data.pieces.filter((p) => p.endMin > hourFrom && p.startMin < hourFrom + 60)
              return (
                <div key={h} className="ins2-tl-row">
                  <span className="ins2-tl-hour">{String(h).padStart(2, '0')}</span>
                  {CELLS.map((c) => (
                    <div key={c} className={`ins2-tl-cell${c === 0 ? ' first' : ''}`} />
                  ))}
                  <div className="ins2-tl-strips">
                    {inHour.map((p, i) => {
                      const a = Math.max(p.startMin, hourFrom)
                      const b = Math.min(p.endMin, hourFrom + 60)
                      const s = xAt(a - hourFrom, 'start')
                      const e = xAt(b - hourFrom, 'end')
                      const col = classColorOf(state, p.classId)
                      const name = classLabelOf(state, p.classId)
                      return (
                        <span
                          key={i}
                          className={`ins2-tl-fill ${p.isBreak ? 'brk' : ''}`}
                          style={{
                            left: xCalc(s.cells, s.frac),
                            width: xCalc(e.cells - s.cells, e.frac - s.frac),
                            background: p.isBreak ? hexToRgba(col, 0.32) : col,
                          }}
                          title={`${name} — ${p.isBreak ? `${t('break')}${p.tag ? ` (${t(p.tag)})` : ''}` : t('studying')} · ${fmtMins(b - a, unit)}`}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
