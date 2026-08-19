import { useMemo, useState } from 'react'
import type { TaskModalInit } from '../../App'
import { taskColor, uid, useStore } from '../../store'
import type { AppState, ID, Task } from '../../types'
import { DUE_EOD_MIN } from '../../types'
import { NEUTRAL_COLOR } from '../../utils/study'
import { fmtFriendly, fmtTime, hmToMin, minToHm } from '../../utils/date'
import TaskAttachments from '../binder/TaskAttachments'
import ColorSelect, { type ColorGroup } from '../ColorSelect'
import InfoIcon from '../InfoIcon'
import TimeSelect from '../TimeSelect'
import Modal from './Modal'

/**
 * Options for the (project, section) picker. Each project contributes one
 * entry for its "main" section (label = project name) and one per named
 * section (label indented under the project). Class projects come first, then
 * the calendar projects (Personal first).
 *
 * The value encodes both ids: "p:<projectId>|s:<sectionId>" or
 * "p:<projectId>|s:" for the project's main section.
 */
export interface ProjectSectionOption {
  value: string
  label: string
  projectId: ID
  sectionId: ID | null
}

export const NONE_VALUE = ''
export const encodeProjectSection = (projectId: ID | null, sectionId: ID | null | undefined): string =>
  projectId ? `p:${projectId}|s:${sectionId ?? ''}` : NONE_VALUE
export const decodeProjectSection = (v: string): { projectId: ID | null; sectionId: ID | null } => {
  if (!v) return { projectId: null, sectionId: null }
  const m = /^p:([^|]+)\|s:(.*)$/.exec(v)
  if (!m) return { projectId: null, sectionId: null }
  return { projectId: m[1], sectionId: m[2] || null }
}

export function projectSectionOptions(state: AppState): ProjectSectionOption[] {
  const out: ProjectSectionOption[] = []
  const push = (
    projectId: ID, projectName: string,
    sections: { id: ID; name: string; order: number; assignments?: boolean }[],
  ) => {
    const sorted = [...sections].sort((a, b) => a.order - b.order)
    if (sorted.length === 0) {
      out.push({ value: encodeProjectSection(projectId, null), label: projectName, projectId, sectionId: null })
      return
    }
    // Project header row (files into main section — used when the project has
    // sections but the user explicitly wants an unsectioned bin).
    out.push({ value: encodeProjectSection(projectId, null), label: projectName, projectId, sectionId: null })
    for (const s of sorted) {
      out.push({
        value: encodeProjectSection(projectId, s.id),
        // A dropdown row can't carry the grey ASSIGNMENTS tag, so flagged
        // sections say it in words instead.
        label: `    ${projectName} › ${s.name}${s.assignments ? ' · assignments' : ''}`,
        projectId, sectionId: s.id,
      })
    }
  }
  // Classes first, in their existing order.
  for (const p of state.projects.filter((pp) => pp.classId != null)) {
    push(p.id, p.name, state.taskSections.filter((s) => s.projectId === p.id))
  }
  // Personal, then custom calendars in order.
  const cals: { id: string; name: string }[] = [
    { id: 'personal', name: 'Personal' },
    ...state.customCalendars.map((c) => ({ id: c.id, name: c.name })),
  ]
  for (const cal of cals) {
    const p = state.projects.find((pp) => pp.classId == null && (pp.calendarId ?? 'personal') === cal.id)
    if (!p) continue
    push(p.id, cal.name, state.taskSections.filter((s) => s.projectId === p.id))
  }
  return out
}

/**
 * The same options as `projectSectionOptions`, shaped for ColorSelect: each row
 * gets its project's colour as a dot (a native <option> can't be painted), and
 * the leading pad of the section rows is dropped since "Project › Section"
 * already reads as a hierarchy.
 */
export function projectSectionColorOptions(state: AppState) {
  return projectSectionOptions(state).map((o) => ({
    value: o.value,
    label: o.label.trim(),
    color: taskColor(state, o.projectId),
  }))
}

