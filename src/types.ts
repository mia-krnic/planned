export type ID = string

/** Optional class details shown at the top of the class's binder page. */
export interface ClassMeta {
  professor?: string
  room?: string
  homework?: string // e.g. "problem sheet every Friday"
  other?: string // freeform slot for anything that doesn't fit above
}

/**
 * An organisational folder for classes ("Year 1", "Maths modules"…). Purely
 * structural: no colour of its own. Collapsible in the sidebar and binder.
 */
export interface ClassFolder {
  id: ID
  name: string
  collapsed: boolean
}

/** A class (course). Each class is its own calendar + gets an auto-created project. */
export interface ClassInfo {
  id: ID
  name: string
  color: string
  code?: string // hidden module code (e.g. CS126) so feed matching survives renames
  meta?: ClassMeta
  folderId?: ID | null
  pinnedBinder?: boolean // pinned to the very top of the binder
  pinnedFolder?: boolean // pinned to the top of its folder (binder ordering)
}

/**
 * A user-created calendar beyond the built-in Personal calendar (e.g. "Film
 * Society"). Events assigned to it have classId: null and calendarId: this id.
 */
export interface CustomCalendar {
  id: ID
  name: string
  color: string
}

export type Repeat = 'none' | 'daily' | 'weekly'

/**
 * Snapshot of an event's last-synced values from the ICS feed. Invisible to
 * the user; used to match feed entries to (possibly user-edited) events and to
 * detect what changed on the feed side between syncs.
 */
export interface IcsSnapshot {
  title: string
  date: string
  allDay: boolean
  startMin: number
  endMin: number
  location: string
  description: string
}

/**
 * A calendar event. Times are minutes-since-midnight in local time; dates are
 * 'YYYY-MM-DD' strings so nothing shifts across timezones.
 * Weekly repeats recur on the weekday of `date`.
 * Scoped series edits: `exDates` lists occurrences detached/removed by
 * "only this event" edits; `until` ends the series before that date after a
 * "this and future events" edit (the future part becomes a new series).
 */
export interface CalEvent {
  id: ID
  title: string
  classId: ID | null // null = personal calendar (or a custom calendar; see calendarId)
  calendarId?: ID | null // when classId is null: a CustomCalendar id, or null/undefined for Personal
  date: string
  allDay: boolean
  startMin: number
  endMin: number
  repeat: Repeat
  exDates?: string[]
  until?: string // exclusive: no occurrences on/after this date
  location?: string
  notes?: string
  isExam?: boolean
  icsUid?: string // present = synced from the university timetable feed
  origin?: IcsSnapshot // hidden last-synced feed values (see IcsSnapshot)
  syncMissing?: boolean // event disappeared from the feed (e.g. cancelled)
}

/** One changed field in an 'edited' sync notification. */
export interface FieldDiff {
  key: string
  label: string
  oldText: string
  newText: string
  patch: Partial<CalEvent>
}

export type NotifKind = 'imported' | 'added' | 'removed' | 'edited'

export interface AppNotification {
  id: ID
  at: string // ISO datetime
  kind: NotifKind
  title: string
  body?: string
  eventId?: ID
  diffs?: FieldDiff[]
}

/**
 * Projects hold tasks. Exactly one project per class (via classId) and one per
 * calendar (via calendarId, 'personal' or a CustomCalendar id). Every task
 * assigned to a class/calendar goes through its project; there are no ad-hoc
 * user-created projects any more. The color mirrors the class/calendar color.
 */
export interface Project {
  id: ID
  name: string
  color: string
  classId: ID | null
  calendarId?: ID | null // when classId is null: 'personal' or a CustomCalendar id
  collapsed: boolean
}

/**
 * A section inside a project ("Coursework", "Studies", "Misc"…). Sections are
 * created/renamed/deleted by the user; deleting a section moves its tasks to
 * the project's default section (Misc for classes, main for calendars).
 * A task with sectionId == null / undefined lives in the project's implicit
 * "main" section (only shown as its own header when other sections exist).
 */
export interface TaskSection {
  id: ID
  projectId: ID
  name: string
  order: number
  /** Marked as holding graded work: feeds the grade tracker. Several sections of one class may be flagged. */
  assignments?: boolean
  /** Folded shut in the project tree: the header stays, its tasks are hidden. */
  collapsed?: boolean
}

