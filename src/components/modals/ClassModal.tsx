import { useState } from 'react'
import type { ClassModalInit } from '../../App'
import { deleteFiles } from '../../api/files'
import { useStore } from '../../store'
import ColorPicker from '../ColorPicker'
import Modal from './Modal'

export default function ClassModal({ init, onClose }: { init: ClassModalInit; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const cls = init.cls

  const used = new Set(state.classes.map((c) => c.color))
  const [name, setName] = useState(cls?.name ?? '')
  const [color, setColor] = useState(cls?.color ?? state.palette.find((c) => !used.has(c)) ?? state.palette[0] ?? '#7faee8')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const save = () => {
    if (!name.trim()) return
    if (cls) dispatch({ type: 'updateClass', cls: { ...cls, name: name.trim(), color } })
    else dispatch({ type: 'addClass', name: name.trim(), color, folderId: init.folderId ?? null })
    onClose()
  }

  const remove = (keepProject: boolean) => {
    if (!cls) return
    // Clean up this class's binder file blobs before the metadata goes.
    const fileIds = state.binderUploads
      .filter((u) => u.classId === cls.id)
      .flatMap((u) => u.files.map((f) => f.id))
    void deleteFiles(fileIds)
    dispatch({ type: 'deleteClass', id: cls.id, keepProject })
    onClose()
  }

  return (
    <Modal title={cls ? 'Edit class' : 'Add class'} onClose={onClose}>
      {!cls && (
        <p style={{ marginTop: 0, fontSize: 12.5, color: 'var(--text-dim)' }}>
          Adding a class creates its own calendar view and a matching project for its tasks.
        </p>
      )}
      <div className="field">
        <label>Class name</label>
        <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="e.g. CHEM 101-003" />
      </div>

      <div className="field">
        <label>Color</label>
        <ColorPicker value={color} onChange={setColor} />
      </div>

      {confirmingDelete && cls && (
        <div className="delete-confirm">
          <p>
            Deleting <strong>{cls.name}</strong> removes its calendar events and binder pages.
            What should happen to its project (and the tasks inside)?
          </p>
          <div className="modal-actions">
            <button className="btn" onClick={() => remove(true)}>Keep project (unfiled)</button>
            <button className="btn danger" onClick={() => remove(false)}>Delete project too</button>
            <div className="spacer" />
            <button className="btn" onClick={() => setConfirmingDelete(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="modal-actions">
        {cls && !confirmingDelete && (
          <button className="btn danger" onClick={() => setConfirmingDelete(true)}>Delete class</button>
        )}
        <div className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}>{cls ? 'Save' : 'Add class'}</button>
      </div>
    </Modal>
  )
}
