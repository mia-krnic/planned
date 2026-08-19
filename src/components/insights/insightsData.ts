/**
 * Derivations behind the Insights page.
 *
 * Everything is a pure function of `state.studySessions` plus the current
 * wall-clock minute — no stored aggregates, so the numbers can never drift from
 * the source. Calendars are deliberately not involved: study time is the only
 * thing this page reports on.
 *
 * A running session (endMin === null) counts up to "now", exactly the way the
 * timer and the calendar stripe already render it.
 */

import type { AppState, ID, StudyBreak, StudySession, Task } from '../../types'
import { MONTHS, WEEKDAYS, addDays, fromISO, startOfWeek, toISO, todayISO, weekdayLabels } from '../../utils/date'
import { NEUTRAL_COLOR, cycleFor, derivedBreaks, segmentSpans, sessionEnd } from '../../utils/study'

/* ---------- page-wide controls ---------- */

export type IntervalKey = 'day' | 'week' | 'month' | 'year' | 'all'
/** Every duration on the page is printed through `fmtMins` in this unit. */
export type Unit = 'hrs' | 'mins'

/**
 * `days: 0` marks the open-ended interval — "All time" runs from the first day
 * that has any data on it, so its length is only known once state is in hand
 * (see `intervalDays`). Every fixed interval keeps its own day count.
 */
export const INTERVALS: { key: IntervalKey; label: string; days: number; noun: string }[] = [
  { key: 'day', label: 'Past day', days: 1, noun: 'today' },
  { key: 'week', label: 'Past week', days: 7, noun: 'the last 7 days' },
  { key: 'month', label: 'Past month', days: 30, noun: 'the last 30 days' },
  { key: 'year', label: 'Past year', days: 365, noun: 'the last 365 days' },
  { key: 'all', label: 'All time', days: 0, noun: 'all time' },
]

export function intervalMeta(key: IntervalKey) {
  return INTERVALS.find((i) => i.key === key) ?? INTERVALS[1]
}

/**
 * The interval as an adverbial phrase: "in the last 7 days", "across all time".
 * Only the open-ended interval takes a different preposition, and every empty
 * state on the page reads better for having it.
 */
export function intervalIn(key: IntervalKey): string {
  const m = intervalMeta(key)
  return key === 'all' ? `across ${m.noun}` : `in ${m.noun}`
}

/**
 * The interval's days, oldest first, always ending on today.
 *
 * "All time" starts at the earliest day carrying data (a study session or an
 * Anki log, whichever is older) and so needs `state`; the fixed intervals
 * ignore it. With no data at all the window collapses to today, which keeps
 * every per-day average finite.
 */
export function intervalDays(key: IntervalKey, state: AppState, today = todayISO()): string[] {
  const out: string[] = []
  if (key === 'all') {
    const from = earliestDataDate(state) ?? today
    for (let d = fromISO(from); toISO(d) <= today; d = addDays(d, 1)) out.push(toISO(d))
    return out.length ? out : [today]
  }
  const n = intervalMeta(key).days
  for (let i = n - 1; i >= 0; i--) out.push(toISO(addDays(fromISO(today), -i)))
  return out
}

/** "1h 25m" / "45m" in hrs mode, "204 min" in mins mode. */
export function fmtMins(mins: number, unit: Unit): string {
  const m = Math.max(0, Math.round(mins))
  if (unit === 'mins') return `${m} min`
  const h = Math.floor(m / 60)
  return h ? `${h}h ${m % 60}m` : `${m}m`
}

/** Percentages are only ever printed as whole numbers, and never as NaN. */
export function pct(part: number, whole: number): number {
  if (!whole || !isFinite(whole)) return 0
  return Math.round((part / whole) * 100)
}

/* ---------- naming / colour ---------- */

export function classColorOf(state: AppState, id: ID | null): string {
  if (!id) return NEUTRAL_COLOR
  return state.classes.find((c) => c.id === id)?.color ?? NEUTRAL_COLOR
}

export function classLabelOf(state: AppState, id: ID | null): string {
  if (!id) return 'Unassigned'
  return state.classes.find((c) => c.id === id)?.name ?? 'Unassigned'
}

/* ---------- session decomposition ---------- */

/**
 * Like `derivedBreaks`, but keeps the `tag` of hand-recorded breaks (the shared
 * helper drops it while clipping). Pomodoro rhythms generate their breaks from
 * wall-clock, so those are untagged by construction.
 */
export function taggedBreaks(s: StudySession, nowMin: number): StudyBreak[] {
  if (cycleFor(s)) return derivedBreaks(s, nowMin)
  const end = sessionEnd(s, nowMin)
  return s.breaks
    .map((b): StudyBreak | null => {
      const from = Math.max(b.startMin, s.startMin)
      const to = Math.min(b.startMin + b.durMin, end)
      return to > from ? { startMin: from, durMin: to - from, tag: b.tag } : null
    })
    .filter((b): b is StudyBreak => b !== null)
    .sort((a, b) => a.startMin - b.startMin)
}

