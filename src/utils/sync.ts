import type { CalEvent, FieldDiff, IcsSnapshot } from '../types'
import type { ParsedIcsEvent } from './ics'
import { fmtFriendly, fmtTime } from './date'

/** Extract a module code like CS126 / MA132 from a feed event title. */
export function moduleCodeFrom(title: string): string | null {
  const m = title.match(/\b([A-Z]{2,4}\d{3}[A-Z0-9]*)\b/)
  return m ? m[1] : null
}

export function snapshotOf(p: ParsedIcsEvent): IcsSnapshot {
  return {
    title: p.title,
    date: p.date,
    allDay: p.allDay,
    startMin: p.startMin,
    endMin: p.endMin,
    location: p.location,
    description: p.description,
  }
}

function timeText(s: { date: string; allDay: boolean; startMin: number; endMin: number }): string {
  const day = fmtFriendly(s.date)
  return s.allDay ? `${day} · all day` : `${day} · ${fmtTime(s.startMin)}–${fmtTime(s.endMin)}`
}

/**
 * Diff the last-synced snapshot against the new feed values. Each entry
 * carries a ready-to-apply patch so the user can accept fields individually.
 */
export function diffSnapshot(origin: IcsSnapshot, next: IcsSnapshot): FieldDiff[] {
  const diffs: FieldDiff[] = []
  if (origin.title !== next.title) {
    diffs.push({ key: 'title', label: 'Title', oldText: origin.title, newText: next.title, patch: { title: next.title } })
  }
  if (
    origin.date !== next.date ||
    origin.allDay !== next.allDay ||
    origin.startMin !== next.startMin ||
    origin.endMin !== next.endMin
  ) {
    diffs.push({
      key: 'time',
      label: 'Time',
      oldText: timeText(origin),
      newText: timeText(next),
      patch: { date: next.date, allDay: next.allDay, startMin: next.startMin, endMin: next.endMin },
    })
  }
  if (origin.location !== next.location) {
    diffs.push({
      key: 'location',
      label: 'Location',
      oldText: origin.location || '(none)',
      newText: next.location || '(none)',
      patch: { location: next.location },
    })
  }
  if (origin.description !== next.description) {
    diffs.push({
      key: 'description',
      label: 'Details',
      oldText: origin.description || '(none)',
      newText: next.description || '(none)',
      patch: { notes: next.description },
    })
  }
  return diffs
}

/**
 * Build a fake feed payload for demoing the notification layouts while the
 * university feed is empty: adds one realistic event, shifts/relocates the
 * first existing synced event, and drops the last one.
 * TODO(ics): remove once the real feed is published and verified.
 */
const FAKE_MODULES = [
  { code: 'CS126', name: 'Design of Information Structures', kind: 'Lecture', room: 'MS.01', staff: 'Dr M. Sinclair' },
  { code: 'CS118', name: 'Programming for Computer Scientists', kind: 'Seminar', room: 'CS1.04', staff: 'Prof A. Okafor' },
  { code: 'CS131', name: 'Mathematics for Computer Scientists', kind: 'Lecture', room: 'OC0.02', staff: 'Dr J. Halvorsen' },
]
let fakeCounter = 0

export function simulateFeed(events: CalEvent[], todayIso: string): ParsedIcsEvent[] {
  const synced = events.filter((e) => e.icsUid && !e.syncMissing)
  const out: ParsedIcsEvent[] = []

  for (let i = 0; i < synced.length; i++) {
    const ev = synced[i]
    const base = ev.origin ?? snapshotOf({ uid: ev.icsUid!, ...ev, location: ev.location ?? '', description: ev.notes ?? '' })
    if (i === 0) {
      // Edited: push start/end 30 min later and move rooms.
      out.push({
        uid: ev.icsUid!,
        title: base.title,
        date: base.date,
        allDay: false,
        startMin: (base.allDay ? 9 * 60 : base.startMin) + 30,
        endMin: (base.allDay ? 10 * 60 : base.endMin) + 30,
        location: base.location === 'MB0.07' ? 'R0.21' : 'MB0.07',
        description: base.description,
      })
    } else if (i === synced.length - 1 && synced.length >= 2) {
      // Removed: omit from the feed (cancelled).
    } else {
      out.push({ uid: ev.icsUid!, ...base })
    }
  }

  const mod = FAKE_MODULES[fakeCounter % FAKE_MODULES.length]
  fakeCounter++
  const startMin = 9 * 60 + (fakeCounter % 4) * 60
  out.push({
    uid: `sim-${Date.now()}-${fakeCounter}`,
    title: `${mod.code} ${mod.name} - ${mod.kind}`,
    date: todayIso,
    allDay: false,
    startMin,
    endMin: startMin + 60,
    location: mod.room,
    description: `${mod.kind}\nStaff: ${mod.staff}`,
  })
  return out
}
