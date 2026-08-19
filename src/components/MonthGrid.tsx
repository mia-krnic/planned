import React, { useEffect, useRef, useState } from 'react'
import { useUI } from '../App'
import { taskColor, useStore } from '../store'
import {
  BIRTHDAY_COLOR, birthdayLabel, birthdaysForDay, DUE_FLAG, dueBarsForDay, eventColor, examColorsForDay,
  examRingBackground, isDayOff, itemsForDay, recurringDueBarsForDay,
} from '../utils/agenda'
import type { Birthday, CalEvent, ID, Task } from '../types'
import { cbTint, hexToRgba } from '../utils/color'
import { addDays, daysBetween, fmtTime, fromISO, isSameDay, monthMatrix, toISO, weekdayLabels } from '../utils/date'
import { pastThreshold } from '../utils/drag'
import { recurringCount, recurringTimes, type EditScope } from '../utils/occur'
import TaskCheck from './TaskCheck'
import { ScopePopover } from './modals/DragPopovers'
import BirthdayPopover, { GiftMark } from './modals/BirthdayPopover'

const MAX_CHIPS = 3

/**
 * A chip dragged between month cells. The month view has no times, so a drop
 * only ever changes the date — everything else about the item is left alone.
 */
interface MonthDrag {
  kind: 'event' | 'task'
  id: ID
  from: string
  x0: number
  y0: number
  active: boolean
  iso: string
}

interface ScopePrompt {
  x: number
  y: number
  event: CalEvent
  occurrence: string
  patchFor: (scope: EditScope) => Partial<CalEvent>
}

