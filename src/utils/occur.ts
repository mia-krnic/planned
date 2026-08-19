import type { CalEvent, RecurException, RecurRule, RecurringTask } from '../types'
import { fromISO, toISO, addDays, daysBetween } from './date'

/**
 * Which occurrences of a repeating event an edit applies to. 'one' detaches the
 * clicked occurrence, 'future' ends the old series there and starts a new one,
 * 'all' edits the series in place.
 */
export type EditScope = 'one' | 'future' | 'all'

/**
 * True when a scoped edit has to SPLIT the series (detach an occurrence / cut
 * it short and start a new one) rather than patch the stored event in place.
 * "This and future" from the very first occurrence is editing everything.
 */
export function splitsSeries(ev: CalEvent, occurrence: string, scope: EditScope): boolean {
  if (ev.repeat === 'none') return false
  return scope === 'one' || (scope === 'future' && occurrence > ev.date)
}

/** Does `ev` (possibly repeating) occur on ISO date `iso`? */
export function eventOccursOn(ev: CalEvent, iso: string): boolean {
  if (ev.repeat === 'none') return ev.date === iso
  if (iso < ev.date) return false
  if (ev.until && iso >= ev.until) return false // series ended ("this and future" edits)
  if (ev.exDates?.includes(iso)) return false // occurrence detached by a "only this event" edit
  if (ev.repeat === 'daily') return true
  // weekly: same weekday as the series start
  return fromISO(iso).getDay() === fromISO(ev.date).getDay()
}

/* ---------- Recurring tasks: the rule engine ---------- */

