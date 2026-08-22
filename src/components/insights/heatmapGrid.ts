/**
 * Shared plumbing for the contribution-style heatmaps (flashcard reviews and
 * study time). Both grids are the same object — a Sunday-first column per week,
 * an opacity ramp per cell — so the layout maths lives here once and the two
 * tabs stay pixel-identical.
 */

import { t } from '../../i18n'
import { addDays, fromISO, MONTHS, toISO } from '../../utils/date'
import type { IntervalKey } from './insightsData'

/** Opacity ramp for a non-empty day, faintest → busiest. */
export const LEVELS = [0.22, 0.42, 0.66, 0.88, 1]

/* ---------- how far back a grid reaches ---------- */

/** `days: 0` = "as far back as there is data" (see each grid's own floor). */
export type HeatmapRange = '30' | '100' | 'year' | 'all'

export const HEATMAP_RANGES: { key: HeatmapRange; label: string; days: number }[] = [
  { key: '30', label: '30 days', days: 30 },
  { key: '100', label: '100 days', days: 100 },
  { key: 'year', label: 'Year', days: 365 },
  { key: 'all', label: 'All', days: 0 },
]

export function heatmapRangeDays(range: HeatmapRange): number {
  return HEATMAP_RANGES.find((r) => r.key === range)?.days ?? 0
}

/**
 * The Insights heatmaps card has no range toggle of its own: inside that card
 * both grids follow the page's interval, so the two tabs and every chart above
 * them are talking about the same stretch of time. The mapping is coarse on
 * purpose — a heatmap of one day would be a single square, so the two shortest
 * intervals share the 30-day grid.
 *
 * (The standalone `full` and `sidebar` Anki trackers keep their own controls;
 * this only applies where the page interval is in scope.)
 */
export function heatmapRangeFor(ival: IntervalKey): HeatmapRange {
  switch (ival) {
    case 'day':
    case 'week':
      return '30'
    case 'month':
      return '100'
    case 'year':
      return 'year'
    case 'all':
      return 'all'
  }
}

/** Prose for the card's ⓘ — what the grids are currently covering. */
export function heatmapRangeNoun(range: HeatmapRange): string {
  switch (range) {
    case '30': return t('the last 30 days')
    case '100': return t('the last 100 days')
    case 'year': return t('the last 365 days')
    case 'all': return t('everything you have logged')
  }
}

/** Inclusive list of ISO dates from `start` to `end`. */
export function daysBetween(start: string, end: string): string[] {
  const out: string[] = []
  for (let d = fromISO(start); toISO(d) <= end; d = addDays(d, 1)) out.push(toISO(d))
  return out
}

/** Week columns, Sunday-first, padded with nulls so every column has 7 rows. */
export function weekColumns(days: string[]): (string | null)[][] {
  if (!days.length) return []
  const flat: (string | null)[] = [...Array(fromISO(days[0]).getDay()).fill(null), ...days]
  while (flat.length % 7 !== 0) flat.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < flat.length; i += 7) weeks.push(flat.slice(i, i + 7))
  return weeks
}

/**
 * A short month label over the first column of each month. Labels closer than
 * three columns to the previous one are dropped so they can't overlap.
 */
export function monthLabels(weeks: (string | null)[][]): (string | null)[] {
  let lastMonth = -1
  let lastAt = -99
  return weeks.map((wk, i) => {
    const d = wk.find((x): x is string => x !== null)
    if (!d) return null
    const m = fromISO(d).getMonth()
    if (m === lastMonth) return null
    lastMonth = m
    if (i - lastAt < 2) return null
    lastAt = i
    return t(MONTHS[m].slice(0, 3))
  })
}

/** The same range cut into one mini-grid per calendar month. */
export function monthChunks(days: string[]): { key: string; label: string; weeks: (string | null)[][] }[] {
  const out: { key: string; label: string; weeks: (string | null)[][] }[] = []
  for (const iso of days) {
    const d = fromISO(iso)
    const key = iso.slice(0, 7)
    if (!out.length || out[out.length - 1].key !== key) {
      out.push({ key, label: `${t(MONTHS[d.getMonth()].slice(0, 3))} ${d.getFullYear()}`, weeks: [] })
    }
  }
  for (const m of out) m.weeks = weekColumns(days.filter((d) => d.startsWith(m.key)))
  return out
}

/** Consecutive days with any activity, ending today or yesterday. */
export function streakOf(counts: Map<string, number>, today: string): number {
  let cur = counts.get(today) ? today : toISO(addDays(fromISO(today), -1))
  let n = 0
  while (counts.get(cur)) {
    n++
    cur = toISO(addDays(fromISO(cur), -1))
  }
  return n
}

/** Opacity bucket 0–5: 0 = empty day, 5 = the busiest day in view. */
export function level(n: number, max: number): number {
  if (n <= 0) return 0
  return Math.min(LEVELS.length, Math.max(1, Math.ceil((n / max) * LEVELS.length)))
}