/** A deadline this task had before an extension was granted (see Task.extensions). */
export interface TaskExtension {
  dueDate: string
  dueMin: number | null
}

/**
 * A slot a scheduled task was moved away from (see Task.ghosts). Recorded every
 * time the task's `date` changes from one day to another, so the calendar can
 * keep showing where the work used to sit.
 */
export interface TaskGhost {
  date: string
  startMin: number | null // null = the task was all-day on that date
  dismissed?: boolean // hidden by the × on the ghost; cleared by re-enabling the setting
}

/**
 * Tri-state completion for the YPT-style checking mode: 0 not started,
 * 1 half done, 2 fully done. Deliberately separate from `Task.done` so a mode
 * switch never destroys a half-done state (see displayYptState in store).
 */
export type YptState = 0 | 1 | 2

/**
 * A one-off task. date=null → free-floating "braindump" task inside its project.
 * date set + startMin=null → all-day task. date + startMin → shows on the time grid.
 * endMin (optional) marks an expected time block — rendered as an outlined
 * (unfilled) box on the grid instead of a filled chip.
 *
 * `dueDate`/`dueMin` are optional metadata, fully independent of the scheduling
 * fields above: when something is actually due. A dueDate with dueMin null means
 * "due that day" and is drawn at end of day (see DUE_EOD_MIN).
 */
export interface Task {
  id: ID
  title: string
  projectId: ID | null
  sectionId?: ID | null // section inside the project; null/undefined = the project's main section
  date: string | null
  startMin: number | null
  endMin?: number | null
  dueDate?: string | null
  dueMin?: number | null // null = no specific time (drawn at end of day)
  location?: string // e.g. "Library front desk — office 2.1"
  done: boolean
  /**
   * Handed in. Fully independent of `done` (you can finish something days
   * before submitting it). With a dueDate it fades and strikes the due bar on
   * the calendar; without one it is a pure tracker.
   */
  submitted?: boolean
  /**
   * Earlier deadlines this task had, oldest first, each kept because the user
   * ticked "Extension granted" when pushing the due date back. They keep
   * rendering on their original day, struck through.
   */
  extensions?: TaskExtension[]
  notes?: string
  pinned?: boolean // shown in the top-of-list PINNED section; auto-cleared on complete
  order?: number // manual drag order inside its own list — (projectId, sectionId) or Unfiled (lower = higher up)
  /**
   * Binder uploads attached to this task (class projects only). The grade
   * tracker reaches its documents through here rather than binding them itself.
   */
  attachmentUploadIds?: ID[]
  /**
   * When `done` was last switched on (ISO datetime), cleared when un-ticked.
   * Orders the per-section Archive lists; tasks completed before this field
   * existed have none and sort last.
   */
  completedAt?: string
  /**
   * YPT-style tri-state, kept alongside (never instead of) `done` so switching
   * checking modes back and forth preserves a half-done mark. Absent = 0.
   */
  yptState?: YptState
  /** Slots this task was scheduled in before being moved (oldest first). */
  ghosts?: TaskGhost[]
}

/** Display position for a due date with no time: 11:59pm. */
export const DUE_EOD_MIN = 23 * 60 + 59

export type Freq = 'daily' | 'weekdays' | 'weekly'

/** Repetition shapes a custom rule can take (see RecurRule). */
export type RecurKind = 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'timesPerDay'

/**
 * The custom recurrence rule. Optional on RecurringTask: a task without one
 * still repeats by the legacy `freq`/`weekday` pair, so stored data needs no
 * rewriting (see recurringOccursOn).
 */
export interface RecurRule {
  kind: RecurKind
  /** weekly / biweekly: every weekday listed (0 = Sunday). Empty falls back to `weekday`. */
  weekdays?: number[]
  /** biweekly: the reference week deciding which fortnight is "on". Defaults to startDate. */
  anchor?: string
  /** monthly: day of the month (1–31), clamped down to the length of short months. */
  day?: number
  /** timesPerDay: how many checkable slots each qualifying day gets. */
  times?: number
}

/**
 * A per-occurrence override, keyed in `RecurringTask.exceptions` by the date the
 * RULE generated the occurrence on (its identity, which a move never changes).
 * Editing or dragging one occurrence writes one of these instead of forking the
 * whole series.
 */
