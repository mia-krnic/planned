import { useState } from 'react'
import type { SessionModalInit } from '../../App'
import { useStore } from '../../store'
import type { StudySession, Task } from '../../types'
import { cbTint, hexToRgba, titleTint } from '../../utils/color'
import { fmtFriendly, fmtTime, hmToMin, minToHm, nowMinutes } from '../../utils/date'
import {
  DAY_END, cycleLabel, derivedBreaks, fmtDuration, modeLabel, openTasksForClass, segmentClassIds, sessionColor,
  sessionDuration, sessionEnd,
} from '../../utils/study'
import Modal from '../modals/Modal'
import TaskCheck from '../TaskCheck'
import TimeSelect from '../TimeSelect'
import { BreaksEditor, SegmentsEditor, UploadPicker, breakTagLabel, mergeBreakTags, normalizeBreaks } from './SessionEditors'

/** The "study log" popup: read the session back, adjust it, jot the reflection. */
export default function SessionModal({ init, onClose }: { init: SessionModalInit; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const s = state.studySessions.find((x) => x.id === init.id) ?? null
  const [reflection, setReflection] = useState(s?.reflection ?? '')

  if (!s) return null

  const now = nowMinutes()
  const color = sessionColor(state, s.classId)
  // One chip per class the session passed through, in switch order.
  const chipClasses = segmentClassIds(s).flatMap((id) => state.classes.find((c) => c.id === id) ?? [])
  const end = sessionEnd(s, now)
  const breaks = derivedBreaks(s, now)
  const breakMin = breaks.reduce((n, b) => n + b.durMin, 0)
  const running = s.endMin == null
  const pomodoroRunning = running && s.mode !== 'normal'

  const patch = (p: Partial<StudySession>) =>
    dispatch({ type: 'updateStudySession', session: { ...s, ...p } })

  // Start never crosses end; editing either one keeps that invariant, clamping
  // to a 1-minute minimum span, then re-clips the explicit breaks to fit.
  const setStart = (v: string) => {
    const newStart = Math.max(0, Math.min(hmToMin(v), end - 1))
    patch({ startMin: newStart, breaks: normalizeBreaks(s.breaks, newStart, end) })
  }
  const setEnd = (v: string) => {
    const newEnd = Math.max(s.startMin + 1, Math.min(hmToMin(v), DAY_END))
    if (running) {
      // Editing "end" on a still-running session ends it at that time —
      // mirrors endStudySession by materialising the pomodoro rhythm too, but
      // carries any break tags across the rebuild.
      const ended: StudySession = { ...s, endMin: newEnd }
      patch({ endMin: newEnd, breaks: mergeBreakTags(s.breaks, derivedBreaks(ended, newEnd)) })
    } else {
      patch({ endMin: newEnd, breaks: normalizeBreaks(s.breaks, s.startMin, newEnd) })
    }
  }
  const setEndNow = () => setEnd(minToHm(Math.min(nowMinutes(), DAY_END)))

  const open = openTasksForClass(state, s.classId)
  const extra = s.taskIds
    .map((id) => state.tasks.find((t) => t.id === id))
    .filter((t): t is Task => !!t && !open.some((o) => o.id === t.id))
  const candidates = [...open, ...extra]
  const linked = s.uploadIds ?? []
  const ratio = cycleLabel(s)

  return (
    <Modal title="Study session" onClose={onClose}>
      <div className="sm-head" style={{ background: hexToRgba(color, 0.18) }}>
        {chipClasses.map((c) => (
          <span key={c.id} className="task-tag"
            style={{ background: hexToRgba(c.color, 0.28), color: titleTint(c.color) }}>
            {c.name}
          </span>
        ))}
        <div className="sm-times" style={{ color: titleTint(color) }}>
          {fmtFriendly(s.date)} · {fmtTime(s.startMin)} – {s.endMin == null ? 'now' : fmtTime(end)}
        </div>
        <div className="sm-meta">
          ◷ {fmtDuration(sessionDuration(s, now))} · {modeLabel(s.mode)}{s.mode === 'custom' && ratio ? ` ${ratio}` : ''}
          {breaks.length > 0 && ` · ${breaks.length} break${breaks.length === 1 ? '' : 's'} (${fmtDuration(breakMin)})`}
          {s.endMin == null && ' · running'}
        </div>
      </div>

      {/* Class + mid-session switches in one list: the first row is the class the
          session started on (its start is pinned), every row below it a switch. */}
      <div className="field">
        <label>Class — and any mid-session switches</label>
        <SegmentsEditor session={s} endMin={Math.max(s.startMin + 1, end)} onChange={patch} />
      </div>

      <div className="field-row">
        <div className="field">
          <label>Start time</label>
          <TimeSelect value={minToHm(s.startMin)} onChange={setStart} />
        </div>
        <div className="field">
          <label>End time</label>
          <div className="sm-end-row">
            <TimeSelect value={minToHm(end)} onChange={setEnd} />
            <button type="button" className="btn sm-now-btn" onClick={setEndNow} title="Set end to now">
              now
            </button>
          </div>
        </div>
      </div>

      <div className="field">
        <label>Breaks</label>
        {pomodoroRunning ? (
          <>
            {breaks.length === 0 ? (
              <div className="st-empty">No breaks yet.</div>
            ) : (
              <div className="brk-list">
                {breaks.map((b, i) => (
                  <div key={i} className="brk-row brk-row-readonly">
                    <span>{fmtTime(b.startMin)} – {fmtTime(b.startMin + b.durMin)}</span>
                    <span className="brk-dur">{fmtDuration(b.durMin)}</span>
                    <span className="brk-tag-ro">
                      {breakTagLabel(s.breaks.find((x) => x.startMin === b.startMin)?.tag)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="st-empty">
              Pomodoro breaks are automatic while running — editable after you end the session.
            </div>
          </>
        ) : (
          <BreaksEditor breaks={s.breaks} bound={{ startMin: s.startMin, endMin: end }}
            onChange={(next) => patch({ breaks: next })} />
        )}
      </div>

      <div className="field">
        <label>Tasks — tick the left box to include, the right one to mark it done</label>
        {candidates.length === 0 ? (
          <div className="st-empty">No tasks to link here.</div>
        ) : (
          <div className="st-list">
            {candidates.map((t) => (
              <div key={t.id} className="st-item sm-task">
                <div className="sm-inc">
                  <input type="checkbox" className="cb" style={cbTint(color)}
                    title="Include in this session"
                    checked={s.taskIds.includes(t.id)}
                    onChange={() => patch({
                      taskIds: s.taskIds.includes(t.id)
                        ? s.taskIds.filter((x) => x !== t.id)
                        : [...s.taskIds, t.id],
                    })} />
                </div>
                <span className={t.done ? 'done-strike' : ''}>{t.title}</span>
                <label className="sm-done" title="Mark the task done">
                  done
                  <TaskCheck task={t} color={color} />
                </label>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="field">
        <label>Linked binder files — notes you made or handouts you revised</label>
        <UploadPicker classId={s.classId} linked={linked} color={color}
          onToggle={(id) => patch({
            uploadIds: linked.includes(id) ? linked.filter((x) => x !== id) : [...linked, id],
          })} />
      </div>

      <div className="field">
        <label>Reflection</label>
        <textarea value={reflection} placeholder="How did it go? Notes for next time…"
          onChange={(e) => {
            setReflection(e.target.value)
            patch({ reflection: e.target.value.trim() || undefined })
          }} />
      </div>

      <div className="modal-actions">
        <button className="btn danger" onClick={() => { dispatch({ type: 'deleteStudySession', id: s.id }); onClose() }}>
          Delete session
        </button>
        <div className="spacer" />
        <button className="btn primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  )
}
