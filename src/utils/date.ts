/** Date helpers. All dates are local; ISO date strings are 'YYYY-MM-DD'. */

import { t } from '../i18n'

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayISO(): string {
  return toISO(new Date())
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/** Week starts on `weekStart` (0=Sunday, 1=Monday, 6=Saturday; default Sunday). */
export function startOfWeek(d: Date, weekStart: 0 | 1 | 6 = 0): Date {
  const diff = (d.getDay() - weekStart + 7) % 7
  return addDays(d, -diff)
}

/** Whole days from ISO date `a` to ISO date `b` (negative = backwards). */
export function daysBetween(a: string, b: string): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000)
}

export function isSameDay(a: Date, b: Date): boolean {
  return toISO(a) === toISO(b)
}

export function nowMinutes(): number {
  const n = new Date()
  return n.getHours() * 60 + n.getMinutes()
}

export function fmtTime(min: number): string {
  let h = Math.floor(min / 60)
  const m = min % 60
  const ap = h >= 12 ? 'pm' : 'am'
  h = h % 12
  if (h === 0) h = 12
  return m === 0 ? `${h}${ap}` : `${h}:${String(m).padStart(2, '0')}${ap}`
}

export function fmtHourLabel(h: number): string {
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

/** 'HH:MM' (from <input type=time>) → minutes since midnight */
export function hmToMin(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}

export function minToHm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** WEEKDAYS rotated so it starts on `weekStart` — for header rows that follow the week-start pref. */
export function weekdayLabels(weekStart: 0 | 1 | 6 = 0): string[] {
  return [...WEEKDAYS.slice(weekStart), ...WEEKDAYS.slice(0, weekStart)]
}
export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/* fmtDayHeader and fmtFriendly are display-only — nothing compares their
   output — so they translate in place rather than at each of their many call
   sites. WEEKDAYS itself stays English: it is the source array, and quickAdd
   keeps its own private copy for parsing. */
export function fmtDayHeader(d: Date): { dow: string; date: string } {
  return { dow: t(WEEKDAYS[d.getDay()]), date: `${d.getMonth() + 1}/${d.getDate()}` }
}

export function fmtFriendly(iso: string): string {
  const d = fromISO(iso)
  const today = new Date()
  if (isSameDay(d, today)) return t('Today')
  if (isSameDay(d, addDays(today, 1))) return t('Tomorrow')
  if (isSameDay(d, addDays(today, -1))) return t('Yesterday')
  return `${t(WEEKDAYS[d.getDay()])} ${d.getMonth() + 1}/${d.getDate()}`
}

/** 6 rows x 7 cols of dates covering the month of `anchor`. */
export function monthMatrix(anchor: Date, weekStart: 0 | 1 | 6 = 0): Date[][] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  let cur = startOfWeek(first, weekStart)
  const rows: Date[][] = []
  for (let r = 0; r < 6; r++) {
    const row: Date[] = []
    for (let c = 0; c < 7; c++) {
      row.push(cur)
      cur = addDays(cur, 1)
    }
    rows.push(row)
  }
  return rows
}