export interface RecurException {
  date?: string // moved to another day
  startMin?: number | null // null = back to an all-day occurrence
  endMin?: number | null
  dueDate?: string
  dueMin?: number | null
  skip?: boolean // occurrence removed ("delete only this")
  /** Deadlines this occurrence was extended away from — drawn struck through. */
  extensions?: TaskExtension[]
}

/**
 * A regenerating task (habit) inside a project. Each qualifying day produces an
 * occurrence; checking it off records the date in `completions`.
 *
 * Scheduling is optional: with `startMin` an occurrence also draws a chip on the
 * time grid, and `dueOffsetDays`/`dueMin` give each occurrence a deadline N days
 * after its own date (a Monday problem set due Friday at 5pm).
 */
export interface RecurringTask {
  id: ID
  title: string
  projectId: ID
  sectionId?: ID | null // section inside the project; null/undefined = main
  freq: Freq
  weekday: number // used when freq === 'weekly'
  startDate: string
  streak: boolean // show the streak/habit tracker
  /** Days completed IN FULL. For timesPerDay, partly-done days live in `partial`. */
  completions: string[]
  /** Custom rule; absent = the legacy `freq`/`weekday` behaviour. */
  rule?: RecurRule
  /** Exclusive end of the series, set by a "this and future" edit. */
  until?: string
  /** timesPerDay: slots ticked off on a day not yet finished (0 < n < times). */
  partial?: Record<string, number>
  startMin?: number | null // occurrence time block on the calendar
  endMin?: number | null
  dueOffsetDays?: number // each occurrence is due this many days after its date
  dueMin?: number | null // …at this time (null/absent = end of day)
  exceptions?: Record<string, RecurException>
}

/* ---------- Study timer ---------- */

/** Timer style. Pomodoro modes auto-alternate work/break; normal is free-running. */
export type StudyMode = 'pomodoro25' | 'pomodoro50' | 'custom' | 'normal'

/** A class assignment slice inside a session ("switched to BIOL at 5pm"). */
export interface ClassSegment {
  startMin: number
  classId: ID | null
}

/** A pause inside a session. Minutes-since-midnight start + length in minutes. */
export interface StudyBreak {
  startMin: number
  durMin: number
  /** Why the user paused ('rest' | 'meal' | 'restroom' | 'other' | free text). Absent = untagged. */
  tag?: string
}

/**
 * One logged study block. Times are minutes-since-midnight; `endMin === null`
 * means it is running right now (at most one such session may exist).
 * Pomodoro breaks are derived from wall-clock while running and materialised
 * into `breaks` when the session ends, so a finished record never changes.
 */
export interface StudySession {
  id: ID
  classId: ID | null // null = unassigned (neutral grey on the calendar)
  taskIds: ID[]
  /** @deprecated event linking was replaced by binder-upload linking (uploadIds). */
  eventIds: ID[]
  uploadIds?: ID[] // binder uploads created/revised during the session
  date: string
  startMin: number
  endMin: number | null // null = currently running
  mode: StudyMode
  customWork?: number // custom pomodoro: work minutes (mode === 'custom')
  customBreak?: number // custom pomodoro: break minutes (mode === 'custom')
  breaks: StudyBreak[] // explicit; pomodoro breaks are derived live, stored on end
  /**
   * Mid-session class switches: slices ordered by startMin; the first slice
   * starts at the session start (classId above mirrors the first slice for
   * back-compat). Absent = single-class session.
   */
  classSegments?: ClassSegment[]
  reflection?: string
}

/* ---------- Binder (per-class notes & resources) ---------- */

/** A customisable section on a class's binder page (defaults: Resources / Handouts, Notes). */
export interface BinderSection {
  id: ID
  classId: ID
  name: string
}

/** One file inside an upload. The blob itself lives in IndexedDB keyed by `id`. */
export interface BinderFile {
  id: ID
  name: string
  type: string // MIME type
  size: number
}

/** Where an upload is attached for dating (optional). */
export interface BinderAttach {
  kind: 'event' | 'task'
  id: ID
  date: string | null // occurrence/task date used for chronological ordering
  label: string // display label captured at attach time (event/task title)
}

