import type { AppState, GradeRow, ID, Task } from '../../types'

/** A row plus the weight it actually carries once the auto rows are settled. */
export interface WeightedRow {
  row: GradeRow
  weight: number
  /** True when the weight came from the even split rather than the row itself. */
  auto: boolean
}

export interface GradeSummary {
  rows: WeightedRow[]
  /** Sum of the weights the user typed in. */
  explicitTotal: number
  /** What each blank-weight row gets: the remainder of 100%, split evenly. */
  autoWeight: number
  autoCount: number
  /** The typed weights already add up to more than the whole course. */
  over: boolean
  /** Weight covered by rows that have a score — the share of the course marked. */
  scoredWeight: number
  /** Weighted average across the marked rows only; null until something is marked. */
  currentGrade: number | null
  /** Marks banked towards the final 100 (unmarked rows contribute nothing). */
  runningTotal: number
}

const hasNum = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)

/**
 * Resolve a class's grade rows into effective weights and the two headline
 * figures.
 *
 * Rows with a typed weight keep it. Everything left of 100% is shared evenly
 * between the rows that left the weight blank — so "midterm 40" alongside three
 * blank rows makes each blank one worth 20. Once the typed weights reach (or
 * pass) 100 the blank rows are worth nothing, and `over` flags the mistake.
 */
export function summariseGrades(rows: GradeRow[]): GradeSummary {
  const explicitTotal = rows.reduce((n, r) => n + (hasNum(r.weightPct) ? r.weightPct : 0), 0)
  const autoCount = rows.filter((r) => !hasNum(r.weightPct)).length
  const remainder = Math.max(0, 100 - explicitTotal)
  const autoWeight = autoCount ? remainder / autoCount : 0

  const weighted: WeightedRow[] = rows.map((row) =>
    hasNum(row.weightPct)
      ? { row, weight: row.weightPct, auto: false }
      : { row, weight: autoWeight, auto: true },
  )

  let scoredWeight = 0
  let points = 0
  for (const w of weighted) {
    if (!hasNum(w.row.scorePct)) continue
    scoredWeight += w.weight
    points += (w.weight * w.row.scorePct) / 100
  }

  return {
    rows: weighted,
    explicitTotal,
    autoWeight,
    autoCount,
    over: explicitTotal > 100,
    scoredWeight,
    currentGrade: scoredWeight > 0 ? (points / scoredWeight) * 100 : null,
    runningTotal: points,
  }
}

/** Percentages to at most one decimal, with no trailing ".0". */
export function fmtPct(n: number): string {
  return String(Math.round(n * 10) / 10)
}

/**
 * Parse a typed number cell. '' clears the field (null); anything that isn't a
 * number at all returns undefined, meaning "leave the stored value alone" so a
 * half-typed entry never wipes it.
 */
export function parseNumCell(raw: string): number | null | undefined {
  const s = raw.trim()
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n)) return undefined
  return Math.max(0, n)
}

/**
 * The tasks a grade row can bind: everything filed under this class's
 * assignments-flagged sections, newest first. Dated by deadline where there is
 * one, else by the day it is planned for; undated tasks sit at the end.
 */
export function assignmentTasks(state: AppState, classId: ID): Task[] {
  const project = state.projects.find((p) => p.classId === classId)
  if (!project) return []
  const flagged = new Set(
    state.taskSections.filter((s) => s.projectId === project.id && s.assignments).map((s) => s.id),
  )
  const when = (t: Task) => t.dueDate ?? t.date ?? ''
  return state.tasks
    .filter((t) => t.projectId === project.id && t.sectionId != null && flagged.has(t.sectionId))
    .sort((a, b) => {
      const ka = when(a)
      const kb = when(b)
      if (ka === kb) return 0
      if (!ka) return 1
      if (!kb) return -1
      return ka < kb ? 1 : -1
    })
}
