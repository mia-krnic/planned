import type { AppState, Birthday, CalEvent } from '../types'
import { birthdayLabel, dueTasksForDay, itemsForDay } from './agenda'
import { addDays, fromISO, MONTHS, toISO } from './date'
import { fmtSleep } from './daylog'
import { eventOccursOn } from './occur'
import { pickIndex } from '../data/homePicks'
import { NIGHT_LINES } from '../data/nightLines'

/**
 * The living parts of the Home page: what hour of the day it is, and the two or
 * three true sentences the page can say about today.
 *
 * Everything here is derived read-only from the store and from the clock. The
 * governing rule, in the page and in this file: nothing a phase adds ever
 * REMOVES anything — a later hour only emphasises or appends. So every function
 * below either returns a line or returns nothing, and no caller is ever asked
 * to hide something it was already showing.
 */

/* ---------- The hour ---------- */

export type DayPhase = 'morning' | 'afternoon' | 'evening' | 'night'

/**
 * morning 05:00–11:59 · afternoon 12:00–17:59 · evening 18:00–22:59 ·
 * night 23:00–04:59. Taken from minutes-since-midnight so the page can read it
 * off the tick it already runs, rather than starting a timer of its own.
 */
export function phaseAt(minOfDay: number): DayPhase {
  const h = Math.floor(minOfDay / 60)
  // Night wraps midnight, so it must be asked about first: 3am answers
  // "h < 12" too, and that way lies an afternoon at three in the morning.
  if (h >= 23 || h < 5) return 'night'
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

/** The night's line, drawn from the date (see NIGHT_LINES). */
export function nightLine(iso: string): string {
  return NIGHT_LINES[pickIndex(`${iso}night`, NIGHT_LINES.length)]
}

/* ---------- The almanac line ---------- */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** 1 on 1 January, 233 on 21 August — leap years included, by construction. */
export function dayOfYear(iso: string): number {
  const d = fromISO(iso)
  const jan1 = new Date(d.getFullYear(), 0, 1)
  return Math.round((d.getTime() - jan1.getTime()) / 86400000) + 1
}

/** "Friday · August 21 · day 233" — month first, the way the rest of the app
 * writes its dates (see the top bar's range label). */
export function almanacLine(iso: string): string {
  const d = fromISO(iso)
  return `${DAY_NAMES[d.getDay()]} · ${MONTHS[d.getMonth()]} ${d.getDate()} · day ${dayOfYear(iso)}`
}

/* ---------- Exams ---------- */

export interface UpcomingExam {
  ev: CalEvent
  /** Whole days from today: 0 = today, 1 = tomorrow. */
  days: number
}

/** Exams on a day, under the same calendar-visibility rule the grids use. */
function examsOn(state: AppState, iso: string): CalEvent[] {
  return state.events.filter((e) =>
    e.isExam
    && eventOccursOn(e, iso)
    && !state.hiddenCalendars.includes(e.classId ?? e.calendarId ?? 'personal'))
}

/** True when an exam sits on `iso` — today's steadying line hangs off this. */
export function hasExamOn(state: AppState, iso: string): boolean {
  return examsOn(state, iso).length > 0
}

/**
 * The soonest exam from `iso` onwards, up to `within` days away. Repeating
 * events are walked day by day rather than read off their start date, so a
 * weekly slot marked as an exam resolves to its next actual sitting.
 */
export function nextExam(state: AppState, iso: string, within: number): UpcomingExam | null {
  const start = fromISO(iso)
  for (let days = 0; days <= within; days++) {
    const [ev] = examsOn(state, toISO(addDays(start, days)))
    if (ev) return { ev, days }
  }
  return null
}

/* ---------- The whispered day-line ---------- */

/** 24-hour, unpadded — "9:00", to sit beside a clock that reads the same way. */
function atTime(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
}

/** Far enough out to start mattering, near enough not to be noise. */
const EXAM_HORIZON_DAYS = 14

/** Tasks due today that still want doing — a finished one is not a deadline. */
export function openDueToday(state: AppState, iso: string): number {
  return dueTasksForDay(state, iso).filter((t) => !t.done).length
}

/**
 * The faint line under the goal: what is still ahead today, how much is due,
 * and the nearest exam worth knowing about. Each part is dropped when it has
 * nothing to say, and the caller drops the whole line when none of them do.
 */
export function dayLine(state: AppState, iso: string, minOfDay: number): string {
  const parts: string[] = []

  const next = itemsForDay(state, iso).timedEvents.find((e) => e.startMin > minOfDay)
  if (next) parts.push(`${next.title} at ${atTime(next.startMin)}`)

  const due = openDueToday(state, iso)
  if (due > 0) parts.push(`${due} due`)

  // Today's exam is not a countdown, it is the steadying line below — so the
  // horizon here starts tomorrow.
  const exam = nextExam(state, iso, EXAM_HORIZON_DAYS)
  if (exam && exam.days >= 1) {
    parts.push(exam.days === 1 ? `${exam.ev.title} tomorrow` : `${exam.ev.title} in ${exam.days} days`)
  }

  return parts.join(' · ')
}

/* ---------- The wellbeing whisper ---------- */

/** Under six hours logged is the point the page says something. */
const SHORT_SLEEP_MIN = 6 * 60
/** Deadlines that make a day feel like a wall rather than a list. */
const HEAVY_DUE_COUNT = 4
/** Past four focused hours, stopping is the sensible thing, not the lazy one. */
const PLENTY_MIN = 4 * 60

/**
 * At most one line, in priority order — an exam today outranks everything, then
 * a short night, then tomorrow's exam, then the weight of the day, then having
 * already done plenty. One whisper or none: two would be a lecture.
 */
export function wellbeingWhisper(state: AppState, iso: string, focusedMin: number): string | null {
  if (hasExamOn(state, iso)) return 'exam day — you’ve done the work, breathe'

  const slept = state.dayLogs[iso]?.sleepMin
  if (slept != null && slept > 0 && slept < SHORT_SLEEP_MIN) {
    return `running on ${fmtSleep(slept)} of sleep — go gentle today`
  }

  const exam = nextExam(state, iso, 1)
  if (exam && exam.days === 1) return `${exam.ev.title} tomorrow — sleep beats cramming`

  if (openDueToday(state, iso) >= HEAVY_DUE_COUNT) return 'heavy day — one thing at a time'

  if (focusedMin > PLENTY_MIN) return 'you’ve done plenty — it’s fine to stop'

  return null
}

/* ---------- Small celebrations ---------- */

/**
 * "Maya turns 21 today". birthdayLabel writes the calendar's hover form
 * ("Maya — turns 21"), which reads as a caption rather than a sentence; the
 * dash comes out and the day goes on the end.
 */
export function birthdayCheer(b: Birthday, iso: string): string {
  return `${birthdayLabel(b, iso).replace(' — ', ' ')} today`
}
