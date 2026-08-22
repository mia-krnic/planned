/**
 * Derivations for the second wave of Insights charts — the start/end scatter,
 * the per-day stacked class bars and the quarter grid of weeks.
 *
 * Kept apart from insightsData.ts so the original aggregate stays the small,
 * page-wide thing it was. Everything here is still a pure function of state (or
 * of an already-built IntervalData), so no number can drift from its source.
 */

import { t } from '../../i18n'
import type { AppState, ID } from '../../types'
import { MONTHS, WEEKDAYS, addDays, fromISO, startOfWeek, toISO, todayISO } from '../../utils/date'
import { sessionPieces, type IntervalData, type IntervalKey, type StudyPiece } from './insightsData'

/* ---------- ink that stays readable on a class colour ---------- */

/**
 * Black or white, whichever contrasts better with `hex`. Class colours are
 * user-picked and span the whole lightness range, so an in-slice percentage
 * inked a fixed dark would vanish on the darker ones.
 */
export function contrastInk(hex: string): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full.slice(0, 6), 16)
  if (!isFinite(n)) return '#1f2328'
  const srgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const lum = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2]
  return lum > 0.45 ? '#1f2328' : '#ffffff'
}

/* ---------- one point per active day: when it began, when it ended ---------- */

export interface DayExtent {
  date: string
  /** Earliest minute of the day's first session (breaks included in the span). */
  firstStartMin: number
  /** Latest minute of the day's last session. */
  lastEndMin: number
  /** Studied minutes on the day, breaks excluded. */
  studiedMin: number
}

/**
 * Every day of the interval that has study time on it, with the day's session
 * span. The span comes off the interval's own pieces — which already resolve a
 * running session against "now" — so no clock is needed here.
 */
export function dayExtents(data: IntervalData): DayExtent[] {
  const span = new Map<string, { first: number; last: number }>()
  for (const p of data.pieces) {
    const cur = span.get(p.date)
    span.set(p.date, {
      first: cur ? Math.min(cur.first, p.startMin) : p.startMin,
      last: cur ? Math.max(cur.last, p.endMin) : p.endMin,
    })
  }
  const out: DayExtent[] = []
  for (const date of data.days) {
    const studiedMin = data.perDay.get(date) ?? 0
    const s = span.get(date)
    if (studiedMin <= 0 || !s) continue
    out.push({ date, firstStartMin: s.first, lastEndMin: s.last, studiedMin })
  }
  return out
}

