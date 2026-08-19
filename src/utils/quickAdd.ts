import type { Project } from '../types'
import { addDays, toISO } from './date'

export interface QuickAddResult {
  title: string
  projectId: string | null
  date: string | null
  startMin: number | null
  dueDate: string | null
  dueMin: number | null
  location: string | undefined
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const WEEKDAY_LONG = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
]
const MONTHS_LONG = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

function today(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function nextWeekday(from: Date, targetDow: number): Date {
  const cur = from.getDay()
  let delta = (targetDow - cur + 7) % 7
  if (delta === 0) delta = 7 // "tue" from Tue means the coming Tue
  return addDays(from, delta)
}

/** Parse a token that might be a date. Returns { date, consumed } or null. */
function parseDateToken(rest: string): { date: string; consumed: number } | null {
  const s = rest.trim()
  const lower = s.toLowerCase()

  // today / tomorrow / tmrw
  if (/^today\b/.test(lower)) return { date: toISO(today()), consumed: matchLen(s, /^today\b/i) }
  if (/^tomorrow\b/.test(lower)) return { date: toISO(addDays(today(), 1)), consumed: matchLen(s, /^tomorrow\b/i) }
  if (/^tmrw\b/.test(lower)) return { date: toISO(addDays(today(), 1)), consumed: matchLen(s, /^tmrw\b/i) }

  // weekday names
  for (let i = 0; i < WEEKDAY_LONG.length; i++) {
    const long = WEEKDAY_LONG[i]
    const short = WEEKDAYS[i]
    const reLong = new RegExp('^' + long + '\\b', 'i')
    const reShort = new RegExp('^' + short + '\\b', 'i')
    if (reLong.test(lower)) return { date: toISO(nextWeekday(today(), i)), consumed: matchLen(s, reLong) }
    if (reShort.test(lower)) return { date: toISO(nextWeekday(today(), i)), consumed: matchLen(s, reShort) }
  }

  // "aug 30" / "august 30"
  for (let mi = 0; mi < MONTHS_LONG.length; mi++) {
    const re = new RegExp('^(' + MONTHS_LONG[mi] + '|' + MONTHS[mi] + ')\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b', 'i')
    const m = re.exec(s)
    if (m) {
      const day = parseInt(m[2], 10)
      if (day >= 1 && day <= 31) {
        const y = today().getFullYear()
        const d = new Date(y, mi, day)
        // if the resulting date is in the past by more than a week, roll to next year
        const now = today()
        if (d.getTime() < now.getTime() - 7 * 86400000) d.setFullYear(y + 1)
        return { date: toISO(d), consumed: m[0].length }
      }
    }
  }

  // "30/8" or "30/8/26" (day/month)
  const slash = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(s)
  if (slash) {
    const day = parseInt(slash[1], 10)
    const month = parseInt(slash[2], 10)
    let year = slash[3] ? parseInt(slash[3], 10) : today().getFullYear()
    if (year < 100) year += 2000
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day)
      if (!slash[3]) {
        const now = today()
        if (d.getTime() < now.getTime() - 7 * 86400000) d.setFullYear(year + 1)
      }
      return { date: toISO(d), consumed: slash[0].length }
    }
  }

  return null
}

function matchLen(s: string, re: RegExp): number {
  const m = re.exec(s)
  return m ? m[0].length : 0
}

/** Parse a time token. "4pm", "4:30pm", "16:30". Returns { min, consumed } or null. */
function parseTimeToken(rest: string): { min: number; consumed: number } | null {
  const s = rest.trim()
  // 12-hour: "4pm", "4:30pm", "12am"
  const m12 = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(s)
  if (m12) {
    let h = parseInt(m12[1], 10)
    const min = m12[2] ? parseInt(m12[2], 10) : 0
    const ap = m12[3].toLowerCase()
    if (h < 1 || h > 12 || min < 0 || min > 59) return null
    if (ap === 'pm' && h !== 12) h += 12
    if (ap === 'am' && h === 12) h = 0
    return { min: h * 60 + min, consumed: m12[0].length }
  }
  // 24-hour "HH:MM"
  const m24 = /^(\d{1,2}):(\d{2})\b/.exec(s)
  if (m24) {
    const h = parseInt(m24[1], 10)
    const min = parseInt(m24[2], 10)
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return { min: h * 60 + min, consumed: m24[0].length }
  }
  return null
}

