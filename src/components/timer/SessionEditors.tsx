/**
 * Editors shared by the running timer page, the study-log modal and the manual
 * logger: the class picker groups, the mid-session class switches ("segments"),
 * the break list (with tags) and the binder-file links. All of them are usable
 * during AND after a session, so they live outside any single view.
 */
import { useMemo } from 'react'
import { t } from '../../i18n'
import { classColorGroups, useStore } from '../../store'
import type { AppState, ClassSegment, ID, StudyBreak, StudySession } from '../../types'
import { cbTint } from '../../utils/color'
import { fmtTime, hmToMin, minToHm, nowMinutes } from '../../utils/date'
import {
  NEUTRAL_COLOR, normalizeSegments, nextSwitchMin, sessionSegments, uploadSectionName, uploadsForClass,
} from '../../utils/study'
import ColorSelect, { type ColorGroup } from '../ColorSelect'
import TimeSelect from '../TimeSelect'

/** What a segment edit hands back — always both fields, kept consistent. */
export type SegmentPatch = Pick<StudySession, 'classId' | 'classSegments'>

/**
 * The option blocks for every "what is this session about?" picker.
 *
 * A study session binds to a CLASS or to nothing — never to a calendar. So this
 * is the classes exactly as the calendar sidebar orders them (unfoldered first,
 * then one block per folder), with a single ungrouped "Unassigned" row on top
 * carrying the neutral grey dot. Unassigned is classId null; it is emphatically
 * not the Personal calendar.
 */
export function classOnlyGroups(state: AppState): ColorGroup[] {
  return [
    { options: [{ value: '', label: t('Unassigned'), color: NEUTRAL_COLOR }] },
    ...classColorGroups(state),
  ]
}

/* ---------- Breaks ---------- */

/** The offered break reasons. Tagging a break is always optional. */
export const BREAK_TAGS = ['rest', 'meal', 'restroom', 'other'] as const

export function breakTagLabel(tag: string | undefined): string {
  return tag ? t(tag) : t('untagged')
}

/**
 * Clamp every break into [startMin, endMin], drop/clamp degenerate ones to a
 * 1-minute minimum, then merge any that now overlap. Pure — no store access —
 * so it can run on every keystroke-equivalent edit before the patch goes out.
 * Tags ride along; a merge keeps the earlier break's tag.
 */
export function normalizeBreaks(list: StudyBreak[], startMin: number, endMin: number): StudyBreak[] {
  const lo = startMin
  const hi = Math.max(startMin + 1, endMin)
  const clamped = list
    .map((b) => {
      const s = Math.max(lo, Math.min(b.startMin, hi - 1))
      const e = Math.max(s + 1, Math.min(b.startMin + b.durMin, hi))
      return { startMin: s, durMin: e - s, tag: b.tag }
    })
    .filter((b) => b.durMin > 0)
    .sort((a, b) => a.startMin - b.startMin)

  const merged: StudyBreak[] = []
  for (const b of clamped) {
    const last = merged[merged.length - 1]
    if (last && b.startMin <= last.startMin + last.durMin) {
      last.durMin = Math.max(last.durMin, b.startMin + b.durMin - last.startMin)
      if (!last.tag && b.tag) last.tag = b.tag
    } else {
      merged.push({ ...b })
    }
  }
  return merged
}

/** A sensible default break: "now" if we're inside the session, else the midpoint. */
export function defaultBreak(startMin: number, endMin: number): StudyBreak {
  const dur = Math.max(1, Math.min(5, endMin - startMin))
  const now = nowMinutes()
  let start = now >= startMin && now <= endMin - dur ? now : startMin + Math.floor((endMin - startMin) / 2)
  start = Math.max(startMin, Math.min(Math.round(start), endMin - dur))
  return { startMin: start, durMin: dur }
}

/**
 * Carry break tags from one break list onto another, matched by start minute.
 *
 * Needed because a pomodoro session's breaks are DERIVED from wall-clock and
 * only materialised into the record when the session ends — that materialisation
 * rebuilds the list from scratch and would otherwise throw away whatever the
 * user tagged while the break was running. Start minutes are computed the same
 * way both times, so they line up exactly.
 */
