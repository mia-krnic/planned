import type { AppState, Birthday, CalEvent, Task, TaskExtension, TaskGhost } from '../types'
import { BIRTHDAY_CAL_ID, DUE_EOD_MIN } from '../types'
import { classById, taskCalendarId, taskColor, taskLabel } from '../store'
import { eventOccursOn, occurrenceAt, occurrencesOn, recurringDueOn, type RecurOccurrence } from './occur'
import { hexToRgba, PERSONAL_COLOR } from './color'
import { fmtFriendly, fmtTime } from './date'
import { t } from '../i18n'

export interface DayItems {
  timedEvents: CalEvent[]
  allDayEvents: CalEvent[]
  timedTasks: Task[]
  allDayTasks: Task[] // dated but time-less tasks
  allDayRecurring: RecurOccurrence[] // recurring occurrences with no time
  timedRecurring: RecurOccurrence[] // recurring occurrences on the time grid
}

export function eventColor(state: AppState, ev: CalEvent): string {
  const classColor = classById(state, ev.classId)?.color
  if (classColor) return classColor
  const cal = ev.calendarId ? state.customCalendars.find((c) => c.id === ev.calendarId) : null
  return cal?.color ?? PERSONAL_COLOR
}

function eventVisible(state: AppState, ev: CalEvent): boolean {
  return !state.hiddenCalendars.includes(ev.classId ?? ev.calendarId ?? 'personal')
}

function taskVisible(state: AppState, projectId: string | null): boolean {
  return state.showTasksOnCalendar && !state.hiddenCalendars.includes(taskCalendarId(state, projectId))
}

/** Everything visible on a given calendar day, filters applied. */
export function itemsForDay(state: AppState, iso: string): DayItems {
  const occ = state.events.filter((e) => eventOccursOn(e, iso) && eventVisible(state, e))
  const tasks = state.tasks.filter((t) => t.date === iso && taskVisible(state, t.projectId))
  const recurring = state.recurring
    .filter((r) => taskVisible(state, r.projectId))
    .flatMap((r) => occurrencesOn(r, iso))
  return {
    timedEvents: occ.filter((e) => !e.allDay).sort((a, b) => a.startMin - b.startMin),
    allDayEvents: occ.filter((e) => e.allDay),
    timedTasks: tasks.filter((t) => t.startMin != null).sort((a, b) => a.startMin! - b.startMin!),
    allDayTasks: tasks.filter((t) => t.startMin == null),
    allDayRecurring: recurring.filter((o) => o.startMin == null),
    timedRecurring: recurring.filter((o) => o.startMin != null).sort((a, b) => a.startMin! - b.startMin!),
  }
}

/* ---------- Birthdays (the built-in yearly calendar) ---------- */

/** The Birthdays calendar's own warm amber — deliberately not in the palette. */
export const BIRTHDAY_COLOR = '#f0a63c'

/** Birthdays falling on `iso`, unless the Birthdays calendar is hidden. */
export function birthdaysForDay(state: AppState, iso: string): Birthday[] {
  if (state.hiddenCalendars.includes(BIRTHDAY_CAL_ID)) return []
  const d = fromISOParts(iso)
  return (state.birthdays ?? []).filter((b) => b.month === d.month && b.day === d.day)
}

/** Month/day of an ISO date without going through Date (no timezone to trip on). */
function fromISOParts(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

/** Hover label for a birthday marker: "Maya — turns 21", or just the name. */
export function birthdayLabel(b: Birthday, iso: string): string {
  if (b.year == null) return `${b.name}'s birthday`
  const age = fromISOParts(iso).year - b.year
  return age >= 0 ? `${b.name} — turns ${age}` : `${b.name}'s birthday`
}

/**
 * Is `iso` a day off? Explicitly marked days plus every birthday that hasn't
 * opted out — derived on read, so state.daysOff is never written to by a
 * birthday and deleting one takes its day off with it.
 */
export function isDayOff(state: AppState, iso: string): boolean {
  if (state.daysOff.includes(iso)) return true
  return birthdaysForDay(state, iso).some((b) => b.dayOff !== false)
}

/** Class colors of exams on a day — one entry per exam, for split highlight rings. */
export function examColorsForDay(state: AppState, iso: string): string[] {
  return state.events
    .filter((e) => e.isExam && eventOccursOn(e, iso) && eventVisible(state, e))
    .map((e) => eventColor(state, e))
}

/**
 * Background for the translucent exam-day circle behind a date number:
 * one exam → plain tinted circle; several → equal pie segments.
 * The pie is an inline SVG (not a conic-gradient): gradient hard stops
 * anti-alias badly at the 0°/360° wrap seam, bleeding one colour into
 * its neighbour; real wedge paths keep every border crisp.
 */
export function examRingBackground(colors: string[]): string | null {
  if (colors.length === 0) return null
  if (colors.length === 1) return hexToRgba(colors[0], 0.38)
  const n = colors.length
  // Radius covers the box corners (half-diagonal of a 32-unit square ≈ 22.6).
  const R = 23
  const pt = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180
    return `${(16 + R * Math.cos(rad)).toFixed(2)},${(16 + R * Math.sin(rad)).toFixed(2)}`
  }
  const wedges = colors.map((c, i) => {
    const a0 = (i * 360) / n
    const a1 = ((i + 1) * 360) / n
    const large = a1 - a0 > 180 ? 1 : 0
    return `<path d="M16,16 L${pt(a0)} A${R},${R} 0 ${large} 1 ${pt(a1)} Z" fill="${c}" fill-opacity="0.48"/>`
  }).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${wedges}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") center / cover no-repeat`
}

