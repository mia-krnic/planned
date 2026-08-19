import { useStore } from '../../store'
import { moonIllumination, moonPhase } from '../../utils/moon'

interface Props {
  date: string
  size?: number
}

/**
 * The day's moon, drawn as two arcs: the disc is the dark side, the path on top
 * is the lit side. Its outer edge is a half circle (one limb) and its inner
 * edge is the terminator — the same circle seen edge-on, so it projects to an
 * ellipse whose half-width runs from the full radius (new / full moon) down to
 * zero (the quarters). Bulging away from the lit limb gives a gibbous, bulging
 * towards it a crescent.
 *
 * Drawn lit-on-the-right for a waxing moon, then mirrored for a waning one —
 * and mirrored again south of the equator, where the whole sky is upside down.
 */
export default function MoonIcon({ date, size = 13 }: Props) {
  const { state } = useStore()
  const { frac, name } = moonPhase(date)
  const south = (state.location?.hemisphere ?? 'N') === 'S'

  const c = 8
  const r = 6.4
  const illum = moonIllumination(frac)
  // Terminator half-width; never exactly 0, so the arc keeps its curvature flag.
  const a = Math.max(r * Math.abs(Math.cos(2 * Math.PI * frac)), 0.01)
  // Gibbous: the terminator bulges past the centre, away from the lit limb.
  const sweep = illum < 0.5 ? 0 : 1
  const lit = `M${c},${c - r} A${r},${r} 0 0,1 ${c},${c + r} A${a.toFixed(3)},${r} 0 0,${sweep} ${c},${c - r} Z`
  // Waxing is lit on the right in the north; every other case is the mirror.
  const mirror = (frac >= 0.5) !== south

  return (
    <svg className="moon-icon" width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={name}>
      <title>{name}</title>
      <g transform={mirror ? `translate(${2 * c},0) scale(-1,1)` : undefined}>
        <circle cx={c} cy={c} r={r} className="moon-dark" />
        <path d={lit} className="moon-lit" />
      </g>
      <circle cx={c} cy={c} r={r} className="moon-rim" fill="none" />
    </svg>
  )
}