export function mergeBreakTags(tagged: StudyBreak[], list: StudyBreak[]): StudyBreak[] {
  const byStart = new Map<number, string>()
  for (const b of tagged) if (b.tag) byStart.set(b.startMin, b.tag)
  if (!byStart.size) return list
  return list.map((b) => {
    const tag = byStart.get(b.startMin)
    return tag && !b.tag ? { ...b, tag } : b
  })
}

/** Compact tag picker for one break — a native select keeps the row one line tall. */
export function BreakTagSelect({ value, onChange }: {
  value: string | undefined
  onChange: (tag: string | undefined) => void
}) {
  return (
    <select className="brk-tag" title={t('Why the break?')} value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">{t('tag…')}</option>
      {BREAK_TAGS.map((tag) => <option key={tag} value={tag}>{t(tag)}</option>)}
      {value && !BREAK_TAGS.includes(value as typeof BREAK_TAGS[number]) && (
        <option value={value}>{t(value)}</option>
      )}
    </select>
  )
}

/**
 * A row of one-click tag chips for the break happening RIGHT NOW. Tagging is
 * optional and never blocks anything — clicking the active chip clears it again,
 * and ignoring the strip entirely leaves the break untagged.
 */
export function BreakTagChips({ value, color, onChange }: {
  value: string | undefined
  color: string
  onChange: (tag: string | undefined) => void
}) {
  return (
    <div className="brk-chips" role="group" aria-label={t('Tag this break')}>
      <span className="brk-chips-lbl">{t('Why the break?')}</span>
      {BREAK_TAGS.map((tag) => (
        <button key={tag} type="button"
          className={`brk-chip ${value === tag ? 'on' : ''}`}
          style={value === tag ? { borderColor: color, color } : undefined}
          aria-pressed={value === tag}
          onClick={() => onChange(value === tag ? undefined : tag)}>
          {t(tag)}
        </button>
      ))}
    </div>
  )
}

/** Editable list of breaks: start/end TimeSelects + tag + delete, plus an "add" row. */
export function BreaksEditor({ breaks, bound, onChange }: {
  breaks: StudyBreak[]
  bound: { startMin: number; endMin: number }
  onChange: (breaks: StudyBreak[]) => void
}) {
  const setBreak = (idx: number, next: StudyBreak) =>
    onChange(normalizeBreaks(breaks.map((b, i) => (i === idx ? next : b)), bound.startMin, bound.endMin))
  const removeBreak = (idx: number) => onChange(breaks.filter((_, i) => i !== idx))
  const addBreak = () =>
    onChange(normalizeBreaks([...breaks, defaultBreak(bound.startMin, bound.endMin)], bound.startMin, bound.endMin))

  return (
    <div className="brk-list">
      {breaks.length === 0 && <div className="st-empty">{t('No breaks logged.')}</div>}
      {breaks.map((b, i) => (
        <div key={i} className="brk-row">
          <TimeSelect value={minToHm(b.startMin)} onChange={(v) => {
            const newStart = hmToMin(v)
            setBreak(i, { ...b, startMin: newStart, durMin: Math.max(1, b.startMin + b.durMin - newStart) })
          }} />
          <span className="brk-sep">–</span>
          <TimeSelect value={minToHm(b.startMin + b.durMin)} onChange={(v) => {
            const newEnd = hmToMin(v)
            setBreak(i, { ...b, startMin: b.startMin, durMin: Math.max(1, newEnd - b.startMin) })
          }} />
          <BreakTagSelect value={b.tag} onChange={(tag) => setBreak(i, { ...b, tag })} />
          <button type="button" className="brk-del" title={t('Remove break')} onClick={() => removeBreak(i)}>×</button>
        </div>
      ))}
      <button type="button" className="btn brk-add" onClick={addBreak}>{t('+ Add break')}</button>
    </div>
  )
}

/* ---------- Class segments ---------- */

/**
 * The class-switch list: one row per slice (start + class + delete).
 * The first row's start is the session start and can't move; deleting a row
 * merges its span into the row above it, and two adjacent rows on the same
 * class collapse into one (that is what "merge" means here).
 */
