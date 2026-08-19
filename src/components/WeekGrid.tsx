import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useUI } from '../App'
import { projectById, taskColor, taskLabel, useStore } from '../store'
import {
  birthdayLabel, birthdaysForDay, DUE_FLAG, dueBarsForDay, eventColor, examColorsForDay, examRingBackground,
  ghostsForDay, isDayOff, itemsForDay, layoutOverlaps, recurringDueBarsForDay,
} from '../utils/agenda'
import type { GhostSlot } from '../utils/agenda'
import type { Birthday, CalEvent, ID, RecurException, RecurringTask, Task } from '../types'
import { DUE_EOD_MIN } from '../types'
import { cbTint, hexToRgba, titleTint } from '../utils/color'
import {
  addDays, daysBetween, fmtDayHeader, fmtHourLabel, fmtTime, fromISO, isSameDay, nowMinutes, startOfWeek, toISO,
} from '../utils/date'
import { clampMin, columnAtX, MIN_BLOCK_MIN, minutesAtY, pastThreshold, snapMin } from '../utils/drag'
import {
  occurrenceAt, recurringCount, recurringTimes, type EditScope, type RecurOccurrence,
} from '../utils/occur'
import TaskCheck, { RecurringCheck } from './TaskCheck'
import { DayLogBlock, JournalBox } from './daylog/DayLogControls'
import { PencilGlyph } from './daylog/glyphs'
import { ExtensionPopover, ScopePopover } from './modals/DragPopovers'
import BirthdayPopover, { GiftMark } from './modals/BirthdayPopover'
import {
  derivedBreaks, fmtDuration, segmentClassIds, segmentSpans, sessionColor, sessionDuration, sessionEnd, sessionsOnDay,
} from '../utils/study'

const HOUR_H = 56
const SCROLL_TO_HOUR = 7.5

interface Props {
  anchor: string
  days: 1 | 7
}

/** What a pointer drag on the time grid is holding on to. */
interface Drag {
  kind: 'event' | 'task' | 'due' | 'recurring' | 'recurringDue'
  id: ID
  mode: 'move' | 'resize'
  /** The day the item was grabbed on — for a repeating event, its occurrence. */
  occurrence: string
  /**
   * Recurring occurrences only: the date the RULE generated this one on. It is
   * the occurrence's identity (what exceptions are filed under) and can differ
   * from the day it was grabbed on once it has been moved.
   */
  occKey?: string
  origStart: number
  origEnd: number // === origStart for a due bar
  /** Where inside the block the pointer grabbed it, so it doesn't jump. */
  grabOffsetMin: number
  x0: number
  y0: number
  active: boolean // past the threshold: a real drag, not a click
  // Live target slot:
  iso: string
  startMin: number
  endMin: number
}

/** Everything beginDrag needs about the block being grabbed. */
type DragInit = Pick<Drag, 'kind' | 'id' | 'mode' | 'occurrence' | 'occKey' | 'origStart' | 'origEnd'>

/**
 * A drag on EMPTY grid space, sketching the block a new item would occupy.
 * It holds nothing yet: on release it just hands its span to the slot chooser,
 * so the user still picks what the block becomes.
 */
interface CreateDrag {
  iso: string
  /** Index into `dates` — a sketch stays in the column it started in. */
  dayIdx: number
  /** Where the press landed; the block grows from here, up or down. */
  anchorMin: number
  startMin: number
  endMin: number
  x0: number
  y0: number
  active: boolean // past the threshold: a sketch, not a plain click
}

/** A dragged repeating event waiting for the user to pick its edit scope. */
interface ScopePrompt {
  x: number
  y: number
  event: CalEvent
  occurrence: string
  /** The patch for one scope choice — 'all' shifts the whole series instead. */
  patchFor: (scope: EditScope) => Partial<CalEvent>
}

/** A due bar dropped on a later day, waiting on the extension question. */
interface ExtPrompt {
  x: number
  y: number
  task: Task
  dueDate: string
  dueMin: number
}

/**
 * A dragged recurring occurrence waiting for its scope. Every edit of one asks:
 * an exception ('one'), a split ('future') or the whole series ('all').
 */
interface RecPrompt {
  x: number
  y: number
  rt: RecurringTask
  occurrence: string // the rule-generated date: the occurrence's identity
  patch: RecurException
  /** A deadline drag: a later drop chains the extension question after the scope. */
  fromDue?: { dueDate: string; dueMin: number | null }
}

/** A recurring occurrence's deadline dropped later, with its scope already picked. */
interface RecExtPrompt extends RecPrompt {
  scope: EditScope
  from: { dueDate: string; dueMin: number | null }
}

