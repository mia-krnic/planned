import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react'
import type {
  AnkiLog, AppNotification, AppState, BinderPost, BinderSection, BinderUpload, Birthday, CalEvent, ClassFolder,
  ClassInfo, CustomCalendar, DayLog, Freq, GradeRow, ID, Project, RecurException, RecurringTask, StudySession, Task,
  TaskSection, YptState,
} from './types'
import { PALETTE } from './types'
import type { ColorGroup } from './components/ColorSelect'
import { PERSONAL_COLOR } from './utils/color'
import { getFile, putFile } from './api/files'
import { loadState, saveState } from './api/storage'
import { addDays, daysBetween, fmtFriendly, fmtTime, fromISO, nowMinutes, startOfWeek, toISO } from './utils/date'
import { derivedBreaks } from './utils/study'
import { recurringTimes, splitsSeries, type EditScope } from './utils/occur'
import type { ParsedIcsEvent } from './utils/ics'
import { diffSnapshot, moduleCodeFrom, snapshotOf } from './utils/sync'

/**
 * Default sections auto-created inside every class project. "Misc" is the
 * fallback bin: deleting any section moves its tasks here (created on demand).
 */
export const DEFAULT_CLASS_SECTIONS = ['Coursework', 'Studies', 'Misc']
export const CLASS_FALLBACK_SECTION = 'Misc'
/** Default sections created with the `assignments` flag on (graded work lives here). */
export const DEFAULT_ASSIGNMENT_SECTIONS = ['Coursework']
export const DEFAULT_BINDER_SECTIONS = ['Resources / Handouts', 'Notes']

/**
 * Bump this whenever seed() changes so demo installs pick up the new example
 * data automatically on next load (see StoreProvider's initializer below).
 * User-owned data (blankState or an imported backup) is never replaced.
 */
export const SEED_VERSION = 19

/**
 * A class plus its auto-created project (one per class, no nesting), the
 * default section list inside that project, and its default binder sections.
 */
export function makeClassBundle(name: string, color: string, code?: string) {
  const cls: ClassInfo = { id: uid(), name, color, code }
  const project: Project = { id: uid(), name, color, classId: cls.id, calendarId: null, collapsed: false }
  const taskSections: TaskSection[] = DEFAULT_CLASS_SECTIONS.map((n, i) => ({
    id: uid(), projectId: project.id, name: n, order: i,
    assignments: DEFAULT_ASSIGNMENT_SECTIONS.includes(n) || undefined,
  }))
  const sections: BinderSection[] = DEFAULT_BINDER_SECTIONS.map((n) => ({ id: uid(), classId: cls.id, name: n }))
  return { cls, project, taskSections, sections }
}

/** A blank calendar project for the built-in Personal calendar or a custom one. */
export function makeCalendarProject(calendarId: string, name: string, color: string): Project {
  return {
    id: uid(), name, color, classId: null, calendarId, collapsed: false,
  }
}

export const uid = (): ID =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

// ---------- Seed data (demo semester) ----------

/**
 * Tiny demo files backing the example binder uploads. Their blobs are written
 * into IndexedDB on first load (see ensureSeedFiles) so the example data is
 * fully clickable.
 */
const SEED_FILE_CONTENTS: Record<string, { name: string; type: string; content: string }> = {
  'seed-chem-reading': {
    name: 'week1-reading-list.txt', type: 'text/plain',
    content: 'CHEM 101 — Week 1 reading\n\n• Chapter 1: Matter and Measurement\n• Chapter 2: Atoms, Molecules, Ions\n• Skim appendix A (sig figs refresher)\n',
  },
  'seed-chem-lab': {
    name: 'titration-lab-brief.txt', type: 'text/plain',
    content: 'Titration lab brief\n\nGoal: determine concentration of unknown HCl sample.\nBring: lab coat, goggles, calculator.\nReport due one week after the session.\n',
  },
  'seed-biol-slides': {
    name: 'lecture2-dna-replication-notes.txt', type: 'text/plain',
    content: 'BIOL 103 — Lecture 2 summary\n\nDNA replication is semi-conservative.\nKey enzymes: helicase, primase, DNA polymerase III, ligase.\nExam hint: know the leading vs lagging strand difference!\n',
  },
  'seed-chem-past': {
    name: 'midterm1-past-paper.txt', type: 'text/plain',
    content: 'CHEM 101 — Midterm 1, last year\n\nSection A (20 marks): naming and formulae.\nSection B (30 marks): stoichiometry, limiting reagent.\nSection C (25 marks): gas laws — one full derivation.\nNo formula sheet. Calculator allowed.\n',
  },
  'seed-math-formula': {
    name: 'derivatives-formula-sheet.txt', type: 'text/plain',
    content: 'MATH 118 — derivative rules to have cold\n\nProduct: (fg)\' = f\'g + fg\'\nQuotient: (f/g)\' = (f\'g − fg\')/g²\nChain: (f(g(x)))\' = f\'(g(x))·g\'(x)\nImplicit: differentiate both sides, then solve for dy/dx.\nRelated rates: draw it, name the rates, THEN differentiate.\n',
  },
  'seed-phil-prompt': {
    name: 'essay2-prompt.txt', type: 'text/plain',
    content: 'PHIL 105 — Essay 2 prompt\n\n1500 words. Pick ONE argument from weeks 4–7 and reconstruct it\nin standard form, then give the strongest objection you can and\nreply to it. Marks are for the reply, not the summary.\n',
  },
}

/** Write the demo file blobs into IndexedDB if they aren't there yet. */
async function ensureSeedFiles(state: AppState): Promise<void> {
  const referenced = new Set(state.binderUploads.flatMap((u) => u.files.map((f) => f.id)))
  for (const [id, f] of Object.entries(SEED_FILE_CONTENTS)) {
    if (!referenced.has(id)) continue
    if (!(await getFile(id))) await putFile(id, new Blob([f.content], { type: f.type }))
  }
}

/**
 * Starter content for the Personal calendar's project: the basic human
 * necessities a brand-new (or freshly wiped) install begins with. Ordinary
 * sections and recurring tasks — rename or delete any of them like your own.
 */
function defaultPersonalStarter(projectId: ID): { sections: TaskSection[]; recurring: RecurringTask[] } {
  const startDate = toISO(new Date())
  const sec = (name: string, order: number): TaskSection => ({ id: uid(), projectId, name, order })
  const selfCare = sec('Self-care', 0)
  const fitness = sec('Fitness', 1)
  const habit = (
    title: string, sectionId: ID, streak: boolean, rule?: RecurringTask['rule'],
  ): RecurringTask => ({
    id: uid(), title, projectId, sectionId, freq: 'daily', weekday: 1, startDate, streak, completions: [], ...(rule ? { rule } : {}),
  })
  // Water isn't a task: the daily log has its own row of eight glasses.
  return {
    sections: [selfCare, fitness],
    recurring: [
      habit('Shower', selfCare.id, false),
      habit('Brush teeth', selfCare.id, false, { kind: 'timesPerDay', times: 2 }),
      habit('Quick clean of the space', selfCare.id, false),
      habit('Move for 30 minutes', fitness.id, true),
    ],
  }
}

/** Empty state for "Delete all data" — a blank slate rather than the example data. */
export function blankState(theme: 'light' | 'dark'): AppState {
  // A blank slate still keeps the built-in Personal calendar's project, and it
  // starts with the basic-necessities starter kit (all editable/deletable).
  const personal = makeCalendarProject('personal', 'Personal', PERSONAL_COLOR)
  const starter = defaultPersonalStarter(personal.id)
  return {
    classes: [], folders: [], customCalendars: [], events: [],
    projects: [personal], taskSections: starter.sections, tasks: [], recurring: starter.recurring, birthdays: [],
    studySessions: [], gradeRows: [], ankiLogs: [], dayLogs: {},
    hiddenCalendars: [], daysOff: [], showTasksOnCalendar: true,
    weekStart: 0, theme, themeConfig: { mode: theme, lightStart: '07:00', darkStart: '19:00' },
    // No live feed until the user binds one (Sidebar → Import live ICS).
    palette: [...PALETTE], notifications: [], icsUrl: '',
    lastSync: null, deletedUids: [], binderSections: [], binderUploads: [], binderPosts: [],
    schema: 8,
    // A user who explicitly cleared their data owns it — never auto-reseed them.
    seedVersion: SEED_VERSION, userOwned: true,
  }
}