/** One contiguous slice of a session: either studied time or a pause. */
export interface StudyPiece {
  date: string
  startMin: number
  endMin: number
  /** The class in force over this slice (null = unassigned). */
  classId: ID | null
  isBreak: boolean
  tag?: string
}

/**
 * A session cut into non-overlapping pieces: its class segments split further
 * wherever a break falls. Everything downstream — totals, the pie, the day
 * timeline, the hour profile — is built from these.
 */
export function sessionPieces(s: StudySession, nowMin: number): StudyPiece[] {
  const breaks = taggedBreaks(s, nowMin)
  const out: StudyPiece[] = []
  for (const sp of segmentSpans(s, nowMin)) {
    let cursor = sp.startMin
    for (const b of breaks) {
      const bStart = Math.max(b.startMin, sp.startMin)
      const bEnd = Math.min(b.startMin + b.durMin, sp.endMin)
      if (bEnd <= cursor) continue
      if (bStart >= sp.endMin) break
      if (bStart > cursor) {
        out.push({ date: s.date, startMin: cursor, endMin: bStart, classId: sp.classId, isBreak: false })
      }
      out.push({
        date: s.date,
        startMin: Math.max(cursor, bStart),
        endMin: bEnd,
        classId: sp.classId,
        isBreak: true,
        tag: b.tag,
      })
      cursor = bEnd
    }
    if (cursor < sp.endMin) {
      out.push({ date: s.date, startMin: cursor, endMin: sp.endMin, classId: sp.classId, isBreak: false })
    }
  }
  return out.filter((p) => p.endMin > p.startMin)
}

/* ---------- interval aggregate ---------- */

export interface TagBucket {
  /** '' = the untagged bucket. */
  tag: string
  label: string
  count: number
  mins: number
}

export interface IntervalData {
  days: string[]
  /** Every study/break slice that falls on one of `days`. */
  pieces: StudyPiece[]
  /** Studied minutes per class (breaks excluded), null key = unassigned. */
  perClass: Map<ID | null, number>
  /** Classes present in the interval, busiest first, unassigned always last. */
  classOrder: (ID | null)[]
  totalMin: number
  dailyAvgMin: number
  /** Studied minutes per ISO day (days with none are absent). */
  perDay: Map<string, number>
  /** Studied minutes summed per hour-of-day slot, across the whole interval. */
  perHour: number[]
  /** Longest uninterrupted studied stretch; back-to-back spans count as one. */
  maxFocusMin: number
  /** Days meeting `studyGoalMin`, and whether the rate is computable at all. */
  goalMin: number | null
  goalDays: number
  breakCount: number
  breakMin: number
  tagBuckets: TagBucket[]
  taggedBreakCount: number
  tasksInRange: Task[]
  tasksDone: number
}

const TAG_LABELS: Record<string, string> = {
  rest: 'Rest',
  meal: 'Meal',
  restroom: 'Restroom',
  other: 'Other',
}

function tagLabel(tag: string): string {
  if (!tag) return 'Untagged'
  return TAG_LABELS[tag] ?? tag.charAt(0).toUpperCase() + tag.slice(1)
}

/** Merge touching/overlapping [start, end) spans, then take the longest. */
function longestRun(spans: { startMin: number; endMin: number }[]): number {
  const sorted = spans.slice().sort((a, b) => a.startMin - b.startMin)
  let best = 0
  let curFrom = 0
  let curTo = -1
  for (const sp of sorted) {
    if (curTo < 0 || sp.startMin > curTo) {
      best = Math.max(best, curTo - curFrom)
      curFrom = sp.startMin
      curTo = sp.endMin
    } else {
      curTo = Math.max(curTo, sp.endMin)
    }
  }
  return Math.max(best, curTo - curFrom, 0)
}