export default function TaskModal({ init, onClose }: { init: TaskModalInit; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const t = init.task

  const [title, setTitle] = useState(t?.title ?? '')
  const [target, setTarget] = useState<string>(() =>
    encodeProjectSection(t?.projectId ?? init.projectId ?? null, t?.sectionId ?? null))
  const [date, setDate] = useState<string>(t?.date ?? init.date ?? '')
  // A new task only starts timed/blocked when the caller prefilled it — which
  // is what a drag-created block on the grid does.
  const [hasTime, setHasTime] = useState(t ? t.startMin != null : init.startMin != null)
  const [time, setTime] = useState(minToHm(t?.startMin ?? init.startMin ?? 9 * 60))
  const [hasBlock, setHasBlock] = useState(t ? t.endMin != null : init.endMin != null)
  const [endTime, setEndTime] = useState(minToHm(t?.endMin ?? init.endMin ?? 10 * 60))
  const [dueDate, setDueDate] = useState<string>(t?.dueDate ?? '')
  const [hasDueTime, setHasDueTime] = useState(t?.dueMin != null)
  const [dueTime, setDueTime] = useState(minToHm(t?.dueMin ?? 17 * 60))
  const [location, setLocation] = useState(t?.location ?? '')
  const [notes, setNotes] = useState(t?.notes ?? '')
  const [submitted, setSubmitted] = useState(!!t?.submitted)
  const [attachments, setAttachments] = useState<ID[]>(t?.attachmentUploadIds ?? [])
  // A save that pushes the deadline back waits here until the user says whether
  // it was an official extension (see save()).
  const [pendingLater, setPendingLater] = useState<Task | null>(null)
  const [granted, setGranted] = useState(true)

  const projectGroups = useMemo<ColorGroup[]>(() => [
    { options: [{ value: NONE_VALUE, label: 'None (Unfiled)', color: NEUTRAL_COLOR }] },
    { options: projectSectionColorOptions(state) },
  ], [state])

  // Binder attachments are a class idea: a task on a calendar project has no
  // binder to attach from, so the whole block stays out of its editor.
  const targetClassId = useMemo<ID | null>(() => {
    const { projectId } = decodeProjectSection(target)
    return state.projects.find((p) => p.id === projectId)?.classId ?? null
  }, [state.projects, target])

  const buildTask = (): Task => {
    const startMin = date && hasTime ? hmToMin(time) : null
    let endMin = startMin != null && hasBlock ? hmToMin(endTime) : null
    if (endMin != null && startMin != null && endMin <= startMin) {
      endMin = Math.min(startMin + 30, 24 * 60)
    }
    const { projectId, sectionId } = decodeProjectSection(target)
    return {
      id: t?.id ?? uid(),
      title: title.trim(),
      projectId,
      sectionId,
      date: date || null,
      startMin,
      endMin,
      // Clearing the date clears the time with it.
      dueDate: dueDate || null,
      dueMin: dueDate && hasDueTime ? hmToMin(dueTime) : null,
      location: location.trim() || undefined,
      done: t?.done ?? false,
      submitted: submitted || undefined,
      extensions: t?.extensions,
      notes: notes.trim() || undefined,
      pinned: t?.pinned,
      order: t?.order,
      // Kept even while the block is hidden: moving a task to a calendar
      // project and back shouldn't silently drop what it had attached.
      attachmentUploadIds: attachments.length ? attachments : undefined,
      completedAt: t?.completedAt,
      // Carried through untouched: a half-done tri-state must survive an edit,
      // and the store appends a new ghost itself when `date` moves day.
      yptState: t?.yptState,
      ghosts: t?.ghosts,
    }
  }

  const commit = (task: Task) => {
    dispatch({ type: t ? 'updateTask' : 'addTask', task })
    onClose()
  }

  const save = () => {
    if (!title.trim()) return
    const next = buildTask()
    // Only a LATER deadline raises the extension question — pulling one forward
    // is a plain edit. Compared by date: a same-day time change is silent too.
    if (t?.dueDate && next.dueDate && next.dueDate > t.dueDate) {
      setPendingLater(next)
      return
    }
    commit(next)
  }

  /** Save the pending later-due edit, recording the old deadline if granted. */
  const saveLater = () => {
    if (!pendingLater || !t?.dueDate) return
    commit(granted
      ? { ...pendingLater, extensions: [...(t.extensions ?? []), { dueDate: t.dueDate, dueMin: t.dueMin ?? null }] }
      : pendingLater)
  }

  // Task fields an event has no home for. Listed in the confirm below, but only
  // the ones actually set — a bare task converts without a question.
  const dropped = [
    t?.dueDate ? 'due date' : null,
    t?.submitted ? 'submitted' : null,
    t?.extensions?.length ? 'extension history' : null,
    t?.attachmentUploadIds?.length ? 'attachments' : null,
    t?.yptState ? 'progress state' : null,
    t?.sectionId ? 'section' : null,
  ].filter((s): s is string => s != null)

  /** Swap this task for an event on the same day (one undo step; see the store). */
  const convert = () => {
    if (!t?.date) return
    if (dropped.length && !window.confirm(
      `Converting to an event drops: ${dropped.join(', ')}.\n\nConvert anyway?`)) return
    dispatch({ type: 'convertTaskToEvent', id: t.id })
    onClose()
  }

  return (
    <Modal title={t ? 'Edit task' : 'New task'} onClose={onClose}>
      <div className="modal-section">
        <div className="modal-section-label">Basics</div>
        <div className="field">
          <label>Name</label>
          <input type="text" autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="Task name" />
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label>Project <InfoIcon text="Every class and every calendar has one project. Sections group tasks inside a project." /></label>
          <ColorSelect value={target} groups={projectGroups} onChange={setTarget} title="Project" />
        </div>
      </div>

      <div className="modal-section">
        <div className="modal-section-label">Plan — when you'll work on it</div>
        <div className="field">
          <label>Date <InfoIcon text="Leave empty to keep this as a braindump / unscheduled task." /></label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        {date && (
          <>
            <label className="check-line">
              <input type="checkbox" className="cb" checked={hasTime} onChange={(e) => setHasTime(e.target.checked)} />
              Set a time
              <InfoIcon text="Off = all-day. On = shown as a chip on the calendar's time grid." />
            </label>
            {hasTime && (
              <>
                <div className="field">
                  <label>Time</label>
                  <TimeSelect value={time} onChange={setTime} />
                </div>
                <label className="check-line">
                  <input type="checkbox" className="cb" checked={hasBlock} onChange={(e) => setHasBlock(e.target.checked)} />
                  Block out expected time
                  <InfoIcon text="Renders as an outlined box on the calendar so you can see the time you plan to spend." />
                </label>
                {hasBlock && (
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Until</label>
                    <TimeSelect value={endTime} onChange={setEndTime} />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Optional deadline metadata — independent of the scheduling above.
          Drawn as a coloured line across the day on the calendar. */}
      <div className="modal-section">
        <div className="modal-section-label">Due — when it must be done</div>
        <div className="field due-field">
          <label>Due date <InfoIcon text="Optional deadline metadata — independent of the scheduling above. Shown as a coloured line across the day on the calendar." /></label>
          <div className="due-row">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            {dueDate && (
              <button className="btn small" type="button"
                onClick={() => { setDueDate(''); setHasDueTime(false) }}>
                Clear
              </button>
            )}
          </div>
        </div>

        {dueDate && (
          <>
            <label className="check-line">
              <input type="checkbox" className="cb" checked={hasDueTime}
                onChange={(e) => setHasDueTime(e.target.checked)} />
              Due at a time
              <InfoIcon text="Off = end of day (11:59pm)." />
            </label>
            {hasDueTime && (
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Due at</label>
                <TimeSelect value={dueTime} onChange={setDueTime} />
              </div>
            )}
          </>
        )}
      </div>

      <div className="modal-section">
        <div className="modal-section-label">Details</div>
        <label className="check-line">
          <input type="checkbox" className="cb" checked={submitted}
            onChange={(e) => setSubmitted(e.target.checked)} />
          Submitted
          <InfoIcon text="For work you hand in — separate from “done”, since you can finish something long before submitting it. With a due date, the due bar on the calendar fades and strikes through once submitted; without one it's just a tracker." />
        </label>
        <div className="field">
          <label>Location <InfoIcon text="Optional — e.g. a room or landmark. Shown as a subtle line under the task." /></label>
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Library front desk · office 2.1" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      {/* Class tasks only — a calendar project has no binder behind it. */}
      {targetClassId && (
        <div className="modal-section">
          <div className="modal-section-label">
            Attachments
            <InfoIcon text="Binder uploads that belong to this task — the brief, the handout, your write-up. The grade tracker shows the documents of the tasks a component is built from, so filing them here is enough." />
          </div>
          <TaskAttachments classId={targetClassId} value={attachments} onChange={setAttachments} />
        </div>
      )}

      {/* Pushing a deadline back: ask once whether it was an official extension.
          If it was, the old deadline stays on the calendar (struck through). */}
      {pendingLater && t?.dueDate ? (
        <div className="ext-confirm">
          <div className="ext-confirm-head">Due date moved later</div>
          <div className="ext-confirm-sub">
            {fmtFriendly(t.dueDate)} {fmtTime(t.dueMin ?? DUE_EOD_MIN)}
            {' → '}
            {fmtFriendly(pendingLater.dueDate!)} {fmtTime(pendingLater.dueMin ?? DUE_EOD_MIN)}
          </div>
          <label className="check-line" style={{ marginBottom: 0 }}>
            <input type="checkbox" className="cb" checked={granted}
              onChange={(e) => setGranted(e.target.checked)} />
            Extension granted
            <InfoIcon text="Keeps the old deadline on its original day, faded and struck through with an “extension granted” note. Leave it off if you're simply rescheduling." />
          </label>
          <div className="modal-actions">
            <button className="btn" onClick={() => setPendingLater(null)}>Back</button>
            <div className="spacer" />
            <button className="btn primary" onClick={saveLater}>Save</button>
          </div>
        </div>
      ) : (
        <div className="modal-actions">
          {t && (
            <button className="btn danger" onClick={() => { dispatch({ type: 'deleteTask', id: t.id }); onClose() }}>
              Delete
            </button>
          )}
          {t && (
            <button className="btn convert" onClick={convert} disabled={!t.date}
              title={t.date
                ? 'Turn the saved task into an event on the same day and time'
                : 'An event has to sit on a day — give this task a date and save it first.'}>
              Convert to event ⇄
            </button>
          )}
          <div className="spacer" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>{t ? 'Save' : 'Add task'}</button>
        </div>
      )}
    </Modal>
  )
}
