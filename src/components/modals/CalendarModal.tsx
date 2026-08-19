import { useState } from 'react'
import type { CalendarModalInit } from '../../App'
import { useStore } from '../../store'
import ColorPicker from '../ColorPicker'
import Modal from './Modal'

export default function CalendarModal({ init, onClose }: { init: CalendarModalInit; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const cal = init.cal

  const used = new Set(state.customCalendars.map((c) => c.color))
  const [name, setName] = useState(cal?.name ?? '')
  const [color, setColor] = useState(cal?.color ?? state.palette.find((c) => !used.has(c)) ?? state.palette[0] ?? '#7faee8')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const save = () => {
    if (!name.trim()) return
    if (cal) dispatch({ type: 'updateCalendar', cal: { ...cal, name: name.trim(), color } })
    else dispatch({ type: 'addCalendar', name: name.trim(), color })
    onClose()
  }

  const remove = () => {
    if (!cal) return
    dispatch({ type: 'deleteCalendar', id: cal.id })
    onClose()
  }

  return (
    <Modal title={cal ? 'Edit calendar' : 'Add calendar'} onClose={onClose}>
      {!cal && (
        <p style={{ marginTop: 0, fontSize: 12.5, color: 'var(--text-dim)' }}>
          A calendar of your own, for events that aren't Personal or tied to a class (e.g. a club or team).
        </p>
      )}
      <div className="field">
        <label>Calendar name</label>
        <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="e.g. Film Society" />
      </div>

      <div className="field">
        <label>Color</label>
        <ColorPicker value={color} onChange={setColor} />
      </div>

      {confirmingDelete && cal && (
        <div className="delete-confirm">
          <p>
            Deleting <strong>{cal.name}</strong> removes the calendar. Its events move to Personal instead of
            being deleted.
          </p>
          <div className="modal-actions">
            <button className="btn danger" onClick={remove}>Delete calendar</button>
            <div className="spacer" />
            <button className="btn" onClick={() => setConfirmingDelete(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="modal-actions">
        {cal && !confirmingDelete && (
          <button className="btn danger" onClick={() => setConfirmingDelete(true)}>Delete calendar</button>
        )}
        <div className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}>{cal ? 'Save' : 'Add calendar'}</button>
      </div>
    </Modal>
  )
}