function seed(): AppState {
  const today = new Date()
  const todayDow = today.getDay()
  const week0 = startOfWeek(today) // Sunday of current week
  const iso = (dowOffset: number, weeksBack = 0) => toISO(addDays(week0, dowOffset - 7 * weeksBack))
  const todayIso = toISO(today)
  const semesterStartWeek = 8 // the demo semester is eight weeks old

  const folders: ClassFolder[] = [
    { id: 'f-sci', name: 'Sciences', collapsed: false },
    { id: 'f-hum', name: 'Humanities', collapsed: false },
  ]

  const customCalendars: CustomCalendar[] = [
    { id: 'cal-society', name: 'Film Society', color: '#e8b06c' },
  ]

  const classes: ClassInfo[] = [
    {
      id: 'c-chem', name: 'CHEM 101-003', color: '#e8879c', code: 'CHEM101', folderId: 'f-sci',
      meta: {
        professor: 'Prof R. Alvarez', room: 'Murray Hall G202',
        homework: 'Problem set due Mondays',
        other: 'Office hours Tue 2–4pm (Murray 310). Lab coat required for practicals.',
      },
    },
    {
      id: 'c-biol', name: 'BIOL 103-003', color: '#8ecfa8', code: 'BIOL103', folderId: 'f-sci',
      meta: {
        professor: 'Dr T. Nwosu', room: 'Genome Sciences G200',
        other: 'Lab notebook checked at the start of every Friday session.',
      },
    },
    {
      id: 'c-phil', name: 'PHIL 105-001', color: '#c79be0', code: 'PHIL105', folderId: 'f-hum', pinnedFolder: true,
      meta: { professor: 'Dr H. Bergmann', room: 'Peabody Hall 2066', homework: 'Weekly reading response, due before seminar' },
    },
    {
      id: 'c-math', name: 'MATH 118-001', color: '#7faee8', code: 'MATH118', folderId: 'f-sci', pinnedBinder: true,
      meta: { professor: 'Prof L. Okafor', room: 'Phillips Hall 332', homework: 'Problem sets every other week (Mon + Wed), due two days later' },
    },
    {
      id: 'c-aaad', name: 'AAAD 89-003', color: '#7c9a5e', code: 'AAAD89',
      meta: { professor: 'Dr M. Sundstrom', room: 'Alumni Bldg 404', other: 'First-year seminar — participation is 15% of the grade.' },
    },
  ]

  const mk = (
    classId: ID | null, title: string, dow: number, start: number, end: number,
    location?: string, extra?: Partial<CalEvent>,
  ): CalEvent => ({
    id: uid(), title, classId, date: iso(dow, semesterStartWeek),
    allDay: false, startMin: start, endMin: end, repeat: 'weekly', location, ...extra,
  })

  const chemLecture = mk('c-chem', 'CHEM 101-003', 1, 8 * 60 + 30, 9 * 60 + 45, 'Murray Hall · G202')
  const biolLecture = mk('c-biol', 'BIOL 103-003', 3, 13 * 60 + 30, 14 * 60 + 45, 'Genome Sciences · G200')
  // The Tuesday maths lecture doesn't run this week: the midterm takes its slot,
  // so the series skips that one occurrence (an "only this event" deletion).
  const mathTuesday = mk('c-math', 'MATH 118-001', 2, 10 * 60, 11 * 60 + 15, 'Phillips Hall · 332', { exDates: [iso(2)] })

  const events: CalEvent[] = [
    // Class meetings (weekly series, running since the start of the semester)
    chemLecture,
    mk('c-chem', 'CHEM 101-003', 3, 8 * 60 + 30, 9 * 60 + 45, 'Murray Hall · G202'),
    mk('c-chem', 'CHEM 101-003', 5, 8 * 60 + 30, 9 * 60 + 45, 'Murray Hall · G202'),
    mk('c-chem', 'CHEM 101 Lab', 3, 15 * 60 + 30, 18 * 60, 'Murray Hall · G160', {
      notes: 'Lab coat + goggles. Write-up is due the following Tuesday.',
    }),
    mathTuesday,
    mk('c-math', 'MATH 118-001', 4, 10 * 60, 11 * 60 + 15, 'Phillips Hall · 332'),
    biolLecture,
    mk('c-biol', 'BIOL 103-003', 5, 13 * 60 + 30, 14 * 60 + 45, 'Genome Sciences · G200'),
    mk('c-phil', 'PHIL 105-001', 2, 15 * 60, 16 * 60 + 15, 'Peabody Hall · 2066'),
    mk('c-phil', 'PHIL 105-001', 4, 15 * 60, 16 * 60 + 15, 'Peabody Hall · 2066'),
    mk('c-aaad', 'AAAD 89-003', 1, 15 * 60, 16 * 60 + 15, 'Alumni Bldg · 404'),
    // Midterm week: two exams on the same Tuesday → split-circle date highlight
    // in the mini month and the week header, plus countdown rows in the sidebar.
    {
      id: uid(), title: 'MATH 118 Midterm', classId: 'c-math', date: iso(2), allDay: false,
      startMin: 10 * 60, endMin: 11 * 60 + 15, repeat: 'none', location: 'Phillips Hall · 332', isExam: true,
      notes: 'In the usual lecture slot. Calculator yes, formula sheet no.',
    },
    {
      id: uid(), title: 'CHEM 101 Midterm 2', classId: 'c-chem', date: iso(2), allDay: false,
      startMin: 18 * 60, endMin: 20 * 60, repeat: 'none', location: 'Murray Hall · G202', isExam: true,
      notes: 'Chapters 4–7. Evening sitting — get there ten minutes early.',
    },
    {
      id: uid(), title: 'BIOL 103 Midterm', classId: 'c-biol', date: iso(1 + 7), allDay: false,
      startMin: 18 * 60, endMin: 20 * 60, repeat: 'none', location: 'Genome Sciences · G200', isExam: true,
    },
    // Personal
    { id: uid(), title: 'Lunch', classId: null, date: iso(2, semesterStartWeek), allDay: false, startMin: 11 * 60 + 30, endMin: 12 * 60 + 15, repeat: 'daily' },
    { id: uid(), title: 'Photography Club', classId: null, date: iso(5, semesterStartWeek), allDay: false, startMin: 17 * 60, endMin: 18 * 60 + 30, repeat: 'weekly', location: 'Hanes Art Center · darkroom' },
    { id: uid(), title: 'Career Fair', classId: null, date: iso(3), allDay: true, startMin: 0, endMin: 0, repeat: 'none', location: 'Student Union · Great Hall' },
    { id: uid(), title: 'Spring registration opens', classId: null, date: iso(5), allDay: true, startMin: 0, endMin: 0, repeat: 'none' },
    {
      id: uid(), title: 'Advising appointment', classId: null, date: iso(1), allDay: false,
      startMin: 16 * 60 + 30, endMin: 17 * 60, repeat: 'none', location: 'Steele Bldg · 2nd floor',
      notes: 'Bring the printed degree audit and a shortlist of spring courses.',
    },
    // Custom calendar example (see customCalendars above)
    { id: uid(), title: 'Film Society Screening', classId: null, calendarId: 'cal-society', date: iso(4, semesterStartWeek), allDay: false, startMin: 19 * 60, endMin: 21 * 60, repeat: 'weekly', location: 'Murphy Hall · 116' },
    { id: uid(), title: 'Film Society committee', classId: null, calendarId: 'cal-society', date: iso(3), allDay: false, startMin: 18 * 60 + 30, endMin: 19 * 60 + 15, repeat: 'none' },
  ]

  // One project per class (auto-created), one project per calendar (Personal
  // and each custom calendar). Every project has default sections.
  const projects: Project[] = [
    ...classes.map((c) => ({ id: `p-${c.id}`, name: c.name, color: c.color, classId: c.id, calendarId: null, collapsed: false })),
    { id: 'p-personal', name: 'Personal', color: PERSONAL_COLOR, classId: null, calendarId: 'personal', collapsed: false },
    { id: 'p-society', name: 'Film Society', color: '#e8b06c', classId: null, calendarId: 'cal-society', collapsed: false },
  ]

  // Sections per project. Classes get Coursework/Studies/Misc (Coursework
  // flagged as the graded-work section); the Film Society calendar project gets
  // a "Screening night" section (folds in the old p-screening tasks); Personal
  // gets Errands/Health/Apartment.
  const classSections = (projectId: ID): TaskSection[] =>
    DEFAULT_CLASS_SECTIONS.map((n, i) => ({
      id: `sec-${projectId}-${n.toLowerCase()}`, projectId, name: n, order: i,
      assignments: DEFAULT_ASSIGNMENT_SECTIONS.includes(n) || undefined,
    }))
  const taskSections: TaskSection[] = [
    ...classes.flatMap((c) => classSections(`p-${c.id}`)),
    // Personal calendar sections — a few realistic buckets a student would use.
    { id: 'sec-personal-errands', projectId: 'p-personal', name: 'Errands', order: 0 },
    { id: 'sec-personal-health', projectId: 'p-personal', name: 'Health & Fitness', order: 1 },
    { id: 'sec-personal-apartment', projectId: 'p-personal', name: 'Apartment Move', order: 2 },
    // The starter kit every install ships with (see defaultPersonalStarter —
    // the demo's Health & Fitness section already covers water + exercise).
    { id: 'sec-personal-selfcare', projectId: 'p-personal', name: 'Self-care', order: 3 },
    // Film Society calendar section — the recurring screening prep list.
    { id: 'sec-society-screening', projectId: 'p-society', name: 'Screening night', order: 0 },
  ]

  // Chemistry gets a Lab Reports section as well (extra example of a
  // user-added section beyond the defaults) — also graded, so a class can show
  // more than one assignments-flagged section.
  taskSections.push({ id: 'sec-p-c-chem-lab', projectId: 'p-c-chem', name: 'Lab Reports', order: 3, assignments: true })

  /** ISO datetime n days back at hour h — the "ticked off at" stamp of a done task. */
  const doneAt = (n: number, h = 18) => {
    const d = addDays(today, -n)
    d.setHours(h, 30, 0, 0)
    return d.toISOString()
  }
  /** The same stamp pinned to a specific day, so archives and uploads stay coherent. */
  const stampOn = (isoDate: string, h = 18) => {
    const d = fromISOLocal(isoDate)
    d.setHours(h, 30, 0, 0)
    return d.toISOString()
  }

  const tasks: Task[] = [
    /* ---- CHEM 101 ---- */
    // Stable ids: the example study sessions and grade rows reference these.
    { id: 't-quiz', title: 'Polyatomic ions quiz', projectId: 'p-c-chem', sectionId: 'sec-p-c-chem-coursework', date: todayIso, startMin: 14 * 60, done: false },
    {
      id: uid(), title: 'Post-lab questions — calorimetry', projectId: 'p-c-chem', sectionId: 'sec-p-c-chem-coursework',
      date: iso(4), startMin: 19 * 60, endMin: 20 * 60, dueDate: iso(5), dueMin: 9 * 60, done: false,
      notes: 'Q4 needs the ICE table from Wednesday\'s lab sheet.',
    },
    { id: uid(), title: 'Problem set 6', projectId: 'p-c-chem', sectionId: 'sec-p-c-chem-coursework', date: null, startMin: null, dueDate: iso(1, 1), dueMin: 9 * 60, done: true, submitted: true, completedAt: stampOn(iso(0, 1), 21) },
    // Handed in: its due bar on Tuesday is faded and struck through. Also the
    // worked example of the task↔binder link — the lab brief is attached here,
    // which is how the grade tracker's "Lab reports" row finds its documents.
    // Also the fully-done YPT example (⊘) — `done` already implies state 2.
    { id: 't-titration', title: 'Titration lab write-up', projectId: 'p-c-chem', sectionId: 'sec-p-c-chem-lab', date: null, startMin: null, dueDate: iso(2), dueMin: 17 * 60, location: 'Chemistry lab prep room', done: true, submitted: true, completedAt: doneAt(2, 16), attachmentUploadIds: ['u-chem-lab'], yptState: 2 },
    {
      id: 't-chem-lab2', title: 'Calorimetry lab write-up', projectId: 'p-c-chem', sectionId: 'sec-p-c-chem-lab',
      date: iso(5), startMin: 16 * 60 + 30, endMin: 18 * 60, dueDate: iso(2 + 7), dueMin: 17 * 60,
      location: 'Murray Hall · G160', done: false,
      notes: 'Same structure as the titration one — method, results table, error discussion.',
    },
    // Rescheduled: planned for Sunday morning, moved to Wednesday — the
    // abandoned Sunday slot keeps a translucent ghost (→) on the week grid.
    {
      id: 't-labprep', title: 'Lab prep reading', projectId: 'p-c-chem', sectionId: 'sec-p-c-chem-studies',
      date: iso(3), startMin: 12 * 60 + 30, endMin: 13 * 60 + 15, done: false,
      ghosts: [{ date: iso(0), startMin: 9 * 60 }],
    },
    { id: uid(), title: 'Redo the gas-law worked examples', projectId: 'p-c-chem', sectionId: 'sec-p-c-chem-studies', date: null, startMin: null, done: true, completedAt: doneAt(3, 20) },
    { id: uid(), title: 'Print the periodic table cheat sheet', projectId: 'p-c-chem', sectionId: 'sec-p-c-chem-misc', date: null, startMin: null, done: false },

    /* ---- BIOL 103 ---- */
    // Written, not handed in yet, due today → ! banner (one open step).
    { id: 't-biol-worksheet', title: 'Cell biology worksheet', projectId: 'p-c-biol', sectionId: 'sec-p-c-biol-coursework', date: null, startMin: null, dueDate: todayIso, dueMin: 16 * 60, done: true, completedAt: doneAt(1, 21) },
    { id: uid(), title: 'Lab notebook check', projectId: 'p-c-biol', sectionId: 'sec-p-c-biol-coursework', date: iso(5), startMin: null, dueDate: iso(5), dueMin: 13 * 60 + 30, location: 'Genome Sciences · G200', done: false },
    { id: uid(), title: 'Osmosis problem set', projectId: 'p-c-biol', sectionId: 'sec-p-c-biol-coursework', date: null, startMin: null, dueDate: iso(3, 1), dueMin: 17 * 60, done: true, submitted: true, completedAt: stampOn(iso(3, 1), 16) },
    // All-day task: dated but time-less, so it sits in the day's top lane.
    { id: uid(), title: 'Read Chapter 5: DNA replication and repair', projectId: 'p-c-biol', sectionId: 'sec-p-c-biol-studies', date: iso(3), startMin: null, dueDate: iso(3), dueMin: 12 * 60, done: false },
    {
      id: uid(), title: 'Midterm revision — chapters 4–7', projectId: 'p-c-biol', sectionId: 'sec-p-c-biol-studies',
      date: iso(0 + 7), startMin: 15 * 60, endMin: 17 * 60, dueDate: iso(1 + 7), dueMin: 18 * 60, done: false,
      notes: 'Redraw the replication fork from memory — that is what actually sticks.',
    },

    /* ---- MATH 118 ---- */
    {
      id: uid(), title: 'Practice past midterm papers', projectId: 'p-c-math', sectionId: 'sec-p-c-math-studies',
      date: iso(1), startMin: 19 * 60, endMin: 20 * 60 + 40, dueDate: iso(2), dueMin: 10 * 60, done: false,
      notes: 'Related rates first — she hinted at it twice in the review session.',
    },
    { id: uid(), title: 'Quiz 3 corrections', projectId: 'p-c-math', sectionId: 'sec-p-c-math-coursework', date: null, startMin: null, done: true, submitted: true, completedAt: doneAt(6, 17) },
    { id: uid(), title: 'Ask about the extra-credit project', projectId: 'p-c-math', sectionId: 'sec-p-c-math-misc', date: null, startMin: null, done: false },

    /* ---- PHIL 105 ---- */
    // Expected time block (outlined box on the grid), worked on today. Due
    // Friday lunchtime — and that Friday date IS the extension: the original
    // Wednesday deadline still shows on Wednesday, struck through.
    {
      id: 't-essay', title: 'Essay 2 draft — focused work', projectId: 'p-c-phil', sectionId: 'sec-p-c-phil-coursework',
      date: todayIso, startMin: 16 * 60, endMin: 17 * 60 + 30,
      dueDate: iso(5), dueMin: 13 * 60, extensions: [{ dueDate: iso(3), dueMin: 17 * 60 }],
      done: false, pinned: true,
      notes: 'Reconstruct the argument in standard form first, objection second.',
    },
    // Half done in YPT mode (◺): flip "Task checking" in ⚙ view settings to see it.
    { id: 't-fallacies', title: 'Read Chapter 3: Fallacies', projectId: 'p-c-phil', sectionId: 'sec-p-c-phil-studies', date: todayIso, startMin: 18 * 60 + 45, done: false, yptState: 1 },
    { id: uid(), title: 'Weekly reading response', projectId: 'p-c-phil', sectionId: 'sec-p-c-phil-coursework', date: null, startMin: null, dueDate: iso(2, 1), dueMin: 9 * 60, done: true, submitted: true, completedAt: stampOn(iso(1, 1), 22) },
    { id: uid(), title: 'Seminar prep — Descartes', projectId: 'p-c-phil', sectionId: 'sec-p-c-phil-studies', date: null, startMin: null, done: true, completedAt: doneAt(7, 15) },
    { id: uid(), title: 'Pick a topic for essay 3', projectId: 'p-c-phil', sectionId: 'sec-p-c-phil-misc', date: null, startMin: null, done: false },

    /* ---- AAAD 89 ---- */
    // Due date with no time → drawn at end of day (11:59pm). Neither done nor
    // submitted, due today → ‼ banner at the top of the calendar.
    { id: uid(), title: 'Submit health inequality paper', projectId: 'p-c-aaad', sectionId: 'sec-p-c-aaad-coursework', date: todayIso, startMin: 23 * 60 + 59, dueDate: todayIso, dueMin: null, done: false, pinned: true },
    { id: uid(), title: 'Watch the documentary for seminar', projectId: 'p-c-aaad', sectionId: 'sec-p-c-aaad-studies', date: iso(0), startMin: 20 * 60, endMin: 21 * 60 + 30, done: true, completedAt: stampOn(iso(0), 21) },
    { id: uid(), title: 'Find two sources for the final project', projectId: 'p-c-aaad', sectionId: 'sec-p-c-aaad-studies', date: null, startMin: null, done: false },

    /* ---- Personal ---- */
    // The project's implicit "main" section (no sectionId) — above the named ones.
    { id: uid(), title: 'Call home', projectId: 'p-personal', date: iso(0), startMin: 19 * 60, endMin: 19 * 60 + 30, done: false },
    // Personal · Errands
    { id: uid(), title: 'Return library book', projectId: 'p-personal', sectionId: 'sec-personal-errands', date: null, startMin: null, done: false },
    { id: uid(), title: 'Renew student ID', projectId: 'p-personal', sectionId: 'sec-personal-errands', date: null, startMin: null, done: false },
    { id: uid(), title: 'Pick up parcel from the mail room', projectId: 'p-personal', sectionId: 'sec-personal-errands', date: null, startMin: null, done: true, completedAt: doneAt(5, 16) },
    // Personal · Health & Fitness
    { id: uid(), title: 'Book dentist appointment', projectId: 'p-personal', sectionId: 'sec-personal-health', date: null, startMin: null, done: false },
    { id: uid(), title: 'Refill prescription', projectId: 'p-personal', sectionId: 'sec-personal-health', date: null, startMin: null, done: true, completedAt: doneAt(4, 11) },
    // Personal · Apartment
    { id: uid(), title: 'Buy a desk lamp', projectId: 'p-personal', sectionId: 'sec-personal-apartment', date: null, startMin: null, done: false },
    { id: uid(), title: 'Set up renters insurance', projectId: 'p-personal', sectionId: 'sec-personal-apartment', date: null, startMin: null, done: true, completedAt: doneAt(9, 13) },
    { id: uid(), title: 'Hang posters', projectId: 'p-personal', sectionId: 'sec-personal-apartment', date: null, startMin: null, done: false, yptState: 1 },

    /* ---- Film Society ---- */
    { id: uid(), title: 'Confirm this week\'s film pick', projectId: 'p-society', sectionId: 'sec-society-screening', date: null, startMin: null, done: false },
    // Dated but time-less → the all-day lane on screening day.
    { id: uid(), title: 'Bring snacks', projectId: 'p-society', sectionId: 'sec-society-screening', date: iso(4), startMin: null, done: false },
    { id: uid(), title: 'Book the projector room', projectId: 'p-society', sectionId: 'sec-society-screening', date: null, startMin: null, done: true, completedAt: doneAt(3, 12) },

    /* ---- Unfiled (no project): manual drag order, one pinned, one archived ---- */
    {
      id: uid(), title: 'Email advising about the spring waitlist', projectId: null,
      date: null, startMin: null, dueDate: iso(4), dueMin: 12 * 60, done: false, pinned: true, order: 0,
    },
    { id: uid(), title: 'Sort out laundry', projectId: null, date: todayIso, startMin: 19 * 60, endMin: 20 * 60, done: false, order: 1 },
    // Scheduled + due + location + notes, all on one task.
    {
      id: uid(), title: 'Collect reserved books', projectId: null,
      date: iso(3), startMin: null, dueDate: iso(4), dueMin: null,
      location: 'Library front desk · office 2.1', done: false, order: 2,
      notes: 'Three holds waiting — the AAAD one expires Friday.',
    },
    { id: uid(), title: 'Replace the bike lock', projectId: null, date: null, startMin: null, done: true, order: 3, completedAt: doneAt(2, 18) },
  ]

  const habitStart = toISO(addDays(today, -27))
  const recurring: RecurringTask[] = [
    // Legacy daily habit (no custom rule) with a visible gap in the strip.
    {
      id: uid(), title: 'Gym', projectId: 'p-personal', sectionId: 'sec-personal-health',
      freq: 'daily', weekday: 1,
      startDate: habitStart, streak: true,
      completions: [-9, -8, -7, -6, -5, -3, -2, -1].map((n) => toISO(addDays(today, n))),
    },
    // Legacy WEEKLY habit: one occurrence a week, so its strip spans seven
    // Sundays — with the reading-week one (five weeks back) missing.
    {
      id: uid(), title: 'Sunday reset & week plan', projectId: 'p-personal',
      freq: 'weekly', weekday: 0,
      startDate: iso(0, semesterStartWeek), streak: true,
      completions: [0, 1, 2, 3, 4, 6, 7].map((w) => iso(0, w)),
    },
    {
      id: uid(), title: 'Review flashcards', projectId: 'p-c-chem', sectionId: 'sec-p-c-chem-studies',
      freq: 'weekdays', weekday: 1,
      startDate: habitStart, streak: true,
      completions: [-7, -6, -5, -4, -3, -2, -1].map((n) => toISO(addDays(today, n))).filter((d) => {
        const dow = new Date(d + 'T00:00').getDay()
        return dow >= 1 && dow <= 5
      }),
    },
    // Custom rule example: every other week on Mon + Wed, scheduled 9:00–10:30,
    // each occurrence due two days later at 5pm — and this week's Wednesday one
    // has been dragged to Thursday 11am, which writes a per-occurrence exception
    // instead of forking the series.
    {
      id: 'r-pset', title: 'Problem set', projectId: 'p-c-math', sectionId: 'sec-p-c-math-coursework',
      freq: 'weekly', weekday: 1,
      rule: { kind: 'biweekly', weekdays: [1, 3], anchor: iso(1) },
      startDate: iso(1, semesterStartWeek), streak: false,
      completions: [iso(1, 2), iso(3, 2), iso(1, 4), iso(3, 4), iso(1, 6)],
      startMin: 9 * 60, endMin: 10 * 60 + 30,
      dueOffsetDays: 2, dueMin: 17 * 60,
      exceptions: { [iso(3)]: { date: iso(4), startMin: 11 * 60, endMin: 12 * 60 + 30 } },
    },
    // The basic-necessities starter kit (same set a wiped install begins with;
    // exercise is covered by Gym above, water by the daily log's glasses row).
    // Brush teeth doubles as the several-times-a-day rule demo.
    {
      id: uid(), title: 'Shower', projectId: 'p-personal', sectionId: 'sec-personal-selfcare',
      freq: 'daily', weekday: 1, startDate: habitStart, streak: false,
      completions: [-2, -1, 0].map((n) => toISO(addDays(today, n))),
    },
    {
      id: uid(), title: 'Brush teeth', projectId: 'p-personal', sectionId: 'sec-personal-selfcare',
      freq: 'daily', weekday: 1, rule: { kind: 'timesPerDay', times: 2 },
      startDate: habitStart, streak: false,
      completions: [-2, -1].map((n) => toISO(addDays(today, n))),
      partial: { [todayIso]: 1 },
    },
    {
      id: uid(), title: 'Quick clean of the space', projectId: 'p-personal', sectionId: 'sec-personal-selfcare',
      freq: 'daily', weekday: 1, startDate: habitStart, streak: false,
      completions: [-1].map((n) => toISO(addDays(today, n))),
    },
  ]

  // The built-in Birthdays calendar. Maya's lands on Sunday of THIS week and
  // takes the day off with it (derived, not stored in daysOff); Dad's is a
  // normal working day; Priya's is months out.
  const bdayOf = (isoDate: string) => {
    const [, m, d] = isoDate.split('-').map(Number)
    return { month: m, day: d }
  }
  const birthdays: Birthday[] = [
    { id: 'b-maya', name: 'Maya', ...bdayOf(iso(0)), year: 2005 },
    { id: 'b-dad', name: 'Dad', ...bdayOf(toISO(addDays(today, 9))), year: 1974, dayOff: false },
    { id: 'b-priya', name: 'Priya', ...bdayOf(toISO(addDays(today, 48))) },
  ]

  // Two blocks logged today: a short single-class one, then a longer split
  // session whose to-dos group under the class chip they belong to.
  const studySessions: StudySession[] = [
    {
      id: 's-phil-today', classId: 'c-phil', taskIds: ['t-fallacies'], eventIds: [],
      date: todayIso, startMin: 12 * 60 + 30, endMin: 13 * 60 + 20, mode: 'normal',
      breaks: [{ startMin: 12 * 60 + 55, durMin: 5, tag: 'restroom' }],
      reflection: 'Reading straight after lunch works — the 8am attempts never do.',
    },
    {
      id: 's-chem-today', classId: 'c-chem', taskIds: ['t-quiz', 't-biol-worksheet'], eventIds: [],
      uploadIds: ['u-chem-reading'],
      date: todayIso, startMin: 16 * 60 + 30, endMin: 18 * 60 + 20, mode: 'pomodoro25',
      // Switched from CHEM to BIOL at 5:30 — the stripe changes colour there,
      // and each class's to-dos sit under its own chip.
      classSegments: [
        { startMin: 16 * 60 + 30, classId: 'c-chem' },
        { startMin: 17 * 60 + 30, classId: 'c-biol' },
      ],
      // 25/5 cycles materialised at the end of the session
      breaks: [
        { startMin: 16 * 60 + 55, durMin: 5, tag: 'rest' },
        { startMin: 17 * 60 + 25, durMin: 5, tag: 'meal' },
        { startMin: 17 * 60 + 55, durMin: 5, tag: 'rest' },
      ],
      reflection: 'Flashcards before the problem sheet works much better — do that again.',
    },
  ]

  /**
   * A block earlier in THIS week (so the weekly-momentum step chart and the
   * delta vs last week always have a line to draw). Days that haven't happened
   * yet — and today, which is written out above — produce nothing.
   */
  const weekSession = (
    dow: number, classId: ID | null, startMin: number, durMin: number, extra?: Partial<StudySession>,
  ): StudySession[] => (dow >= todayDow ? [] : [{
    id: `s-wk-${dow}-${classId ?? 'none'}-${startMin}`,
    classId, taskIds: [], eventIds: [],
    date: iso(dow), startMin, endMin: startMin + durMin, mode: 'normal', breaks: [],
    ...extra,
  }])

  studySessions.push(
    ...weekSession(0, 'c-math', 15 * 60, 100),
    ...weekSession(0, null, 20 * 60, 45),
    ...weekSession(1, 'c-chem', 12 * 60 + 30, 50),
    ...weekSession(1, 'c-math', 19 * 60, 100, {
      mode: 'pomodoro25',
      breaks: [
        { startMin: 19 * 60 + 25, durMin: 5, tag: 'rest' },
        { startMin: 19 * 60 + 55, durMin: 5, tag: 'restroom' },
      ],
      reflection: 'Past papers under exam timing the night before — brutal, but it worked.',
    }),
    ...weekSession(2, 'c-chem', 8 * 60, 80, {
      breaks: [{ startMin: 8 * 60 + 45, durMin: 10, tag: 'meal' }],
    }),
    ...weekSession(2, 'c-chem', 16 * 60, 90),
    ...weekSession(3, 'c-biol', 12 * 60 + 30, 50),
    ...weekSession(3, 'c-phil', 19 * 60 + 30, 90, {
      breaks: [{ startMin: 20 * 60 + 15, durMin: 10, tag: 'rest' }],
    }),
    ...weekSession(4, 'c-phil', 12 * 60 + 30, 60),
    ...weekSession(4, 'c-aaad', 17 * 60, 60),
    ...weekSession(5, 'c-biol', 15 * 60, 80),
    ...weekSession(6, 'c-phil', 11 * 60, 90),
    ...weekSession(6, 'c-aaad', 15 * 60, 60),
  )

  // Historical study log across the eight weeks of the semester so the Insights
  // charts (weekly stacked bars, trend, quarter grid) have a real story to
  // tell: a warm-up, a reading-week dip five weeks back, then the pre-exam ramp.
  const histSession = (
    weeksBack: number, dow: number, classId: ID | null,
    startMin: number, durMin: number, extra?: Partial<StudySession>,
  ): StudySession => ({
    id: `s-hist-${weeksBack}-${dow}-${classId ?? 'none'}-${startMin}`,
    classId, taskIds: [], eventIds: [],
    date: iso(dow, weeksBack), startMin, endMin: startMin + durMin, mode: 'normal', breaks: [],
    ...extra,
  })
  studySessions.push(
    // 8 weeks ago — semester warm-up, short sessions
    histSession(8, 2, 'c-chem', 15 * 60, 45),
    histSession(8, 4, 'c-phil', 9 * 60, 40),
    // 7 weeks ago
    histSession(7, 1, 'c-math', 14 * 60, 60),
    histSession(7, 3, 'c-chem', 16 * 60, 55),
    histSession(7, 5, null, 19 * 60, 40),
    // 6 weeks ago
    histSession(6, 1, 'c-biol', 10 * 60, 90, {
      reflection: 'Genome diagrams finally clicked after redrawing them from memory.',
    }),
    histSession(6, 2, 'c-chem', 15 * 60, 60),
    histSession(6, 4, 'c-phil', 9 * 60, 70),
    // 5 weeks ago — reading week, almost nothing logged
    histSession(5, 3, 'c-math', 11 * 60, 45),
    // 4 weeks ago — back into it
    histSession(4, 1, 'c-chem', 16 * 60, 80, { mode: 'pomodoro25' }),
    histSession(4, 2, 'c-biol', 10 * 60, 60),
    histSession(4, 4, 'c-aaad', 13 * 60, 55),
    histSession(4, 6, null, 20 * 60, 40),
    // 3 weeks ago — split session with a mid-way class switch
    histSession(3, 1, 'c-math', 14 * 60, 120, {
      classSegments: [
        { startMin: 14 * 60, classId: 'c-math' },
        { startMin: 15 * 60, classId: 'c-chem' },
      ],
      breaks: [{ startMin: 15 * 60, durMin: 10, tag: 'rest' }],
    }),
    histSession(3, 3, 'c-phil', 9 * 60, 65),
    histSession(3, 5, 'c-biol', 17 * 60, 70),
    // 2 weeks ago
    histSession(2, 0, 'c-chem', 15 * 60, 95, {
      breaks: [{ startMin: 15 * 60 + 45, durMin: 8, tag: 'restroom' }],
    }),
    histSession(2, 2, 'c-math', 14 * 60, 85, { mode: 'custom', customWork: 40, customBreak: 8 }),
    histSession(2, 4, 'c-biol', 10 * 60, 75),
    histSession(2, 6, 'c-aaad', 13 * 60, 50),
    // last week — the pre-exam ramp, the heaviest week of the semester
    histSession(1, 0, 'c-math', 14 * 60, 110),
    histSession(1, 1, 'c-chem', 16 * 60, 100, {
      breaks: [{ startMin: 16 * 60 + 50, durMin: 10, tag: 'meal' }],
    }),
    histSession(1, 2, 'c-biol', 10 * 60, 90),
    histSession(1, 3, 'c-math', 19 * 60, 120, {
      mode: 'pomodoro50',
      reflection: 'Three hours on related rates. Slow, but I can finally see the pattern.',
    }),
    histSession(1, 4, 'c-chem', 16 * 60, 95),
    histSession(1, 5, 'c-phil', 9 * 60, 80),
    histSession(1, 6, 'c-chem', 13 * 60, 70),
  )

  // Example binder: sections per class, a few uploads (backed by demo files) and stream posts.
  const binderSections: BinderSection[] = classes.flatMap((c) => [
    { id: `sec-res-${c.id}`, classId: c.id, name: 'Resources / Handouts' },
    { id: `sec-notes-${c.id}`, classId: c.id, name: 'Notes' },
  ])
  // A user-added binder section beyond the two defaults.
  binderSections.push({ id: 'sec-past-c-chem', classId: 'c-chem', name: 'Past papers' })
  const daysAgo = (n: number, h = 10) => {
    const d = addDays(today, -n)
    d.setHours(h, 0, 0, 0)
    return d.toISOString()
  }
  const binderUploads: BinderUpload[] = [
    {
      id: 'u-chem-reading', classId: 'c-chem', sectionId: 'sec-res-c-chem',
      title: 'Week 1 reading list',
      caption: 'From the first lecture — appendix A is a lifesaver for sig figs.',
      files: [{ id: 'seed-chem-reading', name: 'week1-reading-list.txt', type: 'text/plain', size: 150 }],
      attach: { kind: 'event', id: chemLecture.id, date: chemLecture.date, label: chemLecture.title },
      createdAt: stampOn(chemLecture.date, 10),
    },
    {
      // Stable id: the titration task attaches this upload (see tasks above),
      // which is also how the grade tracker reaches the document.
      id: 'u-chem-lab', classId: 'c-chem', sectionId: 'sec-res-c-chem',
      title: 'Titration lab brief',
      caption: 'Bring lab coat, goggles and a calculator!',
      files: [{ id: 'seed-chem-lab', name: 'titration-lab-brief.txt', type: 'text/plain', size: 170 }],
      attach: { kind: 'task', id: 't-titration', date: null, label: 'Titration lab write-up' },
      pinned: 'section',
      createdAt: daysAgo(9),
    },
    {
      // Pinned to the whole class → its own box at the top of the collation tab.
      id: 'u-chem-past', classId: 'c-chem', sectionId: 'sec-past-c-chem',
      title: 'Past paper — Midterm 1 (last year)',
      caption: 'Section C is basically the same every year.',
      files: [{ id: 'seed-chem-past', name: 'midterm1-past-paper.txt', type: 'text/plain', size: 230 }],
      pinned: 'class',
      createdAt: daysAgo(4, 20),
    },
    {
      // Pinned to the top of the class's stream tab.
      id: 'u-biol-notes', classId: 'c-biol', sectionId: 'sec-notes-c-biol',
      title: 'Lecture 2 notes — DNA replication',
      caption: 'Leading vs lagging strand — she said this comes up every single year.',
      files: [{ id: 'seed-biol-slides', name: 'lecture2-dna-replication-notes.txt', type: 'text/plain', size: 210 }],
      attach: { kind: 'event', id: biolLecture.id, date: biolLecture.date, label: biolLecture.title },
      pinnedStream: true,
      createdAt: stampOn(biolLecture.date, 15),
    },
    {
      id: 'u-math-formula', classId: 'c-math', sectionId: 'sec-notes-c-math',
      title: 'Derivative rules — one page',
      caption: 'Copied out by hand, which is the only reason I remember any of it.',
      files: [{ id: 'seed-math-formula', name: 'derivatives-formula-sheet.txt', type: 'text/plain', size: 280 }],
      createdAt: daysAgo(6, 21),
    },
    {
      id: 'u-phil-prompt', classId: 'c-phil', sectionId: 'sec-res-c-phil',
      title: 'Essay 2 prompt',
      caption: 'Marks are for the reply to the objection, not the summary.',
      files: [{ id: 'seed-phil-prompt', name: 'essay2-prompt.txt', type: 'text/plain', size: 240 }],
      attach: { kind: 'task', id: 't-essay', date: todayIso, label: 'Essay 2 draft — focused work' },
      createdAt: daysAgo(14),
    },
  ]
  // Example grade tracker (Chemistry only): three explicitly-weighted rows, then
  // two left blank so the even split of the remaining 35% is on show. Only the
  // marked rows count towards the current grade, and the lab row reaches its
  // documents through its bound task's attachments.
  const gradeRows: GradeRow[] = [
    { id: 'g-chem-midterm1', classId: 'c-chem', name: 'Midterm 1', weightPct: 20, scorePct: 78, taskIds: [] },
    { id: 'g-chem-midterm2', classId: 'c-chem', name: 'Midterm 2', weightPct: 20, scorePct: null, taskIds: [] },
    { id: 'g-chem-lab', classId: 'c-chem', name: 'Lab reports', weightPct: 25, scorePct: null, taskIds: ['t-titration', 't-chem-lab2'] },
    { id: 'g-chem-quizzes', classId: 'c-chem', name: 'Quizzes', weightPct: null, scorePct: 82, taskIds: ['t-quiz'] },
    { id: 'g-chem-final', classId: 'c-chem', name: 'Final exam', weightPct: null, scorePct: null, taskIds: [] },
  ]

  const binderPosts: BinderPost[] = [
    { id: uid(), classId: 'c-chem', text: 'Lab coat + goggles for Wednesday — she turns people away without them.', pinned: true, createdAt: daysAgo(2, 15) },
    { id: uid(), classId: 'c-chem', text: 'Midterm 2 covers chapters 4–7 only. Confirmed in class.', createdAt: daysAgo(1, 9) },
    { id: uid(), classId: 'c-phil', text: 'Prof said the essay deadline moved to Friday — double-check the portal.', createdAt: daysAgo(4, 16) },
    { id: uid(), classId: 'c-biol', text: 'Lab notebooks get checked at the START of Friday, not the end.', createdAt: daysAgo(3, 13) },
    { id: uid(), classId: 'c-math', text: 'Office hours moved to Wednesday 3pm this week only.', createdAt: daysAgo(5, 11) },
    { id: uid(), classId: 'c-aaad', text: 'Bring two discussion questions to seminar — he does check.', createdAt: daysAgo(6, 14) },
  ]

  // Example daily log: the ten days either side of the midterm, so the weather
  // toggles, meals, moods and journal all arrive with something in them. The
  // moods run a small arc — grinding, then flat, then the relief afterwards —
  // and today is left half-written (weather + breakfast) as an invitation.
  const logDay = (n: number) => toISO(addDays(today, -n))
  const dayLogs: Record<string, DayLog> = {
    // Sparser entries across the earlier semester, so the Journal tab's
    // month grouping and search have history to chew on.
    [logDay(52)]: {
      weather: ['sun'],
      meals: { b: 'Bagel from the freshers stall', d: 'Flat dinner — someone made tacos' },
      mood: 4,
      journal: 'First proper week. Bought a plant for the desk and named him Newton. Everything still smells like cardboard boxes.',
    },
    [logDay(49)]: { weather: ['sun', 'wind'], meals: { l: 'Meal deal on the quad' }, mood: 4 },
    [logDay(45)]: {
      weather: ['rain'],
      meals: { b: 'Porridge', l: 'Canteen lasagne', d: 'Soup' },
      mood: 3,
      journal: 'First chem lab. Broke exactly one beaker, which I am told is under average.',
    },
    [logDay(42)]: { weather: ['cloud'], meals: { d: 'Ramen night with Maya' }, mood: 4 },
    [logDay(38)]: {
      weather: ['suncloud'],
      meals: { b: 'Eggs', l: 'Falafel wrap', d: 'Pasta bake' },
      mood: 3,
      journal: 'Reading week starts tomorrow. Grand plans, a colour-coded schedule, and absolutely no faith in either.',
    },
    [logDay(35)]: { weather: ['rain', 'wind'], meals: { l: 'Cereal. For lunch. Reading week.' }, mood: 2 },
    [logDay(31)]: { weather: ['cloud'], meals: { b: 'Toast', d: 'Curry with the flat' }, mood: 3 },
    [logDay(27)]: {
      weather: ['sun'],
      meals: { b: 'Yoghurt and granola', l: 'Sandwich by the lake', d: 'Risotto, only slightly gluey' },
      mood: 5,
      journal: 'Ate lunch by the lake and the ducks accepted me as one of their own. Genome diagrams finally make sense. A good day.',
    },
    [logDay(24)]: { weather: ['storm'], meals: { d: 'Emergency pizza' }, mood: 2 },
    [logDay(20)]: {
      weather: ['snow'],
      meals: { b: 'Hot chocolate and toast', l: 'Canteen stew', d: 'Leftover stew' },
      mood: 4,
      journal: 'SNOW. In August, somehow, per the weather gods of this demo. Campus shut for the afternoon and nobody complained.',
    },
    [logDay(16)]: { weather: ['suncloud', 'wind'], meals: { l: 'Burrito with the lab group' }, mood: 3 },
    [logDay(13)]: { weather: ['cloud', 'rain'], meals: { b: 'Porridge', d: 'Fried rice' }, mood: 3 },
    [logDay(9)]: {
      weather: ['rain'],
      meals: { b: 'Toast and peanut butter', l: 'Leftover pasta at my desk', d: 'Rice and black beans' },
      mood: 3,
    },
    [logDay(8)]: {
      weather: ['cloud', 'rain'],
      water: 6,
      meals: { b: 'Porridge with a banana', l: 'Cheese sandwich in the library', d: 'Instant noodles with an egg in it' },
      mood: 2,
      journal: 'Rain all day and still three chapters to go before the midterm. Ate lunch at my desk again, which I keep promising not to do. Library at nine tomorrow, no negotiating with myself about it.',
    },
    [logDay(7)]: {
      weather: ['cloud'],
      meals: { b: 'Coffee only, ran late', l: 'Soup from the canteen', d: 'Stir fry with the last of the veg' },
      mood: 2,
    },
    [logDay(6)]: {
      weather: ['sun', 'wind'],
      water: 8,
      meals: { b: 'Scrambled eggs', l: 'Chicken wrap with Priya', d: 'Pasta and pesto' },
      mood: 3,
      journal: 'Past papers under exam timing, which was humbling. Section C really is the same every year, so at least I know where the hours should go.',
    },
    [logDay(5)]: {
      weather: ['storm', 'rain'],
      water: 4,
      meals: { b: 'Porridge', l: 'Rice bowl, ate it too fast', d: 'Toast — could not face cooking' },
      mood: 2,
      journal: 'Thunder all evening and the library wifi kept dropping out. Three hours on related rates and I can finally see the pattern, which is the one good thing about today.',
    },
    [logDay(4)]: {
      weather: ['suncloud'],
      meals: { b: 'Yoghurt and a banana', l: 'Canteen curry', d: 'Roast veg and couscous' },
      mood: 3,
    },
    [logDay(3)]: {
      weather: ['sun'],
      water: 7,
      meals: { b: 'Eggs on toast', l: 'Sandwich at the lab bench', d: 'Pizza with the flat' },
      mood: 4,
      journal: 'Midterm done. No idea how it went and I am refusing to think about it until the marks are up. Pizza with the flat afterwards — first proper evening off in two weeks.',
    },
    [logDay(2)]: {
      weather: ['sun', 'suncloud'],
      water: 8,
      meals: { b: 'Porridge with honey', l: 'Leftover pizza', d: 'Chilli, made a big batch' },
      mood: 5,
      journal: 'Slept nine hours and it changed my entire personality. Cooked something real, did the reading before the seminar instead of during it. This is the version of me I would like to keep.',
    },
    [logDay(1)]: {
      weather: ['cloud', 'wind'],
      water: 5,
      meals: { b: 'Toast and jam', l: 'Soup and bread', d: 'Chilli again, still good' },
      mood: 4,
    },
    [todayIso]: {
      weather: ['suncloud'],
      water: 3,
      meals: { b: 'Coffee and a croissant from the place by Murray' },
    },
  }

  return {
    classes, folders, customCalendars, events, projects, taskSections, tasks, recurring, birthdays,
    studySessions, gradeRows,
    ankiLogs: seedAnkiLogs(todayIso, iso(0, semesterStartWeek)),
    dayLogs,
    hiddenCalendars: [],
    // Explicitly marked day off (Saturday). Sunday is a day off too, but a
    // DERIVED one: Maya's birthday sits there and hasn't opted out.
    daysOff: [iso(6)],
    showTasksOnCalendar: true,
    // Ships in classic checkbox mode; the seeded ◺/⊘ states are already there
    // for anyone who flips "Task checking" to YPT-style in ⚙ view settings.
    taskCheckStyle: 'checkbox', showGhosts: true,
    weekStart: 0, theme: 'dark', themeConfig: { mode: 'dark', lightStart: '07:00', darkStart: '19:00' },
    // The demo ships unbound: the user pastes their own school feed URL.
    palette: [...PALETTE], notifications: [], icsUrl: '',
    lastSync: null, deletedUids: [], binderSections, binderUploads, binderPosts, schema: 1,
    // Demo daily study goal: 90 min — low enough that some seed days hit it,
    // so the Target Achievement Rate figure shows a real percentage.
    studyGoalMin: 90,
    // The demo campus is in the northern hemisphere, so the moon icon on the
    // daily log is drawn the way this student would actually see it.
    location: { label: 'Chapel Hill', hemisphere: 'N' },
    // Both grid lanes ship open, so the new log and journal are on show.
    // Demo data: never user-owned, so a SEED_VERSION bump auto-refreshes it.
    seedVersion: SEED_VERSION, userOwned: false,
  }
}