export function buildIntervalData(state: AppState, key: IntervalKey, nowMin: number): IntervalData {
  const days = intervalDays(key, state)
  const inRange = new Set(days)

  const pieces: StudyPiece[] = []
  for (const s of state.studySessions) {
    if (!inRange.has(s.date)) continue
    pieces.push(...sessionPieces(s, nowMin))
  }

  const perClass = new Map<ID | null, number>()
  const perDay = new Map<string, number>()
  const perHour = new Array<number>(24).fill(0)
  const byDayRuns = new Map<string, { startMin: number; endMin: number }[]>()
  const tagMap = new Map<string, TagBucket>()
  let totalMin = 0
  let breakMin = 0
  let breakCount = 0
  let taggedBreakCount = 0

  for (const p of pieces) {
    const mins = p.endMin - p.startMin
    if (p.isBreak) {
      breakMin += mins
      breakCount++
      const tag = p.tag ?? ''
      if (tag) taggedBreakCount++
      const b = tagMap.get(tag) ?? { tag, label: tagLabel(tag), count: 0, mins: 0 }
      b.count++
      b.mins += mins
      tagMap.set(tag, b)
      continue
    }
    totalMin += mins
    perClass.set(p.classId, (perClass.get(p.classId) ?? 0) + mins)
    perDay.set(p.date, (perDay.get(p.date) ?? 0) + mins)
    // Spread the slice over the hour slots it actually covers.
    for (let h = Math.floor(p.startMin / 60); h <= Math.floor((p.endMin - 1) / 60); h++) {
      if (h < 0 || h > 23) continue
      const from = Math.max(p.startMin, h * 60)
      const to = Math.min(p.endMin, (h + 1) * 60)
      if (to > from) perHour[h] += to - from
    }
    const runs = byDayRuns.get(p.date) ?? []
    runs.push({ startMin: p.startMin, endMin: p.endMin })
    byDayRuns.set(p.date, runs)
  }

  let maxFocusMin = 0
  for (const runs of byDayRuns.values()) maxFocusMin = Math.max(maxFocusMin, longestRun(runs))

  const classOrder = Array.from(perClass.keys())
    .filter((id) => (perClass.get(id) ?? 0) > 0)
    .sort((a, b) => {
      if (a === null) return 1
      if (b === null) return -1
      return (perClass.get(b) ?? 0) - (perClass.get(a) ?? 0)
    })

  const goalMin = state.studyGoalMin ?? null
  let goalDays = 0
  if (goalMin && goalMin > 0) {
    for (const d of days) if ((perDay.get(d) ?? 0) >= goalMin) goalDays++
  }

  const tagBuckets = Array.from(tagMap.values()).sort((a, b) => {
    if (!a.tag) return 1
    if (!b.tag) return -1
    return b.mins - a.mins
  })

  const tasksInRange = state.tasks.filter((t) => t.date && inRange.has(t.date))

  return {
    days,
    pieces,
    perClass,
    classOrder,
    totalMin,
    dailyAvgMin: days.length ? totalMin / days.length : 0,
    perDay,
    perHour,
    maxFocusMin,
    goalMin,
    goalDays,
    breakCount,
    breakMin,
    tagBuckets,
    taggedBreakCount,
    tasksInRange,
    tasksDone: tasksInRange.filter((t) => t.done).length,
  }
}

/* ---------- weekly momentum (calendar week) ---------- */

/**
 * The Weekly Momentum card is the one place on this page that does NOT use the
 * rolling window: it reports on the *calendar* week containing today, starting
 * on `state.weekStart`, so "this week" means the same thing here as it does on
 * the calendar. Everything below is derived for that week and the one before it.
 */

const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export interface WeekDayStat {
  date: string
  /** Weekday abbreviation, in `weekStart` order. */
  label: string
  /** Studied minutes on the day, breaks excluded (unassigned time included). */
  studiedMin: number
  /** Earliest session start / latest session end on the day; null when nothing was logged. */
  firstStartMin: number | null
  lastEndMin: number | null
  isToday: boolean
  isFuture: boolean
}

export interface WeekMomentum {
  /** "Mon, Aug 17 – Sun, Aug 23" */
  rangeLabel: string
  /** Weekday abbreviations in `weekStart` order. */
  labels: string[]
  days: WeekDayStat[]
  /** Cumulative studied minutes by the end of day i — this week (only meaningful up to `todayIdx`). */
  cumThis: number[]
  /** The same for the previous calendar week, all seven days. */
  cumPrev: number[]
  /** Today's index within the week, 0..6. */
  todayIdx: number
  /** "Wednesday" — today's weekday, spelled out, for the delta line. */
  todayName: string
  /** Studied minutes so far this calendar week. */
  totalMin: number
  /** Days of the week elapsed so far, today included (1..7) — the daily-average divisor. */
  daysElapsed: number
  dailyAvgMin: number
  /** This week's cumulative so far minus last week's cumulative at the end of the same weekday. */
  deltaMin: number
  hasThis: boolean
  hasPrev: boolean
}

/** Studied minutes per ISO day (breaks excluded) for the given days only. */
function studiedByDay(state: AppState, want: Set<string>, nowMin: number): Map<string, number> {
  const out = new Map<string, number>()
  for (const s of state.studySessions) {
    if (!want.has(s.date)) continue
    for (const p of sessionPieces(s, nowMin)) {
      if (p.isBreak) continue
      out.set(p.date, (out.get(p.date) ?? 0) + (p.endMin - p.startMin))
    }
  }
  return out
}