/**
 * Parse an input like "essay draft tue 4pm p:PHIL due fri 17:00 @library".
 * Anything unrecognised becomes part of the title; the function never throws.
 * Extraction is left-to-right: the first date/time seen becomes date/startMin
 * (unless preceded by "due", which fills dueDate/dueMin instead).
 */
export function parseQuickAdd(input: string, projects: Project[] = []): QuickAddResult {
  const result: QuickAddResult = {
    title: '', projectId: null, date: null, startMin: null,
    dueDate: null, dueMin: null, location: undefined,
  }
  const titleParts: string[] = []
  const src = String(input ?? '')
  let i = 0

  try {
    while (i < src.length) {
      // skip leading spaces
      if (/\s/.test(src[i])) { i++; continue }
      const rest = src.slice(i)

      // p:<project-prefix> — non-space token
      const pm = /^p:(\S+)/i.exec(rest)
      if (pm) {
        const q = pm[1].toLowerCase()
        const match = projects.find((p) => p.name.toLowerCase().startsWith(q))
          ?? projects.find((p) => p.name.toLowerCase().includes(q))
        if (match) result.projectId = match.id
        i += pm[0].length
        continue
      }

      // @location — take one word
      const at = /^@(\S+(?:\s+\S+){0,3})/.exec(rest)
      if (at && rest.startsWith('@')) {
        // Just one whitespace-delimited chunk for safety; multi-word locations can be quoted.
        const one = /^@(\S+)/.exec(rest)!
        result.location = one[1]
        i += one[0].length
        continue
      }

      // "due <date> [time]"
      const dueKw = /^due\b/i.exec(rest)
      if (dueKw) {
        let j = i + dueKw[0].length
        // skip whitespace
        while (j < src.length && /\s/.test(src[j])) j++
        const dt = parseDateToken(src.slice(j))
        if (dt) {
          result.dueDate = dt.date
          j += dt.consumed
          while (j < src.length && /\s/.test(src[j])) j++
          const tm = parseTimeToken(src.slice(j))
          if (tm) {
            result.dueMin = tm.min
            j += tm.consumed
          }
          i = j
          continue
        }
        // just a bare "due <time>" — attach time to due, keep dueDate null → today?
        const tmOnly = parseTimeToken(src.slice(j))
        if (tmOnly) {
          result.dueMin = tmOnly.min
          if (!result.dueDate) result.dueDate = toISO(today())
          i = j + tmOnly.consumed
          continue
        }
        // "due" without a followable token — treat as title word
      }

      // bare date token → sets date (only first one)
      if (result.date == null) {
        const dt = parseDateToken(rest)
        if (dt) {
          result.date = dt.date
          i += dt.consumed
          continue
        }
      }

      // bare time token → sets startMin (only first one, requires a date)
      if (result.startMin == null) {
        const tm = parseTimeToken(rest)
        if (tm) {
          result.startMin = tm.min
          if (!result.date) result.date = toISO(today())
          i += tm.consumed
          continue
        }
      }

      // otherwise take one whitespace-delimited word into the title
      const w = /^\S+/.exec(rest)
      if (w) {
        titleParts.push(w[0])
        i += w[0].length
      } else {
        i++
      }
      // silence unused var
      void at
    }
  } catch {
    // never throw: fall back to raw input as title
    return {
      title: src.trim(),
      projectId: null, date: null, startMin: null, dueDate: null, dueMin: null, location: undefined,
    }
  }

  result.title = titleParts.join(' ').trim()
  return result
}