/** Demo per-class decks: the classes a student would realistically drill. */
const ANKI_SEED_DECKS: ID[] = ['c-chem', 'c-biol', 'c-math']

/**
 * Deterministic example review history from `startIso` (the demo semester's
 * first day) to today — no randomness, so every demo install (and every
 * reload) shows the same heatmap. ~2/3 of days have activity, mostly
 * general-bucket sessions with per-class decks sprinkled onto weekdays, a
 * couple of cram days, and an unbroken run up to today so the streak stat has
 * something to show.
 */
function seedAnkiLogs(todayIso: string, startIso: string): AnkiLog[] {
  // Cheap deterministic pseudo-random: multiply-xorshift over (day, salt), so
  // each salt gives an independent-looking 0–9999 sequence.
  const h = (day: number, salt: number) => {
    let x = Math.imul(day + 7919, 2654435761) ^ Math.imul(salt + 1, 1013904223)
    x = Math.imul(x ^ (x >>> 15), 2246822519)
    x ^= x >>> 13
    return (x >>> 0) % 10000
  }
  const start = startIso <= todayIso ? startIso : todayIso
  const logs: AnkiLog[] = []
  const total = Math.round((fromISOLocal(todayIso).getTime() - fromISOLocal(start).getTime()) / 86400000)
  for (let i = 0; i <= total; i++) {
    const date = toISO(addDays(fromISOLocal(start), i))
    const dow = fromISOLocal(date).getDay()
    const streakRun = total - i < 7 // the last week is always active (current streak)
    const active = streakRun || h(i, 1) % 100 < 66
    if (!active) continue

    // General bucket: the everyday "just do my reviews" number.
    let general = 15 + (h(i, 2) % 106) // 15–120
    if (h(i, 7) % 53 === 0) general = 200 + (h(i, 8) % 140) // occasional cram day
    logs.push({ date, classId: null, count: general })

    // Class-specific decks only get drilled on teaching days.
    if (dow === 0 || dow === 6) continue
    ANKI_SEED_DECKS.forEach((classId, k) => {
      if (h(i, 11 + k) % 100 >= 38) return
      logs.push({ date, classId, count: 10 + (h(i, 21 + k) % 51) }) // 10–60
    })
  }
  return logs
}