/** Mean of a list of minute values, or null when the list is empty. */
export function meanOf(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

/* ---------- per-day (or per-month) class stacks ---------- */

export interface StackPart {
  id: ID | null
  mins: number
}

export interface StackBucket {
  key: string
  /** Axis label, or '' when this bucket's tick is skipped for room. */
  label: string
  total: number
  /** One entry per class in the interval's classOrder, zeroes included. */
  parts: StackPart[]
}

/** Weekday abbreviation for an ISO day. */
function dowOf(iso: string): string {
  return t(WEEKDAYS[fromISO(iso).getDay()])
}

/** "8/17" for an ISO day. */
export function shortDate(iso: string): string {
  const d = fromISO(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/**
 * The interval's study time cut by day and by class, ready to stack.
 *
 * A year of daily bars would be unreadable, so "Past year" — and "All time",
 * which is longer still — aggregate to one bucket per calendar month. A month
 * of 30 bars keeps every bar but labels only every fifth, counted back from
 * today so today always carries a label. All-time months thin their labels the
 * same way once there are more than a dozen, and mark each January with its
 * year so a run of "Jan" bars can still be told apart.
 */
export function buildClassStacks(data: IntervalData, ival: IntervalKey): StackBucket[] {
  const monthly = ival === 'year' || ival === 'all'
  const keyOf = (piece: StudyPiece) => (monthly ? piece.date.slice(0, 7) : piece.date)

  const order = data.classOrder
  const byKey = new Map<string, Map<ID | null, number>>()

  // Seed every bucket the interval covers, so quiet days still occupy a slot.
  const keys: string[] = []
  for (const d of data.days) {
    const k = monthly ? d.slice(0, 7) : d
    if (!byKey.has(k)) {
      byKey.set(k, new Map())
      keys.push(k)
    }
  }

  for (const p of data.pieces) {
    if (p.isBreak) continue
    const bucket = byKey.get(keyOf(p))
    if (!bucket) continue
    bucket.set(p.classId, (bucket.get(p.classId) ?? 0) + (p.endMin - p.startMin))
  }

  const n = keys.length
  // One label per month up to a year's worth, then every other / every third…
  const monthStep = Math.max(1, Math.ceil(n / 12))
  const out = keys.map((k, i) => {
    const bucket = byKey.get(k) ?? new Map<ID | null, number>()
    const parts: StackPart[] = order.map((id) => ({ id, mins: bucket.get(id) ?? 0 }))
    let label = ''
    // Anchor every thinning rule on the newest bucket, so the most recent bar
    // always carries a label whatever the interval's length happens to be.
    if (monthly) {
      if (ival === 'year' || (n - 1 - i) % monthStep === 0) {
        label = t(MONTHS[Number(k.slice(5, 7)) - 1].slice(0, 3))
      }
    } else if (ival === 'week') label = dowOf(k)
    // Past month: label every fifth bar.
    else if ((n - 1 - i) % 5 === 0) label = shortDate(k)
    return { key: k, label, total: parts.reduce((a, p) => a + p.mins, 0), parts }
  })

  // All time can span several years, where a bare "Apr" repeats and says
  // nothing. Stamp the year onto the first surviving label of each calendar
  // year — thinning often drops January, so keying off the month would miss.
  if (ival === 'all') {
    let lastYear = ''
    for (const b of out) {
      if (!b.label) continue
      const year = b.key.slice(0, 4)
      if (year === lastYear) continue
      b.label += ` ${year.slice(2)}`
      lastYear = year
    }
  }
  return out
}

/* ---------- quarter grid of calendar weeks ---------- */

/** Studied minutes per ISO day across the whole history, breaks excluded. */
export function studiedMinutesByDay(state: AppState, nowMin: number): Map<string, number> {
  const out = new Map<string, number>()
  for (const s of state.studySessions) {
    for (const p of sessionPieces(s, nowMin)) {
      if (p.isBreak) continue
      out.set(p.date, (out.get(p.date) ?? 0) + (p.endMin - p.startMin))
    }
  }
  return out
}

export interface QuarterCell {
  /** ISO date of the week's first day, in the user's weekStart. */
  start: string
  /** "8/17 ~" — the week-start date, with a tilde standing in for "onwards". */
  label: string
  mins: number
  isCurrent: boolean
  isFuture: boolean
}

export interface QuarterGrid {
  /** "2026 Q3" */
  label: string
  cells: QuarterCell[]
  /** Studied minutes across every week shown. */
  totalMin: number
}

/** Floor-division that behaves for negative quarter offsets. */
function floorDiv(a: number, b: number): number {
  return Math.floor(a / b)
}

/**
 * The weeks of one calendar quarter, `offset` quarters from the one containing
 * today. A week belongs to the quarter its FIRST day falls in, so no week is
 * ever counted twice and the grid tiles the year exactly.
 */
export function buildQuarterGrid(
  state: AppState,
  nowMin: number,
  offset: number,
  today = todayISO(),
): QuarterGrid {
  const ws = state.weekStart ?? 0
  const now = fromISO(today)
  const abs = now.getFullYear() * 4 + floorDiv(now.getMonth(), 3) + offset
  const year = floorDiv(abs, 4)
  const q = abs - year * 4

  const qStart = new Date(year, q * 3, 1)
  // Day 0 of the following month is the last day of this one.
  const qEnd = new Date(year, q * 3 + 3, 0)

  const minsBy = studiedMinutesByDay(state, nowMin)
  const thisWeek = toISO(startOfWeek(now, ws))

  let cursor = startOfWeek(qStart, ws)
  if (cursor < qStart) cursor = addDays(cursor, 7)

  const cells: QuarterCell[] = []
  let totalMin = 0
  while (cursor <= qEnd) {
    const start = toISO(cursor)
    let mins = 0
    for (let i = 0; i < 7; i++) mins += minsBy.get(toISO(addDays(cursor, i))) ?? 0
    totalMin += mins
    cells.push({
      start,
      label: `${cursor.getMonth() + 1}/${cursor.getDate()} ~`,
      mins,
      isCurrent: start === thisWeek,
      isFuture: start > thisWeek,
    })
    cursor = addDays(cursor, 7)
  }

  return { label: `${year} Q${q + 1}`, cells, totalMin }
}