/** Ticks every 30s so the now-line and today marker stay current. */
function useNow(): { minutes: number; iso: string } {
  const [now, setNow] = useState(() => ({ minutes: nowMinutes(), iso: toISO(new Date()) }))
  useEffect(() => {
    const t = setInterval(() => setNow({ minutes: nowMinutes(), iso: toISO(new Date()) }), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}

export default function WeekGrid({ anchor, days }: Props) {
  const { state, dispatch } = useStore()
  const ui = useUI()
  const now = useNow()
  const scrollRef = useRef<HTMLDivElement>(null)

  const start = days === 7 ? startOfWeek(fromISO(anchor), state.weekStart) : fromISO(anchor)
  const dates = Array.from({ length: days }, (_, i) => addDays(start, i))

  // Two lane-level view prefs (persisted, outside undo history).
  const allDayShut = state.collapseAllDay ?? false
  const journalShut = state.collapseJournal ?? false

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: SCROLL_TO_HOUR * HOUR_H })
  }, [])

  /* ---------- Drag & drop: move + resize on the time grid ---------- */

  const colRefs = useRef<(HTMLDivElement | null)[]>([])
  const [drag, setDrag] = useState<Drag | null>(null)
  // The listeners below run off refs so they always see the live drag without
  // being torn down and re-attached on every pointermove.
  const dragRef = useRef<Drag | null>(null)
  const putDrag = (d: Drag | null) => {
    dragRef.current = d
    setDrag(d)
  }
  // A finished drag is followed by a click on whatever is under the pointer;
  // swallowed here so a drag never also opens an editor.
  const swallowClick = useRef(false)
  const [scopePrompt, setScopePrompt] = useState<ScopePrompt | null>(null)
  const [extPrompt, setExtPrompt] = useState<ExtPrompt | null>(null)
  const [recPrompt, setRecPrompt] = useState<RecPrompt | null>(null)
  const [recExtPrompt, setRecExtPrompt] = useState<RecExtPrompt | null>(null)
  // The birthday marker's edit popup, anchored at the click.
  const [bdayPop, setBdayPop] = useState<{ x: number; y: number; init: Birthday } | null>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!swallowClick.current) return
      swallowClick.current = false
      e.stopPropagation()
      e.preventDefault()
    }
    window.addEventListener('click', onClick, true)
    return () => window.removeEventListener('click', onClick, true)
  }, [])

  const beginDrag = (e: React.PointerEvent, init: DragInit) => {
    if (e.button !== 0) return
    // Checkboxes, ypt glyphs and the ghost's × keep their own click.
    if ((e.target as HTMLElement).closest('input, button, .info-icon')) return
    const idx = dates.findIndex((d) => toISO(d) === init.occurrence)
    const rect = colRefs.current[idx]?.getBoundingClientRect()
    const grabOffsetMin = rect ? minutesAtY(rect.top, e.clientY, HOUR_H) - init.origStart : 0
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    putDrag({
      ...init, grabOffsetMin,
      x0: e.clientX, y0: e.clientY, active: false,
      iso: init.occurrence, startMin: init.origStart, endMin: init.origEnd,
    })
  }

  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      if (!d.active && !pastThreshold(d.x0, d.y0, e.clientX, e.clientY)) return
      swallowClick.current = true
      const rects = colRefs.current.map((el) => el?.getBoundingClientRect())
      const idx = columnAtX(rects, e.clientX)
      const rect = rects[idx]
      const raw = rect ? minutesAtY(rect.top, e.clientY, HOUR_H) : d.origStart
      if (d.mode === 'resize') {
        // Resizing only changes the bottom edge; the day and start stay put.
        putDrag({
          ...d, active: true, iso: d.occurrence, startMin: d.origStart,
          endMin: clampMin(snapMin(raw), d.origStart + MIN_BLOCK_MIN),
        })
        return
      }
      const dur = d.origEnd - d.origStart
      const startMin = clampMin(snapMin(raw - d.grabOffsetMin), 0, 24 * 60 - dur)
      putDrag({ ...d, active: true, iso: toISO(dates[idx]), startMin, endMin: startMin + dur })
    }
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current
      putDrag(null)
      // Safety net: if no click follows the release, don't swallow a later one.
      setTimeout(() => { swallowClick.current = false }, 300)
      if (d?.active) commitDrag(d, e.clientX, e.clientY)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Abandon the drag; the click after the eventual release is still eaten.
      putDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null, dates.length, anchor])

  /** Turn a finished drag into state — or into the question it still needs answered. */
  const commitDrag = (d: Drag, x: number, y: number) => {
    const unchanged = d.iso === d.occurrence && d.startMin === d.origStart && d.endMin === d.origEnd
    if (unchanged) return

    if (d.kind === 'event') {
      const ev = state.events.find((e) => e.id === d.id)
      if (!ev) return
      const delta = daysBetween(d.occurrence, d.iso)
      const patchFor = (scope: EditScope): Partial<CalEvent> => {
        const base = { startMin: d.startMin, endMin: d.endMin }
        // "All events" moves the SERIES by the same offset, so occurrences
        // before the one dragged survive; the split scopes pin the new event
        // to the concrete day it was dropped on.
        if (scope !== 'all') return { ...base, date: d.iso }
        return delta === 0 ? base : { ...base, date: toISO(addDays(fromISO(ev.date), delta)) }
      }
      if (ev.repeat !== 'none') {
        setScopePrompt({ x, y, event: ev, occurrence: d.occurrence, patchFor })
        return
      }
      dispatch({
        type: 'moveEventOccurrence', id: ev.id, occurrence: d.occurrence, scope: 'all', patch: patchFor('all'),
      })
      return
    }

    // Recurring occurrences: a drag is a scoped edit, so it always asks which
    // occurrences it applies to. 'one' lands as a per-occurrence exception.
    if (d.kind === 'recurring' || d.kind === 'recurringDue') {
      const rt = state.recurring.find((r) => r.id === d.id)
      if (!rt || !d.occKey) return
      const occ = occurrenceAt(rt, d.occKey)
      if (d.kind === 'recurringDue') {
        setRecPrompt({
          x, y, rt, occurrence: d.occKey,
          patch: { dueDate: d.iso, dueMin: d.startMin },
          fromDue: { dueDate: occ.dueDate ?? d.occurrence, dueMin: occ.dueMin },
        })
        return
      }
      setRecPrompt({
        x, y, rt, occurrence: d.occKey,
        patch: {
          date: d.iso,
          startMin: d.startMin,
          // Like a task chip, a bare occurrence only grows a block when resized.
          endMin: d.mode === 'resize' || occ.endMin != null ? d.endMin : null,
        },
      })
      return
    }

    const t = state.tasks.find((x2) => x2.id === d.id)
    if (!t) return

    if (d.kind === 'task') {
      dispatch({
        type: 'updateTask',
        task: {
          ...t, date: d.iso, startMin: d.startMin,
          // A bare chip only grows an expected-time block when it is resized.
          endMin: d.mode === 'resize' || t.endMin != null ? d.endMin : t.endMin ?? null,
        },
      })
      return
    }

    // Due bar: a later deadline asks the extension question first (same rule as
    // the task editor — compared by DAY, so a same-day nudge stays silent).
    if (!t.dueDate) return
    if (d.iso > t.dueDate) {
      setExtPrompt({ x, y, task: t, dueDate: d.iso, dueMin: d.startMin })
      return
    }
    dispatch({ type: 'updateTask', task: { ...t, dueDate: d.iso, dueMin: d.startMin } })
  }

  /** Pointer handlers for one draggable block (plus its resize handle). */
  const dragHandlers = (init: DragInit) => ({
    onPointerDown: (e: React.PointerEvent) => beginDrag(e, init),
  })
  const resizeHandle = (init: Omit<DragInit, 'mode'>) => (
    <div className="drag-resize" title="Drag to change the length"
      onPointerDown={(e) => { e.stopPropagation(); beginDrag(e, { ...init, mode: 'resize' }) }}
      onClick={(e) => e.stopPropagation()} />
  )
  /** True while THIS item is the one being dragged (its block goes ghosty). */
  const isDragging = (kind: Drag['kind'], id: ID) => !!drag?.active && drag.kind === kind && drag.id === id

  /** Applies a scoped recurring edit once every question has an answer. */
  const commitRecurring = (p: RecPrompt, scope: EditScope, patch = p.patch) => {
    dispatch({ type: 'editRecurringOccurrence', id: p.rt.id, occurrence: p.occurrence, scope, patch })
    setRecPrompt(null)
    setRecExtPrompt(null)
  }

  /**
   * The tick(s) for one recurring occurrence: a plain checkbox, or — for a
   * "several times a day" habit — one box per slot, filled left to right.
   * Clicking a filled box drops the count back to it, so undoing is one click.
   */
  const recurCheck = (occ: RecurOccurrence) => (
    <RecurringCheck rt={occ.rt} date={occ.key} color={taskColor(state, occ.rt.projectId)} />
  )

  /**
   * One reschedule ghost: the slot a task used to occupy, left behind in its
   * own colour with an arrow. Clicking it opens the task; the × puts it away.
   */
  const ghostChip = ({ task: t, ghost, index }: GhostSlot, timed: boolean) => (
    <div key={`g-${t.id}-${index}`}
      className={`task-ghost${timed ? ' tg-timed' : ''}`}
      style={{
        color: taskColor(state, t.projectId),
        ...(timed ? { top: ((ghost.startMin ?? 0) / 60) * HOUR_H } : null),
      }}
      title={`Moved away from ${ghost.startMin != null ? fmtTime(ghost.startMin) : 'all-day'} — ${t.title}`}
      onClick={(e) => { e.stopPropagation(); ui.openTask({ task: t }) }}>
      <span className="tg-arrow">⇢</span>
      <span className="tg-title">{t.title}</span>
      <button className="tg-x" title="Dismiss this ghost"
        onClick={(e) => { e.stopPropagation(); dispatch({ type: 'dismissGhost', id: t.id, index }) }}>×</button>
    </div>
  )

  // Empty-slot click opens a small chooser (Event · Task · Study log) at the
  // click point; Event/Task route to the existing flows, Study log opens the
  // manual-log modal. The popover is closed by a click anywhere outside it.
  // `endMin` is set only when the slot was DRAGGED open (see createDrag below);
  // without it every branch keeps its own default length.
  const [slotChooser, setSlotChooser] = useState<
    | { iso: string; startMin: number; endMin?: number; x: number; y: number }
    | null
  >(null)
  const clickSlot = (iso: string) => (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    const rect = e.currentTarget.getBoundingClientRect()
    const min = Math.floor(((e.clientY - rect.top) / HOUR_H) * 60 / 30) * 30
    setSlotChooser({ iso, startMin: min, x: e.clientX, y: e.clientY })
  }
  useEffect(() => {
    if (!slotChooser) return
    const close = () => setSlotChooser(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    // Fire on the next tick so the very click that opened the popover doesn't
    // immediately dismiss it via this listener.
    const t = setTimeout(() => document.addEventListener('mousedown', close), 0)
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [slotChooser])

  /* ---------- Drag-to-create on empty grid space ---------- */

  // Anchored on the same empty column surface as clickSlot, behind the same
  // `e.target === e.currentTarget` guard: blocks, chips, due bars, ghosts and
  // journal cells sit above it and keep their own pointerdowns, so a press on
  // one never reaches this. A press that never passes the drag threshold is
  // left entirely alone — the click still opens the chooser as it always has.
  const [createDrag, setCreateDrag] = useState<CreateDrag | null>(null)
  const createRef = useRef<CreateDrag | null>(null)
  const putCreate = (c: CreateDrag | null) => {
    createRef.current = c
    setCreateDrag(c)
  }

  const startCreate = (iso: string, dayIdx: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return
    const min = clampMin(snapMin(minutesAtY(e.currentTarget.getBoundingClientRect().top, e.clientY, HOUR_H)))
    e.currentTarget.setPointerCapture?.(e.pointerId)
    putCreate({
      iso, dayIdx, anchorMin: min, startMin: min, endMin: min,
      x0: e.clientX, y0: e.clientY, active: false,
    })
  }

  useEffect(() => {
    if (!createDrag) return
    const onMove = (e: PointerEvent) => {
      const c = createRef.current
      if (!c) return
      if (!c.active && !pastThreshold(c.x0, c.y0, e.clientX, e.clientY)) return
      swallowClick.current = true
      const rect = colRefs.current[c.dayIdx]?.getBoundingClientRect()
      if (!rect) return
      const cur = clampMin(snapMin(minutesAtY(rect.top, e.clientY, HOUR_H)))
      let startMin = Math.min(c.anchorMin, cur)
      let endMin = Math.max(c.anchorMin, cur)
      // Never thinner than one snap step, growing away from the anchor.
      if (endMin - startMin < MIN_BLOCK_MIN) {
        if (cur < c.anchorMin) startMin = endMin - MIN_BLOCK_MIN
        else endMin = startMin + MIN_BLOCK_MIN
      }
      if (startMin < 0) { startMin = 0; endMin = MIN_BLOCK_MIN }
      if (endMin > 24 * 60) { endMin = 24 * 60; startMin = endMin - MIN_BLOCK_MIN }
      putCreate({ ...c, active: true, startMin, endMin })
    }
    const onUp = (e: PointerEvent) => {
      const c = createRef.current
      putCreate(null)
      // Below the threshold this was a plain click: leave it entirely alone so
      // the chooser opens the way it always has.
      if (!c?.active) return
      // Safety net: if no click follows the release, don't swallow a later one.
      setTimeout(() => { swallowClick.current = false }, 300)
      // The sketch doesn't decide what it becomes: hand the span to the same
      // chooser a plain click opens, at the point the drag was released.
      setSlotChooser({ iso: c.iso, startMin: c.startMin, endMin: c.endMin, x: e.clientX, y: e.clientY })
    }
    const onKey = (e: KeyboardEvent) => {
      // Abandon the sketch; the click after the eventual release is still eaten,
      // so Escape doesn't fall through to opening the chooser.
      if (e.key === 'Escape') putCreate(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createDrag !== null])

  return (
    <>
      {/* Day headers */}
      <div className="grid-header">
        <div className="gutter" />
        {dates.map((d) => {
          const h = fmtDayHeader(d)
          const iso = toISO(d)
          const today = isSameDay(d, new Date())
          // `dayOff` includes the birthdays that make their day one; the ⛱
          // button only ever toggles the days the user marked by hand.
          const dayOff = isDayOff(state, iso)
          const marked = state.daysOff.includes(iso)
          const examBg = examRingBackground(examColorsForDay(state, iso))
          return (
            <div key={h.date} className={`day-head ${today ? 'today' : ''} ${dayOff ? 'day-off' : ''}`}>
              {/* The day-off outline / exam fill wraps BOTH the weekday name and the
                  number; as the wrap's background it always paints behind the
                  solid today pill inside. */}
              <div className="dh-wrap" style={examBg ? { background: examBg } : undefined}>
                <div className="dow">{h.dow}</div>
                <div className="dnum">
                  <span className="dnum-txt">{d.getDate()}</span>
                </div>
              </div>
              <button className="dayoff-btn" title={marked ? 'Unmark day off' : 'Mark as day off'}
                onClick={() => {
                  if (!marked && examColorsForDay(state, iso).length > 0) {
                    window.alert('This day has an exam scheduled — it can\'t be marked as a day off.')
                    return
                  }
                  dispatch({ type: 'toggleDayOff', date: iso })
                }}>
                ⛱
              </button>
              {/* The day's log — weather, meals, mood — at the foot of the
                  header cell. Week and day views only: the month grid's cells
                  have no room for it. */}
              <DayLogBlock date={iso} />
            </div>
          )
        })}
      </div>

      {/* All-day lane: all-day events + date-only tasks + recurring occurrences.
          Collapsible down to a per-day count when the week is busy up here. */}
      <div className={`allday-lane${allDayShut ? ' lane-shut' : ''}`}>
        <button type="button" className="gutter lane-toggle"
          title={allDayShut ? 'Show all-day items' : 'Collapse all-day items'}
          aria-expanded={!allDayShut}
          onClick={() => dispatch({ type: 'setCollapseAllDay', on: !allDayShut })}>
          <span className={`caret ${allDayShut ? '' : 'open'}`}>▶</span>
          <span className="lane-toggle-label">all-day</span>
        </button>
        {dates.map((d) => {
          const iso = toISO(d)
          const items = itemsForDay(state, iso)
          if (allDayShut) {
            const n = items.allDayEvents.length + items.allDayTasks.length
              + items.allDayRecurring.length + birthdaysForDay(state, iso).length
            return (
              <div key={iso} className={`allday-cell allday-count ${isDayOff(state, iso) ? 'day-off' : ''}`}
                title={n ? `${n} all-day item${n === 1 ? '' : 's'} — click to expand` : 'Click to expand'}
                onClick={() => dispatch({ type: 'setCollapseAllDay', on: false })}>
                {n > 0 && <span className="ac-n">{n}</span>}
              </div>
            )
          }
          return (
            <div key={iso} className={`allday-cell ${isDayOff(state, iso) ? 'day-off' : ''}`}
              onClick={(e) => {
                if (e.target === e.currentTarget) ui.openEvent({ date: iso, allDay: true })
              }}>
              {items.allDayEvents.map((ev) => {
                const color = eventColor(state, ev)
                return (
                  <div key={ev.id} className={`chip ${ev.isExam ? 'chip-exam' : ''}`}
                    style={{
                      background: hexToRgba(color, 0.25), borderLeftColor: color,
                      ...(ev.isExam ? { borderColor: color } : {}),
                    }}
                    onClick={() => ui.openEvent({ event: ev, date: iso })}>
                    <span className="label">{ev.title}</span>
                  </div>
                )
              })}
              {/* All-day tasks list below the day's all-day events: no fill, tag only */}
              {items.allDayTasks.map((t) => {
                const color = taskColor(state, t.projectId)
                const label = taskLabel(state, t.projectId)
                return (
                  <div key={t.id} className="chip chip-task chip-bare"
                    onClick={() => ui.openTask({ task: t })}>
                    <TaskCheck task={t} color={color} />
                    <span className="chip-col">
                      {label && (
                        <span className="task-tag"
                          style={{ background: hexToRgba(color, 0.28), color: titleTint(color) }}>
                          {label}
                        </span>
                      )}
                      <span className={`label ${t.done ? 'done-strike' : ''}`} style={{ color: titleTint(color) }}>
                        {t.title}
                      </span>
                    </span>
                  </div>
                )
              })}
              {/* Birthdays: a present in the all-day lane, hover for the name
                  (and the age, when the birth year is known). */}
              {birthdaysForDay(state, iso).map((b) => (
                <div key={b.id} className="chip chip-bday" title={birthdayLabel(b, iso)}
                  onClick={(e) => { e.stopPropagation(); setBdayPop({ x: e.clientX, y: e.clientY, init: b }) }}>
                  <GiftMark size={13} />
                  <span className="label">{b.name}</span>
                </div>
              ))}
              {items.allDayRecurring.map((occ) => {
                const rt = occ.rt
                const color = taskColor(state, rt.projectId)
                const label = taskLabel(state, rt.projectId)
                const done = recurringCount(rt, occ.key) >= recurringTimes(rt)
                return (
                  <div key={`${rt.id}-${occ.key}`} className="chip chip-task chip-bare"
                    onClick={() => ui.openRecurring({ rt, occurrence: occ.key })}>
                    {recurCheck(occ)}
                    <span className="chip-col">
                      {label && (
                        <span className="task-tag"
                          style={{ background: hexToRgba(color, 0.28), color: titleTint(color) }}>
                          {label}
                        </span>
                      )}
                      <span className={`label ${done ? 'done-strike' : ''}`} style={{ color: titleTint(color) }}>
                        {rt.title} ↻{occ.moved ? ' ⇢' : ''}
                      </span>
                    </span>
                  </div>
                )
              })}
              {/* All-day slots this day's tasks were rescheduled away from. */}
              {ghostsForDay(state, iso, false).map((g) => ghostChip(g, false))}
            </div>
          )
        })}
      </div>

      {/* Time grid */}
      <div className="grid-scroll" ref={scrollRef}>
        <div className={`grid-body${drag?.active || createDrag?.active ? ' grid-dragging' : ''}`}
          style={{ height: 24 * HOUR_H }}>
          <div className="hour-gutter">
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <div key={h} className="hour-label" style={{ top: h * HOUR_H }}>{fmtHourLabel(h)}</div>
            ))}
          </div>

          {dates.map((d, dayIdx) => {
            const iso = toISO(d)
            const isToday = iso === now.iso
            const items = itemsForDay(state, iso)

            // Events and timed tasks share the overlap layout (tasks get a 30-min block)
            const blocks = [
              ...items.timedEvents.map((ev) => ({ kind: 'event' as const, ev, startMin: ev.startMin, endMin: Math.max(ev.endMin, ev.startMin + 20) })),
              ...items.timedTasks.map((t) => ({
                kind: 'task' as const,
                t,
                startMin: t.startMin!,
                // Expected time block if set, otherwise a compact 30-min chip
                endMin: Math.min(t.endMin != null && t.endMin > t.startMin! ? t.endMin : t.startMin! + 30, 24 * 60),
              })),
              ...items.timedRecurring.map((occ) => ({
                kind: 'recur' as const,
                occ,
                startMin: occ.startMin!,
                endMin: Math.min(
                  occ.endMin != null && occ.endMin > occ.startMin! ? occ.endMin : occ.startMin! + 30, 24 * 60,
                ),
              })),
            ]
            const pos = layoutOverlaps(blocks)

            return (
              <div key={iso}
                ref={(el) => { colRefs.current[dayIdx] = el }}
                className={`day-col ${isToday ? 'today-col' : ''} ${isDayOff(state, iso) ? 'day-off' : ''}`}
                onPointerDown={startCreate(iso, dayIdx)}
                onClick={clickSlot(iso)}>
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="hour-line" style={{ top: h * HOUR_H }} />
                ))}

                {/* Slots the day's tasks were rescheduled away from. */}
                {ghostsForDay(state, iso, true).map((g) => ghostChip(g, true))}

                {blocks.map((b, i) => {
                  const { col, cols } = pos[i]
                  const top = (b.startMin / 60) * HOUR_H
                  const height = Math.max(((b.endMin - b.startMin) / 60) * HOUR_H - 2, 16)
                  const width = 100 / cols
                  const style: React.CSSProperties = {
                    top, height,
                    left: `calc(${col * width}% + 2px)`,
                    width: `calc(${width}% - 5px)`,
                  }
                  if (b.kind === 'event') {
                    const color = eventColor(state, b.ev)
                    const isExam = !!b.ev.isExam
                    const grab = {
                      kind: 'event' as const, id: b.ev.id, occurrence: iso,
                      origStart: b.ev.startMin, origEnd: b.ev.endMin,
                    }
                    return (
                      <div key={b.ev.id}
                        className={`evt drag-block ${isExam ? 'evt-exam' : ''}${isDragging('event', b.ev.id) ? ' drag-source' : ''}`}
                        style={{
                          ...style, background: hexToRgba(color, 0.22), borderLeftColor: color,
                          ...(isExam ? { borderColor: color } : {}),
                        }}
                        {...dragHandlers({ ...grab, mode: 'move' })}
                        onClick={(e) => { e.stopPropagation(); ui.openEvent({ event: b.ev, date: iso }) }}>
                        {resizeHandle(grab)}
                        {isExam && (
                          <span className="exam-flag" style={{ color: titleTint(color) }}>
                            EXAM<span className="exam-bang">{'‼︎'}</span>
                          </span>
                        )}
                        {isExam && <span className="exam-corner" style={{ background: color }} />}
                        <div className="t" style={{ color: titleTint(color) }}>{b.ev.title}</div>
                        {height > 34 && <div className="sub">{fmtTime(b.ev.startMin)} – {fmtTime(b.ev.endMin)}</div>}
                        {height > 52 && b.ev.location && <div className="sub">{b.ev.location}</div>}
                        {height > 70 && b.ev.notes && <div className="sub note">📝 {b.ev.notes}</div>}
                      </div>
                    )
                  }
                  if (b.kind === 'recur') {
                    // A scheduled recurring occurrence: same shapes as a task
                    // (outlined block when it has one, bare chip otherwise), and
                    // draggable — a drop asks which occurrences it applies to.
                    const occ = b.occ
                    const color = taskColor(state, occ.rt.projectId)
                    const label = taskLabel(state, occ.rt.projectId)
                    const done = recurringCount(occ.rt, occ.key) >= recurringTimes(occ.rt)
                    const hasBlock = occ.endMin != null && occ.endMin > occ.startMin!
                    const grab = {
                      kind: 'recurring' as const, id: occ.rt.id, occurrence: iso, occKey: occ.key,
                      origStart: b.startMin, origEnd: b.endMin,
                    }
                    const dragging = !!drag?.active && drag.kind === 'recurring'
                      && drag.id === occ.rt.id && drag.occKey === occ.key
                    return (
                      <div key={`r-${occ.rt.id}-${occ.key}`}
                        className={`evt ${hasBlock ? 'task-block' : 'task-chip-grid'} drag-block${dragging ? ' drag-source' : ''}`}
                        style={hasBlock ? { ...style, borderColor: hexToRgba(color, 0.5) } : style}
                        {...dragHandlers({ ...grab, mode: 'move' })}
                        onClick={(e) => { e.stopPropagation(); ui.openRecurring({ rt: occ.rt, occurrence: occ.key }) }}>
                        {resizeHandle(grab)}
                        {label && (
                          <span className={hasBlock ? 'tb-label' : 'task-tag'}
                            style={{
                              color: titleTint(color),
                              background: hasBlock
                                ? `color-mix(in srgb, ${color} 28%, var(--bg))`
                                : hexToRgba(color, 0.28),
                            }}>
                            {label}
                          </span>
                        )}
                        <div className="task-main">
                          {recurCheck(occ)}
                          <span className={`t ${done ? 'done-strike' : ''}`} style={{ color: titleTint(color) }}>
                            {occ.rt.title} ↻{occ.moved ? ' ⇢' : ''}
                          </span>
                        </div>
                        {hasBlock && height > 48 && <div className="sub">{fmtTime(b.startMin)} – {fmtTime(b.endMin)}</div>}
                      </div>
                    )
                  }
                  const color = taskColor(state, b.t.projectId)
                  const label = taskLabel(state, b.t.projectId)
                  const hasBlock = b.t.endMin != null && b.t.endMin > b.t.startMin!
                  const checkbox = <TaskCheck task={b.t} color={color} />
                  const grab = {
                    kind: 'task' as const, id: b.t.id, occurrence: iso,
                    origStart: b.startMin, origEnd: b.endMin,
                  }
                  const dragCls = isDragging('task', b.t.id) ? ' drag-source' : ''
                  if (hasBlock) {
                    // Expected time block: outlined, unfilled; the label sits on the border.
                    return (
                      <div key={b.t.id} className={`evt task-block drag-block${dragCls}`}
                        style={{ ...style, borderColor: hexToRgba(color, 0.5) }}
                        {...dragHandlers({ ...grab, mode: 'move' })}
                        onClick={(e) => { e.stopPropagation(); ui.openTask({ task: b.t }) }}>
                        {resizeHandle(grab)}
                        {label && (
                          <span className="tb-label"
                            style={{
                              color: titleTint(color),
                              // Opaque tint: shows the class colour highlight AND still
                              // interrupts the border line it sits on.
                              background: `color-mix(in srgb, ${color} 28%, var(--bg))`,
                            }}>
                            {label}
                          </span>
                        )}
                        <div className="task-main">
                          {checkbox}
                          <span className={`t ${b.t.done ? 'done-strike' : ''}`} style={{ color: titleTint(color) }}>
                            {b.t.title}
                          </span>
                        </div>
                        {height > 48 && <div className="sub">{fmtTime(b.startMin)} – {fmtTime(b.endMin)}</div>}
                        {height > 62 && b.t.location && <div className="sub">{b.t.location}</div>}
                        {height > 76 && b.t.notes && <div className="sub note">{b.t.notes}</div>}
                      </div>
                    )
                  }
                  // No time block: bare task — colored class tag + checkbox + title,
                  // no fill and no border (border marks blocked tasks only).
                  return (
                    <div key={b.t.id} className={`evt task-chip-grid drag-block${dragCls}`}
                      style={style}
                      {...dragHandlers({ ...grab, mode: 'move' })}
                      onClick={(e) => { e.stopPropagation(); ui.openTask({ task: b.t }) }}>
                      {resizeHandle(grab)}
                      {label && (
                        <span className="task-tag"
                          style={{ background: hexToRgba(color, 0.28), color: titleTint(color) }}>
                          {label}
                        </span>
                      )}
                      <div className="task-main">
                        {checkbox}
                        <span className={`t ${b.t.done ? 'done-strike' : ''}`} style={{ color: titleTint(color) }}>
                          {b.t.title}
                        </span>
                      </div>
                    </div>
                  )
                })}

                {/* Deadlines: a coloured hairline across the whole column at the
                    due time, labelled above its right end. The layer is
                    click-through so events underneath stay reachable; only the
                    label itself opens the task. A bar goes faded + struck once
                    the work is submitted, and an extended-away deadline (ghost)
                    keeps its original slot the same way, with a small note. */}
                {dueBarsForDay(state, iso).map(({ task: t, dueMin, ghost }) => {
                  const due = dueMin ?? DUE_EOD_MIN
                  const color = taskColor(state, t.projectId)
                  const spent = ghost || !!t.submitted
                  const openDue = (e: React.MouseEvent) => { e.stopPropagation(); ui.openTask({ task: t }) }
                  const tip = ghost
                    ? `Was due ${fmtTime(due)} — ${t.title} (extension granted)`
                    : `Due ${fmtTime(due)} — ${t.title}${t.submitted ? ' (submitted)' : ''}`
                  // An extended-away deadline is history: only the live bar drags.
                  const dueDrag = ghost
                    ? {}
                    : dragHandlers({ kind: 'due', id: t.id, mode: 'move', occurrence: iso, origStart: due, origEnd: due })
                  return (
                    <div key={`due-${t.id}-${ghost ? `x${due}` : 'now'}`}
                      className={`due-layer${spent ? ' due-spent' : ''}${isDragging('due', t.id) && !ghost ? ' drag-source' : ''}`}
                      style={{ top: (due / 60) * HOUR_H }}>
                      {/* Invisible ~8px hit strip centred on the hairline so the
                          whole bar is clickable, not just the label. */}
                      <div className="due-hit" title={tip} onClick={openDue} {...dueDrag} />
                      <div className="due-label" style={{ color }} title={tip} onClick={openDue} {...dueDrag}>
                        <span className="due-txt">DUE — {t.title}</span>
                        <span className="due-flag">{DUE_FLAG}</span>
                        {ghost && <span className="due-ext-note">extension granted</span>}
                      </div>
                      <div className="due-line" style={{ background: color }} />
                    </div>
                  )
                })}

                {/* The same deadline bars for recurring occurrences: a weekly
                    problem set scheduled Monday shows its Friday deadline here,
                    every week, without a task per week. */}
                {recurringDueBarsForDay(state, iso).map(({ occ, dueMin, ghost }) => {
                  const due = dueMin ?? DUE_EOD_MIN
                  const color = taskColor(state, occ.rt.projectId)
                  const openDue = (e: React.MouseEvent) => {
                    e.stopPropagation()
                    ui.openRecurring({ rt: occ.rt, occurrence: occ.key })
                  }
                  const tip = ghost
                    ? `Was due ${fmtTime(due)} — ${occ.rt.title} (extension granted)`
                    : `Due ${fmtTime(due)} — ${occ.rt.title}`
                  const dueDrag = ghost
                    ? {}
                    : dragHandlers({
                      kind: 'recurringDue', id: occ.rt.id, mode: 'move',
                      occurrence: iso, occKey: occ.key, origStart: due, origEnd: due,
                    })
                  return (
                    <div key={`rdue-${occ.rt.id}-${occ.key}-${ghost ? `x${due}` : 'now'}`}
                      className={`due-layer${ghost ? ' due-spent' : ''}`}
                      style={{ top: (due / 60) * HOUR_H }}>
                      <div className="due-hit" title={tip} onClick={openDue} {...dueDrag} />
                      <div className="due-label" style={{ color }} title={tip} onClick={openDue} {...dueDrag}>
                        <span className="due-txt">DUE — {occ.rt.title} ↻</span>
                        <span className="due-flag">{DUE_FLAG}</span>
                        {ghost && <span className="due-ext-note">extension granted</span>}
                      </div>
                      <div className="due-line" style={{ background: color }} />
                    </div>
                  )
                })}

                {/* Study log: a stripe down the left edge of the day, painted in
                    solid per-segment class colours (a session that never switched
                    class is one segment, i.e. one solid colour), with translucent
                    windows where the breaks fell — the wash sits ON TOP, so a
                    break tints whichever segment colour it lands on. A running
                    session ends at `now`, so it grows with the 30s tick. */}
                {sessionsOnDay(state, iso).map((s) => {
                  const color = sessionColor(state, s.classId)
                  const end = sessionEnd(s, now.minutes)
                  const top = (s.startMin / 60) * HOUR_H
                  const height = Math.max(((end - s.startMin) / 60) * HOUR_H, 3)
                  const spans = segmentSpans(s, now.minutes)
                  const chipClasses = segmentClassIds(s)
                    .flatMap((id) => state.classes.find((c) => c.id === id) ?? [])
                  const sessTasks = s.taskIds.flatMap((id) => state.tasks.find((t) => t.id === id) ?? [])
                  const open = (e: React.MouseEvent) => { e.stopPropagation(); ui.openSession({ id: s.id }) }
                  return (
                    <div key={s.id} className="study-layer" style={{ top, height }}>
                      <div className="study-stripe" style={{ background: color }} onClick={open}
                        title={`Study session · ${fmtDuration(sessionDuration(s, now.minutes))}`}>
                        {spans.map((sp, i) => (
                          <div key={`seg${i}`} className="study-seg"
                            style={{
                              top: ((sp.startMin - s.startMin) / 60) * HOUR_H,
                              height: Math.max(((sp.endMin - sp.startMin) / 60) * HOUR_H, 1),
                              background: sessionColor(state, sp.classId),
                            }} />
                        ))}
                        {derivedBreaks(s, now.minutes).map((b, i) => (
                          <div key={i} className="study-brk"
                            style={{
                              top: ((b.startMin - s.startMin) / 60) * HOUR_H,
                              height: Math.max((b.durMin / 60) * HOUR_H, 2),
                              background: 'color-mix(in srgb, var(--bg) 70%, transparent)',
                            }} />
                        ))}
                      </div>
                      <div className="study-edge top" onClick={open}>{fmtTime(s.startMin)}</div>
                      <div className="study-edge bottom" onClick={open}>
                        {s.endMin == null ? 'now' : fmtTime(end)}
                      </div>
                      <div className="study-info" onClick={open}>
                        {/* One chip per class the session passed through, in order,
                            each followed by the attached to-dos belonging to that
                            class; to-dos from other classes/calendars trail last. */}
                        {(() => {
                          const taskClassId = (t: (typeof sessTasks)[number]) =>
                            projectById(state, t.projectId)?.classId ?? null
                          const grouped = new Set<string>()
                          const taskRow = (t: (typeof sessTasks)[number], tint: string) => (
                            <div key={t.id} className="study-task">
                              <TaskCheck task={t} color={tint} />
                              <span className={t.done ? 'done-strike' : ''} style={{ color: titleTint(tint) }}>
                                {t.title}
                              </span>
                            </div>
                          )
                          const blocks = chipClasses.map((c, i) => {
                            const mine = sessTasks.filter((t) => taskClassId(t) === c.id)
                            mine.forEach((t) => grouped.add(t.id))
                            // Each block spans at least its class's stripe segment, so
                            // the NEXT class's title never appears above the point on
                            // the stripe where the switch actually happened (long todo
                            // lists may push it lower — never higher).
                            const span = spans.find((sp) => sp.classId === c.id)
                            const minH = i < chipClasses.length - 1 && span
                              ? ((span.endMin - span.startMin) / 60) * HOUR_H
                              : undefined
                            return (
                              <div key={c.id} className="study-info-blk" style={minH ? { minHeight: minH } : undefined}>
                                <span className="task-tag"
                                  style={{ background: hexToRgba(c.color, 0.28), color: titleTint(c.color) }}>
                                  {c.name}
                                </span>
                                {mine.map((t) => taskRow(t, c.color))}
                              </div>
                            )
                          })
                          const rest = sessTasks.filter((t) => !grouped.has(t.id))
                          return <>{blocks}{rest.map((t) => taskRow(t, color))}</>
                        })()}
                        <div className="study-dur">◷ {fmtDuration(sessionDuration(s, now.minutes))}</div>
                      </div>
                    </div>
                  )
                })}

                {/* Live drop preview: an outline where the item would land. */}
                {drag?.active && drag.iso === iso && (
                  drag.kind === 'due' ? (
                    <div className="drag-preview dp-due" style={{ top: (drag.startMin / 60) * HOUR_H }}>
                      <span className="dp-time">{fmtTime(drag.startMin)}</span>
                    </div>
                  ) : (
                    <div className="drag-preview"
                      style={{
                        top: (drag.startMin / 60) * HOUR_H,
                        height: Math.max(((drag.endMin - drag.startMin) / 60) * HOUR_H - 2, 16),
                      }}>
                      <span className="dp-time">{fmtTime(drag.startMin)} – {fmtTime(drag.endMin)}</span>
                    </div>
                  )
                )}

                {/* The block being sketched on empty space, same outline as a drop preview. */}
                {createDrag?.active && createDrag.iso === iso && (
                  <div className="drag-preview"
                    style={{
                      top: (createDrag.startMin / 60) * HOUR_H,
                      height: Math.max(((createDrag.endMin - createDrag.startMin) / 60) * HOUR_H - 2, 16),
                    }}>
                    <span className="dp-time">{fmtTime(createDrag.startMin)} – {fmtTime(createDrag.endMin)}</span>
                  </div>
                )}

                {isToday && <div className="now-line" style={{ top: (now.minutes / 60) * HOUR_H }} />}
              </div>
            )
          })}
        </div>

        {/* Past midnight: one journal box per day, in the same scrollport as the
            time grid (so the default scroll position is untouched and it is
            found by scrolling past the last hour). */}
        <div className={`journal-lane${journalShut ? ' lane-shut' : ''}`}>
          <button type="button" className="gutter lane-toggle"
            title={journalShut ? 'Show journal boxes' : 'Collapse journal boxes'}
            aria-expanded={!journalShut}
            onClick={() => dispatch({ type: 'setCollapseJournal', on: !journalShut })}>
            <span className={`caret ${journalShut ? '' : 'open'}`}>▶</span>
          </button>
          {dates.map((d) => {
            const iso = toISO(d)
            return (
              <div key={iso} className={`journal-cell ${isDayOff(state, iso) ? 'day-off' : ''}`}>
                <button type="button" className="jl-head"
                  title={journalShut ? 'Show journal boxes' : 'Collapse journal boxes'}
                  onClick={() => dispatch({ type: 'setCollapseJournal', on: !journalShut })}>
                  <PencilGlyph size={11} />
                  <span>Journal</span>
                  {journalShut && state.dayLogs[iso]?.journal && <span className="jl-dot" aria-label="Has an entry">•</span>}
                </button>
                {!journalShut && <JournalBox date={iso} />}
              </div>
            )
          })}
        </div>
      </div>

      {/* Portalled onto <body>, like the InfoIcon tip: inside the grid the
          popover shared a stacking context with the day columns, so the day-off
          hatching (and other overlays) painted over it. */}
      {slotChooser && createPortal(
        <div
          className="slot-chooser"
          style={{ left: slotChooser.x, top: slotChooser.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={() => {
            ui.openEvent({ date: slotChooser.iso, startMin: slotChooser.startMin, endMin: slotChooser.endMin })
            setSlotChooser(null)
          }}>Event</button>
          {/* A plain click still hands the task editor nothing but the day —
              only a dragged span gives it a time and an expected-time block. */}
          <button type="button" onClick={() => {
            ui.openTask(slotChooser.endMin != null
              ? { date: slotChooser.iso, startMin: slotChooser.startMin, endMin: slotChooser.endMin }
              : { date: slotChooser.iso })
            setSlotChooser(null)
          }}>Task</button>
          <button type="button" onClick={() => {
            ui.openLogStudy({
              date: slotChooser.iso,
              startMin: slotChooser.startMin,
              endMin: slotChooser.endMin ?? Math.min(24 * 60, slotChooser.startMin + 60),
            })
            setSlotChooser(null)
          }}>Study log</button>
        </div>,
        document.body,
      )}

      {/* A dragged repeating event commits only once its scope is chosen. */}
      {scopePrompt && (
        <ScopePopover x={scopePrompt.x} y={scopePrompt.y}
          onCancel={() => setScopePrompt(null)}
          onPick={(scope) => {
            dispatch({
              type: 'moveEventOccurrence',
              id: scopePrompt.event.id, occurrence: scopePrompt.occurrence,
              scope, patch: scopePrompt.patchFor(scope),
            })
            setScopePrompt(null)
          }} />
      )}

      {/* A due bar dragged later: same extension question as the task editor. */}
      {extPrompt && (
        <ExtensionPopover x={extPrompt.x} y={extPrompt.y}
          from={{ dueDate: extPrompt.task.dueDate!, dueMin: extPrompt.task.dueMin ?? null }}
          to={{ dueDate: extPrompt.dueDate, dueMin: extPrompt.dueMin }}
          onCancel={() => setExtPrompt(null)}
          onSave={(granted) => {
            const t = extPrompt.task
            dispatch({
              type: 'updateTask',
              task: {
                ...t, dueDate: extPrompt.dueDate, dueMin: extPrompt.dueMin,
                extensions: granted
                  ? [...(t.extensions ?? []), { dueDate: t.dueDate!, dueMin: t.dueMin ?? null }]
                  : t.extensions,
              },
            })
            setExtPrompt(null)
          }} />
      )}

      {/* A dragged recurring occurrence: which occurrences does this apply to? */}
      {recPrompt && !recExtPrompt && (
        <ScopePopover x={recPrompt.x} y={recPrompt.y} noun="occurrence"
          onCancel={() => setRecPrompt(null)}
          onPick={(scope) => {
            const from = recPrompt.fromDue
            // A deadline pushed BACK asks the extension question next, exactly
            // as a task's due bar does; anything else commits straight away.
            if (from?.dueDate && recPrompt.patch.dueDate && recPrompt.patch.dueDate > from.dueDate) {
              setRecExtPrompt({ ...recPrompt, scope, from: { dueDate: from.dueDate, dueMin: from.dueMin } })
              return
            }
            commitRecurring(recPrompt, scope)
          }} />
      )}

      {recExtPrompt && (
        <ExtensionPopover x={recExtPrompt.x} y={recExtPrompt.y}
          from={recExtPrompt.from}
          to={{ dueDate: recExtPrompt.patch.dueDate!, dueMin: recExtPrompt.patch.dueMin ?? null }}
          onCancel={() => { setRecExtPrompt(null); setRecPrompt(null) }}
          onSave={(granted) => {
            const prev = recExtPrompt.rt.exceptions?.[recExtPrompt.occurrence]?.extensions ?? []
            // The abandoned deadline is a fact about ONE occurrence, so it is
            // only kept when the edit was scoped to that occurrence; moving the
            // whole series' offset simply moves every deadline.
            const keep = granted && recExtPrompt.scope === 'one'
            commitRecurring(recExtPrompt, recExtPrompt.scope, {
              ...recExtPrompt.patch,
              extensions: keep ? [...prev, recExtPrompt.from] : undefined,
            })
          }} />
      )}

      {bdayPop && (
        <BirthdayPopover x={bdayPop.x} y={bdayPop.y} init={bdayPop.init}
          onClose={() => setBdayPop(null)} />
      )}
    </>
  )
}
