import { useMemo, useState } from 'react'
import { uid, useStore } from '../../store'
import type { StudyBreak, StudySession } from '../../types'
import { hmToMin, minToHm, nowMinutes, todayISO } from '../../utils/date'
import ColorSelect, { type ColorGroup } from '../ColorSelect'
import TimeSelect from '../TimeSelect'
import { BreaksEditor, classOnlyGroups, normalizeBreaks } from '../timer/SessionEditors'
import Modal from './Modal'

export interface LogStudyModalInit {
  date?: string
  startMin?: number
  endMin?: number
}

/**
 * Manual "I already did this" study log. Dispatches startStudySession with a
 * completed payload (endMin set) so the session lands as a finished record —
 * the reducer's "one running at a time" guard is fine with that since endMin
 * is not null.
 *
 * Like every other session editor this binds to a CLASS or to nothing; there is
 * deliberately no calendar option.
 */
export default function LogStudyModal({ init, onClose }: { init: LogStudyModalInit; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [classId, setClassId] = useState<string>('')
  const [date, setDate] = useState<string>(init.date ?? todayISO())
  const now = nowMinutes()
  const defaultStart = init.startMin ?? Math.max(0, now - 60)
  const defaultEnd = init.endMin && init.endMin > defaultStart ? init.endMin : Math.min(24 * 60, defaultStart + 60)
  const [startMin, setStartMin] = useState<number>(defaultStart)
  const [endMin, setEndMin] = useState<number>(defaultEnd)
  const [breaks, setBreaks] = useState<StudyBreak[]>([])
  const [reflection, setReflection] = useState<string>('')

  const classGroups = useMemo<ColorGroup[]>(() => classOnlyGroups(state), [state])

  const setStart = (v: string) => {
    const s = Math.max(0, Math.min(hmToMin(v), 24 * 60 - 1))
    const e = endMin <= s ? Math.min(24 * 60, s + 1) : endMin
    setStartMin(s)
    setEndMin(e)
    setBreaks((list) => normalizeBreaks(list, s, e))
  }
  const setEnd = (v: string) => {
    const e = Math.max(startMin + 1, Math.min(hmToMin(v), 24 * 60))
    setEndMin(e)
    setBreaks((list) => normalizeBreaks(list, startMin, e))
  }

  const canSave = endMin > startMin

  const save = () => {
    if (!canSave) return
    const session: StudySession = {
      id: uid(),
      classId: classId || null,
      taskIds: [],
      eventIds: [],
      date,
      startMin,
      endMin,
      mode: 'normal',
      breaks: normalizeBreaks(breaks, startMin, endMin),
      reflection: reflection.trim() || undefined,
    }
    dispatch({ type: 'startStudySession', session })
    onClose()
  }

  return (
    <Modal title="Log a study session" onClose={onClose}>
      <div className="field">
        <label>Class</label>
        <ColorSelect value={classId} groups={classGroups} onChange={setClassId} title="Class" />
      </div>

      <div className="field">
        <label>Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="field-row">
        <div className="field">
          <label>Start time</label>
          <TimeSelect value={minToHm(startMin)} onChange={setStart} />
        </div>
        <div className="field">
          <label>End time</label>
          <TimeSelect value={minToHm(endMin)} onChange={setEnd} />
        </div>
      </div>

      <div className="field">
        <label>Breaks (optional) — tag one to say why you paused</label>
        <BreaksEditor breaks={breaks} bound={{ startMin, endMin }} onChange={setBreaks} />
      </div>

      <div className="field">
        <label>Reflection (optional)</label>
        <textarea value={reflection} placeholder="How did it go? Notes for next time…"
          onChange={(e) => setReflection(e.target.value)} />
      </div>

      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <div className="spacer" />
        <button className="btn primary" onClick={save} disabled={!canSave}>Log session</button>
      </div>
    </Modal>
  )
}
