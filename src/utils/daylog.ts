import type { AppState } from '../types'

/**
 * Helpers for the daily log: the sleep-length field's text format, and the
 * first day the journal should reach back to.
 */

/** Nothing longer than a full day can be slept. */
export const SLEEP_MAX_MIN = 24 * 60

/** Minutes → the canonical "7:30" the sleep field displays. */
export function fmtSleep(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

function clamp(v: number): number | null {
  if (!Number.isFinite(v)) return null
  return Math.max(0, Math.min(SLEEP_MAX_MIN, Math.round(v)))
}

/**
 * Read a hours-slept entry. Everything the field accepts:
 *   "7:30" · "7h30" · "7h30m" · "7h" · "7.5" / "7,5" · "8" (hours) · "450m"
 * Empty text means "no entry" and comes back as 0 (the reducer then drops the
 * field). Anything unreadable returns null, which the caller treats as "leave
 * the stored value alone" and puts the old text back.
 */
export function parseSleep(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '').replace(',', '.')
  if (!s) return 0
  let m: RegExpMatchArray | null
  if ((m = s.match(/^(\d{1,2}):(\d{1,2})$/))) return clamp(Number(m[1]) * 60 + Number(m[2]))
  if ((m = s.match(/^(\d{1,2})h(\d{1,2})m?$/))) return clamp(Number(m[1]) * 60 + Number(m[2]))
  if ((m = s.match(/^(\d{1,2})h$/))) return clamp(Number(m[1]) * 60)
  if ((m = s.match(/^(\d{1,4})m(?:in)?$/))) return clamp(Number(m[1]))
  if (/^\d{1,2}(\.\d{1,2})?$/.test(s)) return clamp(parseFloat(s) * 60)
  return null
}

/**
 * The earliest day the user has ANY data on — the day the journal starts from.
 * Everything dated is considered: events, a task's schedule/deadline/completion,
 * study sessions, flashcard counts, day logs, habit ticks and the start of a
 * recurring series. Returns null when the app holds nothing dated at all.
 */
export function earliestUserDate(state: AppState): string | null {
  const seen: string[] = []
  const take = (d: string | null | undefined) => {
    if (!d) return
    const iso = d.slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) seen.push(iso)
  }
  for (const e of state.events) take(e.date)
  for (const t of state.tasks) { take(t.date); take(t.dueDate); take(t.completedAt) }
  for (const s of state.studySessions) take(s.date)
  for (const a of state.ankiLogs) take(a.date)
  for (const d of Object.keys(state.dayLogs)) take(d)
  for (const [d, ids] of Object.entries(state.habitTicks ?? {})) if (ids?.length) take(d)
  for (const r of state.recurring) take(r.startDate)
  return seen.length ? seen.reduce((a, b) => (b < a ? b : a)) : null
}
