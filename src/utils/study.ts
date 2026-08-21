/**
 * Study-timer engine.
 *
 * There is no background interval driving the logic: everything below is a pure
 * function of the stored session plus the current wall-clock minute. A running
 * session therefore keeps "running" while the user is on another page, and even
 * across a reload, because the session itself lives in the persisted state.
 * (The timer page runs its own 1s interval purely to repaint the clock.)
 */

import type { AppState, BinderUpload, ClassSegment, ID, StudyBreak, StudyMode, StudySession, Task } from '../types'

/** Colour used for a session with no class assigned. */
export const NEUTRAL_COLOR = '#9aa0a6'

export const DAY_END = 24 * 60

/** Bounds + defaults for the custom pomodoro ratio (mode 'custom'). */
export const CUSTOM_WORK_MIN = 5
export const CUSTOM_WORK_MAX = 180
export const CUSTOM_BREAK_MIN = 1
export const CUSTOM_BREAK_MAX = 60
export const CUSTOM_WORK_DEFAULT = 30
export const CUSTOM_BREAK_DEFAULT = 5

export const STUDY_MODES: { value: StudyMode; label: string; hint: string }[] = [
  { value: 'custom', label: 'Custom pomodoro', hint: 'your own work/break ratio' },
  { value: 'pomodoro25', label: 'Pomodoro 25/5', hint: '25 min work · 5 min break' },
  { value: 'pomodoro50', label: 'Pomodoro 50/10', hint: '50 min work · 10 min break' },
  { value: 'normal', label: 'Normal', hint: 'free-running, breaks when you say so' },
]

export function modeLabel(mode: StudyMode): string {
  return STUDY_MODES.find((m) => m.value === mode)?.label ?? mode
}

export function clampCustomWork(n: number): number {
  return Math.max(CUSTOM_WORK_MIN, Math.min(Math.round(n), CUSTOM_WORK_MAX))
}
export function clampCustomBreak(n: number): number {
  return Math.max(CUSTOM_BREAK_MIN, Math.min(Math.round(n), CUSTOM_BREAK_MAX))
}

/** True for every rhythm-driven mode (the ones that get a phase ring). */
export function isPomodoro(mode: StudyMode): boolean {
  return mode !== 'normal'
}

/**
 * Work/break lengths of a session's rhythm; null for free-running 'normal'.
 * The presets are fixed; 'custom' reads its ratio off the session itself
 * (falling back to the 30/5 default if a record somehow lacks it), so every
 * derivation below — phase, breaks, materialisation on end — is ratio-agnostic.
 */
export function cycleFor(
  s: Pick<StudySession, 'mode'> & Partial<Pick<StudySession, 'customWork' | 'customBreak'>>,
): { work: number; brk: number } | null {
  if (s.mode === 'pomodoro25') return { work: 25, brk: 5 }
  if (s.mode === 'pomodoro50') return { work: 50, brk: 10 }
  if (s.mode === 'custom') {
    return {
      work: clampCustomWork(s.customWork ?? CUSTOM_WORK_DEFAULT),
      brk: clampCustomBreak(s.customBreak ?? CUSTOM_BREAK_DEFAULT),
    }
  }
  return null
}

/** Human ratio label for a session ("25/5", "40/8"). */
export function cycleLabel(s: StudySession): string | null {
  const cyc = cycleFor(s)
  return cyc ? `${cyc.work}/${cyc.brk}` : null
}

/** The session's effective end: its stored end, or "now" while it is running. */
export function sessionEnd(s: StudySession, nowMin: number): number {
  return Math.min(s.endMin ?? Math.max(nowMin, s.startMin), DAY_END)
}

/** Total wall-clock length in minutes (breaks included). */
export function sessionDuration(s: StudySession, nowMin: number): number {
  return Math.max(0, sessionEnd(s, nowMin) - s.startMin)
}

/**
 * Overlapping or touching windows fused into one, so that summing `durMin`
 * over the result can never count the same minute twice. A pomodoro break the
 * user also paused through, for instance, arrives here as two windows covering
 * one span of wall-clock. The first tag encountered wins.
 */
function coalesceBreaks(list: StudyBreak[]): StudyBreak[] {
  const sorted = list.slice().sort((a, b) => a.startMin - b.startMin)
  const out: StudyBreak[] = []
  for (const b of sorted) {
    const prev = out[out.length - 1]
    if (prev && b.startMin <= prev.startMin + prev.durMin) {
      const stop = Math.max(prev.startMin + prev.durMin, b.startMin + b.durMin)
      const tag = prev.tag ?? b.tag
      out[out.length - 1] = { startMin: prev.startMin, durMin: stop - prev.startMin, ...(tag ? { tag } : {}) }
    } else {
      out.push(b)
    }
  }
  return out
}