/**
 * An upload: one or more files posted together under a title, with an optional
 * caption — like a Google Classroom post ("Week 2 resources", "Seminar 5 notes").
 */
export interface BinderUpload {
  id: ID
  classId: ID
  sectionId: ID
  title: string
  caption?: string
  files: BinderFile[]
  attach?: BinderAttach
  pinned?: 'class' | 'section' // pinned to top of the class page or its section
  pinnedStream?: boolean // pinned to the top of the class's stream tab
  createdAt: string // ISO datetime
}

/**
 * A written stream post — a quick note-to-self on the class's stream tab
 * ("bring calculator on Thursday"). Not part of the collation sections.
 */
export interface BinderPost {
  id: ID
  classId: ID
  text: string
  pinned?: boolean // pinned to the top of the stream
  createdAt: string // ISO datetime
}

/* ---------- Grade tracker ---------- */

/**
 * One assessed component of a class ("Midterm", "Lab reports"): what it is
 * worth, what it scored, and which assignment tasks make it up.
 *
 * `weightPct` null/absent means "auto": every auto row of the class shares the
 * remainder of 100% left by the explicitly-weighted rows, evenly.
 * `scorePct` null/absent means "not marked yet" — the row is left out of the
 * current-grade figure entirely.
 * Documents are NOT bound here: they come through `taskIds` → each task's
 * `attachmentUploadIds`, so filing a handout on the task is enough.
 */
export interface GradeRow {
  id: ID
  classId: ID
  name: string
  weightPct?: number | null
  scorePct?: number | null
  taskIds: ID[]
}

/* ---------- Anki review tracker ---------- */

/**
 * One day's manually-logged flashcard review count for one deck bucket.
 * `classId` null = the general/unassigned bucket (displayed as "General").
 * At most one entry per (date, classId) pair — logging replaces the count,
 * and a count of 0 removes the entry entirely.
 */
export interface AnkiLog {
  date: string
  classId: ID | null
  count: number
}

/* ---------- Birthdays ---------- */

/**
 * One entry on the built-in Birthdays calendar. Repeats yearly on month/day;
 * `year` (the birth year) is optional and only drives the "turns N" hint.
 * The date is a day off unless `dayOff` is explicitly false.
 */
export interface Birthday {
  id: ID
  name: string
  month: number // 1–12
  day: number // 1–31
  year?: number | null
  dayOff?: boolean // absent = true; false = this birthday is a normal working day
}

/** Calendar id of the built-in Birthdays calendar (hiddenCalendars, filters). */
export const BIRTHDAY_CAL_ID = 'birthdays'

/* ---------- Daily log & journal ---------- */

/** The seven weather marks a day can be tagged with (several at once). */
export type WeatherKind = 'sun' | 'suncloud' | 'cloud' | 'rain' | 'storm' | 'snow' | 'wind'

/**
 * One day's diary: what the weather did, what was eaten, how the day felt and
 * a free-text entry. Every field is optional and a day with nothing in it is
 * not stored at all (see the updateDayLog reducer), so `dayLogs` only ever
 * holds days the user actually wrote something on.
 */
export interface DayLog {
  /** Glasses of water crossed off today, 0–8 (0 stored as absent). */
  water?: number
  /** Showered today (the showerhead icon at the end of the water row). */
  shower?: boolean
  /** Teeth brushed today, 0–2 (the brush icons at the end of the mood row). */
  teeth?: number
  /** Minutes slept the night into this day (the ☾ input under the log). */
  sleepMin?: number
  /** The day's one main goal (Home page) — a reminder, never a task. */
  goal?: string
  /** True while weather[0] came from the auto-fetcher; any user click clears it. */
  weatherAuto?: boolean
  meals?: { b?: string; l?: string; d?: string }
  /**
   * Kept as an array for stored-data compatibility, but the UI treats it as a
   * single choice — element [0] is the day's weather.
   */
  weather?: WeatherKind[]
  mood?: 1 | 2 | 3 | 4 | 5
  journal?: string
}

/**
 * A habit-tracker goal for the gantt grids. Year goals ('2026') trickle down
 * into every month/week grid of that year; month goals ('2026-08') exist for
 * that month only — the customisable part that resets monthly.
 */
