import { useMemo, useState } from 'react'
import type { EventModalInit } from '../../App'
import { classColorGroups, uid, useStore } from '../../store'
import type { CalEvent, Repeat } from '../../types'
import { PERSONAL_COLOR } from '../../utils/color'
import { hmToMin, minToHm, todayISO } from '../../utils/date'
import ColorSelect, { type ColorGroup } from '../ColorSelect'
import TimeSelect from '../TimeSelect'
import Modal from './Modal'

type EditScope = 'one' | 'future' | 'all'

export default function EventModal({ init, onClose }: { init: EventModalInit; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const ev = init.event
  // The specific occurrence the user opened (grids pass the clicked day);
  // falls back to the series start.
  const occurrence = init.date ?? ev?.date ?? todayISO()
  const isSeries = !!ev && ev.repeat !== 'none'

  const [title, setTitle] = useState(ev?.title ?? '')
  // Calendar select value: '' = Personal, 'cal:{id}' = custom calendar, {classId} = class.
  const [calendarSel, setCalendarSel] = useState<string>(
    ev?.classId ? ev.classId : ev?.calendarId ? `cal:${ev.calendarId}` : '',
  )
  const [date, setDate] = useState(occurrence)
  const [scope, setScope] = useState<EditScope>('one')
  const [allDay, setAllDay] = useState(ev?.allDay ?? init.allDay ?? false)
  const [start, setStart] = useState(minToHm(ev?.startMin ?? init.startMin ?? 9 * 60))
  const [end, setEnd] = useState(
    minToHm(ev?.endMin ?? init.endMin ?? (init.startMin != null ? init.startMin + 60 : 10 * 60)),
  )
  const [repeat, setRepeat] = useState<Repeat>(ev?.repeat ?? 'none')
  const [location, setLocation] = useState(ev?.location ?? '')
  const [notes, setNotes] = useState(ev?.notes ?? '')
  const [isExam, setIsExam] = useState(ev?.isExam ?? false)

  // Same option blocks as before, but as a ColorSelect so each calendar/class
  // carries its colour dot (a native <option> can't be painted).
  const calendarGroups = useMemo<ColorGroup[]>(() => [
    { options: [{ value: '', label: 'Personal', color: PERSONAL_COLOR }] },
    ...(state.customCalendars.length
      ? [{
          heading: 'My calendars',
          options: state.customCalendars.map((c) => ({ value: `cal:${c.id}`, label: c.name, color: c.color })),
        }]
      : []),
    ...classColorGroups(state),
  ], [state])

  const save = () => {
    if (!title.trim()) return
    let startMin = hmToMin(start)
    let endMin = hmToMin(end)
    if (endMin <= startMin) endMin = Math.min(startMin + 30, 24 * 60)
    const isCustomCal = calendarSel.startsWith('cal:')
    const next: CalEvent = {
      ...ev, // preserve hidden sync fields (icsUid, origin, syncMissing)
      id: ev?.id ?? uid(),
      title: title.trim(),
      classId: isCustomCal ? null : calendarSel || null,
      calendarId: isCustomCal ? calendarSel.slice(4) : null,
      date, allDay,
      startMin: allDay ? 0 : startMin,
      endMin: allDay ? 0 : endMin,
      repeat,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      isExam: isExam || undefined,
    }

    // Scoped edits on a repeating series ("only this" / "this and future"):
    // the series keeps its identity; the changed part becomes a new event.
    // ("this and future" from the very first occurrence = editing everything)
    if (ev && isSeries && (scope === 'one' || (scope === 'future' && occurrence > ev.date))) {
      const detached: CalEvent = {
        ...next,
        id: uid(),
        icsUid: undefined, origin: undefined, syncMissing: undefined,
        exDates: undefined, until: undefined,
        repeat: scope === 'one' ? 'none' : repeat,
      }
      if (scope === 'one') {
        dispatch({ type: 'updateEvent', event: { ...ev, exDates: [...(ev.exDates ?? []), occurrence] } })
      } else {
        dispatch({ type: 'updateEvent', event: { ...ev, until: occurrence } })
      }
      dispatch({ type: 'addEvent', event: detached })
      onClose()
      return
    }

    dispatch({ type: ev ? 'updateEvent' : 'addEvent', event: next })
    onClose()
  }

  const remove = () => {
    if (!ev) return
    if (isSeries && (scope === 'one' || (scope === 'future' && occurrence > ev.date))) {
      if (scope === 'one') {
        dispatch({ type: 'updateEvent', event: { ...ev, exDates: [...(ev.exDates ?? []), occurrence] } })
      } else {
        dispatch({ type: 'updateEvent', event: { ...ev, until: occurrence } })
      }
    } else {
      dispatch({ type: 'deleteEvent', id: ev.id })
    }
    onClose()
  }

  /** Swap this event for a task at the same time (one undo step; see the store). */
  const convert = () => {
    if (!ev || isSeries) return
    dispatch({ type: 'convertEventToTask', id: ev.id })
    onClose()
  }

  return (
    <Modal title={ev ? 'Edit event' : 'New event'} onClose={onClose}>
      {ev?.syncMissing && (
        <div className="sync-banner warn">
          ⚠ This event no longer exists on your synced university calendar.
        </div>
      )}
      {ev?.icsUid && !ev.syncMissing && (
        <div className="sync-banner">⬇ Synced from your university timetable.</div>
      )}
      <div className="field">
        <label>Title</label>
        <input type="text" autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="Event title" />
      </div>

      <div className="field">
        <label>Calendar</label>
        <ColorSelect value={calendarSel} groups={calendarGroups} onChange={setCalendarSel} title="Calendar" />
      </div>

      <div className="field-row">
        <div className="field">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Repeat</label>
          <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
            <option value="none">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
      </div>

      <label className="check-line">
        <input type="checkbox" className="cb" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        All-day
      </label>

      <label className="check-line">
        <input type="checkbox" className="cb" checked={isExam} onChange={(e) => setIsExam(e.target.checked)} />
        Flag as exam <span className="exam-hint">(shows a countdown + highlights the day)</span>
      </label>

      {!allDay && (
        <div className="field-row">
          <div className="field">
            <label>Starts</label>
            <TimeSelect value={start} onChange={setStart} />
          </div>
          <div className="field">
            <label>Ends</label>
            <TimeSelect value={end} onChange={setEnd} />
          </div>
        </div>
      )}

      <div className="field">
        <label>Location</label>
        <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
      </div>

      <div className="field">
        <label>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {isSeries && (
        <div className="field">
          <label>Apply changes / delete</label>
          <div className="scope-row">
            {([
              ['one', 'Only this event'],
              ['future', 'This and future events'],
              ['all', 'All events'],
            ] as const).map(([value, label]) => (
              <label key={value} className="scope-opt">
                <input type="radio" name="edit-scope" checked={scope === value} onChange={() => setScope(value)} />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="modal-actions">
        {ev && (
          <button className="btn danger" onClick={remove}>
            Delete{isSeries ? (scope === 'all' ? ' all' : scope === 'future' ? ' this + future' : ' this one') : ''}
          </button>
        )}
        {ev && (
          <button className="btn convert" onClick={convert} disabled={isSeries}
            title={isSeries
              ? 'A repeating event can\'t be converted — turning a series into recurring tasks isn\'t supported.'
              : 'Turn the saved event into a task on the same day and time'}>
            Convert to task ⇄
          </button>
        )}
        <div className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}>{ev ? 'Save' : 'Add event'}</button>
      </div>
    </Modal>
  )
}
