/**
 * Moon phase from the calendar date alone — no network, no ephemeris table.
 *
 * The synodic (new moon to new moon) month is very nearly constant, so counting
 * whole synodic months from a known new moon is accurate to a few hours, which
 * is far finer than the eight phase names below can express.
 */

/** Reference new moon: 2000-01-06 18:14 UTC. */
const NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14)
/** Mean length of one lunation, in days. */
const SYNODIC_DAYS = 29.530588853

const DAY_MS = 86400000

/**
 * Age of the moon on `dateIso`, as a fraction of one lunation:
 * 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter.
 * Measured from LOCAL noon, so the whole day gets one representative phase.
 */
export function moonPhase(dateIso: string): { frac: number; name: string } {
  const [y, m, d] = dateIso.split('-').map(Number)
  const noon = new Date(y, m - 1, d, 12, 0, 0, 0).getTime()
  const frac = (((noon - NEW_MOON_MS) / DAY_MS / SYNODIC_DAYS) % 1 + 1) % 1
  return { frac, name: phaseName(frac) }
}

/** Lit fraction of the disc (0 at new moon, 1 at full). */
export function moonIllumination(frac: number): number {
  return (1 - Math.cos(2 * Math.PI * frac)) / 2
}

/**
 * The four principal phases claim the eighth of a lunation centred on their
 * instant (~1.85 days either side); the rest are crescent or gibbous.
 */
function phaseName(frac: number): string {
  if (frac < 0.0625 || frac >= 0.9375) return 'New moon'
  if (frac < 0.1875) return 'Waxing crescent'
  if (frac < 0.3125) return 'First quarter'
  if (frac < 0.4375) return 'Waxing gibbous'
  if (frac < 0.5625) return 'Full moon'
  if (frac < 0.6875) return 'Waning gibbous'
  if (frac < 0.8125) return 'Last quarter'
  return 'Waning crescent'
}