export function buildWeekMomentum(state: AppState, nowMin: number, today = todayISO()): WeekMomentum {
  const ws = state.weekStart ?? 0
  const start = startOfWeek(fromISO(today), ws)
  const prevStart = addDays(start, -7)
  const labels = weekdayLabels(ws)

  const thisDates = Array.from({ length: 7 }, (_, i) => toISO(addDays(start, i)))
  const prevDates = Array.from({ length: 7 }, (_, i) => toISO(addDays(prevStart, i)))
  const minsBy = studiedByDay(state, new Set([...thisDates, ...prevDates]), nowMin)

  // Session extents per day of THIS week — the start/finish annotations. A
  // running session ends at "now", exactly as it does everywhere else.
  const extents = new Map<string, { first: number; last: number }>()
  const thisSet = new Set(thisDates)
  for (const s of state.studySessions) {
    if (!thisSet.has(s.date)) continue
    const end = sessionEnd(s, nowMin)
    const cur = extents.get(s.date)
    extents.set(s.date, {
      first: cur ? Math.min(cur.first, s.startMin) : s.startMin,
      last: cur ? Math.max(cur.last, end) : end,
    })
  }

  const todayIdx = (fromISO(today).getDay() - ws + 7) % 7

  const days: WeekDayStat[] = thisDates.map((date, i) => {
    const studiedMin = minsBy.get(date) ?? 0
    // Days with nothing studied — and days still to come — carry no annotation.
    const ext = studiedMin > 0 && i <= todayIdx ? extents.get(date) : undefined
    return {
      date,
      label: labels[i],
      studiedMin,
      firstStartMin: ext ? ext.first : null,
      lastEndMin: ext ? ext.last : null,
      isToday: i === todayIdx,
      isFuture: i > todayIdx,
    }
  })

  const cumThis: number[] = []
  const cumPrev: number[] = []
  let a = 0
  let b = 0
  for (let i = 0; i < 7; i++) {
    a += minsBy.get(thisDates[i]) ?? 0
    b += minsBy.get(prevDates[i]) ?? 0
    cumThis.push(a)
    cumPrev.push(b)
  }

  const totalMin = cumThis[todayIdx]
  const daysElapsed = todayIdx + 1
  const end = addDays(start, 6)
  const dLabel = (d: Date) => `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`

  return {
    rangeLabel: `${dLabel(start)} – ${dLabel(end)}`,
    labels,
    days,
    cumThis,
    cumPrev,
    todayIdx,
    todayName: DOW_FULL[fromISO(today).getDay()],
    totalMin,
    daysElapsed,
    dailyAvgMin: totalMin / daysElapsed,
    deltaMin: totalMin - cumPrev[todayIdx],
    hasThis: totalMin > 0,
    hasPrev: cumPrev[6] > 0,
  }
}

/** "+2h 15m" / "−45m" / "0m", in the page's unit. */
export function fmtDelta(mins: number, unit: Unit): string {
  const rounded = Math.round(mins)
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : ''
  return `${sign}${fmtMins(Math.abs(rounded), unit)}`
}

/* ---------- heatmap source ---------- */

/**
 * date → (classId → studied minutes) over the whole history, for the study-time
 * heatmap (which has its own range selector and so ignores the page interval).
 */
export function dailyClassMinutes(state: AppState, nowMin: number): Map<string, Map<ID | null, number>> {
  const out = new Map<string, Map<ID | null, number>>()
  for (const s of state.studySessions) {
    for (const p of sessionPieces(s, nowMin)) {
      if (p.isBreak) continue
      const day = out.get(p.date) ?? new Map<ID | null, number>()
      day.set(p.classId, (day.get(p.classId) ?? 0) + (p.endMin - p.startMin))
      out.set(p.date, day)
    }
  }
  return out
}

/** Earliest day with any logged study time, or null when there is none. */
export function earliestStudyDate(state: AppState): string | null {
  let best: string | null = null
  for (const s of state.studySessions) if (!best || s.date < best) best = s.date
  return best
}

/** Earliest day with any logged Anki review, or null when there is none. */
export function earliestAnkiDate(state: AppState): string | null {
  let best: string | null = null
  for (const l of state.ankiLogs) if (!best || l.date < best) best = l.date
  return best
}

/**
 * Where "All time" begins: the first day carrying either kind of data, so the
 * window covers the study charts and both heatmaps alike. Null when the app has
 * nothing logged at all.
 */
export function earliestDataDate(state: AppState): string | null {
  const study = earliestStudyDate(state)
  const anki = earliestAnkiDate(state)
  if (!study) return anki
  if (!anki) return study
  return study < anki ? study : anki
}
