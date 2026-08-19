import { toISO } from './date'

/**
 * Minimal iCalendar parser tuned for university timetable feeds (Warwick
 * Tabula). Assumed VEVENT fields until the real published feed is available:
 * UID, SUMMARY ("CS126 Lecture"), DTSTART/DTEND (UTC 'Z', TZID= or
 * VALUE=DATE forms), LOCATION (room), DESCRIPTION (event type / lecturer).
 * TODO(ics): verify against the real feed once the university publishes it.
 */
export interface ParsedIcsEvent {
  uid: string
  title: string
  date: string // YYYY-MM-DD local
  startMin: number
  endMin: number
  allDay: boolean
  location: string
  description: string
}

function unfoldLines(text: string): string[] {
  const raw = text.split(/\r?\n/)
  const out: string[] = []
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) {
      out[out.length - 1] += line.slice(1)
    } else if (line.length) {
      out.push(line)
    }
  }
  return out
}

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

interface IcsDate {
  date: string
  minutes: number
  dateOnly: boolean
}

/**
 * Parse an ICS date-time value. UTC ('Z') values are converted to local time;
 * TZID values are treated as local wall-clock time.
 * TODO(ics): proper TZID handling if the feed ever uses a non-local zone.
 */
function parseIcsDate(value: string, params: string): IcsDate | null {
  const dateOnly = /VALUE=DATE(?!-TIME)/.test(params) || /^\d{8}$/.test(value)
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/)
  if (!m) return null
  const [, y, mo, d, hh = '0', mm = '0', , z] = m
  if (dateOnly) {
    return { date: `${y}-${mo}-${d}`, minutes: 0, dateOnly: true }
  }
  if (z) {
    const local = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm))
    return { date: toISO(local), minutes: local.getHours() * 60 + local.getMinutes(), dateOnly: false }
  }
  return { date: `${y}-${mo}-${d}`, minutes: +hh * 60 + +mm, dateOnly: false }
}

export function parseIcs(text: string): ParsedIcsEvent[] {
  const lines = unfoldLines(text)
  const events: ParsedIcsEvent[] = []
  let cur: Record<string, { value: string; params: string }> | null = null

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      cur = {}
      continue
    }
    if (line === 'END:VEVENT') {
      if (cur) {
        const ev = buildEvent(cur)
        if (ev) events.push(ev)
      }
      cur = null
      continue
    }
    if (!cur) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const head = line.slice(0, idx)
    const value = line.slice(idx + 1)
    const semi = head.indexOf(';')
    const name = (semi < 0 ? head : head.slice(0, semi)).toUpperCase()
    const params = semi < 0 ? '' : head.slice(semi + 1).toUpperCase()
    cur[name] = { value, params }
  }
  return events
}

function buildEvent(props: Record<string, { value: string; params: string }>): ParsedIcsEvent | null {
  const uid = props.UID?.value
  const start = props.DTSTART ? parseIcsDate(props.DTSTART.value, props.DTSTART.params) : null
  if (!uid || !start) return null
  const end = props.DTEND ? parseIcsDate(props.DTEND.value, props.DTEND.params) : null

  // Midnight-to-midnight (or date-only) events are all-day.
  const allDay =
    start.dateOnly ||
    (start.minutes === 0 && (!end || (end.minutes === 0 && (end.date === start.date || !!end.dateOnly))))

  let endMin = end && end.date === start.date ? end.minutes : start.minutes + 60
  if (!allDay && endMin <= start.minutes) endMin = Math.min(start.minutes + 60, 24 * 60)

  return {
    uid,
    title: unescapeText(props.SUMMARY?.value ?? 'Untitled'),
    date: start.date,
    startMin: allDay ? 0 : start.minutes,
    endMin: allDay ? 24 * 60 : endMin,
    allDay,
    location: unescapeText(props.LOCATION?.value ?? ''),
    description: unescapeText(props.DESCRIPTION?.value ?? ''),
  }
}

/** Shown when the browser refuses/cannot complete the request (usually CORS). */
export const UNREACHABLE_FEED =
  "Couldn't reach the feed (the school server may block browser access — a backend proxy fixes this)"

/**
 * Map a bound feed URL onto something the browser is allowed to fetch.
 * Warwick Tabula goes through the dev proxy declared in vite.config.ts; any
 * other host is attempted directly and may well be blocked by CORS.
 * TODO(backend): route every feed through the app's own server so any school's
 * ICS URL works in production, not just the one host we proxy in dev.
 */
export function feedFetchUrl(url: string): string {
  try {
    const u = new URL(url, window.location.origin)
    if (u.host === 'tabula.warwick.ac.uk') return `/tabula${u.pathname}${u.search}`
  } catch {
    // Not parseable — hand it to fetch as-is and let it fail loudly.
  }
  return url
}

export async function fetchIcs(url: string): Promise<ParsedIcsEvent[]> {
  let res: Response
  try {
    res = await fetch(feedFetchUrl(url))
  } catch {
    throw new Error(UNREACHABLE_FEED)
  }
  if (!res.ok) throw new Error(`Feed returned ${res.status}`)
  return parseIcs(await res.text())
}