/** Local-midnight Date from 'YYYY-MM-DD' (kept here so seed() has no import cycle). */
function fromISOLocal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Class deletion keeps the flashcard history: that class's counts fold into the
 * General (unassigned) bucket for the same day, so daily totals never change.
 */
function mergeAnkiIntoGeneral(logs: AnkiLog[], classId: ID): AnkiLog[] {
  if (!logs.some((l) => l.classId === classId)) return logs
  const out: AnkiLog[] = []
  const generalAt = new Map<string, number>()
  for (const l of logs) {
    if (l.classId === classId) continue
    if (l.classId === null) generalAt.set(l.date, out.length)
    out.push(l)
  }
  for (const l of logs) {
    if (l.classId !== classId) continue
    const at = generalAt.get(l.date)
    if (at === undefined) {
      generalAt.set(l.date, out.length)
      out.push({ date: l.date, classId: null, count: l.count })
    } else {
      out[at] = { ...out[at], count: out[at].count + l.count }
    }
  }
  return out
}

/**
 * Drop deleted binder uploads from every task that attached them, leaving the
 * tasks that never referenced them untouched (so React sees no change there).
 */
function detachUploads(tasks: Task[], gone: Set<ID>): Task[] {
  if (!gone.size) return tasks
  return tasks.map((t) => {
    const ids = t.attachmentUploadIds
    if (!ids?.some((id) => gone.has(id))) return t
    const kept = ids.filter((id) => !gone.has(id))
    return { ...t, attachmentUploadIds: kept.length ? kept : undefined }
  })
}

/**
 * Records the slot a scheduled task is leaving when its `date` moves to a
 * different day — from a drag, the task editor, anywhere. Only day-to-day moves
 * ghost: scheduling a floating task (null → date) leaves nothing behind, and
 * un-scheduling it (date → null) removes the task from the calendar entirely.
 */
function withRescheduleGhost(prev: Task, next: Task): Task {
  if (!prev.date || !next.date || prev.date === next.date) return next
  return { ...next, ghosts: [...(next.ghosts ?? []), { date: prev.date, startMin: prev.startMin }] }
}

/**
 * The tri-state a task SHOWS in YPT mode. `done` is the source of truth for
 * completion, `yptState` only remembers the half-done step, so:
 *   done            → 2 (however the task got completed)
 *   stored 2, !done → 1 (it was finished then re-opened: half done reads best)
 *   otherwise       → the stored state (0 or 1), absent = 0
 * Nothing here writes, so flipping checking modes never destroys a ◺.
 */
export function displayYptState(t: Task): YptState {
  if (t.done) return 2
  return t.yptState === 2 ? 1 : t.yptState ?? 0
}

/**
 * Normalise a merged day log: trim the text fields, drop everything empty, and
 * return null when nothing at all is left (the caller then removes the date).
 */
function cleanDayLog(log: DayLog): DayLog | null {
  const out: DayLog = {}
  const meals: NonNullable<DayLog['meals']> = {}
  for (const k of ['b', 'l', 'd'] as const) {
    const v = log.meals?.[k]?.trim()
    if (v) meals[k] = v
  }
  if (Object.keys(meals).length) out.meals = meals
  // Duplicates can't come from the UI, but a hand-edited backup could carry them.
  const weather = log.weather?.filter((w, i, all) => all.indexOf(w) === i)
  if (weather?.length) out.weather = weather
  if (log.mood) out.mood = log.mood
  if (typeof log.water === 'number' && log.water > 0) out.water = Math.min(8, Math.round(log.water))
  const journal = log.journal?.trim()
  if (journal) out.journal = journal
  return Object.keys(out).length ? out : null
}

function sameDayLog(a: DayLog | undefined, b: DayLog | null): boolean {
  if (!a || !b) return !a && !b
  const am = a.meals ?? {}
  const bm = b.meals ?? {}
  const aw = a.weather ?? []
  const bw = b.weather ?? []
  return am.b === bm.b && am.l === bm.l && am.d === bm.d
    && a.mood === b.mood && a.water === b.water && a.journal === b.journal
    && aw.length === bw.length && aw.every((w, i) => w === bw[i])
}

/** Fill in fields added after first release and run one-time schema upgrades. */
export function migrate(s: AppState): AppState {
  const state: AppState = {
    ...s,
    folders: s.folders ?? [],
    customCalendars: s.customCalendars ?? [],
    daysOff: s.daysOff ?? [],
    weekStart: s.weekStart ?? 0,
    themeConfig: s.themeConfig ?? { mode: s.theme ?? 'dark', lightStart: '07:00', darkStart: '19:00' },
    palette: s.palette ?? [...PALETTE],
    notifications: s.notifications ?? [],
    // A stored URL is the user's own binding (including the proxy-form Warwick
    // feed older builds shipped with) — always kept. '' stays unbound.
    icsUrl: s.icsUrl ?? '',
    lastSync: s.lastSync ?? null,
    deletedUids: s.deletedUids ?? [],
    binderSections: s.binderSections ?? [],
    binderUploads: s.binderUploads ?? [],
    binderPosts: s.binderPosts ?? [],
    studySessions: s.studySessions ?? [],
    gradeRows: s.gradeRows ?? [],
    ankiLogs: s.ankiLogs ?? [],
    dayLogs: s.dayLogs ?? {},
    taskSections: s.taskSections ?? [],
    birthdays: s.birthdays ?? [],
    schema: s.schema ?? 1,
    seedVersion: s.seedVersion ?? 0,
    userOwned: s.userOwned ?? false,
  }
  if (state.schema < 3) {
    // Every class gets its default binder sections.
    const extra: BinderSection[] = []
    for (const c of state.classes) {
      for (const n of DEFAULT_BINDER_SECTIONS) {
        if (!state.binderSections.some((sec) => sec.classId === c.id && sec.name === n)) {
          extra.push({ id: uid(), classId: c.id, name: n })
        }
      }
    }
    state.binderSections = [...state.binderSections, ...extra]
    state.schema = 3
  }
  // Every top-level non-class project belongs to a calendar; older data
  // predates the field, so default it to Personal (also repairs a project whose
  // custom calendar has since vanished). Legacy: parentId may still exist.
  type LegacyProject = Project & { parentId?: ID | null }
  const legacy = state.projects as LegacyProject[]
  const calIds0 = new Set(state.customCalendars.map((c) => c.id))
  legacy.forEach((p) => {
    if (p.classId === null && (p.parentId ?? null) === null && !(p.calendarId && calIds0.has(p.calendarId))) {
      p.calendarId = 'personal'
    }
  })

  if (state.schema < 4) {
    // ---- Restructure to the new one-project-per-class/calendar model. ----
    // Flatten parentId, dedupe to one project per class/calendar. Every extra
    // project becomes a SECTION of the survivor; its tasks inherit that
    // section id so nothing is lost.
    const projs = legacy
    const byId = new Map(projs.map((p) => [p.id, p] as const))
    const rootOf = (p: LegacyProject): LegacyProject => {
      let cur: LegacyProject = p
      const seen = new Set<ID>()
      while (cur.parentId && !seen.has(cur.id)) {
        seen.add(cur.id)
        const next = byId.get(cur.parentId)
        if (!next) break
        cur = next
      }
      return cur
    }
    // 'class:<id>' | 'cal:<id>' — which bin a project's tasks should end up in.
    const ownerOf = (p: LegacyProject): string => {
      let cur: LegacyProject = p
      const seen = new Set<ID>()
      while (cur.parentId && !seen.has(cur.id)) {
        seen.add(cur.id)
        const parent = byId.get(cur.parentId)
        if (!parent) break
        if (parent.classId) return 'class:' + parent.classId
        cur = parent
      }
      if (cur.classId) return 'class:' + cur.classId
      const root = rootOf(cur)
      const calId = root.calendarId && (calIds0.has(root.calendarId) || root.calendarId === 'personal') ? root.calendarId : 'personal'
      return 'cal:' + calId
    }

    // Pick the surviving project per owner: prefer the direct auto-created one.
    const survivors = new Map<string, LegacyProject>()
    for (const p of projs) {
      const key = ownerOf(p)
      const existing = survivors.get(key)
      const directMatch = (key.startsWith('class:') && p.classId === key.slice(6) && !p.parentId)
        || (key.startsWith('cal:') && p.classId == null && !p.parentId && (p.calendarId ?? 'personal') === key.slice(4))
      if (!existing || directMatch) survivors.set(key, p)
    }
    // Backfill: every class and every calendar (incl. Personal) must have a project.
    for (const c of state.classes) {
      if (!survivors.has('class:' + c.id)) {
        const p: LegacyProject = { id: uid(), name: c.name, color: c.color, classId: c.id, calendarId: null, collapsed: false }
        survivors.set('class:' + c.id, p)
        projs.push(p)
      }
    }
    const ensureCal = (calId: string, name: string, color: string) => {
      if (survivors.has('cal:' + calId)) return
      const p: LegacyProject = { id: uid(), name, color, classId: null, calendarId: calId, collapsed: false }
      survivors.set('cal:' + calId, p)
      projs.push(p)
    }
    ensureCal('personal', 'Personal', PERSONAL_COLOR)
    for (const cc of state.customCalendars) ensureCal(cc.id, cc.name, cc.color)

    // Normalise survivor fields to match owner (kill parentId; sync fields).
    for (const [key, sur] of survivors) {
      sur.parentId = null
      if (key.startsWith('class:')) {
        const cls = state.classes.find((c) => c.id === key.slice(6))
        sur.classId = cls?.id ?? null
        sur.calendarId = null
        if (cls) { sur.name = cls.name; sur.color = cls.color }
      } else {
        const calId = key.slice(4)
        sur.classId = null
        sur.calendarId = calId
        const cc = state.customCalendars.find((x) => x.id === calId)
        if (calId === 'personal') { sur.name = 'Personal'; sur.color = PERSONAL_COLOR }
        else if (cc) { sur.name = cc.name; sur.color = cc.color }
      }
    }

    // Sections: start from existing (empty on first migration), then guarantee
    // the default class sections and append one section per subsumed project.
    const newSections: TaskSection[] = [...state.taskSections]
    const nextOrder = new Map<ID, number>()
    for (const sec of newSections) {
      nextOrder.set(sec.projectId, Math.max(nextOrder.get(sec.projectId) ?? 0, sec.order + 1))
    }
    for (const [key, sur] of survivors) {
      if (!key.startsWith('class:')) continue
      for (const n of DEFAULT_CLASS_SECTIONS) {
        if (!newSections.some((s) => s.projectId === sur.id && s.name === n)) {
          const order = nextOrder.get(sur.id) ?? 0
          newSections.push({ id: uid(), projectId: sur.id, name: n, order })
          nextOrder.set(sur.id, order + 1)
        }
      }
    }
    const sectionForProject = new Map<ID, ID>() // old project id -> new section id
    for (const p of projs) {
      const key = ownerOf(p)
      const sur = survivors.get(key)!
      if (p.id === sur.id) continue
      const order = nextOrder.get(sur.id) ?? 0
      const sec: TaskSection = { id: uid(), projectId: sur.id, name: p.name, order }
      nextOrder.set(sur.id, order + 1)
      newSections.push(sec)
      sectionForProject.set(p.id, sec.id)
    }

    // Rewire tasks / recurring to (survivor project id, new section id).
    state.tasks = state.tasks.map((t) => {
      if (t.projectId == null) return t
      const orig = byId.get(t.projectId)
      if (!orig) return { ...t, projectId: null, sectionId: null }
      const key = ownerOf(orig)
      const sur = survivors.get(key)!
      const secId = orig.id === sur.id ? (t.sectionId ?? null) : sectionForProject.get(orig.id) ?? null
      return { ...t, projectId: sur.id, sectionId: secId }
    })
    state.recurring = state.recurring.map((r) => {
      const orig = byId.get(r.projectId)
      if (!orig) return r
      const key = ownerOf(orig)
      const sur = survivors.get(key)!
      const secId = orig.id === sur.id ? (r.sectionId ?? null) : sectionForProject.get(orig.id) ?? null
      return { ...r, projectId: sur.id, sectionId: secId }
    })

    // Final projects list is exactly the survivors — no parentId, no extras.
    state.projects = [...survivors.values()].map((p) => ({
      id: p.id, name: p.name, color: p.color, classId: p.classId, calendarId: p.calendarId, collapsed: p.collapsed,
    }))
    state.taskSections = newSections
    state.schema = 4
  }

  if (state.schema < 5) {
    // "Revision" was renamed to "Studies", and the section holding graded work
    // is now flagged so the grade tracker can find it. Both only apply to class
    // projects; a user's own "Revision" section on a calendar project is theirs.
    const classProjects = new Set(state.projects.filter((p) => p.classId != null).map((p) => p.id))
    state.taskSections = state.taskSections.map((s) => {
      if (!classProjects.has(s.projectId)) return s
      if (s.name === 'Revision') return { ...s, name: 'Studies' }
      if (s.name === 'Coursework') return { ...s, assignments: true }
      return s
    })
    state.schema = 5
  }

  if (state.schema < 6) {
    // The grade tracker arrives empty for everyone: gradeRows is defaulted
    // above, so this stage only records that the upgrade has run.
    state.schema = 6
  }

  if (state.schema < 7) {
    // The Birthdays calendar arrives empty (`birthdays` is defaulted above).
    // Custom recurrence rules need NO migration: a recurring task without a
    // `rule` keeps repeating by its freq/weekday pair (see recurringOccursOn).
    state.schema = 7
  }

  if (state.schema < 8) {
    // The daily log & journal arrives empty: `dayLogs` is defaulted above, so
    // this stage only records that the upgrade has run.
    state.schema = 8
  }

  return state
}