export default function MonthGrid({ anchor }: { anchor: string }) {
  const { state, dispatch } = useStore()
  const ui = useUI()
  const anchorDate = fromISO(anchor)
  const matrix = monthMatrix(anchorDate, state.weekStart)
  const today = new Date()

  /* ---------- Drag & drop between day cells (date only) ---------- */

  const cellRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [drag, setDrag] = useState<MonthDrag | null>(null)
  const dragRef = useRef<MonthDrag | null>(null)
  const putDrag = (d: MonthDrag | null) => {
    dragRef.current = d
    setDrag(d)
  }
  const swallowClick = useRef(false)
  const [scopePrompt, setScopePrompt] = useState<ScopePrompt | null>(null)
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

  const beginDrag = (e: React.PointerEvent, init: Pick<MonthDrag, 'kind' | 'id' | 'from'>) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('input, button')) return
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    putDrag({ ...init, x0: e.clientX, y0: e.clientY, active: false, iso: init.from })
  }

  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      if (!d.active && !pastThreshold(d.x0, d.y0, e.clientX, e.clientY)) return
      swallowClick.current = true
      let iso = d.iso
      for (const [key, el] of Object.entries(cellRefs.current)) {
        const r = el?.getBoundingClientRect()
        if (r && e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom) {
          iso = key
          break
        }
      }
      putDrag({ ...d, active: true, iso })
    }
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current
      putDrag(null)
      setTimeout(() => { swallowClick.current = false }, 300)
      if (d?.active && d.iso !== d.from) commitDrag(d, e.clientX, e.clientY)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') putDrag(null)
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
  }, [drag !== null, anchor])

  const commitDrag = (d: MonthDrag, x: number, y: number) => {
    if (d.kind === 'task') {
      const t = state.tasks.find((tt) => tt.id === d.id)
      if (t) dispatch({ type: 'updateTask', task: { ...t, date: d.iso } })
      return
    }
    const ev = state.events.find((e) => e.id === d.id)
    if (!ev) return
    const delta = daysBetween(d.from, d.iso)
    const patchFor = (scope: EditScope): Partial<CalEvent> =>
      scope === 'all'
        ? { date: toISO(addDays(fromISO(ev.date), delta)) } // whole series shifts
        : { date: d.iso }
    if (ev.repeat !== 'none') {
      setScopePrompt({ x, y, event: ev, occurrence: d.from, patchFor })
      return
    }
    dispatch({ type: 'moveEventOccurrence', id: ev.id, occurrence: d.from, scope: 'all', patch: patchFor('all') })
  }

  return (
    <div className="month-grid">
      <div className="month-dows">
        {weekdayLabels(state.weekStart).map((d, i) => <div key={i}>{d}</div>)}
      </div>
      {matrix.map((row, r) => (
        <div key={r} className="month-row">
          {row.map((d) => {
            const iso = toISO(d)
            const items = itemsForDay(state, iso)
            type Chip =
              | { key: string; kind: 'event'; color: string; label: string; exam?: boolean; id: ID; onClick: (e: React.MouseEvent) => void }
              | { key: string; kind: 'task'; color: string; label: string; task: Task; onClick: (e: React.MouseEvent) => void }
              // Recurring occurrences are generated per day, so they take a
              // plain box in both checking modes. Dragging them needs a time
              // grid (and a scope prompt), so it stays a week-view affordance.
              | { key: string; kind: 'recurring'; color: string; label: string; done: boolean; onClick: (e: React.MouseEvent) => void; onToggle: () => void }
              | { key: string; kind: 'birthday'; color: string; label: string; bday: Birthday; onClick: (e: React.MouseEvent) => void }
            const chips: Chip[] = [
              ...birthdaysForDay(state, iso).map((b): Chip => ({
                key: `b${b.id}`, kind: 'birthday', color: BIRTHDAY_COLOR, label: b.name, bday: b,
                onClick: (e) => setBdayPop({ x: e.clientX, y: e.clientY, init: b }),
              })),
              ...items.allDayEvents.map((ev): Chip => ({
                key: `e${ev.id}`, kind: 'event', color: eventColor(state, ev), label: ev.title,
                exam: !!ev.isExam, id: ev.id,
                onClick: () => ui.openEvent({ event: ev, date: iso }),
              })),
              ...items.timedEvents.map((ev): Chip => ({
                key: `e${ev.id}`, kind: 'event', color: eventColor(state, ev),
                label: `${fmtTime(ev.startMin)} ${ev.title}`,
                exam: !!ev.isExam, id: ev.id,
                onClick: () => ui.openEvent({ event: ev, date: iso }),
              })),
              ...items.allDayTasks.concat(items.timedTasks).map((t): Chip => ({
                key: `t${t.id}`, kind: 'task', color: taskColor(state, t.projectId), label: t.title, task: t,
                onClick: () => ui.openTask({ task: t }),
              })),
              ...[...items.allDayRecurring, ...items.timedRecurring].map((occ): Chip => {
                const times = recurringTimes(occ.rt)
                const count = recurringCount(occ.rt, occ.key)
                const when = occ.startMin != null ? `${fmtTime(occ.startMin)} ` : ''
                const slots = times > 1 ? ` ${count}/${times}` : ''
                return {
                  key: `r${occ.rt.id}-${occ.key}`, kind: 'recurring', color: taskColor(state, occ.rt.projectId),
                  label: `${when}${occ.rt.title} ↻${slots}`, done: count >= times,
                  onClick: () => ui.openRecurring({ rt: occ.rt, occurrence: occ.key }),
                  // One box for the whole day here: the per-slot ticks live on
                  // the week grid, where there is room for them.
                  onToggle: () => (times > 1
                    ? dispatch({ type: 'setRecurringCount', id: occ.rt.id, date: occ.key, count: count >= times ? 0 : times })
                    : dispatch({ type: 'toggleRecurring', id: occ.rt.id, date: occ.key })),
                }
              }),
            ]
            const shown = chips.slice(0, MAX_CHIPS)
            const extra = chips.length - shown.length

            const dayOff = isDayOff(state, iso)
            const isToday = isSameDay(d, today)
            const examBg = examRingBackground(examColorsForDay(state, iso))
            // Deadlines land as small coloured flags in the cell's top-right
            // corner (at most three, then we stop). A submitted task's flag —
            // and an extended-away one — fades, matching the week grid's bars.
            // Recurring occurrences carry deadlines too, so they queue up here.
            const dueFlags = [
              ...dueBarsForDay(state, iso).map((b) => ({
                key: `${b.task.id}-${b.ghost ? 'x' : 'now'}`,
                color: taskColor(state, b.task.projectId),
                spent: b.ghost || !!b.task.submitted,
                title: b.ghost ? `Was due — ${b.task.title} (extension granted)` : `Due — ${b.task.title}`,
              })),
              ...recurringDueBarsForDay(state, iso).map((b) => ({
                key: `r${b.occ.rt.id}-${b.occ.key}-${b.ghost ? 'x' : 'now'}`,
                color: taskColor(state, b.occ.rt.projectId),
                spent: b.ghost,
                title: b.ghost ? `Was due — ${b.occ.rt.title} (extension granted)` : `Due — ${b.occ.rt.title}`,
              })),
            ].slice(0, 3)
            return (
              <div key={iso}
                ref={(el) => { cellRefs.current[iso] = el }}
                className={`month-cell ${d.getMonth() !== anchorDate.getMonth() ? 'outside' : ''} ${isToday ? 'today' : ''} ${dayOff ? 'day-off' : ''}${drag?.active && drag.iso === iso ? ' mc-drop' : ''}`}
                onClick={() => ui.gotoDay(iso)}>
                {/* Exam fill on the date pill; today keeps its solid accent pill untinted */}
                <span className="num" style={examBg && !isToday ? { background: examBg, borderRadius: 8 } : undefined}>
                  <span className="num-txt">{d.getDate()}</span>
                </span>
                {dueFlags.length > 0 && (
                  <span className="mc-due-flags">
                    {dueFlags.map((f) => (
                      <span key={f.key} className={`mc-due-flag${f.spent ? ' spent' : ''}`}
                        style={{ color: f.color }} title={f.title}>
                        {DUE_FLAG}
                      </span>
                    ))}
                  </span>
                )}
                {shown.map((c) => {
                  const done = c.kind === 'task' ? c.task.done : c.kind === 'recurring' ? c.done : false
                  const draggable = c.kind === 'event' || c.kind === 'task'
                  const dragging = drag?.active && draggable && drag.id === (c.kind === 'event' ? c.id : c.task.id)
                  return (
                    <div key={c.key}
                      className={`chip ${c.kind === 'event' && c.exam ? 'chip-exam' : ''}${draggable ? ' drag-block' : ''}${c.kind === 'birthday' ? ' chip-bday' : ''}${dragging ? ' drag-source' : ''}`}
                      title={c.kind === 'birthday' ? birthdayLabel(c.bday, iso) : undefined}
                      style={{
                        background: hexToRgba(c.color, 0.2), borderLeftColor: c.color,
                        ...(c.kind === 'event' && c.exam ? { borderColor: c.color } : {}),
                      }}
                      onPointerDown={(e) => {
                        if (!draggable) return
                        beginDrag(e, c.kind === 'event'
                          ? { kind: 'event', id: c.id, from: iso }
                          : { kind: 'task', id: c.task.id, from: iso })
                      }}
                      onClick={(e) => { e.stopPropagation(); c.onClick(e) }}>
                      {c.kind === 'task' && <TaskCheck task={c.task} color={c.color} />}
                      {c.kind === 'birthday' && <GiftMark size={12} />}
                      {c.kind === 'recurring' && (
                        <input type="checkbox" className="cb" checked={c.done}
                          style={cbTint(c.color)}
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          onChange={c.onToggle} />
                      )}
                      <span className={`label ${done ? 'done-strike' : ''}`}>{c.label}</span>
                    </div>
                  )
                })}
                {extra > 0 && <div className="more">+{extra} more</div>}
              </div>
            )
          })}
        </div>
      ))}

      {/* A repeating event dropped on another day picks its scope first. */}
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

      {bdayPop && (
        <BirthdayPopover x={bdayPop.x} y={bdayPop.y} init={bdayPop.init}
          onClose={() => setBdayPop(null)} />
      )}
    </div>
  )
}