export function SegmentsEditor({ session, endMin, onChange }: {
  session: StudySession
  /** Exclusive upper bound for switch times (session end, or "now" while running). */
  endMin: number
  onChange: (patch: SegmentPatch) => void
}) {
  const { state } = useStore()
  const segs = sessionSegments(session)
  const groups = useMemo<ColorGroup[]>(() => classOnlyGroups(state), [state])

  const emit = (list: ClassSegment[]) => {
    const norm = normalizeSegments(list, session.startMin, endMin)
    onChange({ classId: norm[0].classId, classSegments: norm.length > 1 ? norm : undefined })
  }
  const setSeg = (idx: number, next: ClassSegment) => emit(segs.map((s, i) => (i === idx ? next : s)))
  const removeSeg = (idx: number) => emit(segs.filter((_, i) => i !== idx))
  const addSeg = () => {
    const last = segs[segs.length - 1]
    const other = state.classes.find((c) => c.id !== last.classId)
    emit([...segs, { startMin: nextSwitchMin(session, endMin), classId: other?.id ?? null }])
  }
  const roomToAdd = segs[segs.length - 1].startMin + 1 < endMin

  return (
    <div className="brk-list seg-list">
      {segs.map((seg, i) => (
        <div key={i} className="brk-row seg-row">
          {i === 0 ? (
            <span className="seg-fixed" title={t('The first slice always starts with the session')}>
              {fmtTime(seg.startMin)}
            </span>
          ) : (
            <TimeSelect value={minToHm(seg.startMin)}
              onChange={(v) => setSeg(i, { ...seg, startMin: hmToMin(v) })} />
          )}
          <div className="seg-class">
            <ColorSelect value={seg.classId ?? ''} groups={groups}
              onChange={(v) => setSeg(i, { ...seg, classId: v || null })} />
          </div>
          {i === 0 ? (
            <span className="seg-del-spacer" />
          ) : (
            <button type="button" className="brk-del" title={t('Remove this switch')} onClick={() => removeSeg(i)}>×</button>
          )}
        </div>
      ))}
      {roomToAdd && (
        <button type="button" className="btn brk-add" onClick={addSeg}>{t('+ Add switch')}</button>
      )}
    </div>
  )
}

/**
 * Binder-file links: tick the current class's uploads. Anything linked from a
 * different class (because the session switched away from it) stays listed
 * below so it can still be unlinked. Ids that no longer resolve are simply not
 * shown — the stored data is left alone.
 */
export function UploadPicker({ classId, linked, color, onToggle }: {
  classId: ID | null
  linked: ID[]
  color: string
  onToggle: (id: ID) => void
}) {
  const { state } = useStore()
  const here = uploadsForClass(state, classId)
  const elsewhere = linked
    .filter((id) => !here.some((u) => u.id === id))
    .flatMap((id) => state.binderUploads.find((u) => u.id === id) ?? [])

  return (
    <>
      {here.length === 0 ? (
        <div className="st-empty">
          {classId ? t('No binder files in this class yet.') : t('Pick a class to link its binder files.')}
        </div>
      ) : (
        <div className="st-list">
          {here.map((u) => (
            <label key={u.id} className="st-item">
              <input type="checkbox" className="cb" style={cbTint(color)}
                checked={linked.includes(u.id)} onChange={() => onToggle(u.id)} />
              <span>{u.title}</span>
              <span className="st-when">{uploadSectionName(state, u)}</span>
            </label>
          ))}
        </div>
      )}
      {elsewhere.length > 0 && (
        <div className="st-linked">
          <div className="st-linked-head">{t('Linked earlier in this session')}</div>
          {elsewhere.map((u) => {
            const cls = state.classes.find((c) => c.id === u.classId)
            return (
              <div key={u.id} className="st-linked-row">
                <span className="st-linked-dot" style={{ background: cls?.color ?? 'var(--text-faint)' }} />
                <span className="st-linked-title">{u.title}</span>
                <span className="st-when">{cls?.name ?? t('other class')}</span>
                <button type="button" className="brk-del" title={t('Unlink')} onClick={() => onToggle(u.id)}>×</button>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
