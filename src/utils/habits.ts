/**
 * Habit-tracker gantt helpers.
 *
 * Two kinds of goal share one list. A YEAR goal ('2026') trickles down: it
 * shows in every month, week and day grid of that year. A MONTH goal
 * ('2026-08') lives inside its own month only — the layer that resets monthly.
 * Everything below is pure; the components own the dispatching.
 */

import type { AppState, HabitGoal, ID } from '../types'
import { daysBetween, fromISO, toISO } from './date'

/** 'YYYY' for an ISO date — the period key of that date's year goals. */
export const yearOf = (iso: string): string => iso.slice(0, 4)
/** 'YYYY-MM' for an ISO date — the period key of that date's month goals. */
export const monthOf = (iso: string): string => iso.slice(0, 7)

const byOrder = (a: HabitGoal, b: HabitGoal) => a.order - b.order

/** Just the year goals of 'YYYY', in order. */
export function yearGoals(state: AppState, year: string): HabitGoal[] {
  return state.habitGoals.filter((g) => g.period === year).sort(byOrder)
}

/** Every goal that applies to a 'YYYY-MM': the year's goals first, then its own. */
export function goalsForMonth(state: AppState, period: string): HabitGoal[] {
  return [...yearGoals(state, period.slice(0, 4)), ...state.habitGoals.filter((g) => g.period === period).sort(byOrder)]
}

/** Every goal that applies to a single day (its month's list — see above). */
export function goalsForDate(state: AppState, iso: string): HabitGoal[] {
  return goalsForMonth(state, monthOf(iso))
}

export const isYearGoal = (g: HabitGoal): boolean => g.period.length === 4

export function isTicked(state: AppState, goalId: ID, iso: string): boolean {
  return !!state.habitTicks[iso]?.includes(goalId)
}

/** Days in `from`..`to` (inclusive) on which the goal is ticked. */
export function ticksInRange(state: AppState, goalId: ID, from: string, to: string): number {
  if (to < from) return 0
  let n = 0
  for (const [date, ids] of Object.entries(state.habitTicks)) {
    if (date >= from && date <= to && ids.includes(goalId)) n++
  }
  return n
}

/**
 * Progress over a window, counted only as far as it has actually happened:
 * `elapsed` stops at today, so a month still running is scored on the days
 * lived rather than the days planned. A window entirely in the future has
 * nothing to score and reports `pct: null`.
 */
export interface Progress { done: number; elapsed: number; pct: number | null }

export function progress(state: AppState, goalId: ID, from: string, to: string, today: string): Progress {
  const end = to < today ? to : today
  const elapsed = end < from ? 0 : daysBetween(from, end) + 1
  const done = ticksInRange(state, goalId, from, end)
  return { done, elapsed, pct: elapsed > 0 ? Math.round((done / elapsed) * 100) : null }
}

/** Every date of a month, as ISO strings. */
export function monthDates(year: number, month: number): string[] {
  const n = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: n }, (_, i) => toISO(new Date(year, month, i + 1)))
}

/** Every date of a year, as ISO strings (365 or 366 of them). */
export function yearDates(year: number): string[] {
  const out: string[] = []
  for (let m = 0; m < 12; m++) out.push(...monthDates(year, m))
  return out
}

/** The 'YYYY-MM' before a given one — where a carry-over reads its goals from. */
export function prevMonthPeriod(period: string): string {
  const d = fromISO(`${period}-01`)
  return toISO(new Date(d.getFullYear(), d.getMonth() - 1, 1)).slice(0, 7)
}