/* ---------- Recurring tasks: scoped occurrence edits ---------- */

/** Copy of `rec` keeping only the keys `keep` accepts; undefined when empty. */
function pickByDate<T>(rec: Record<string, T> | undefined, keep: (k: string) => boolean): Record<string, T> | undefined {
  if (!rec) return undefined
  const out: Record<string, T> = {}
  for (const [k, v] of Object.entries(rec)) if (keep(k)) out[k] = v
  return Object.keys(out).length ? out : undefined
}

/** Drop the undefined keys a spread-merged exception picks up. */
function cleanException(ex: RecurException): RecurException {
  const out: RecurException = {}
  for (const [k, v] of Object.entries(ex)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v
  }
  return out
}

/**
 * Does moving one occurrence to another day mean anything for the whole series?
 * Only for rules where the day of the week / month is part of the rule — a daily
 * habit already fires every day, so shifting it would just move its start.
 */
function dayShiftMatters(rt: RecurringTask): boolean {
  if (!rt.rule) return rt.freq === 'weekly'
  return rt.rule.kind === 'weekly' || rt.rule.kind === 'biweekly' || rt.rule.kind === 'monthly'
}

const mod7 = (n: number) => ((n % 7) + 7) % 7

/**
 * The whole series shifted so the occurrence generated on `occurrence` lands
 * where `patch` puts it — the "all events" arm of a scoped occurrence edit.
 */
function shiftedSeries(rt: RecurringTask, occurrence: string, patch: RecurException): RecurringTask {
  const next: RecurringTask = { ...rt }
  if (patch.date && patch.date !== occurrence && dayShiftMatters(rt)) {
    const delta = daysBetween(occurrence, patch.date)
    next.startDate = toISO(addDays(fromISO(rt.startDate), delta))
    next.weekday = mod7(rt.weekday + delta)
    if (rt.rule) {
      const rule = { ...rt.rule }
      if (rule.weekdays?.length) rule.weekdays = rule.weekdays.map((d) => mod7(d + delta))
      if (rule.anchor) rule.anchor = toISO(addDays(fromISO(rule.anchor), delta))
      if (rule.kind === 'monthly') {
        rule.day = Math.min(31, Math.max(1, (rule.day ?? fromISO(rt.startDate).getDate()) + delta))
      }
      next.rule = rule
    }
  }
  if (patch.startMin !== undefined) next.startMin = patch.startMin
  if (patch.endMin !== undefined) next.endMin = patch.endMin
  if (patch.dueMin !== undefined) next.dueMin = patch.dueMin
  if (patch.dueDate) next.dueOffsetDays = daysBetween(patch.date ?? occurrence, patch.dueDate)
  return next
}

/**
 * "This and future": the old series stops the day before `occurrence` (keeping
 * the history that belongs to it) and a clone carries the change forward from
 * there, so nothing already ticked off is disturbed.
 */
function splitRecurring(
  rt: RecurringTask, occurrence: string, patch: RecurException, series?: Partial<RecurringTask>,
): [RecurringTask, RecurringTask] {
  const before: RecurringTask = {
    ...rt,
    until: occurrence,
    completions: rt.completions.filter((d) => d < occurrence),
    partial: pickByDate(rt.partial, (d) => d < occurrence),
    exceptions: pickByDate(rt.exceptions, (d) => d < occurrence),
  }
  const startDate = patch.date ?? occurrence
  const shifted = shiftedSeries(rt, occurrence, patch)
  const after: RecurringTask = {
    ...shifted,
    ...series,
    id: uid(),
    startDate,
    until: rt.until,
    completions: rt.completions.filter((d) => d >= occurrence),
    partial: pickByDate(rt.partial, (d) => d >= occurrence),
    exceptions: pickByDate(rt.exceptions, (d) => d >= occurrence && d !== occurrence),
  }
  // A fortnightly clone pins its own parity, so the split week stays "on".
  if (after.rule?.kind === 'biweekly') after.rule = { ...after.rule, anchor: startDate }
  return [before, after]
}

// ---------- Actions ----------

export type Action =
  | { type: 'addEvent'; event: CalEvent }
  | { type: 'updateEvent'; event: CalEvent }
  | { type: 'deleteEvent'; id: ID }
  /**
   * Scoped edit of one occurrence of a (possibly repeating) event — the drag &
   * drop counterpart of EventModal's save(). One action so a whole drag is a
   * single undo step even when it splits the series (see scopedEventEdit).
   */
  | { type: 'moveEventOccurrence'; id: ID; occurrence: string; scope: EditScope; patch: Partial<CalEvent> }
  /**
   * Event ⇄ task, in one step. Two dispatches (add + delete) would record two
   * history entries, so the swap lives in the reducer instead and stays a
   * single undo. Refused — and the modals disable their control — for a
   * repeating event (a series of recurring tasks is out of scope) or a task
   * with no date (an event must sit on a day).
   */
  | { type: 'convertEventToTask'; id: ID }
  | { type: 'convertTaskToEvent'; id: ID }
  | { type: 'addTask'; task: Task }
  | { type: 'updateTask'; task: Task }
  | { type: 'deleteTask'; id: ID }
  | { type: 'toggleTask'; id: ID }
  | { type: 'cycleYpt'; id: ID } // YPT mode: not started → half done → done → …
  | { type: 'dismissGhost'; id: ID; index: number } // hide one reschedule ghost
  | { type: 'toggleTaskSubmitted'; id: ID } // handed in — independent of done
  | { type: 'toggleCollapse'; id: ID }
  | { type: 'addTaskSection'; projectId: ID; name: string }
  | { type: 'renameTaskSection'; id: ID; name: string }
  | { type: 'toggleSectionAssignments'; id: ID } // section holds graded work
  | { type: 'toggleSectionCollapse'; id: ID } // fold the section shut (header stays)
  | { type: 'deleteTaskSection'; id: ID }
  | { type: 'reorderTaskSection'; id: ID; beforeId: ID | null }
  // Drag & drop of a whole section into another project (or, with the same
  // projectId, a plain reorder). beforeId null appends to the destination.
  // Its tasks and recurring tasks follow, keeping their sectionId.
  | { type: 'moveTaskSection'; id: ID; projectId: ID; beforeId: ID | null }
  // Drag & drop of a task inside its list, or into another project/section.
  // Omitted projectId/sectionId keep the task where it is (a pure reorder);
  // beforeId null appends to the end of the target list.
  | { type: 'moveTask'; id: ID; projectId?: ID | null; sectionId?: ID | null; beforeId: ID | null }
  | { type: 'addRecurring'; rt: RecurringTask }
  | { type: 'updateRecurring'; rt: RecurringTask }
  | { type: 'deleteRecurring'; id: ID }
  | { type: 'toggleRecurring'; id: ID; date: string }
  /** timesPerDay: how many of the day's slots are ticked off (see recurringTimes). */
  | { type: 'setRecurringCount'; id: ID; date: string; count: number }
  /**
   * Scoped edit of ONE occurrence of a recurring task — the counterpart of
   * moveEventOccurrence. 'one' writes a per-occurrence exception, 'all' shifts
   * the series, 'future' splits it. `series` carries whole-series field changes
   * (title, rule, …) for the 'all'/'future' arms; 'one' ignores it.
   */
  | {
      type: 'editRecurringOccurrence'
      id: ID
      occurrence: string
      scope: EditScope
      patch: RecurException
      series?: Partial<RecurringTask>
    }
  | { type: 'addBirthday'; birthday: Birthday }
  | { type: 'updateBirthday'; birthday: Birthday }
  | { type: 'deleteBirthday'; id: ID }
  | { type: 'addClass'; name: string; color: string; folderId?: ID | null }
  | { type: 'updateClass'; cls: ClassInfo }
  | { type: 'deleteClass'; id: ID; keepProject: boolean }
  | { type: 'toggleCalendar'; id: ID } // class id, custom calendar id, or 'personal'
  | { type: 'addCalendar'; name: string; color: string }
  | { type: 'updateCalendar'; cal: CustomCalendar }
  | { type: 'deleteCalendar'; id: ID }
  | { type: 'toggleDayOff'; date: string }
  | { type: 'toggleTasksOnCalendar' }
  | { type: 'setTheme'; theme: 'light' | 'dark' }
  | { type: 'setWeekStart'; weekStart: 0 | 1 | 6 }
  | { type: 'setThemeConfig'; config: AppState['themeConfig'] }
  | { type: 'setIcsUrl'; url: string } // bind / unbind the live feed ('' = unbound)
  | { type: 'applySync'; parsed: ParsedIcsEvent[] }
  | { type: 'importEvents'; events: CalEvent[]; source?: string } // static .ics import, one atomic step
  | { type: 'resolveRemoved'; notifId: ID; keep: boolean }
  | { type: 'applyEdited'; notifId: ID; keys: string[] }
  | { type: 'dismissNotification'; id: ID }
  | { type: 'addPaletteColor'; color: string }
  | { type: 'removePaletteColor'; color: string }
  | { type: 'addBinderSection'; classId: ID; name: string }
  | { type: 'renameBinderSection'; id: ID; name: string }
  | { type: 'deleteBinderSection'; id: ID }
  | { type: 'addBinderUpload'; upload: BinderUpload }
  | { type: 'updateBinderUpload'; upload: BinderUpload }
  | { type: 'deleteBinderUpload'; id: ID }
  | { type: 'addBinderPost'; post: BinderPost }
  | { type: 'updateBinderPost'; post: BinderPost }
  | { type: 'deleteBinderPost'; id: ID }
  | { type: 'startStudySession'; session: StudySession } // refused if one is already running
  | { type: 'endStudySession'; id: ID; endMin: number } // materialises pomodoro breaks
  | { type: 'updateStudySession'; session: StudySession } // class/tasks/reflection/breaks, during or after
  | { type: 'deleteStudySession'; id: ID }
  | { type: 'startBreak'; id: ID; durMin: number } // normal mode: start a break now
  | { type: 'endBreakNow'; id: ID } // normal mode: cut the current break short
  | { type: 'addGradeRow'; classId: ID; name?: string }
  | { type: 'updateGradeRow'; row: GradeRow }
  | { type: 'deleteGradeRow'; id: ID }
  // Sets (replaces) the review count for one (date, deck) pair; 0 removes it.
  | { type: 'logAnki'; date: string; classId: ID | null; count: number }
  | { type: 'addFolder'; name: string }
  | { type: 'renameFolder'; id: ID; name: string }
  | { type: 'deleteFolder'; id: ID } // classes inside become unfoldered
  | { type: 'toggleFolderCollapse'; id: ID }
  | { type: 'reorderFolder'; id: ID; beforeId: ID | null }
  | { type: 'moveClass'; id: ID; folderId: ID | null; beforeClassId?: ID } // reorder and/or refolder
  | { type: 'toggleClassPin'; id: ID; scope: 'binder' | 'folder' }
  | { type: 'toggleTaskPin'; id: ID }
  | { type: 'setNlQuickAdd'; on: boolean }
  | { type: 'setTaskCheckStyle'; style: 'checkbox' | 'ypt' }
  // Re-enabling ghosts also un-dismisses every ghost (see the ⓘ in ViewSettings).
  | { type: 'setShowGhosts'; on: boolean }
  | { type: 'setStudyGoal'; minutes: number | null } // daily study-time goal (minutes)
  | { type: 'updateDayLog'; date: string; patch: Partial<DayLog> } // merged into the day's log
  | { type: 'setLocation'; location: AppState['location'] } // hemisphere drives the moon icon
  | { type: 'setCollapseAllDay'; on: boolean }
  | { type: 'setCollapseJournal'; on: boolean }
  | { type: 'replaceState'; state: AppState } // backup import

