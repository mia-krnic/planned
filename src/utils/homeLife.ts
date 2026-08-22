import type { AppState, Birthday, CalEvent } from '../types'
import { birthdayLabel, dueTasksForDay, itemsForDay } from './agenda'
import { addDays, fromISO, MONTHS, toISO } from './date'
import { fmtSleep } from './daylog'
import { eventOccursOn } from './occur'
import { pickIndex } from '../data/homePicks'
import { NIGHT_LINES, NIGHT_LINES_ZH } from '../data/nightLines'
import { lang, t } from '../i18n'

/**
 * The living parts of the Home page: what hour of the day it is, and the two or
 * three true sentences the page can say about today.
 *
 * Everything here is derived read-only from the store and from the clock. The
 * governing rule, in the page and in this file: nothing a phase adds ever
 * REMOVES anything — a later hour only emphasises or appends. So every function
 * below either returns a line or returns nothing, and no caller is ever asked
 * to hide something it was already showing.
 *
 * A second rule, for the Chinese build: a sentence assembled from translated
 * fragments comes out as word salad, because the pieces sit in a different
 * order and take different particles. So the lines below that interpolate
 * anything branch on `lang()` and write the whole Chinese sentence out; only
 * the fixed ones go through `t()`. Longer, and readable in both languages.
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
  // The two arrays run parallel, so the same date lands on the same sentence in
  // either language — switching language translates tonight's line rather than
  // dealing a different one.
  const lines = lang() === 'zh' ? NIGHT_LINES_ZH : NIGHT_LINES
  return lines[pickIndex(`${iso}night`, lines.length)]
}

/* ---------- The almanac line ---------- */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_NAMES_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

/** 1 on 1 January, 233 on 21 August — leap years included, by construction. */
export function dayOfYear(iso: string): number {
  const d = fromISO(iso)
  const jan1 = new Date(d.getFullYear(), 0, 1)
  return Math.round((d.getTime() - jan1.getTime()) / 86400000) + 1
}

/** "Friday · August 21 · day 233" — month first, the way the rest of the app
 * writes its dates (see the top bar's range label). In Chinese, "星期五 ·
 * 8月21日 · 第233天": same three fields, each in its own language's form. */
export function almanacLine(iso: string): string {
  const d = fromISO(iso)
  if (lang() === 'zh') {
    return `${DAY_NAMES_ZH[d.getDay()]} · ${d.getMonth() + 1}月${d.getDate()}日 · 第${dayOfYear(iso)}天`
  }
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
  const zh = lang() === 'zh'
  const parts: string[] = []

  // Chinese puts the when in front of the what — "9:00 有机化学" — where English
  // hangs it off the back with "at". Same two fields, opposite order.
  const next = itemsForDay(state, iso).timedEvents.find((e) => e.startMin > minOfDay)
  if (next) {
    parts.push(zh ? `${atTime(next.startMin)} ${next.title}` : `${next.title} at ${atTime(next.startMin)}`)
  }

  const due = openDueToday(state, iso)
  if (due > 0) parts.push(zh ? `${due} 项到期` : `${due} due`)

  // Today's exam is not a countdown, it is the steadying line below — so the
  // horizon here starts tomorrow.
  const exam = nextExam(state, iso, EXAM_HORIZON_DAYS)
  if (exam && exam.days >= 1) {
    if (zh) parts.push(exam.days === 1 ? `明天 ${exam.ev.title}` : `${exam.days} 天后 ${exam.ev.title}`)
    else parts.push(exam.days === 1 ? `${exam.ev.title} tomorrow` : `${exam.ev.title} in ${exam.days} days`)
  }

  return parts.join(' · ')
}

/* ---------- The wellbeing whisper ---------- */

/**
 * "5小时30分" — fmtSleep's "5:30" read out loud, because the Chinese sentence
 * wraps it in prose rather than standing it next to a clock. Local to this
 * whisper on purpose: fmtSleep itself sits beside the journal's sleep field and
 * inside the insights charts, where the colon form is what belongs.
 */
function sleptZh(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (!h) return `${m}分`
  return m ? `${h}小时${m}分` : `${h}小时`
}

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
  const zh = lang() === 'zh'

  if (hasExamOn(state, iso)) return t('exam day — you’ve done the work, breathe')

  const slept = state.dayLogs[iso]?.sleepMin
  if (slept != null && slept > 0 && slept < SHORT_SLEEP_MIN) {
    return zh
      ? `只睡了${sleptZh(slept)}——今天温柔一点`
      : `running on ${fmtSleep(slept)} of sleep — go gentle today`
  }

  const exam = nextExam(state, iso, 1)
  if (exam && exam.days === 1) {
    return zh
      ? `明天 ${exam.ev.title}——睡够比临时抱佛脚管用`
      : `${exam.ev.title} tomorrow — sleep beats cramming`
  }

  if (openDueToday(state, iso) >= HEAVY_DUE_COUNT) return t('heavy day — one thing at a time')

  if (focusedMin > PLENTY_MIN) return t('you’ve done plenty — it’s fine to stop')

  return null
}

/* ---------- Small celebrations ---------- */

/**
 * "Maya turns 21 today". birthdayLabel writes the calendar's hover form
 * ("Maya — turns 21"), which reads as a caption rather than a sentence; the
 * dash comes out and the day goes on the end.
 *
 * Chinese wants "今天" in the middle rather than on the end, so it is written
 * out here instead of patched out of the label — which is why the age is
 * recomputed rather than read back out of a string.
 */
export function birthdayCheer(b: Birthday, iso: string): string {
  if (lang() === 'zh') {
    const age = b.year == null ? -1 : Number(iso.slice(0, 4)) - b.year
    return age >= 0 ? `${b.name} 今天满${age}岁` : `今天是 ${b.name} 的生日`
  }
  return `${birthdayLabel(b, iso).replace(' — ', ' ')} today`
}
