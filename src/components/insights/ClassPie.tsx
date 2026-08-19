import type { ID } from '../../types'
import { fmtMins, type Unit } from './insightsData'

/**
 * Hand-rolled pie of study time per class.
 *
 * Labels live INSIDE their slice when the slice is wide enough to hold them,
 * and are pushed outside on a thin leader line otherwise — readability wins
 * over tidiness, so outside labels are also nudged apart vertically until they
 * stop colliding.
 */

export interface PieSlice {
  id: ID | null
  label: string
  color: string
  mins: number
}

const W = 480
const H = 292
const CX = 240
const CY = 146
const R = 100
/** Radius the in-slice label is centred on. */
const LABEL_R = R * 0.58
/** Where the leader line bends, and where the outside text column sits. */
const ELBOW_R = R + 14
const TEXT_DX = R + 42
/** Rough character widths for the two label lines (bold 10.5px / plain 9.5px). */
const NAME_CH = 6
const SUB_CH = 5.1
/** Minimum vertical gap between two outside labels. */
const STACK_GAP = 26

const point = (ang: number, rad: number): [number, number] => [CX + rad * Math.cos(ang), CY + rad * Math.sin(ang)]

interface Placed {
  slice: PieSlice
  sub: string
  a0: number
  a1: number
  inside: boolean
  /** In-slice anchor, or the outside elbow before collision nudging. */
  x: number
  y: number
  side: 'l' | 'r'
}

export default function ClassPie({ slices, total, unit }: {
  slices: PieSlice[]
  total: number
  unit: Unit
}) {
  if (!slices.length || total <= 0) {
    return <div className="ins2-empty">No study time to break down yet.</div>
  }

  const placed: Placed[] = []
  let a = -Math.PI / 2
  for (const s of slices) {
    const frac = s.mins / total
    const a0 = a
    const a1 = a + frac * Math.PI * 2
    a = a1
    // ◷ prefix matches the calendar study stripe's tracked-time label.
    const sub = `◷ ${fmtMins(s.mins, unit)} | ${Math.round(frac * 100)}%`
    const ang = a1 - a0
    const mid = (a0 + a1) / 2
    // The widest the label may be at LABEL_R is the chord across the slice there.
    const chord = 2 * LABEL_R * Math.sin(Math.min(ang, Math.PI) / 2)
    const need = Math.max(s.label.length * NAME_CH, sub.length * SUB_CH) + 10
    const only = slices.length === 1
    const inside = only || (ang >= 0.5 && chord >= need)
    const [lx, ly] = only ? [CX, CY] : point(mid, inside ? LABEL_R : ELBOW_R)
    placed.push({ slice: s, sub, a0, a1, inside, x: lx, y: ly, side: Math.cos(mid) >= 0 ? 'r' : 'l' })
  }

  // Nudge outside labels apart, per side, top to bottom.
  for (const side of ['l', 'r'] as const) {
    const col = placed.filter((p) => !p.inside && p.side === side).sort((x, y) => x.y - y.y)
    let floor = 18
    for (const p of col) {
      p.y = Math.max(p.y, floor)
      floor = p.y + STACK_GAP
    }
    // If the stack ran off the bottom, push the whole column back up.
    const over = floor - STACK_GAP - (H - 14)
    if (over > 0) for (const p of col) p.y -= over
  }

  return (
    <svg className="ins2-pie" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Study time per class">
      {placed.map((p) => {
        const s = p.slice
        const frac = s.mins / total
        if (slices.length === 1) {
          return (
            <circle key={String(s.id)} cx={CX} cy={CY} r={R} fill={s.color} opacity={0.9}>
              <title>{`${s.label} — ${p.sub}`}</title>
            </circle>
          )
        }
        const [x0, y0] = point(p.a0, R)
        const [x1, y1] = point(p.a1, R)
        const large = frac > 0.5 ? 1 : 0
        return (
          <path
            key={String(s.id)}
            d={`M ${CX} ${CY} L ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} Z`}
            fill={s.color}
            opacity={0.9}
            className="ins2-pie-slice"
          >
            <title>{`${s.label} — ${p.sub}`}</title>
          </path>
        )
      })}

      {placed.map((p) => {
        if (p.inside) {
          return (
            <g key={`in-${String(p.slice.id)}`} className="ins2-pie-label">
              <text x={p.x} y={p.y - 3} textAnchor="middle" className="ins2-pie-name">{p.slice.label}</text>
              <text x={p.x} y={p.y + 10} textAnchor="middle" className="ins2-pie-sub">{p.sub}</text>
            </g>
          )
        }
        const mid = (p.a0 + p.a1) / 2
        const [ex, ey] = point(mid, R + 2)
        const tx = p.side === 'r' ? CX + TEXT_DX : CX - TEXT_DX
        const anchor = p.side === 'r' ? 'start' : 'end'
        const hinge = p.side === 'r' ? tx - 7 : tx + 7
        return (
          <g key={`out-${String(p.slice.id)}`} className="ins2-pie-label out">
            <polyline
              points={`${ex},${ey} ${p.x},${p.y} ${hinge},${p.y}`}
              className="ins2-pie-leader"
              fill="none"
            />
            <text x={tx} y={p.y - 2} textAnchor={anchor} className="ins2-pie-name out">{p.slice.label}</text>
            <text x={tx} y={p.y + 10} textAnchor={anchor} className="ins2-pie-sub out">{p.sub}</text>
          </g>
        )
      })}
    </svg>
  )
}