function reducer(state: AppState, a: Action): AppState {
  switch (a.type) {
    case 'addEvent':
      return { ...state, events: [...state.events, a.event] }
    case 'updateEvent':
      return { ...state, events: state.events.map((e) => (e.id === a.event.id ? a.event : e)) }
    case 'deleteEvent': {
      // Tombstone synced events so the next sync doesn't resurrect them.
      const doomed = state.events.find((e) => e.id === a.id)
      return {
        ...state,
        events: state.events.filter((e) => e.id !== a.id),
        deletedUids: doomed?.icsUid ? [...state.deletedUids, doomed.icsUid] : state.deletedUids,
        notifications: state.notifications.filter((n) => n.eventId !== a.id),
        binderUploads: state.binderUploads.map((u) =>
          u.attach?.kind === 'event' && u.attach.id === a.id ? { ...u, attach: undefined } : u,
        ),
        studySessions: state.studySessions.map((s) =>
          s.eventIds.includes(a.id) ? { ...s, eventIds: s.eventIds.filter((e) => e !== a.id) } : s,
        ),
      }
    }

    /**
     * Same semantics as EventModal's scoped save, in one step: 'all' (and
     * "this and future" from the series start) patches the event; 'one'
     * detaches the occurrence; 'future' ends the series and starts a new one.
     */
    case 'moveEventOccurrence': {
      const ev = state.events.find((e) => e.id === a.id)
      if (!ev) return state
      if (!splitsSeries(ev, a.occurrence, a.scope)) {
        return { ...state, events: state.events.map((e) => (e.id === a.id ? { ...e, ...a.patch } : e)) }
      }
      const detached: CalEvent = {
        ...ev, ...a.patch,
        id: uid(),
        icsUid: undefined, origin: undefined, syncMissing: undefined,
        exDates: undefined, until: undefined,
        repeat: a.scope === 'one' ? 'none' : ev.repeat,
      }
      const trimmed: CalEvent = a.scope === 'one'
        ? { ...ev, exDates: [...(ev.exDates ?? []), a.occurrence] }
        : { ...ev, until: a.occurrence }
      return {
        ...state,
        events: [...state.events.map((e) => (e.id === a.id ? trimmed : e)), detached],
      }
    }

    /**
     * Event → task. The time becomes the task's scheduled block; an all-day
     * event becomes an all-day (date-only) task. Everything the event carried
     * that a task has no home for (repeat, exam flag, sync fields) is dropped
     * with it, which is why the control is refused on a series.
     */
    case 'convertEventToTask': {
      const ev = state.events.find((e) => e.id === a.id)
      if (!ev || ev.repeat !== 'none') return state
      const task: Task = {
        id: uid(),
        title: ev.title,
        projectId: projectForCalendar(state, ev.classId, ev.calendarId),
        sectionId: null,
        date: ev.date,
        startMin: ev.allDay ? null : ev.startMin,
        endMin: ev.allDay ? null : ev.endMin,
        dueDate: null,
        dueMin: null,
        location: ev.location,
        done: false,
        notes: ev.notes,
      }
      const gone = reducer(state, { type: 'deleteEvent', id: a.id })
      return { ...gone, tasks: [...gone.tasks, task] }
    }

    /**
     * Task → event, the mirror. A task with a start but no expected-time block
     * gets the editor's default hour; an all-day task becomes an all-day event.
     * The task-only fields (due date, submitted, extensions, attachments, ypt
     * state, section) have no counterpart and are dropped — TaskModal confirms
     * that first when any of them is set.
     */
    case 'convertTaskToEvent': {
      const t = state.tasks.find((x) => x.id === a.id)
      if (!t || !t.date) return state
      const p = projectById(state, t.projectId)
      const calendarId = p?.classId ? null : p?.calendarId ?? null
      const allDay = t.startMin == null
      const startMin = t.startMin ?? 0
      const event: CalEvent = {
        id: uid(),
        title: t.title,
        classId: p?.classId ?? null,
        calendarId: calendarId === 'personal' ? null : calendarId,
        date: t.date,
        allDay,
        startMin: allDay ? 0 : startMin,
        endMin: allDay
          ? 0
          : t.endMin != null && t.endMin > startMin ? t.endMin : Math.min(startMin + 60, 24 * 60),
        repeat: 'none',
        location: t.location,
        notes: t.notes,
      }
      const gone = reducer(state, { type: 'deleteTask', id: a.id })
      return { ...gone, events: [...gone.events, event] }
    }

    case 'addTask':
      return { ...state, tasks: [...state.tasks, a.task] }
    case 'updateTask': {
      const prev = state.tasks.find((t) => t.id === a.task.id)
      const task = prev ? withRescheduleGhost(prev, a.task) : a.task
      return { ...state, tasks: state.tasks.map((t) => (t.id === task.id ? task : t)) }
    }
    case 'deleteTask':
      return {
        ...state,
        tasks: state.tasks.filter((t) => t.id !== a.id),
        binderUploads: state.binderUploads.map((u) =>
          u.attach?.kind === 'task' && u.attach.id === a.id ? { ...u, attach: undefined } : u,
        ),
        studySessions: state.studySessions.map((s) =>
          s.taskIds.includes(a.id) ? { ...s, taskIds: s.taskIds.filter((t) => t !== a.id) } : s,
        ),
        gradeRows: state.gradeRows.map((r) =>
          r.taskIds.includes(a.id) ? { ...r, taskIds: r.taskIds.filter((t) => t !== a.id) } : r,
        ),
      }
    case 'toggleTask':
      return {
        ...state,
        tasks: state.tasks.map((t) => {
          if (t.id !== a.id) return t
          const done = !t.done
          // Completing a task auto-unpins it — it doesn't need to stay at the
          // top — and stamps the moment, which orders the section Archives.
          return done
            ? { ...t, done, pinned: undefined, completedAt: new Date().toISOString() }
            : { ...t, done, completedAt: undefined }
        }),
      }
    /**
     * YPT mode: the glyph cycles not started → half done → done → not started.
     * Landing on 2 is the same completion event a tick is (done + stamp +
     * auto-unpin); stepping off it re-opens the task.
     */
    case 'cycleYpt':
      return {
        ...state,
        tasks: state.tasks.map((t) => {
          if (t.id !== a.id) return t
          const next = (((displayYptState(t) + 1) % 3) as YptState)
          return next === 2
            ? { ...t, yptState: next, done: true, pinned: undefined, completedAt: new Date().toISOString() }
            : { ...t, yptState: next, done: false, completedAt: undefined }
        }),
      }
    case 'dismissGhost': {
      const t = state.tasks.find((x) => x.id === a.id)
      const g = t?.ghosts?.[a.index]
      if (!g || g.dismissed) return state
      return {
        ...state,
        tasks: state.tasks.map((x) =>
          x.id === a.id
            ? { ...x, ghosts: x.ghosts!.map((gg, i) => (i === a.index ? { ...gg, dismissed: true } : gg)) }
            : x,
        ),
      }
    }
    case 'toggleTaskSubmitted':
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === a.id ? { ...t, submitted: !t.submitted || undefined } : t)),
      }

    case 'toggleCollapse':
      return { ...state, projects: state.projects.map((p) => (p.id === a.id ? { ...p, collapsed: !p.collapsed } : p)) }

    case 'addTaskSection': {
      const order = state.taskSections.filter((s) => s.projectId === a.projectId).length
      return {
        ...state,
        taskSections: [...state.taskSections, { id: uid(), projectId: a.projectId, name: a.name.trim() || 'New section', order }],
      }
    }
    case 'renameTaskSection':
      return {
        ...state,
        taskSections: state.taskSections.map((s) => (s.id === a.id ? { ...s, name: a.name } : s)),
      }
    case 'toggleSectionAssignments':
      return {
        ...state,
        taskSections: state.taskSections.map((s) =>
          s.id === a.id ? { ...s, assignments: !s.assignments || undefined } : s,
        ),
      }
    case 'toggleSectionCollapse':
      return {
        ...state,
        taskSections: state.taskSections.map((s) =>
          s.id === a.id ? { ...s, collapsed: !s.collapsed || undefined } : s,
        ),
      }
    case 'deleteTaskSection': {
      const doomed = state.taskSections.find((s) => s.id === a.id)
      if (!doomed) return state
      // Tasks move to the project's fallback (Misc for classes — created on
      // demand if missing; main/null for calendar projects).
      const project = state.projects.find((p) => p.id === doomed.projectId)
      let taskSections = state.taskSections.filter((s) => s.id !== a.id)
      let fallbackId: ID | null = null
      if (project?.classId) {
        let misc = taskSections.find((s) => s.projectId === project.id && s.name === CLASS_FALLBACK_SECTION)
        if (!misc) {
          const order = taskSections.filter((s) => s.projectId === project.id).length
          misc = { id: uid(), projectId: project.id, name: CLASS_FALLBACK_SECTION, order }
          taskSections = [...taskSections, misc]
        }
        fallbackId = misc.id
      }
      return {
        ...state,
        taskSections,
        tasks: state.tasks.map((t) => (t.sectionId === a.id ? { ...t, sectionId: fallbackId } : t)),
        recurring: state.recurring.map((r) => (r.sectionId === a.id ? { ...r, sectionId: fallbackId } : r)),
      }
    }
    case 'reorderTaskSection': {
      const moving = state.taskSections.find((s) => s.id === a.id)
      if (!moving || a.id === a.beforeId) return state
      const same = state.taskSections
        .filter((s) => s.projectId === moving.projectId && s.id !== a.id)
        .sort((x, y) => x.order - y.order)
      const at = a.beforeId ? same.findIndex((s) => s.id === a.beforeId) : same.length
      const idx = at < 0 ? same.length : at
      const seq = [...same.slice(0, idx), moving, ...same.slice(idx)]
      const reordered = new Map(seq.map((s, i) => [s.id, i] as const))
      // Dropping a section back where it already sits changes nothing — bail so
      // it never lands in the undo history.
      if (seq.every((s) => s.order === reordered.get(s.id))) return state
      return {
        ...state,
        taskSections: state.taskSections.map((s) =>
          s.projectId === moving.projectId ? { ...s, order: reordered.get(s.id) ?? s.order } : s,
        ),
      }
    }
    case 'moveTaskSection': {
      // A whole section dragged into another project: it is just a bin of
      // tasks, so its tasks and recurring tasks are rewired to the destination
      // project (keeping their sectionId). Colour/tag derive from projectId, so
      // they follow on their own. Order is renumbered in BOTH projects.
      const moving = state.taskSections.find((s) => s.id === a.id)
      if (!moving || a.id === a.beforeId) return state
      if (!state.projects.some((p) => p.id === a.projectId)) return state
      const from = moving.projectId
      const moved: TaskSection = { ...moving, projectId: a.projectId }
      const dest = state.taskSections
        .filter((s) => s.projectId === a.projectId && s.id !== a.id)
        .sort((x, y) => x.order - y.order)
      const at = a.beforeId ? dest.findIndex((s) => s.id === a.beforeId) : dest.length
      const idx = at < 0 ? dest.length : at
      const seq = [...dest.slice(0, idx), moved, ...dest.slice(idx)]
      const destOrder = new Map(seq.map((s, i) => [s.id, i] as const))
      const sameProject = from === a.projectId
      if (sameProject && seq.every((s) => s.order === destOrder.get(s.id))) return state
      const srcOrder = new Map(
        (sameProject
          ? []
          : state.taskSections
            .filter((s) => s.projectId === from && s.id !== a.id)
            .sort((x, y) => x.order - y.order)
        ).map((s, i) => [s.id, i] as const),
      )
      return {
        ...state,
        taskSections: state.taskSections.map((s) => {
          if (s.id === a.id) return { ...moved, order: destOrder.get(a.id) ?? 0 }
          if (s.projectId === a.projectId) {
            const order = destOrder.get(s.id)
            return order === undefined ? s : { ...s, order }
          }
          if (s.projectId === from) {
            const order = srcOrder.get(s.id)
            return order === undefined ? s : { ...s, order }
          }
          return s
        }),
        tasks: sameProject
          ? state.tasks
          : state.tasks.map((t) => (t.sectionId === a.id ? { ...t, projectId: a.projectId } : t)),
        recurring: sameProject
          ? state.recurring
          : state.recurring.map((r) => (r.sectionId === a.id ? { ...r, projectId: a.projectId } : r)),
      }
    }
    case 'moveTask': {
      // Drag-and-drop inside one list (Unfiled, a project's main list, a
      // section) and across them. Every task in the target list is renumbered,
      // so from the first drag on `order` alone decides that list's order.
      const moving = state.tasks.find((t) => t.id === a.id)
      if (!moving || a.id === a.beforeId) return state
      const projectId = a.projectId === undefined ? moving.projectId : a.projectId
      const sectionId = a.sectionId === undefined ? moving.sectionId ?? null : a.sectionId
      const moved: Task = { ...moving, projectId, sectionId }
      const listed = sortTaskList(
        state.tasks.filter((t) => t.projectId === projectId && (t.sectionId ?? null) === sectionId),
      )
      const same = listed.filter((t) => t.id !== a.id)
      const at = a.beforeId ? same.findIndex((t) => t.id === a.beforeId) : same.length
      const idx = at < 0 ? same.length : at
      const seq = [...same.slice(0, idx), moved, ...same.slice(idx)]
      const reordered = new Map(seq.map((t, i) => [t.id, i] as const))
      return {
        ...state,
        tasks: state.tasks.map((t) => {
          if (t.id === a.id) return { ...moved, order: reordered.get(a.id) ?? 0 }
          const order = reordered.get(t.id)
          return order === undefined ? t : { ...t, order }
        }),
      }
    }

    case 'addRecurring':
      return { ...state, recurring: [...state.recurring, a.rt] }
    case 'updateRecurring':
      return { ...state, recurring: state.recurring.map((r) => (r.id === a.rt.id ? a.rt : r)) }
    case 'deleteRecurring':
      return { ...state, recurring: state.recurring.filter((r) => r.id !== a.id) }
    case 'toggleRecurring':
      return {
        ...state,
        recurring: state.recurring.map((r) => {
          if (r.id !== a.id) return r
          const done = r.completions.includes(a.date)
          return {
            ...r,
            completions: done ? r.completions.filter((d) => d !== a.date) : [...r.completions, a.date],
            // A day ticked (or un-ticked) wholesale has no half-finished slots left.
            partial: pickByDate(r.partial, (d) => d !== a.date),
          }
        }),
      }

    /**
     * A day of a timesPerDay habit fills left to right: `count` slots done. A
     * full day still lands in `completions`, so streaks, the habit strip and
     * every legacy reader keep working unchanged.
     */
    case 'setRecurringCount': {
      const rt = state.recurring.find((r) => r.id === a.id)
      if (!rt) return state
      const times = recurringTimes(rt)
      const count = Math.max(0, Math.min(Math.round(a.count), times))
      if (count === (rt.completions.includes(a.date) ? times : rt.partial?.[a.date] ?? 0)) return state
      const completions = count >= times
        ? [...rt.completions.filter((d) => d !== a.date), a.date]
        : rt.completions.filter((d) => d !== a.date)
      const rest = pickByDate(rt.partial, (d) => d !== a.date) ?? {}
      const partial = count > 0 && count < times ? { ...rest, [a.date]: count } : rest
      return {
        ...state,
        recurring: state.recurring.map((r) =>
          r.id === a.id
            ? { ...r, completions, partial: Object.keys(partial).length ? partial : undefined }
            : r,
        ),
      }
    }

    case 'editRecurringOccurrence': {
      const rt = state.recurring.find((r) => r.id === a.id)
      if (!rt) return state
      if (a.scope === 'one') {
        const merged = cleanException({ ...rt.exceptions?.[a.occurrence], ...a.patch })
        return {
          ...state,
          recurring: state.recurring.map((r) =>
            r.id === a.id ? { ...r, exceptions: { ...r.exceptions, [a.occurrence]: merged } } : r,
          ),
        }
      }
      // "This and future" from the very first occurrence is editing everything.
      if (a.scope === 'future' && a.occurrence > rt.startDate) {
        const [before, after] = splitRecurring(rt, a.occurrence, a.patch, a.series)
        return { ...state, recurring: [...state.recurring.map((r) => (r.id === a.id ? before : r)), after] }
      }
      const next: RecurringTask = { ...shiftedSeries(rt, a.occurrence, a.patch), ...a.series }
      return { ...state, recurring: state.recurring.map((r) => (r.id === a.id ? next : r)) }
    }

    case 'addBirthday':
      return { ...state, birthdays: [...state.birthdays, a.birthday] }
    case 'updateBirthday':
      return {
        ...state,
        birthdays: state.birthdays.map((b) => (b.id === a.birthday.id ? a.birthday : b)),
      }
    case 'deleteBirthday':
      return { ...state, birthdays: state.birthdays.filter((b) => b.id !== a.id) }

    case 'addClass': {
      // Adding a class auto-creates its project, default task sections + binder sections.
      const bundle = makeClassBundle(a.name, a.color)
      if (a.folderId) bundle.cls.folderId = a.folderId
      return {
        ...state,
        classes: [...state.classes, bundle.cls],
        projects: [...state.projects, bundle.project],
        taskSections: [...state.taskSections, ...bundle.taskSections],
        binderSections: [...state.binderSections, ...bundle.sections],
      }
    }
    case 'updateClass':
      return {
        ...state,
        classes: state.classes.map((c) => (c.id === a.cls.id ? a.cls : c)),
        // Project color/name mirrors the class.
        projects: state.projects.map((p) =>
          p.classId === a.cls.id ? { ...p, name: a.cls.name, color: a.cls.color } : p,
        ),
      }
    case 'deleteClass': {
      const proj = state.projects.find((p) => p.classId === a.id)
      const cls = state.classes.find((c) => c.id === a.id)
      let projects = state.projects
      let taskSections = state.taskSections
      let tasks = state.tasks
      let recurring = state.recurring
      if (proj && a.keepProject) {
        // Move the project (and its sections) onto Personal, severing the class link.
        projects = projects.map((p) =>
          p.id === proj.id
            ? { ...p, classId: null, calendarId: 'personal', name: cls?.name ?? p.name }
            : p,
        )
      } else if (proj) {
        // Drop the project + its sections; tasks become unfiled, recurring go.
        projects = projects.filter((p) => p.id !== proj.id)
        taskSections = taskSections.filter((s) => s.projectId !== proj.id)
        tasks = tasks.map((t) => (t.projectId === proj.id ? { ...t, projectId: null, sectionId: null } : t))
        recurring = recurring.filter((r) => r.projectId !== proj.id)
      }
      const goneUploads = new Set(state.binderUploads.filter((u) => u.classId === a.id).map((u) => u.id))
      return {
        ...state,
        classes: state.classes.filter((c) => c.id !== a.id),
        events: state.events.filter((e) => e.classId !== a.id),
        projects, taskSections, tasks: detachUploads(tasks, goneUploads), recurring,
        hiddenCalendars: state.hiddenCalendars.filter((h) => h !== a.id),
        binderSections: state.binderSections.filter((s) => s.classId !== a.id),
        binderUploads: state.binderUploads.filter((u) => u.classId !== a.id),
        // The grade tracker is per class, so it goes with the class.
        gradeRows: state.gradeRows.filter((r) => r.classId !== a.id),
        binderPosts: state.binderPosts.filter((p) => p.classId !== a.id),
        // Sessions survive the class; they just become unassigned (grey).
        studySessions: state.studySessions.map((s) => (s.classId === a.id ? { ...s, classId: null } : s)),
        // Flashcard counts fold into General so the daily totals are preserved.
        ankiLogs: mergeAnkiIntoGeneral(state.ankiLogs, a.id),
      }
    }

    case 'toggleCalendar':
      return {
        ...state,
        hiddenCalendars: state.hiddenCalendars.includes(a.id)
          ? state.hiddenCalendars.filter((h) => h !== a.id)
          : [...state.hiddenCalendars, a.id],
      }
    case 'addCalendar': {
      // Adding a calendar auto-creates its blank project (with no sections).
      const cal: CustomCalendar = { id: uid(), name: a.name, color: a.color }
      const project = makeCalendarProject(cal.id, cal.name, cal.color)
      return {
        ...state,
        customCalendars: [...state.customCalendars, cal],
        projects: [...state.projects, project],
      }
    }
    case 'updateCalendar':
      return {
        ...state,
        customCalendars: state.customCalendars.map((c) => (c.id === a.cal.id ? a.cal : c)),
        projects: state.projects.map((p) =>
          p.calendarId === a.cal.id ? { ...p, name: a.cal.name, color: a.cal.color } : p,
        ),
      }
    case 'deleteCalendar': {
      // Move all tasks & sections of this calendar's project onto Personal so
      // nothing is lost. The sections keep their names/order (appended).
      const doomedProj = state.projects.find((p) => p.calendarId === a.id)
      const personalProj = state.projects.find((p) => p.calendarId === 'personal')
      let taskSections = state.taskSections
      let tasks = state.tasks
      let recurring = state.recurring
      let projects = state.projects
      if (doomedProj) {
        if (personalProj) {
          const base = taskSections.filter((s) => s.projectId === personalProj.id).length
          const remap = new Map<ID, ID>() // old section id -> new (rehomed) section id
          const moved: TaskSection[] = []
          taskSections
            .filter((s) => s.projectId === doomedProj.id)
            .forEach((s, i) => {
              const ns: TaskSection = { id: s.id, projectId: personalProj.id, name: s.name, order: base + i }
              moved.push(ns)
              remap.set(s.id, ns.id)
            })
          taskSections = [...taskSections.filter((s) => s.projectId !== doomedProj.id), ...moved]
          tasks = tasks.map((t) =>
            t.projectId === doomedProj.id
              ? { ...t, projectId: personalProj.id, sectionId: remap.get(t.sectionId ?? '') ?? null }
              : t,
          )
          recurring = recurring.map((r) =>
            r.projectId === doomedProj.id
              ? { ...r, projectId: personalProj.id, sectionId: remap.get(r.sectionId ?? '') ?? null }
              : r,
          )
          projects = projects.filter((p) => p.id !== doomedProj.id)
        } else {
          // Should never happen (blankState/seed always include Personal).
          taskSections = taskSections.filter((s) => s.projectId !== doomedProj.id)
          tasks = tasks.map((t) => (t.projectId === doomedProj.id ? { ...t, projectId: null, sectionId: null } : t))
          recurring = recurring.filter((r) => r.projectId !== doomedProj.id)
          projects = projects.filter((p) => p.id !== doomedProj.id)
        }
      }
      return {
        ...state,
        customCalendars: state.customCalendars.filter((c) => c.id !== a.id),
        events: state.events.map((e) => (e.calendarId === a.id ? { ...e, calendarId: null } : e)),
        projects, taskSections, tasks, recurring,
        hiddenCalendars: state.hiddenCalendars.filter((h) => h !== a.id),
      }
    }
    case 'toggleDayOff':
      return {
        ...state,
        daysOff: state.daysOff.includes(a.date)
          ? state.daysOff.filter((d) => d !== a.date)
          : [...state.daysOff, a.date],
      }
    case 'toggleTasksOnCalendar':
      return { ...state, showTasksOnCalendar: !state.showTasksOnCalendar }
    case 'setTheme':
      return { ...state, theme: a.theme }
    case 'setWeekStart':
      return { ...state, weekStart: a.weekStart }
    case 'setThemeConfig':
      // A fixed mode applies immediately; 'auto' resolution is an effect's job.
      return {
        ...state,
        themeConfig: a.config,
        theme: a.config.mode === 'auto' ? state.theme : a.config.mode,
      }
    case 'setIcsUrl':
      return state.icsUrl === a.url ? state : { ...state, icsUrl: a.url }

    /**
     * Static import from an .ics file: plain events, no icsUid/origin, so the
     * live sync never touches them. One action = one undo step for the lot.
     */
    case 'importEvents': {
      if (!a.events.length) return state
      const n = a.events.length
      return {
        ...state,
        events: [...state.events, ...a.events],
        notifications: [...state.notifications, {
          id: uid(), at: new Date().toISOString(), kind: 'imported',
          title: `Imported ${n} event${n === 1 ? '' : 's'}${a.source ? ` from ${a.source}` : ''}`,
        }],
      }
    }

    case 'applySync': {
      const now = new Date().toISOString()
      const parsed = a.parsed.filter((p) => !state.deletedUids.includes(p.uid))
      const byUid = new Map(state.events.filter((e) => e.icsUid).map((e) => [e.icsUid!, e]))
      const firstSync = state.lastSync === null && byUid.size === 0

      let events = [...state.events]
      let classes = [...state.classes]
      let projects = [...state.projects]
      let taskSections = [...state.taskSections]
      let binderSections = [...state.binderSections]
      let notifications = [...state.notifications]
      const patchEvent = (id: ID, patch: Partial<CalEvent>) => {
        events = events.map((e) => (e.id === id ? { ...e, ...patch } : e))
      }

      // Match feed events to a class by hidden module code, creating classes on demand.
      const ensureClassId = (title: string): ID | null => {
        const code = moduleCodeFrom(title)
        if (!code) return null
        const existing = classes.find((c) => c.code === code)
        if (existing) return existing.id
        const used = new Set(classes.map((c) => c.color))
        const color = state.palette.find((c) => !used.has(c)) ?? state.palette[classes.length % state.palette.length] ?? '#7faee8'
        const bundle = makeClassBundle(code, color, code)
        classes = [...classes, bundle.cls]
        projects = [...projects, bundle.project]
        taskSections = [...taskSections, ...bundle.taskSections]
        binderSections = [...binderSections, ...bundle.sections]
        return bundle.cls.id
      }

      const seen = new Set<string>()
      let addedCount = 0
      for (const p of parsed) {
        seen.add(p.uid)
        const existing = byUid.get(p.uid)
        const next = snapshotOf(p)
        if (!existing) {
          const ev: CalEvent = {
            id: uid(), title: p.title, classId: ensureClassId(p.title),
            date: p.date, allDay: p.allDay, startMin: p.startMin, endMin: p.endMin,
            repeat: 'none', location: p.location || undefined, notes: p.description || undefined,
            icsUid: p.uid, origin: next,
          }
          events = [...events, ev]
          addedCount++
          if (!firstSync) {
            notifications = [...notifications, {
              id: uid(), at: now, kind: 'added', title: p.title,
              body: `${fmtWhen(next)}${p.location ? ' · ' + p.location : ''}`, eventId: ev.id,
            }]
          }
        } else {
          const origin = existing.origin ?? next
          const diffs = diffSnapshot(origin, next)
          // Always advance the hidden snapshot; the user's own values stay put
          // until they accept individual changes from the notification.
          patchEvent(existing.id, { origin: next, syncMissing: false })
          if (diffs.length) {
            notifications = [
              ...notifications.filter((n) => !(n.kind === 'edited' && n.eventId === existing.id)),
              { id: uid(), at: now, kind: 'edited', title: existing.title, eventId: existing.id, diffs },
            ]
          }
        }
      }

      for (const [icsUid, ev] of byUid) {
        if (!seen.has(icsUid) && !ev.syncMissing) {
          patchEvent(ev.id, { syncMissing: true })
          notifications = [...notifications, {
            id: uid(), at: now, kind: 'removed', title: ev.title,
            body: ev.origin ? fmtWhen(ev.origin) : undefined, eventId: ev.id,
          }]
        }
      }

      if (firstSync && addedCount > 0) {
        notifications = [...notifications, {
          id: uid(), at: now, kind: 'imported',
          title: `Imported ${addedCount} event${addedCount === 1 ? '' : 's'} from your live calendar`,
        }]
      }

      return { ...state, events, classes, projects, taskSections, binderSections, notifications, lastSync: now }
    }

    case 'resolveRemoved': {
      const notif = state.notifications.find((n) => n.id === a.notifId)
      if (!notif) return state
      const rest = state.notifications.filter((n) => n.id !== a.notifId)
      if (a.keep || !notif.eventId) return { ...state, notifications: rest }
      const ev = state.events.find((e) => e.id === notif.eventId)
      return {
        ...state,
        notifications: rest,
        events: state.events.filter((e) => e.id !== notif.eventId),
        deletedUids: ev?.icsUid ? [...state.deletedUids, ev.icsUid] : state.deletedUids,
      }
    }

    case 'applyEdited': {
      const notif = state.notifications.find((n) => n.id === a.notifId)
      if (!notif) return state
      const patch: Partial<CalEvent> = {}
      for (const d of notif.diffs ?? []) {
        if (a.keys.includes(d.key)) Object.assign(patch, d.patch)
      }
      return {
        ...state,
        events: state.events.map((e) => (e.id === notif.eventId ? { ...e, ...patch } : e)),
        notifications: state.notifications.filter((n) => n.id !== a.notifId),
      }
    }

    case 'dismissNotification':
      return { ...state, notifications: state.notifications.filter((n) => n.id !== a.id) }

    case 'addPaletteColor':
      return state.palette.includes(a.color) ? state : { ...state, palette: [...state.palette, a.color] }
    case 'removePaletteColor':
      return { ...state, palette: state.palette.filter((c) => c !== a.color) }

    case 'addBinderSection':
      return {
        ...state,
        binderSections: [...state.binderSections, { id: uid(), classId: a.classId, name: a.name }],
      }
    case 'renameBinderSection':
      return {
        ...state,
        binderSections: state.binderSections.map((s) => (s.id === a.id ? { ...s, name: a.name } : s)),
      }
    case 'deleteBinderSection': {
      const doomed = state.binderSections.find((s) => s.id === a.id)
      if (!doomed) return state
      // Uploads move to the class's first remaining section (UI blocks
      // deleting the last section of a class).
      const fallback = state.binderSections.find((s) => s.classId === doomed.classId && s.id !== a.id)
      if (!fallback) return state
      return {
        ...state,
        binderSections: state.binderSections.filter((s) => s.id !== a.id),
        binderUploads: state.binderUploads.map((u) =>
          u.sectionId === a.id ? { ...u, sectionId: fallback.id } : u,
        ),
      }
    }
    case 'addBinderUpload':
      return { ...state, binderUploads: [...state.binderUploads, a.upload] }
    case 'updateBinderUpload':
      return { ...state, binderUploads: state.binderUploads.map((u) => (u.id === a.upload.id ? a.upload : u)) }
    case 'deleteBinderUpload':
      return {
        ...state,
        binderUploads: state.binderUploads.filter((u) => u.id !== a.id),
        tasks: detachUploads(state.tasks, new Set([a.id])),
      }
    case 'addBinderPost':
      return { ...state, binderPosts: [...state.binderPosts, a.post] }
    case 'updateBinderPost':
      return { ...state, binderPosts: state.binderPosts.map((p) => (p.id === a.post.id ? a.post : p)) }
    case 'deleteBinderPost':
      return { ...state, binderPosts: state.binderPosts.filter((p) => p.id !== a.id) }

    case 'startStudySession':
      // Only one session may be running at a time.
      if (state.studySessions.some((s) => s.endMin === null)) return state
      return { ...state, studySessions: [...state.studySessions, a.session] }
    case 'endStudySession': {
      const s = state.studySessions.find((x) => x.id === a.id)
      if (!s || s.endMin !== null) return state
      const ended: StudySession = {
        ...s,
        endMin: Math.min(Math.max(a.endMin, s.startMin), 24 * 60),
      }
      // Freeze the pomodoro rhythm into the record so it never drifts again.
      return {
        ...state,
        studySessions: state.studySessions.map((x) =>
          x.id === a.id ? { ...ended, breaks: derivedBreaks(ended, ended.endMin!) } : x,
        ),
      }
    }
    case 'updateStudySession':
      return {
        ...state,
        studySessions: state.studySessions.map((s) => (s.id === a.session.id ? a.session : s)),
      }
    case 'deleteStudySession':
      return { ...state, studySessions: state.studySessions.filter((s) => s.id !== a.id) }
    case 'startBreak': {
      const now = nowMinutes()
      return {
        ...state,
        studySessions: state.studySessions.map((s) =>
          s.id === a.id && s.endMin === null
            ? { ...s, breaks: [...s.breaks, { startMin: now, durMin: a.durMin }] }
            : s,
        ),
      }
    }
    case 'endBreakNow': {
      const now = nowMinutes()
      return {
        ...state,
        studySessions: state.studySessions.map((s) => {
          if (s.id !== a.id) return s
          const breaks = s.breaks
            .map((b) =>
              now >= b.startMin && now < b.startMin + b.durMin ? { ...b, durMin: now - b.startMin } : b,
            )
            .filter((b) => b.durMin > 0)
          return { ...s, breaks }
        }),
      }
    }

    case 'addGradeRow':
      return {
        ...state,
        gradeRows: [
          ...state.gradeRows,
          { id: uid(), classId: a.classId, name: a.name?.trim() || 'New component', taskIds: [] },
        ],
      }
    case 'updateGradeRow':
      return state.gradeRows.some((r) => r.id === a.row.id)
        ? { ...state, gradeRows: state.gradeRows.map((r) => (r.id === a.row.id ? a.row : r)) }
        : state
    case 'deleteGradeRow':
      return state.gradeRows.some((r) => r.id === a.id)
        ? { ...state, gradeRows: state.gradeRows.filter((r) => r.id !== a.id) }
        : state

    /**
     * One (date, deck) pair holds one number, so logging is also how the user
     * corrects a day after the fact (retype it, or set 0 to wipe the entry).
     */
    case 'logAnki': {
      const count = Math.max(0, Math.round(a.count))
      const classId = a.classId ?? null
      const at = state.ankiLogs.findIndex((l) => l.date === a.date && (l.classId ?? null) === classId)
      if (at < 0) {
        return count === 0 ? state : { ...state, ankiLogs: [...state.ankiLogs, { date: a.date, classId, count }] }
      }
      if (state.ankiLogs[at].count === count) return state
      return {
        ...state,
        ankiLogs: count === 0
          ? state.ankiLogs.filter((_, i) => i !== at)
          : state.ankiLogs.map((l, i) => (i === at ? { ...l, count } : l)),
      }
    }

    case 'addFolder':
      return { ...state, folders: [...state.folders, { id: uid(), name: a.name, collapsed: false }] }
    case 'renameFolder':
      return { ...state, folders: state.folders.map((f) => (f.id === a.id ? { ...f, name: a.name } : f)) }
    case 'deleteFolder':
      return {
        ...state,
        folders: state.folders.filter((f) => f.id !== a.id),
        classes: state.classes.map((c) => (c.folderId === a.id ? { ...c, folderId: null, pinnedFolder: undefined } : c)),
      }
    case 'toggleFolderCollapse':
      return { ...state, folders: state.folders.map((f) => (f.id === a.id ? { ...f, collapsed: !f.collapsed } : f)) }
    case 'reorderFolder': {
      const moving = state.folders.find((f) => f.id === a.id)
      if (!moving || a.id === a.beforeId) return state
      const rest = state.folders.filter((f) => f.id !== a.id)
      const at = a.beforeId ? rest.findIndex((f) => f.id === a.beforeId) : rest.length
      return { ...state, folders: [...rest.slice(0, at < 0 ? rest.length : at), moving, ...rest.slice(at < 0 ? rest.length : at)] }
    }
    case 'moveClass': {
      const moving = state.classes.find((c) => c.id === a.id)
      if (!moving || a.id === a.beforeClassId) return state
      const moved = { ...moving, folderId: a.folderId }
      const rest = state.classes.filter((c) => c.id !== a.id)
      const at = a.beforeClassId ? rest.findIndex((c) => c.id === a.beforeClassId) : -1
      const idx = at < 0 ? rest.length : at
      return { ...state, classes: [...rest.slice(0, idx), moved, ...rest.slice(idx)] }
    }
    case 'toggleClassPin':
      return {
        ...state,
        classes: state.classes.map((c) =>
          c.id === a.id
            ? a.scope === 'binder'
              ? { ...c, pinnedBinder: !c.pinnedBinder || undefined }
              : { ...c, pinnedFolder: !c.pinnedFolder || undefined }
            : c,
        ),
      }

    case 'toggleTaskPin':
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === a.id ? { ...t, pinned: !t.pinned || undefined } : t)),
      }
    case 'setNlQuickAdd':
      return state.nlQuickAdd === a.on ? state : { ...state, nlQuickAdd: a.on || undefined }
    case 'setTaskCheckStyle':
      return (state.taskCheckStyle ?? 'checkbox') === a.style ? state : { ...state, taskCheckStyle: a.style }
    case 'setShowGhosts': {
      if ((state.showGhosts ?? true) === a.on) return state
      // Switching ghosts back on brings the dismissed ones back with them:
      // the toggle is the master switch, the × is a per-ghost snooze.
      const tasks = a.on
        ? state.tasks.map((t) =>
          t.ghosts?.some((g) => g.dismissed)
            ? { ...t, ghosts: t.ghosts.map((g) => (g.dismissed ? { ...g, dismissed: undefined } : g)) }
            : t)
        : state.tasks
      return { ...state, showGhosts: a.on, tasks }
    }
    case 'setStudyGoal':
      return state.studyGoalMin === a.minutes ? state : { ...state, studyGoalMin: a.minutes }

    /**
     * The day's log is edited one control at a time, so every dispatch is a
     * merge. Emptying the last field removes the date's record entirely rather
     * than leaving a husk of empty strings behind.
     */
    case 'updateDayLog': {
      const prev = state.dayLogs[a.date]
      const next = cleanDayLog({ ...prev, ...a.patch, meals: { ...prev?.meals, ...a.patch.meals } })
      if (sameDayLog(prev, next)) return state
      const dayLogs = { ...state.dayLogs }
      if (next) dayLogs[a.date] = next
      else delete dayLogs[a.date]
      return { ...state, dayLogs }
    }

    case 'setLocation': {
      const label = a.location?.label?.trim()
      const hemisphere = a.location?.hemisphere
      const next = label || hemisphere ? { ...(label ? { label } : null), ...(hemisphere ? { hemisphere } : null) } : undefined
      const cur = state.location
      if ((cur?.label ?? '') === (next?.label ?? '') && (cur?.hemisphere ?? '') === (next?.hemisphere ?? '')) return state
      return { ...state, location: next }
    }

    case 'setCollapseAllDay':
      return (state.collapseAllDay ?? false) === a.on ? state : { ...state, collapseAllDay: a.on || undefined }
    case 'setCollapseJournal':
      return (state.collapseJournal ?? false) === a.on ? state : { ...state, collapseJournal: a.on || undefined }

    case 'replaceState':
      return a.state
  }
}