/**
 * The break windows to render/store for a session: the explicitly recorded
 * breaks, an open pause (a break running up to "now"), and — in a pomodoro
 * mode — the rhythm's own breaks, where the k-th starts at
 * start + k*(work+break) + work and lasts `break` minutes. Everything is
 * clipped to the session's current end (endMin when finished, now while
 * running) and coalesced, so the three sources can overlap freely.
 */
export function derivedBreaks(s: StudySession, nowMin: number): StudyBreak[] {
  const end = sessionEnd(s, nowMin)
  const clip = (startMin: number, stop: number, tag?: string): StudyBreak | null => {
    const from = Math.max(startMin, s.startMin)
    const to = Math.min(stop, end)
    return to > from ? { startMin: from, durMin: to - from, ...(tag ? { tag } : {}) } : null
  }
  const out: StudyBreak[] = []
  for (const b of s.breaks) {
    const c = clip(b.startMin, b.startMin + b.durMin, b.tag)
    if (c) out.push(c)
  }
  if (s.pausedAtMin != null) {
    const c = clip(s.pausedAtMin, end)
    if (c) out.push(c)
  }
  const cyc = cycleFor(s)
  if (cyc) {
    const span = cyc.work + cyc.brk
    for (let k = 0; k < 1000; k++) {
      const bs = s.startMin + k * span + cyc.work
      if (bs >= end) break
      const b = clip(bs, bs + cyc.brk)
      if (b) out.push(b)
    }
  }
  return coalesceBreaks(out)
}

export interface Phase {
  phase: 'work' | 'break'
  /** Minutes left in the current phase; null when free-running with no end. */
  leftMin: number | null
  /** Full length of the current phase — the ring's 100%; null when free-running. */
  totalMin: number | null
}

/**
 * Which half of the rhythm the session is in right now. `nowMin` may be
 * fractional so the timer page can show a seconds-accurate countdown.
 */
export function currentPhase(s: StudySession, nowMin: number): Phase {
  // A paused session is on break in every mode, with no phase to count down.
  if (s.pausedAtMin != null) return { phase: 'break', leftMin: null, totalMin: null }
  const cyc = cycleFor(s)
  if (cyc) {
    const span = cyc.work + cyc.brk
    const pos = Math.max(0, nowMin - s.startMin) % span
    return pos < cyc.work
      ? { phase: 'work', leftMin: cyc.work - pos, totalMin: cyc.work }
      : { phase: 'break', leftMin: span - pos, totalMin: cyc.brk }
  }
  const b = s.breaks.find((x) => nowMin >= x.startMin && nowMin < x.startMin + x.durMin)
  return b
    ? { phase: 'break', leftMin: b.startMin + b.durMin - nowMin, totalMin: b.durMin }
    : { phase: 'work', leftMin: null, totalMin: null }
}

/** The one running session, if any. */
export function runningSession(state: AppState): StudySession | null {
  return state.studySessions.find((s) => s.endMin === null) ?? null
}

export function sessionsOnDay(state: AppState, iso: string): StudySession[] {
  return state.studySessions.filter((s) => s.date === iso).sort((a, b) => a.startMin - b.startMin)
}

/** Class colour of a session, or the neutral grey when unassigned. */
export function sessionColor(state: AppState, classId: ID | null): string {
  return (classId && state.classes.find((c) => c.id === classId)?.color) || NEUTRAL_COLOR
}

/** "1h 35m" / "45m" — total wall time. */
export function fmtDuration(mins: number): string {
  const m = Math.max(0, Math.round(mins))
  const h = Math.floor(m / 60)
  return h ? `${h}h ${m % 60}m` : `${m}m`
}