/** Days in the month of `iso` — monthly rules clamp their day down to this. */
function daysInMonth(iso: string): number {
  const d = fromISO(iso)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

/** Whole weeks between two ISO dates, floored — the biweekly parity test. */
function weeksBetween(anchor: string, iso: string): number {
  return Math.floor(daysBetween(anchor, iso) / 7)
}

/**
 * Does the rule itself fire on `iso`? Range, skips and exceptions are the
 * caller's business (see recurringOccursOn).
 */
function ruleFiresOn(rt: RecurringTask, rule: RecurRule, iso: string): boolean {
  const dow = fromISO(iso).getDay()
  const days = rule.weekdays?.length ? rule.weekdays : [rt.weekday]
  switch (rule.kind) {
    case 'daily':
    case 'timesPerDay':
      return true
    case 'weekdays':
      return dow >= 1 && dow <= 5
    case 'weekly':
      return days.includes(dow)
    case 'biweekly': {
      if (!days.includes(dow)) return false
      // Parity is measured in whole weeks from the anchor's own week, so every
      // weekday of an "on" week fires together.
      const anchor = rule.anchor ?? rt.startDate
      const anchorDow = fromISO(anchor).getDay()
      const weekStart = toISO(addDays(fromISO(anchor), -anchorDow))
      return weeksBetween(weekStart, iso) % 2 === 0
    }
    case 'monthly': {
      const want = rule.day ?? fromISO(rt.startDate).getDate()
      return fromISO(iso).getDate() === Math.min(want, daysInMonth(iso))
    }
  }
}

/**
 * Does recurring task `rt` produce an occurrence on ISO date `iso`? `iso` is the
 * date the RULE generates — an occurrence moved elsewhere by an exception still
 * belongs to (and is checked off on) this date; see occurrencesOn for where it
 * actually renders.
 */
export function recurringOccursOn(rt: RecurringTask, iso: string): boolean {
  if (iso < rt.startDate) return false
  if (rt.until && iso >= rt.until) return false
  if (rt.exceptions?.[iso]?.skip) return false
  // No custom rule: the original freq/weekday behaviour, untouched.
  if (!rt.rule) {
    const dow = fromISO(iso).getDay()
    if (rt.freq === 'daily') return true
    if (rt.freq === 'weekdays') return dow >= 1 && dow <= 5
    return dow === rt.weekday
  }
  return ruleFiresOn(rt, rt.rule, iso)
}

/** How many checkable slots one qualifying day has (1 unless timesPerDay). */
export function recurringTimes(rt: RecurringTask): number {
  return rt.rule?.kind === 'timesPerDay' ? Math.max(1, Math.round(rt.rule.times ?? 1)) : 1
}

/**
 * Slots ticked off on `iso`. A day listed in `completions` is complete however
 * many slots it has, which is what keeps legacy data (and the streak/habit
 * strip) working unchanged.
 */
export function recurringCount(rt: RecurringTask, iso: string): number {
  if (rt.completions.includes(iso)) return recurringTimes(rt)
  return Math.max(0, Math.min(rt.partial?.[iso] ?? 0, recurringTimes(rt)))
}

export function isRecurringDone(rt: RecurringTask, iso: string): boolean {
  return rt.completions.includes(iso)
}

/** The exception recorded for the occurrence generated on `key`, if any. */
export function recurringException(rt: RecurringTask, key: string): RecurException | undefined {
  return rt.exceptions?.[key]
}

/**
 * One occurrence as the calendar sees it: `key` identifies it (the date the rule
 * generated it on — where completions and exceptions are filed), `date` is where
 * it currently sits after any per-occurrence move.
 */
export interface RecurOccurrence {
  rt: RecurringTask
  key: string
  date: string
  startMin: number | null
  endMin: number | null
  dueDate: string | null
  dueMin: number | null
  /** True when this occurrence carries a per-occurrence override. */
  moved: boolean
}

/** Where the occurrence generated on `key` actually lands. */
export function occurrenceAt(rt: RecurringTask, key: string): RecurOccurrence {
  const ex = rt.exceptions?.[key]
  const baseDue = rt.dueOffsetDays != null ? toISO(addDays(fromISO(key), rt.dueOffsetDays)) : null
  return {
    rt,
    key,
    date: ex?.date ?? key,
    // `null` on an exception is a real value ("this one is all-day"), so only
    // `undefined` falls back to the series.
    startMin: ex?.startMin !== undefined ? ex.startMin : rt.startMin ?? null,
    endMin: ex?.endMin !== undefined ? ex.endMin : rt.endMin ?? null,
    dueDate: ex?.dueDate ?? baseDue,
    dueMin: ex?.dueMin !== undefined ? ex.dueMin : rt.dueMin ?? null,
    moved: !!ex,
  }
}

/**
 * Occurrences of `rt` RENDERED on `iso`: the one the rule generates there (unless
 * an exception moved it away) plus any occurrence moved onto it from another day.
 * Exceptions are a small map, so the second pass stays cheap.
 */
export function occurrencesOn(rt: RecurringTask, iso: string): RecurOccurrence[] {
  const out: RecurOccurrence[] = []
  if (recurringOccursOn(rt, iso) && (rt.exceptions?.[iso]?.date ?? iso) === iso) {
    out.push(occurrenceAt(rt, iso))
  }
  for (const [key, ex] of Object.entries(rt.exceptions ?? {})) {
    if (key === iso || ex.date !== iso) continue
    if (recurringOccursOn(rt, key)) out.push(occurrenceAt(rt, key))
  }
  return out
}

/** Occurrences of `rt` whose DUE date lands on `iso` (see dueOffsetDays). */
export function recurringDueOn(rt: RecurringTask, iso: string): RecurOccurrence[] {
  const out: RecurOccurrence[] = []
  const push = (key: string) => {
    const occ = occurrenceAt(rt, key)
    if (occ.dueDate === iso) out.push(occ)
  }
  if (rt.dueOffsetDays != null) {
    const key = toISO(addDays(fromISO(iso), -rt.dueOffsetDays))
    if (recurringOccursOn(rt, key) && (rt.exceptions?.[key]?.dueDate ?? iso) === iso) push(key)
  }
  for (const [key, ex] of Object.entries(rt.exceptions ?? {})) {
    if (ex.dueDate !== iso) continue
    if (rt.dueOffsetDays != null && toISO(addDays(fromISO(iso), -rt.dueOffsetDays)) === key) continue
    if (recurringOccursOn(rt, key)) push(key)
  }
  return out
}

/** True when a scoped edit of one occurrence has to split the series. */
export function splitsRecurring(rt: RecurringTask, occurrence: string, scope: EditScope): boolean {
  return scope === 'one' || (scope === 'future' && occurrence > rt.startDate)
}

/** Human summary of a recurrence rule, e.g. "every other week · Mon, Wed". */
export function describeRule(rt: RecurringTask): string {
  const rule = rt.rule
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  if (!rule) return rt.freq === 'weekly' ? `weekly · ${names[rt.weekday]}` : rt.freq
  const days = (rule.weekdays?.length ? rule.weekdays : [rt.weekday]).map((d) => names[d]).join(', ')
  switch (rule.kind) {
    case 'daily': return 'daily'
    case 'weekdays': return 'weekdays'
    case 'weekly': return `weekly · ${days}`
    case 'biweekly': return `every other week · ${days}`
    case 'monthly': return `monthly · day ${rule.day ?? fromISO(rt.startDate).getDate()}`
    case 'timesPerDay': return `${recurringTimes(rt)}× a day`
  }
}

/**
 * Current streak: consecutive qualifying days completed, counting back from
 * today (today itself may still be pending without breaking the streak).
 */
export function currentStreak(rt: RecurringTask, todayIso: string): number {
  let streak = 0
  let d = fromISO(todayIso)
  let first = true
  for (let i = 0; i < 730; i++) {
    const iso = toISO(d)
    if (iso < rt.startDate) break
    if (recurringOccursOn(rt, iso)) {
      if (isRecurringDone(rt, iso)) streak++
      else if (first || iso === todayIso) {
        // today not yet done: don't break, don't count
      } else break
      first = false
    }
    d = addDays(d, -1)
  }
  return streak
}

/** Last `n` qualifying days (oldest first) for the habit tracker strip. */
export function recentOccurrences(rt: RecurringTask, todayIso: string, n: number): string[] {
  const out: string[] = []
  let d = fromISO(todayIso)
  for (let i = 0; i < 366 && out.length < n; i++) {
    const iso = toISO(d)
    if (iso < rt.startDate) break
    if (recurringOccursOn(rt, iso)) out.push(iso)
    d = addDays(d, -1)
  }
  return out.reverse()
}
