/**
 * Derivations behind the "Journal insights" half of the Insights page.
 *
 * Everything here is a pure function of `state.dayLogs` — the daily log writes
 * one record per day and only for days the user actually touched, so a day
 * missing from the map is genuinely "not logged" rather than "logged as zero".
 * That distinction is the whole point of these cards: an unlogged day must never
 * be averaged in as a 0, and must never be drawn as a filled cell.
 *
 * The span every card covers is NOT chosen per card: it comes down from the
 * page's interval toggle through `heatmapRangeFor`, exactly like the study-time
 * heatmap, so the journal cards and the study charts above them always talk
 * about the same stretch of time.
 */

import { t } from '../../i18n'
import type { AppState, WeatherKind } from '../../types'
import { MONTHS, WEEKDAYS, addDays, fromISO, toISO, todayISO } from '../../utils/date'
import type { MoodLevel } from '../daylog/glyphs'
import { WEATHER_KINDS } from '../daylog/glyphs'
import { daysBetween, heatmapRangeDays, type HeatmapRange } from './heatmapGrid'
import { fill } from './insightsData'

/** The mood scale's own colours, rough day → great day. */
export const MOOD_COLOR: Record<MoodLevel, string> = {
  1: '#e07f6f',
  2: '#e8b06c',
  3: '#d4c05e',
  4: '#8ecfa8',
  5: '#7c9a5e',
}

/** Glasses of water a full day is: the target line on the water chart. */
export const WATER_TARGET = 8

/** "All" always reaches at least this far back, mirroring the study heatmap. */
const EARLIEST_ALL = '2026-01-01'

/* ---------- span ---------- */

/** Earliest day carrying a daily-log record, or null when nothing is logged. */
export function earliestDayLogDate(state: AppState): string | null {
  let best: string | null = null
  for (const iso of Object.keys(state.dayLogs)) if (!best || iso < best) best = iso
  return best
}

/**
 * The days a journal card covers, oldest first, always ending today. The fixed
 * ranges are a rolling window; "all" runs from the first logged day (floored at
 * EARLIEST_ALL so an empty app still draws a grid rather than one square).
 */
export function journalSpan(state: AppState, range: HeatmapRange, today = todayISO()): string[] {
  const n = heatmapRangeDays(range)
  if (n) return daysBetween(toISO(addDays(fromISO(today), -(n - 1))), today)
  const earliest = earliestDayLogDate(state)
  const start = earliest && earliest < EARLIEST_ALL ? earliest : EARLIEST_ALL
  return daysBetween(start, today)
}

/* ---------- formatting ---------- */

/** "Wed 12 Aug" — the tooltip prefix every card shares. */
export function dayLabel(iso: string): string {
  const d = fromISO(iso)
  return fill(t('{dow} {day} {mon}'), {
    dow: t(WEEKDAYS[d.getDay()]),
    day: d.getDate(),
    mon: t(MONTHS[d.getMonth()].slice(0, 3)),
  })
}

/**
 * "7h 24m" / "45m". Sleep is always printed in hours regardless of the page's
 * duration unit — minutes-since-bedtime is not a number anyone reads.
 */
export function fmtSleep(mins: number): string {
  const m = Math.max(0, Math.round(mins))
  const h = Math.floor(m / 60)
  return h ? `${h}h ${m % 60}m` : `${m}m`
}

/** Axis tick: "8h", "4.5h" — never a trailing ".0". */
export function fmtHourTick(mins: number): string {
  const h = mins / 60
  return `${Number(h.toFixed(1))}h`
}

/* ---------- mood ---------- */

export interface MoodStats {
  /** date → level, for days that recorded a mood. */
  byDay: Map<string, MoodLevel>
  /** How many days in the span sit at each level. */
  counts: Record<MoodLevel, number>
  /** Days in the span with a mood on them. */
  logged: number
  /** Mean level over `logged` days; 0 when nothing is logged. */
  avg: number
  /** The level appearing most often, or null when nothing is logged. */
  top: MoodLevel | null
}

export function moodStats(state: AppState, days: string[]): MoodStats {
  const byDay = new Map<string, MoodLevel>()
  const counts: Record<MoodLevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let sum = 0
  for (const iso of days) {
    const lvl = state.dayLogs[iso]?.mood
    if (!lvl) continue
    byDay.set(iso, lvl)
    counts[lvl]++
    sum += lvl
  }
  const logged = byDay.size
  let top: MoodLevel | null = null
  for (const l of [1, 2, 3, 4, 5] as MoodLevel[]) {
    if (counts[l] > 0 && (top === null || counts[l] > counts[top])) top = l
  }
  return { byDay, counts, logged, avg: logged ? sum / logged : 0, top }
}

/* ---------- sleep ---------- */