/** "07:32" / "1:04:11" — elapsed clock for the running display. */
export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`
}

/** The set of project ids for a class — always a single project under the new model. */
export function classProjectIds(state: AppState, classId: ID): Set<ID> {
  const out = new Set<ID>()
  const root = state.projects.find((p) => p.classId === classId)
  if (root) out.add(root.id)
  return out
}

/**
 * Tasks offered as session targets: open tasks from the class's project
 * subtree, or — with no class chosen — the unfiled ones.
 */
export function openTasksForClass(state: AppState, classId: ID | null): Task[] {
  if (!classId) return state.tasks.filter((t) => !t.done && !t.projectId)
  const ids = classProjectIds(state, classId)
  return state.tasks.filter((t) => !t.done && t.projectId && ids.has(t.projectId))
}

/* ---------- Mid-session class switching (segments) ---------- */

/**
 * A session's class slices, always non-empty and always starting at the session
 * start. A session with no stored `classSegments` is a single slice of its
 * `classId` — that back-compat shape is what everything else renders against.
 */
export function sessionSegments(s: StudySession): ClassSegment[] {
  const list = (s.classSegments ?? []).slice().sort((a, b) => a.startMin - b.startMin)
  if (!list.length) return [{ startMin: s.startMin, classId: s.classId }]
  // The first slice always owns the session start, whatever it was stored as.
  return list.map((seg, i) => (i === 0 ? { ...seg, startMin: s.startMin } : seg))
}

export interface SegmentSpan {
  startMin: number
  endMin: number
  classId: ID | null
}

/** Segments turned into drawable [start, end) spans, clipped to the session. */
export function segmentSpans(s: StudySession, nowMin: number): SegmentSpan[] {
  const end = sessionEnd(s, nowMin)
  const segs = sessionSegments(s)
  const out: SegmentSpan[] = []
  segs.forEach((seg, i) => {
    const from = Math.max(s.startMin, Math.min(seg.startMin, end))
    const to = i + 1 < segs.length ? Math.max(from, Math.min(segs[i + 1].startMin, end)) : end
    if (to > from || out.length === 0) out.push({ startMin: from, endMin: to, classId: seg.classId })
  })
  return out
}

/** The class in force at `atMin` — the last segment that has already started. */
export function classIdAt(s: StudySession, atMin: number): ID | null {
  const segs = sessionSegments(s)
  let cur = segs[0]
  for (const seg of segs) if (seg.startMin <= atMin) cur = seg
  return cur.classId
}

/** Distinct class ids in switch order (consecutive duplicates collapsed). */
export function segmentClassIds(s: StudySession): (ID | null)[] {
  const out: (ID | null)[] = []
  for (const seg of sessionSegments(s)) {
    if (!out.length || out[out.length - 1] !== seg.classId) out.push(seg.classId)
  }
  return out
}

/**
 * Keep a segment list legal: first slice pinned to the session start, starts
 * strictly increasing inside [start, end), consecutive same-class slices merged.
 */
export function normalizeSegments(list: ClassSegment[], startMin: number, endMin: number): ClassSegment[] {
  const hi = Math.max(startMin + 1, endMin)
  const sorted = list.slice().sort((a, b) => a.startMin - b.startMin)
  const out: ClassSegment[] = []
  sorted.forEach((seg, i) => {
    if (i === 0) {
      out.push({ ...seg, startMin: startMin })
      return
    }
    const prev = out[out.length - 1]
    const at = Math.max(prev.startMin + 1, Math.min(Math.round(seg.startMin), hi - 1))
    if (at <= prev.startMin) return // no room left before the end: drop it
    if (seg.classId === prev.classId) return // a switch to the same class is nothing
    out.push({ startMin: at, classId: seg.classId })
  })
  return out
}

/**
 * Switch the session's class at `atMin`, returning the fields to patch.
 * - switching to the class already in force is a no-op (undefined result);
 * - a second switch inside the same minute replaces the last slice rather than
 *   stacking a zero-length one;
 * - `classId` always mirrors the first slice, for back-compat.
 */
export function withClassSwitch(
  s: StudySession,
  atMin: number,
  classId: ID | null,
): Pick<StudySession, 'classId' | 'classSegments'> | null {
  const at = Math.max(s.startMin, Math.floor(atMin))
  if (classIdAt(s, at) === classId) return null
  const segs = sessionSegments(s)
  const last = segs[segs.length - 1]
  const next =
    last.startMin >= at
      ? [...segs.slice(0, -1), { startMin: last.startMin, classId }]
      : [...segs, { startMin: at, classId }]
  const merged = normalizeSegments(next, s.startMin, Math.max(s.startMin + 1, at + 1))
  return { classId: merged[0].classId, classSegments: merged.length > 1 ? merged : undefined }
}

/** A sensible time for a new "+ Add switch" row: after the last one, inside the span. */
export function nextSwitchMin(s: StudySession, endMin: number): number {
  const segs = sessionSegments(s)
  const last = segs[segs.length - 1].startMin
  const mid = last + Math.max(1, Math.round((endMin - last) / 2))
  return Math.max(last + 1, Math.min(mid, Math.max(s.startMin + 1, endMin - 1)))
}

/* ---------- Binder-upload linking ---------- */

/** The binder uploads of one class (newest first), offered as session links. */
export function uploadsForClass(state: AppState, classId: ID | null): BinderUpload[] {
  if (!classId) return []
  return state.binderUploads
    .filter((u) => u.classId === classId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

/** Uploads a session links to, dangling ids dropped (display-side only). */
export function sessionUploads(state: AppState, s: StudySession): BinderUpload[] {
  return (s.uploadIds ?? [])
    .map((id) => state.binderUploads.find((u) => u.id === id))
    .filter((u): u is BinderUpload => !!u)
}

/** Small print under a linked upload: which binder section it lives in. */
export function uploadSectionName(state: AppState, u: BinderUpload): string {
  return state.binderSections.find((sec) => sec.id === u.sectionId)?.name ?? 'Binder'
}