/* ---------- Due dates ---------- */

/** Monochrome flag glyph (VS15 forces text, not emoji, presentation). */
export const DUE_FLAG = '⚑︎'

/**
 * Tasks whose *due date* lands on `iso`, in due-time order. Same visibility
 * rules as any other task on the calendar (showTasksOnCalendar + the owning
 * calendar not hidden). Independent of the task's own scheduling.
 */
export function dueTasksForDay(state: AppState, iso: string): Task[] {
  return state.tasks
    .filter((t) => t.dueDate === iso && taskVisible(state, t.projectId))
    .sort((a, b) => (a.dueMin ?? DUE_EOD_MIN) - (b.dueMin ?? DUE_EOD_MIN))
}

/**
 * One deadline bar to draw on a day. A task contributes its current due date
 * (ghost false) plus one entry per earlier due date it was extended away from
 * (ghost true) — those keep their place on the calendar, struck through.
 */
export interface DueBar {
  task: Task
  dueMin: number | null
  ghost: boolean
}

/** Every deadline bar landing on `iso`, in due-time order (see DueBar). */
export function dueBarsForDay(state: AppState, iso: string): DueBar[] {
  const bars: DueBar[] = []
  for (const t of state.tasks) {
    if (!taskVisible(state, t.projectId)) continue
    if (t.dueDate === iso) bars.push({ task: t, dueMin: t.dueMin ?? null, ghost: false })
    for (const ex of t.extensions ?? []) {
      if (ex.dueDate === iso) bars.push({ task: t, dueMin: ex.dueMin, ghost: true })
    }
  }
  return bars.sort((a, b) => (a.dueMin ?? DUE_EOD_MIN) - (b.dueMin ?? DUE_EOD_MIN))
}

/** One deadline bar belonging to a recurring occurrence (see DueBar). */
export interface RecurDueBar {
  occ: RecurOccurrence
  dueMin: number | null
  ghost: boolean
}

/**
 * Deadline bars from recurring occurrences landing on `iso` — the live one plus
 * any deadline that occurrence was extended away from, exactly like a task's.
 */
export function recurringDueBarsForDay(state: AppState, iso: string): RecurDueBar[] {
  const bars: RecurDueBar[] = []
  for (const rt of state.recurring) {
    if (!taskVisible(state, rt.projectId)) continue
    for (const occ of recurringDueOn(rt, iso)) bars.push({ occ, dueMin: occ.dueMin, ghost: false })
    for (const [key, ex] of Object.entries(rt.exceptions ?? {})) {
      for (const old of (ex.extensions ?? []) as TaskExtension[]) {
        if (old.dueDate === iso) bars.push({ occ: occurrenceAt(rt, key), dueMin: old.dueMin, ghost: true })
      }
    }
  }
  return bars.sort((a, b) => (a.dueMin ?? DUE_EOD_MIN) - (b.dueMin ?? DUE_EOD_MIN))
}

/* ---------- Reschedule ghosts ---------- */

/** One abandoned slot to draw on a day, with the index that identifies it. */
export interface GhostSlot {
  task: Task
  ghost: TaskGhost
  index: number // position in task.ghosts — what 'dismissGhost' addresses
}

/**
 * Slots on `iso` that a task was moved away from. Same visibility rules as any
 * task on the calendar, plus the global toggle and the per-ghost dismissal.
 * `timed` splits the time grid (startMin set) from the all-day lane.
 */