function fmtWhen(s: { date: string; allDay: boolean; startMin: number }): string {
  return s.allDay ? `${fmtFriendly(s.date)} · all day` : `${fmtFriendly(s.date)} · ${fmtTime(s.startMin)}`
}

// ---------- Undo / redo history ----------

/** Dispatched by the keyboard shortcuts and the TopBar arrows. */
export type HistoryAction = { type: 'undo' } | { type: 'redo' }
export type AnyAction = Action | HistoryAction

/**
 * The wrapper state around the app reducer. Only `present` is ever persisted —
 * `past`/`future` are session memory and start empty around the loaded state.
 * `lastType`/`lastAt` power coalescing and live here (never in AppState) so the
 * bookkeeping stays pure under React's StrictMode double-invoke.
 */
interface History {
  past: AppState[]
  present: AppState
  future: AppState[]
  lastType: Action['type'] | null
  lastAt: number
}

/** How many undo steps we keep; the oldest is dropped beyond this. */
const HISTORY_LIMIT = 100
/** Same action type again within this window folds into the previous entry. */
const COALESCE_MS = 1000

/**
 * Applied without recording a history entry:
 *  - setTheme: cosmetic, undoing it would be a surprise.
 */
const SKIP_HISTORY = new Set<Action['type']>([
  'setTheme', 'setWeekStart', 'setThemeConfig', 'setNlQuickAdd', 'setStudyGoal',
  'setTaskCheckStyle', 'setShowGhosts', 'setLocation', 'setCollapseAllDay', 'setCollapseJournal',
])

