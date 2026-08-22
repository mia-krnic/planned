import { t } from '../../i18n'
import { fmtMins, type Unit } from './insightsData'
import { contrastInk } from './chartsData'
import type { PieSlice } from './ClassPie'

/**
 * The donut alternative to ClassPie.
 *
 * Deliberately spare next to the pie: the same slices in the same colours and
 * the same order, but hollow, and labelled with nothing except the share. The
 * per-class list under the chart is already a full legend, so repeating names
 * and durations on the ring would only crowd it.
 *
 * Each percentage is inked black or white against its own slice, because class
 * colours are user-picked and a fixed ink disappears on half of them.
 */

const W = 300
const H = 300
const CX = 150
const CY = 150
const R = 118
/** The hole. 55% of the outer radius leaves a ring wide enough for the labels. */
const IR = R * 0.55
const LABEL_R = (R + IR) / 2
/** Below this slice angle the percentage cannot fit on the ring without collisions. */
const MIN_LABEL_ANGLE = 0.34

const point = (ang: number, rad: number): [number, number] => [CX + rad * Math.cos(ang), CY + rad * Math.sin(ang)]

export default function ClassDonut({ slices, total, unit }: {
  slices: PieSlice[]
  total: number
  unit: Unit
}) {
  if (!slices.length || total <= 0) {
    return <div className="ins2-empty">{t('No study time to break down yet.')}</div>
  }

  const only = slices.length === 1
  let a = -Math.PI / 2
  const arcs = slices.map((s) => {
    const frac = s.mins / total
    const a0 = a
    const a1 = a + frac * Math.PI * 2
    a = a1
    return { s, a0, a1, frac }
  })

  return (
    <svg className="ins2-donut" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Study time per class')}>
      {arcs.map(({ s, a0, a1, frac }) => {
        const tip = `${s.label} — ◷ ${fmtMins(s.mins, unit)} | ${Math.round(frac * 100)}%`
        // A single class spans the full turn, where an arc path degenerates —
        // draw it as two stacked discs instead, punched through by the hole.
        if (only) {
          return (
            <g key={String(s.id)}>
              <circle cx={CX} cy={CY} r={R} fill={s.color} opacity={0.9} className="ins2-donut-slice" />
              <circle cx={CX} cy={CY} r={IR} className="ins2-donut-hole" />
              <title>{tip}</title>
            </g>
          )
        }
        const [ox0, oy0] = point(a0, R)
        const [ox1, oy1] = point(a1, R)
        const [ix1, iy1] = point(a1, IR)
        const [ix0, iy0] = point(a0, IR)
        const large = frac > 0.5 ? 1 : 0
        return (
          <path
            key={String(s.id)}
            d={
              `M ${ox0} ${oy0} A ${R} ${R} 0 ${large} 1 ${ox1} ${oy1} ` +
              `L ${ix1} ${iy1} A ${IR} ${IR} 0 ${large} 0 ${ix0} ${iy0} Z`
            }
            fill={s.color}
            opacity={0.9}
            className="ins2-donut-slice"
          >
            <title>{tip}</title>
          </path>
        )
      })}

      {arcs.map(({ s, a0, a1, frac }) => {
        const ang = a1 - a0
        if (!only && ang < MIN_LABEL_ANGLE) return null
        const mid = only ? -Math.PI / 2 : (a0 + a1) / 2
        const [lx, ly] = point(mid, LABEL_R)
        return (
          <text
            key={`p-${String(s.id)}`}
            x={lx}
            y={ly + 4.5}
            textAnchor="middle"
            className="ins2-donut-pct"
            fill={contrastInk(s.color)}
          >
            {Math.round(frac * 100)}%
          </text>
        )
      })}
    </svg>
  )
}