export function ghostsForDay(state: AppState, iso: string, timed: boolean): GhostSlot[] {
  if (state.showGhosts === false) return []
  const out: GhostSlot[] = []
  for (const t of state.tasks) {
    if (!t.ghosts?.length || !taskVisible(state, t.projectId)) continue
    // A task dragged back to a day it once left keeps the record, but the day
    // it actually sits on never shows a ghost of itself.
    if (t.date === iso) continue
    t.ghosts.forEach((g, index) => {
      if (g.date !== iso || g.dismissed) return
      if ((g.startMin != null) !== timed) return
      out.push({ task: t, ghost: g, index })
    })
  }
  return out.sort((a, b) => (a.ghost.startMin ?? 0) - (b.ghost.startMin ?? 0))
}

/* ---------- Urgent banners (due today) ---------- */

/** Marks on an urgent task: one per outstanding step (complete it, hand it in). */
export const URGENT_MARKS: Record<1 | 2, string> = { 2: '‼', 1: '!' }

export interface UrgentTask {
  task: Task
  marks: 1 | 2 // 2 = neither done nor submitted, 1 = one of the two still open
}

/** One banner: every task of one class/calendar due on the day. */
export interface UrgentGroup {
  key: string
  name: string
  color: string
  tasks: UrgentTask[]
}

/**
 * Tasks due on `iso` that still need something doing, grouped into one banner
 * per class/calendar. A task drops out only once it is BOTH done and submitted
 * (or its due date moves/passes) — there is deliberately no dismissing.
 * Visibility filters apply: hiding a calendar silences its banners too, so a
 * student can genuinely focus on a subset of classes (user decision).
 */
export function urgentDueGroups(state: AppState, iso: string): UrgentGroup[] {
  const groups = new Map<string, UrgentGroup>()
  for (const t of state.tasks) {
    if (t.dueDate !== iso) continue
    if (!taskVisible(state, t.projectId)) continue
    const open = (t.done ? 0 : 1) + (t.submitted ? 0 : 1)
    if (open === 0) continue
    const key = t.projectId == null ? 'unfiled' : taskCalendarId(state, t.projectId)
    let g = groups.get(key)
    if (!g) {
      g = {
        key,
        name: taskLabel(state, t.projectId) ?? 'Unfiled',
        color: taskColor(state, t.projectId),
        tasks: [],
      }
      groups.set(key, g)
    }
    g.tasks.push({ task: t, marks: open as 1 | 2 })
  }
  for (const g of groups.values()) {
    g.tasks.sort((a, b) => (a.task.dueMin ?? DUE_EOD_MIN) - (b.task.dueMin ?? DUE_EOD_MIN))
  }
  return [...groups.values()]
}

/** Compact deadline line for task rows, e.g. "due Fri 8/28 11:59pm". */
// The parameter is `task`, not `t`: `t` is the translation function here.
export function fmtDue(task: Task): string | null {
  if (!task.dueDate) return null
  return `${t('due')} ${fmtFriendly(task.dueDate)} ${fmtTime(task.dueMin ?? DUE_EOD_MIN)}`
}

/** Up to `n` distinct colours of tasks due on `iso` — the mini-month dots. */
export function dueColorsForDay(state: AppState, iso: string, n = 3): string[] {
  const colors: string[] = []
  for (const t of dueTasksForDay(state, iso)) {
    const c = taskColor(state, t.projectId)
    if (colors.length < n && !colors.includes(c)) colors.push(c)
  }
  return colors
}

/**
 * Column layout for overlapping timed items. Greedy interval-partitioning:
 * items in the same overlap cluster split the width evenly.
 */
export interface Positioned {
  col: number
  cols: number
}

export function layoutOverlaps(items: { startMin: number; endMin: number }[]): Positioned[] {
  const idx = items.map((_, i) => i).sort((a, b) => items[a].startMin - items[b].startMin)
  const out: Positioned[] = items.map(() => ({ col: 0, cols: 1 }))
  let cluster: number[] = []
  let clusterEnd = -1
  const colEnds: number[] = []

  const closeCluster = () => {
    const ncols = Math.max(...cluster.map((i) => out[i].col)) + 1
    for (const i of cluster) out[i].cols = ncols
    cluster = []
    colEnds.length = 0
  }

  for (const i of idx) {
    const it = items[i]
    if (cluster.length && it.startMin >= clusterEnd) closeCluster()
    let col = colEnds.findIndex((end) => end <= it.startMin)
    if (col === -1) col = colEnds.length
    colEnds[col] = it.endMin
    out[i].col = col
    cluster.push(i)
    clusterEnd = Math.max(clusterEnd, it.endMin)
  }
  if (cluster.length) closeCluster()
  return out
}