export interface HabitGoal {
  id: ID
  title: string
  period: string // 'YYYY' (year goal) or 'YYYY-MM' (month goal)
  order: number
}

/** A quote the user typed into the Home library themselves. */
export interface CustomQuote { id: ID; text: string; author?: string }
/** A mantra (the short line under the clock) the user added themselves. */
export interface CustomMantra { id: ID; text: string }

export interface AppState {
  classes: ClassInfo[]
  folders: ClassFolder[]
  customCalendars: CustomCalendar[]
  events: CalEvent[]
  projects: Project[]
  taskSections: TaskSection[]
  tasks: Task[]
  recurring: RecurringTask[]
  birthdays: Birthday[] // the built-in Birthdays calendar
  studySessions: StudySession[]
  gradeRows: GradeRow[] // assessed components per class (the grade tracker)
  ankiLogs: AnkiLog[] // manual flashcard review counts, one per (date, classId)
  dayLogs: Record<string, DayLog> // the daily log & journal, keyed by ISO date
  /** Home-page favourites, keyed by wallpaper file / quote text / mantra text. */
  homeFavs?: { wallpapers?: string[]; quotes?: string[]; mantras?: string[] }
  customQuotes?: CustomQuote[]
  customMantras?: CustomMantra[]
  /** Per-date Home picks the user applied from the library, overriding the daily draw. */
  homeOverrides?: Record<string, { wallpaper?: string; mantra?: string; quote?: string }>
  habitGoals: HabitGoal[] // gantt habit-tracker goals (see HabitGoal)
  habitTicks: Record<string, ID[]> // ISO date -> goal ids ticked that day
  collapseHabits?: boolean // fold the habit grids away (month + week views)
  hiddenCalendars: ID[] // class ids (or 'personal') hidden from the calendar
  daysOff: string[] // ISO dates marked as days off (greyed columns + outlined date)
  showTasksOnCalendar: boolean
  weekStart: 0 | 1 | 6 // first day of the week: Sunday, Monday or Saturday
  theme: 'light' | 'dark' // the RESOLVED theme actually applied
  themeConfig: {
    mode: 'light' | 'dark' | 'auto' // auto flips by time of day
    lightStart: string // 'HH:MM' — auto mode: light theme from this time
    darkStart: string // 'HH:MM' — auto mode: dark theme from this time
  }
  palette: string[] // editable color palette (seeded from PALETTE)
  notifications: AppNotification[]
  icsUrl: string
  lastSync: string | null // ISO datetime of last successful feed sync
  deletedUids: string[] // tombstones: user-deleted synced events stay deleted
  binderSections: BinderSection[]
  binderUploads: BinderUpload[]
  binderPosts: BinderPost[]
  schema: number
  seedVersion: number // demo data version this state was seeded from (0 = pre-versioning)
  userOwned: boolean // true once the user has their own data (blank slate or imported backup) — never auto-reseeded
  nlQuickAdd?: boolean // interpret quick-add inputs with the natural-language parser
  /** How task completion is ticked off. Absent = 'checkbox'. */
  taskCheckStyle?: 'checkbox' | 'ypt'
  /** Reschedule ghosts on the calendar. Absent = shown (the default is ON). */
  showGhosts?: boolean
  /** Daily study-time goal in minutes (set in the study timer section). null/absent = no goal. */
  studyGoalMin?: number | null
  /**
   * Where the user is. Only the hemisphere is used by the app (it mirrors the
   * moon-phase icon, which southern observers see the other way round); the
   * label is a note to self. Absent hemisphere = 'N'.
   */
  location?: { label?: string; hemisphere?: 'N' | 'S' }
  /** All-day lane collapsed to a per-day count strip. Absent = expanded. */
  collapseAllDay?: boolean
  /** Bottom-of-day journal boxes collapsed to their header row. Absent = expanded. */
  collapseJournal?: boolean
}

export const PALETTE = [
  '#7c9a5e', // olive
  '#e8879c', // pink
  '#8ecfa8', // mint
  '#7faee8', // blue
  '#c79be0', // lavender
  '#e8b06c', // amber
  '#6cc5c9', // teal
  '#e07f6f', // coral
  '#a0a6e8', // periwinkle
  '#d4c05e', // gold
]