export interface SleepStats {
  /** One slot per day of the span; null = no sleep recorded that day. */
  series: (number | null)[]
  logged: number
  /** Mean over logged nights only — unlogged days are never counted as zero. */
  avgMin: number
  maxMin: number
  minMin: number
}

export function sleepStats(state: AppState, days: string[]): SleepStats {
  const series = days.map((iso) => {
    const v = state.dayLogs[iso]?.sleepMin
    return typeof v === 'number' && v > 0 ? v : null
  })
  let sum = 0
  let logged = 0
  let maxMin = 0
  let minMin = Infinity
  for (const v of series) {
    if (v === null) continue
    logged++
    sum += v
    if (v > maxMin) maxMin = v
    if (v < minMin) minMin = v
  }
  return {
    series,
    logged,
    avgMin: logged ? sum / logged : 0,
    maxMin,
    minMin: logged ? minMin : 0,
  }
}

/* ---------- water ---------- */

export interface WaterStats {
  /** One slot per day; null = the day has no log at all (not "drank nothing"). */
  series: (number | null)[]
  /** Days in the span that carry a log record of any kind. */
  loggedDays: number
  /** Mean glasses across `loggedDays` — 0 when nothing is logged. */
  avg: number
  total: number
  /** Logged days that reached the eight-glass target. */
  targetDays: number
}

export function waterStats(state: AppState, days: string[]): WaterStats {
  const series = days.map((iso) => {
    const log = state.dayLogs[iso]
    if (!log) return null
    return log.water ?? 0
  })
  let total = 0
  let loggedDays = 0
  let targetDays = 0
  for (const v of series) {
    if (v === null) continue
    loggedDays++
    total += v
    if (v >= WATER_TARGET) targetDays++
  }
  return { series, loggedDays, avg: loggedDays ? total / loggedDays : 0, total, targetDays }
}

/**
 * The water series folded into fixed-size buckets, each carrying the mean
 * glasses per LOGGED day inside it. Long spans (a year, all time) would draw a
 * hairline per day otherwise, and a mean keeps the eight-glass target line
 * meaningful in the bucketed view too.
 */
export interface WaterBucket {
  key: string
  label: string
  /** Mean glasses per logged day in the bucket; null = no logged day in it. */
  value: number | null
  days: number
}

export function waterBuckets(days: string[], series: (number | null)[], size: number): WaterBucket[] {
  const out: WaterBucket[] = []
  for (let i = 0; i < days.length; i += size) {
    const slice = series.slice(i, i + size)
    const isoFrom = days[i]
    const isoTo = days[Math.min(i + size, days.length) - 1]
    let sum = 0
    let n = 0
    for (const v of slice) {
      if (v === null) continue
      sum += v
      n++
    }
    out.push({
      key: isoFrom,
      label: size === 1 ? dayLabel(isoFrom) : `${dayLabel(isoFrom)} – ${dayLabel(isoTo)}`,
      value: n ? sum / n : null,
      days: n,
    })
  }
  return out
}

/* ---------- journalling ---------- */

export interface JournalStats {
  /** date → journal length in characters, for days with any text. */
  chars: Map<string, number>
  /** Days in the span that have a log record of any kind (text or not). */
  loggedDays: Set<string>
  /** Days with a non-empty journal entry. */
  journalled: number
  maxChars: number
  totalChars: number
  /** Mean characters per journalled day. */
  avgChars: number
}

export function journalStats(state: AppState, days: string[]): JournalStats {
  const chars = new Map<string, number>()
  const loggedDays = new Set<string>()
  let maxChars = 0
  let totalChars = 0
  for (const iso of days) {
    const log = state.dayLogs[iso]
    if (!log) continue
    loggedDays.add(iso)
    const n = (log.journal ?? '').trim().length
    if (!n) continue
    chars.set(iso, n)
    totalChars += n
    if (n > maxChars) maxChars = n
  }
  const journalled = chars.size
  return {
    chars,
    loggedDays,
    journalled,
    maxChars,
    totalChars,
    avgChars: journalled ? totalChars / journalled : 0,
  }
}

/* ---------- weather ---------- */

export interface WeatherRow {
  kind: WeatherKind
  count: number
}

export interface WeatherSummary {
  rows: WeatherRow[]
  /** Days in the span carrying a weather mark. */
  total: number
  max: number
}

/**
 * Frequency of each weather kind over the span. `weather` is stored as an array
 * for compatibility with older records, but the log records ONE weather per day,
 * so only element [0] is read here.
 */
export function weatherSummary(state: AppState, days: string[]): WeatherSummary {
  const counts = new Map<WeatherKind, number>()
  let total = 0
  for (const iso of days) {
    const kind = state.dayLogs[iso]?.weather?.[0]
    if (!kind) continue
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
    total++
  }
  const rows = WEATHER_KINDS.map((kind) => ({ kind, count: counts.get(kind) ?? 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
  return { rows, total, max: Math.max(1, ...rows.map((r) => r.count)) }
}