/**
 * Actions that wipe past+future once they actually change something:
 *  - replaceState: wholesale replacement (backup import, "delete all data").
 *    Undoing past it would confuse, and could resurrect personal data the user
 *    deliberately cleared.
 *  - applySync: the live feed is the source of truth for synced events, and the
 *    sync fires automatically on app open — undoing across it would silently
 *    throw away what the school just published.
 * A sync the reducer refuses (returns the same state) never gets this far: the
 * no-op guard below leaves history untouched.
 */
const CLEAR_HISTORY = new Set<Action['type']>(['replaceState', 'applySync'])

/**
 * Fields that survive an undo/redo untouched. The theme is skipped by history
 * (see SKIP_HISTORY) but still lives inside AppState, so a restored snapshot
 * would otherwise drag an old theme back with it.
 */
function keepUnversioned(restored: AppState, current: AppState): AppState {
  if (
    restored.theme === current.theme &&
    restored.weekStart === current.weekStart &&
    restored.themeConfig === current.themeConfig &&
    restored.taskCheckStyle === current.taskCheckStyle &&
    restored.showGhosts === current.showGhosts &&
    restored.location === current.location &&
    restored.collapseAllDay === current.collapseAllDay &&
    restored.collapseJournal === current.collapseJournal
  ) return restored
  return {
    ...restored,
    theme: current.theme, weekStart: current.weekStart, themeConfig: current.themeConfig,
    taskCheckStyle: current.taskCheckStyle, showGhosts: current.showGhosts,
    location: current.location,
    collapseAllDay: current.collapseAllDay, collapseJournal: current.collapseJournal,
  }
}

function historyReducer(h: History, action: AnyAction): History {
  if (action.type === 'undo') {
    if (!h.past.length) return h
    const present = keepUnversioned(h.past[h.past.length - 1], h.present)
    return {
      past: h.past.slice(0, -1),
      present,
      future: [h.present, ...h.future],
      lastType: null, // never coalesce onto a restored entry
      lastAt: 0,
    }
  }
  if (action.type === 'redo') {
    if (!h.future.length) return h
    return {
      past: [...h.past, h.present],
      present: keepUnversioned(h.future[0], h.present),
      future: h.future.slice(1),
      lastType: null,
      lastAt: 0,
    }
  }

  const a: Action = action
  const next = reducer(h.present, a)
  if (next === h.present) return h // no-op: don't record, don't re-render

  if (CLEAR_HISTORY.has(a.type)) {
    return { past: [], present: next, future: [], lastType: null, lastAt: 0 }
  }
  if (SKIP_HISTORY.has(a.type)) {
    return { ...h, present: next }
  }

  const now = Date.now()
  // Typing bursts (updateClass / updateBinderPost / renameFolder / …) collapse
  // into the entry they started, so one undo reverts the whole burst.
  if (h.lastType === a.type && h.past.length > 0 && now - h.lastAt < COALESCE_MS) {
    return { ...h, present: next, future: [], lastAt: now }
  }

  const past = h.past.length >= HISTORY_LIMIT
    ? [...h.past.slice(h.past.length - HISTORY_LIMIT + 1), h.present]
    : [...h.past, h.present]
  return { past, present: next, future: [], lastType: a.type, lastAt: now }
}

/** True when the keydown happened in a text field (leave native undo alone). */
function isTextTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el || !el.tagName) return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true
}

// ---------- Context ----------

interface StoreValue {
  state: AppState
  dispatch: React.Dispatch<AnyAction>
  canUndo: boolean
  canRedo: boolean
}

const StoreCtx = createContext<StoreValue | null>(null)

/**
 * Demo installs auto-refresh to the latest example data: if the stored state
 * isn't user-owned (never blanked, never imported) and predates the current
 * SEED_VERSION, discard it and reseed. Bump SEED_VERSION whenever seed()
 * changes so this delivers the new demo data on next load. User-owned data
 * (blankState or an imported backup) is never touched.
 */
function loadOrSeed(): AppState {
  const stored = loadState()
  if (stored && !stored.userOwned && (stored.seedVersion ?? 0) < SEED_VERSION) return seed()
  return stored ?? seed()
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [hist, dispatch] = useReducer(historyReducer, undefined, (): History => ({
    past: [], present: migrate(loadOrSeed()), future: [], lastType: null, lastAt: 0,
  }))
  const state = hist.present
  useEffect(() => saveState(state), [state])
  // Make sure the example binder uploads have real (openable) file blobs.
  useEffect(() => {
    void ensureSeedFiles(state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = state.theme
  }, [state.theme])

  // Auto theme: resolve light/dark from the current time vs. lightStart/darkStart
  // whenever mode is 'auto'. Re-checked every 60s and whenever the config changes.
  // Fixed modes ('light'/'dark') are resolved by the reducer on setThemeConfig — nothing to do here.
  useEffect(() => {
    if (state.themeConfig.mode !== 'auto') return
    const toMin = (hm: string) => {
      const [h, m] = hm.split(':').map(Number)
      return h * 60 + m
    }
    const check = () => {
      const nowMin = nowMinutes()
      const lightMin = toMin(state.themeConfig.lightStart)
      const darkMin = toMin(state.themeConfig.darkStart)
      // Light window is [lightStart, darkStart); it can wrap past midnight.
      const inLightWindow = lightMin <= darkMin
        ? nowMin >= lightMin && nowMin < darkMin
        : nowMin >= lightMin || nowMin < darkMin
      const resolved: 'light' | 'dark' = inLightWindow ? 'light' : 'dark'
      if (resolved !== state.theme) dispatch({ type: 'setTheme', theme: resolved })
    }
    check()
    const t = setInterval(check, 60_000)
    return () => clearInterval(t)
  }, [state.themeConfig, state.theme])

  // Global undo/redo: Ctrl/Cmd+Z, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey !== e.metaKey // exactly one of ctrl/cmd
      if (!mod || e.altKey) return
      const key = e.key.toLowerCase()
      if (key !== 'z' && key !== 'y') return
      if (isTextTarget(e.target)) return // let text fields keep native undo
      if (key === 'y' && e.shiftKey) return
      dispatch({ type: key === 'y' || e.shiftKey ? 'redo' : 'undo' })
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const value = useMemo<StoreValue>(
    () => ({ state, dispatch, canUndo: hist.past.length > 0, canRedo: hist.future.length > 0 }),
    [state, hist.past.length, hist.future.length],
  )
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore() {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore outside provider')
  return ctx
}

// ---------- Derived helpers ----------

export function classById(state: AppState, id: ID | null): ClassInfo | null {
  return id ? state.classes.find((c) => c.id === id) ?? null : null
}

export function projectById(state: AppState, id: ID | null): Project | null {
  return id ? state.projects.find((p) => p.id === id) ?? null : null
}

/**
 * The project that owns the tasks of one calendar — the inverse of
 * `taskCalendarId`. Projects are 1:1 with classes and calendars, so an event's
 * (classId, calendarId) picks exactly one; an absent calendarId means Personal.
 * Null only when the class/calendar has no project left (see deleteClass).
 */
export function projectForCalendar(
  state: AppState, classId: ID | null, calendarId?: ID | null,
): ID | null {
  if (classId) return state.projects.find((p) => p.classId === classId)?.id ?? null
  const calId = calendarId ?? 'personal'
  return state.projects.find((p) => p.classId == null && (p.calendarId ?? 'personal') === calId)?.id ?? null
}

/** Color for a task: its project's class color, else the project's calendar color, else neutral. */
export function taskColor(state: AppState, projectId: ID | null): string {
  const p = projectById(state, projectId)
  if (!p) return '#9aa0a6'
  const c = classById(state, p.classId)
  if (c) return c.color
  if (p.calendarId && p.calendarId !== 'personal') {
    const cal = state.customCalendars.find((cc) => cc.id === p.calendarId)
    if (cal) return cal.color
  }
  return p.color
}

/**
 * Display order of one task list (Unfiled, a project's main list, a section).
 * Manual `order` wins as soon as the user has dragged anything in that list;
 * until then the old dated-first-then-undated sort applies. Tasks added after a
 * drag have no order yet and sit at the end.
 */
export function sortTaskList(list: Task[]): Task[] {
  if (list.some((t) => t.order != null)) {
    return [...list].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))
  }
  const dated = list.filter((t) => t.date != null).sort((a, b) => (a.date! < b.date! ? -1 : 1))
  return [...dated, ...list.filter((t) => t.date == null)]
}

/**
 * Archive order for one list's completed tasks: most recently finished first.
 * Tasks completed before `completedAt` existed carry no stamp and sit last, in
 * their normal list order.
 */
export function sortArchived(list: Task[]): Task[] {
  const stamped = list.filter((t) => t.completedAt).sort((a, b) => (a.completedAt! < b.completedAt! ? 1 : -1))
  return [...stamped, ...list.filter((t) => !t.completedAt)]
}

/** Name of the folder a class sits in (for the faint hint next to class names). */
export function folderNameOf(state: AppState, cls: ClassInfo): string | null {
  if (!cls.folderId) return null
  return state.folders.find((f) => f.id === cls.folderId)?.name ?? null
}

export interface ClassGroup {
  folder: ClassFolder | null // null = unfoldered classes (rendered first)
  classes: ClassInfo[]
}

/**
 * Classes grouped for display: unfoldered first (array order), then each
 * folder in folder order. With `binderPins`, folder-pinned classes float to
 * the top of their folder (calendar sidebar ignores pins).
 */
export function groupedClasses(state: AppState, binderPins = false): ClassGroup[] {
  const inFolder = (fid: ID | null) => {
    const list = state.classes.filter((c) => (c.folderId ?? null) === fid)
    if (!binderPins) return list
    return [...list.filter((c) => c.pinnedFolder), ...list.filter((c) => !c.pinnedFolder)]
  }
  return [
    { folder: null, classes: inFolder(null) },
    ...state.folders.map((f) => ({ folder: f, classes: inFolder(f.id) })),
  ].filter((g) => g.folder !== null || g.classes.length > 0)
}

/**
 * Classes as ColorSelect option blocks, grouped exactly the way the calendar
 * sidebar shows them: unfoldered classes first with no heading, then one block
 * per folder. `toValue` maps a class id onto the dropdown's option value.
 */
export function classColorGroups(
  state: AppState,
  toValue: (id: ID) => string = (id) => id,
): ColorGroup[] {
  return groupedClasses(state)
    .filter((g) => g.classes.length > 0)
    .map((g) => ({
      heading: g.folder?.name,
      options: g.classes.map((c) => ({ value: toValue(c.id), label: c.name, color: c.color })),
    }))
}

/** Small label shown above a task on the calendar: its class name, else its project name. */
export function taskLabel(state: AppState, projectId: ID | null): string | null {
  const p = projectById(state, projectId)
  if (!p) return null
  const calId = taskCalendarId(state, projectId)
  const cls = calId !== 'personal' ? classById(state, calId) : null
  return cls ? cls.name : p.name
}

/**
 * The calendar id a task belongs to for visibility filtering: its project's
 * classId (a class), else the project's calendarId ('personal' or a custom
 * calendar id). Projects are flat (one per class/calendar).
 */
export function taskCalendarId(state: AppState, projectId: ID | null): string {
  const p = projectById(state, projectId)
  if (!p) return 'personal'
  if (p.classId) return p.classId
  return p.calendarId ?? 'personal'
}

export function defaultFreq(): Freq {
  return 'daily'
}
