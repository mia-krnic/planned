import { createContext, useContext, useState } from 'react'
import { useUI } from '../App'
import { sortArchived, sortTaskList, taskColor, useStore, uid } from '../store'
import type { AppState, ID, Project, Task, TaskSection } from '../types'
import { t } from '../i18n'
import { dueTint, titleTint } from '../utils/color'
import { DUE_FLAG, fmtDue } from '../utils/agenda'
import { fmtFriendly, fmtTime, todayISO } from '../utils/date'
import { isSectionDrag, isTaskDrag, sectionDragId, setSectionDrag, setTaskDrag, taskDragId } from '../utils/dnd'
import { currentStreak, describeRule } from '../utils/occur'
import { parseQuickAdd } from '../utils/quickAdd'
import HabitStrip from './HabitStrip'
import InfoIcon from './InfoIcon'
import Ring from './Ring'
import TaskCheck from './TaskCheck'

/** Fills {name} placeholders in a t()'d template (see src/i18n/zh.ts). */
function fill(tpl: string, v: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''))
}

/** Sections of a project sorted by their stored `order`. */
function sectionsOf(state: AppState, projectId: ID): TaskSection[] {
  return state.taskSections
    .filter((s) => s.projectId === projectId)
    .sort((a, b) => a.order - b.order)
}

/** Where a dropped task lands: a project's main list, one of its sections, or Unfiled. */
interface Scope {
  projectId: ID | null
  sectionId: ID | null
}

/**
 * Reports the task being dragged, so drop zones that would otherwise not be
 * rendered (an empty Unfiled bin) can appear for the duration of the drag.
 * ProjectNode is also used standalone by the binder, hence the no-op default.
 */
const DragCtx = createContext<(id: ID | null) => void>(() => {})

/**
 * One draggable task row. Dropping a task on a row inserts the dragged task
 * above it, in that row's own list — which is what moves a task between
 * projects/sections too (projectId drives colour and tag, so they follow).
 *
 * Archived rows (a list's completed tasks) render identically but take no part
 * in drag & drop: there is no order to hold inside an Archive, and a drop
 * aimed at one falls through to the list behind it.
 */
function TaskRow({ task, planned, archived }: { task: Task; planned?: boolean; archived?: boolean }) {
  const { state, dispatch } = useStore()
  const ui = useUI()
  const setDragId = useContext(DragCtx)
  const [over, setOver] = useState(false)
  const color = taskColor(state, task.projectId)
  const due = fmtDue(task)
  const overdue = !task.done && task.date != null && task.date < todayISO()

  const dnd = archived ? {} : {
    draggable: true,
    onDragStart: (e: React.DragEvent) => { setTaskDrag(e, task.id); setDragId(task.id) },
    onDragEnd: () => { setDragId(null); setOver(false) },
    onDragOver: (e: React.DragEvent) => {
      if (!isTaskDrag(e)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      if (!over) setOver(true)
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      setOver(false)
      const src = taskDragId(e)
      // A row that changes list is remounted, so its dragend never arrives —
      // every drop clears the drag flag itself.
      setDragId(null)
      if (!src || src === task.id) return
      e.preventDefault()
      e.stopPropagation()
      dispatch({
        type: 'moveTask', id: src,
        projectId: task.projectId, sectionId: task.sectionId ?? null, beforeId: task.id,
      })
    },
  }

  return (
    <div
      className={`task-row${archived ? ' archived-row' : ' drag-row'}${over ? ' drop-target' : ''}`}
      {...dnd}
      onClick={() => ui.openTask({ task })}
    >
      <TaskCheck task={task} color={color} />
      <div className="body">
        <div className={`title ${task.done ? 'done-strike' : ''}`} style={{ color: titleTint(color) }}>{task.title}</div>
        {/* Planned (scheduled) date — plain grey small print, no colour. */}
        {planned && task.date && (
          <div className={`due ${overdue ? 'overdue' : ''}`}>
            {fmtFriendly(task.date)}{task.startMin != null ? ` · ${fmtTime(task.startMin)}` : ''}
          </div>
        )}
        {/* Due date — coloured DUE_FLAG line; always distinct from planned. */}
        {due && (
          <div className="due-note" style={dueTint(color)}>
            {DUE_FLAG} {due}{task.extensions?.length ? ` · ${t('extended')}` : ''}
          </div>
        )}
        {task.submitted && <div className="submitted-note">✓ {t('submitted')}</div>}
        {task.location && <div className="loc-note">⌖ {task.location}</div>}
      </div>
      {/* Nothing to pin to the top of: an archived task is already at rest. */}
      {!archived && (
        <button className={`pin-btn ${task.pinned ? 'pinned' : ''}`}
          title={task.pinned ? t('Unpin') : t('Pin to top')}
          onClick={(e) => { e.stopPropagation(); dispatch({ type: 'toggleTaskPin', id: task.id }) }}>⚲</button>
      )}
    </div>
  )
}

/**
 * The completed tail of one list (a section, a project's main list, Unfiled),
 * folded shut by default so finished work stops crowding what's left. Most
 * recently ticked off first; see sortArchived for the unstamped tail.
 */
function ArchiveBox({ tasks, planned }: { tasks: Task[]; planned?: boolean }) {
  const [open, setOpen] = useState(false)
  if (tasks.length === 0) return null
  return (
    <div className="archive-box">
      <div className="archive-head" onClick={() => setOpen((v) => !v)}
        title={open ? t('Hide completed tasks') : t('Show completed tasks')}>
        <span className={`caret ${open ? 'open' : ''}`}>▶</span>
        {t('Archive')} <span className="archive-count">{tasks.length}</span>
      </div>
      {open && (
        <div className="archive-body">
          {tasks.map((t) => <TaskRow key={t.id} task={t} planned={planned} archived />)}
        </div>
      )}
    </div>
  )
}

export function ProjectNode({ project }: { project: Project }) {
  const { state, dispatch } = useStore()
  const ui = useUI()
  const setDragId = useContext(DragCtx)
  const [quickAdd, setQuickAdd] = useState('')
  const [renaming, setRenaming] = useState<ID | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // Which drop zone the pointer is over ('head', 'body' or a section id).
  const [overKey, setOverKey] = useState<string | null>(null)
  // Section drags: the header a section would be dropped above, and the section
  // this project started dragging (so its own header shows no indicator).
  const [secOver, setSecOver] = useState<ID | null>(null)
  const [dragSec, setDragSec] = useState<ID | null>(null)

  const sections = sectionsOf(state, project.id)
  const own = state.tasks.filter((t) => t.projectId === project.id)
  const recurring = state.recurring.filter((r) => r.projectId === project.id)
  const doneCount = own.filter((t) => t.done).length
  const total = own.length
  const open = !project.collapsed

  // Recurring tasks live inside their section like any other task — the
  // frequency label (e.g. "every other week · Mon, Wed") marks them as such.
  const recurringOf = (secId: ID | null) => recurring.filter((r) => (r.sectionId ?? null) === secId)
  const recurringRow = (rt: (typeof recurring)[number]) => {
    const color = taskColor(state, rt.projectId)
    const streak = currentStreak(rt, today)
    return (
      <div key={rt.id}>
        <div className="habit-row">
          <span className="swatch" style={{ background: color }} />
          <span className="title" style={{ cursor: 'pointer', color: titleTint(color) }}
            onClick={() => ui.openRecurring({ rt })}>{rt.title}</span>
          <span className="freq">{describeRule(rt)}</span>
          {rt.streak && streak > 0 && <span className="streak-badge">⚡︎ {streak}</span>}
        </div>
        {rt.streak && <HabitStrip rt={rt} color={color} />}
      </div>
    )
  }

  const submitQuickAdd = () => {
    const raw = quickAdd.trim()
    if (!raw) return
    if (state.nlQuickAdd) {
      const parsed = parseQuickAdd(raw, state.projects)
      const title = parsed.title || raw
      dispatch({
        type: 'addTask',
        task: {
          id: uid(), title,
          projectId: parsed.projectId ?? project.id,
          sectionId: null, // NL quick-add drops in the project's main section
          date: parsed.date, startMin: parsed.startMin,
          dueDate: parsed.dueDate, dueMin: parsed.dueMin,
          location: parsed.location, done: false,
        },
      })
    } else {
      dispatch({ type: 'addTask', task: { id: uid(), title: raw, projectId: project.id, sectionId: null, date: null, startMin: null, done: false } })
    }
    setQuickAdd('')
  }

  /**
   * Drop handlers for a whole area (project head/body, a section block): the
   * task lands at the end of that list. Rows and inner blocks stop propagation,
   * so the innermost zone under the pointer is the one that takes the drop.
   */
  const dropZone = (key: string, scope: Scope) => ({
    onDragOver: (e: React.DragEvent) => {
      // A section dropped on the project itself (head or body) joins it at the
      // end. The per-section blocks take no section drops — those bubble up to
      // the body, so a miss still lands somewhere sensible.
      if (isSectionDrag(e)) {
        if (scope.sectionId !== null) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        if (overKey !== key) setOverKey(key)
        return
      }
      if (!isTaskDrag(e)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      if (overKey !== key) setOverKey(key)
    },
    onDragLeave: () => setOverKey((k) => (k === key ? null : k)),
    onDrop: (e: React.DragEvent) => {
      setOverKey(null)
      setDragId(null)
      const sec = scope.sectionId === null ? sectionDragId(e) : null
      if (sec) {
        setDragSec(null)
        e.preventDefault()
        e.stopPropagation()
        dropSection(sec, null)
        return
      }
      const src = taskDragId(e)
      if (!src) return
      e.preventDefault()
      e.stopPropagation()
      dispatch({ type: 'moveTask', id: src, projectId: scope.projectId, sectionId: scope.sectionId, beforeId: null })
    },
  })

  /**
   * A dropped section lands above `beforeId` (or at the end) in THIS project:
   * a plain reorder when it already lives here, otherwise a move that drags its
   * tasks and recurring tasks along.
   */
  const dropSection = (id: ID, beforeId: ID | null) => {
    const sec = state.taskSections.find((s) => s.id === id)
    if (!sec || id === beforeId) return
    if (sec.projectId === project.id) dispatch({ type: 'reorderTaskSection', id, beforeId })
    else dispatch({ type: 'moveTaskSection', id, projectId: project.id, beforeId })
  }

  /** Tasks for one section (or main = sectionId null/undefined). */
  const sectionTasks = (sectionId: ID | null): Task[] =>
    sortTaskList(own.filter((t) => (t.sectionId ?? null) === sectionId))

  /** The same list split into the live rows and the Archive behind them. */
  const splitTasks = (sectionId: ID | null) => {
    const list = sectionTasks(sectionId)
    return { active: list.filter((t) => !t.done), archived: sortArchived(list.filter((t) => t.done)) }
  }

  const startRename = (sec: TaskSection) => { setRenaming(sec.id); setRenameValue(sec.name) }
  const commitRename = () => {
    if (renaming && renameValue.trim()) dispatch({ type: 'renameTaskSection', id: renaming, name: renameValue.trim() })
    setRenaming(null)
  }
  const removeSection = (sec: TaskSection) => {
    const has = own.some((t) => t.sectionId === sec.id) || recurring.some((r) => r.sectionId === sec.id)
    const msg = has
      ? fill(t('Delete section "{name}"? Its tasks will move to {dest}.'),
        { name: sec.name, dest: project.classId ? t('Misc') : t('the main list') })
      : fill(t('Delete section "{name}"?'), { name: sec.name })
    if (!window.confirm(msg)) return
    dispatch({ type: 'deleteTaskSection', id: sec.id })
  }
  const addSection = () => {
    const name = window.prompt(t('Section name:'))
    if (name && name.trim()) dispatch({ type: 'addTaskSection', projectId: project.id, name: name.trim() })
  }

  /**
   * A section header: the drag handle for the whole section, the collapse
   * toggle, and the hover buttons. Task drops are deliberately left alone here
   * — they fall through to the section block behind it.
   */
  const sectionHeader = (sec: TaskSection) => {
    const list = sectionTasks(sec.id)
    const secDone = list.filter((t) => t.done).length
    return (
    <div key={`h-${sec.id}`}
      className={`task-section-head sec-drag${sec.collapsed ? ' collapsed' : ''}${secOver === sec.id && dragSec !== sec.id ? ' sec-drop-above' : ''}`}
      title={sec.collapsed ? t('Click to expand · drag to move the section') : t('Click to collapse · drag to move the section')}
      draggable={renaming !== sec.id}
      onDragStart={(e) => { setSectionDrag(e, sec.id); setDragSec(sec.id) }}
      onDragEnd={() => { setDragSec(null); setSecOver(null) }}
      onDragOver={(e) => {
        if (!isSectionDrag(e)) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        if (secOver !== sec.id) setSecOver(sec.id)
      }}
      onDragLeave={() => setSecOver((k) => (k === sec.id ? null : k))}
      onDrop={(e) => {
        const src = sectionDragId(e)
        setSecOver(null)
        // A section that changes project is remounted, so its dragend never
        // arrives — every drop clears the drag flag itself.
        setDragSec(null)
        if (!src) return // a task drop: let the section block behind take it
        e.preventDefault()
        e.stopPropagation()
        dropSection(src, sec.id)
      }}
      onClick={() => dispatch({ type: 'toggleSectionCollapse', id: sec.id })}>
      {renaming === sec.id ? (
        <input className="task-section-rename" autoFocus value={renameValue}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitRename() }
            if (e.key === 'Escape') { e.preventDefault(); setRenaming(null) }
          }} />
      ) : (
        <>
          <span className={`caret ${sec.collapsed ? '' : 'open'}`}>▶</span>
          <span className="task-section-name">{sec.name}</span>
          {sec.assignments && <span className="sec-tag">{t('Assignments')}</span>}
          {/* The graded-work flag is a class-project idea (it feeds the grade
              tracker), so calendar projects don't offer it. */}
          {project.classId != null && (
            <>
              <button className={`hover-btn${sec.assignments ? ' on' : ''}`}
                title={sec.assignments ? t('Remove the assignments flag') : t('Flag as an assignments section')}
                onClick={(e) => { e.stopPropagation(); dispatch({ type: 'toggleSectionAssignments', id: sec.id }) }}>
                {sec.assignments ? '⚑' : '⚐'}
              </button>
              <span className="sec-info">
                <InfoIcon text={t('Flagged sections hold graded work and feed the grade tracker. A class can flag as many sections as it likes (Coursework and Lab Reports, say).')} />
              </span>
            </>
          )}
          <button className="hover-btn" title={t('Add task in this section')}
            onClick={(e) => { e.stopPropagation(); ui.openTask({ projectId: project.id, sectionId: sec.id, date: null }) }}>＋</button>
          <button className="hover-btn" title={t('Rename section')}
            onClick={(e) => { e.stopPropagation(); startRename(sec) }}>✎</button>
          <button className="hover-btn" title={t('Delete section')}
            onClick={(e) => { e.stopPropagation(); removeSection(sec) }}>×</button>
          <span className="sec-count">{secDone}/{list.length}</span>
        </>
      )}
    </div>
    )
  }

  const main = splitTasks(null)
  const today = todayISO()

  return (
    <div className="project">
      <div className={`proj-head${overKey === 'head' ? ' drop-into' : ''}`}
        onClick={() => dispatch({ type: 'toggleCollapse', id: project.id })}
        {...dropZone('head', { projectId: project.id, sectionId: null })}>
        <span className={`caret ${open ? 'open' : ''}`}>▶</span>
        <span className="swatch" style={{ background: project.color }} />
        <span className="pname">{project.name}</span>
        <button className="hover-btn" title={t('Add task')}
          onClick={(e) => { e.stopPropagation(); ui.openTask({ projectId: project.id, date: null }) }}>＋</button>
        <button className="hover-btn" title={t('Add recurring task')}
          onClick={(e) => { e.stopPropagation(); ui.openRecurring({ projectId: project.id }) }}>↻</button>
        <button className="hover-btn" title={t('Add section')}
          onClick={(e) => { e.stopPropagation(); addSection() }}>§</button>
        <span className="count">{doneCount}/{total}</span>
        <Ring done={doneCount} total={total} color={project.color} />
      </div>

      {open && (
        <div className={`proj-body${overKey === 'body' ? ' drop-into' : ''}`}
          {...dropZone('body', { projectId: project.id, sectionId: null })}>
          {/* Main section: only shown with an explicit header if there are
              named sections too — otherwise its tasks render bare. */}
          {sections.length > 0 &&
            main.active.length + main.archived.length + recurringOf(null).length > 0 && (
            <div className="task-section-head"><span className="task-section-name">{t('Main')}</span></div>
          )}
          {recurringOf(null).map(recurringRow)}
          {main.active.map((t) => <TaskRow key={t.id} task={t} planned />)}
          <ArchiveBox tasks={main.archived} planned />

          {sections.map((sec) => {
            const { active, archived } = splitTasks(sec.id)
            return (
              <div key={sec.id} className={`task-sec${overKey === sec.id ? ' drop-into' : ''}`}
                {...dropZone(sec.id, { projectId: project.id, sectionId: sec.id })}>
                {sectionHeader(sec)}
                {/* Collapsed: the header (and its drop zone) stays, tasks hide. */}
                {!sec.collapsed && (
                  <>
                    {recurringOf(sec.id).map(recurringRow)}
                    {active.map((t) => <TaskRow key={t.id} task={t} planned />)}
                    <ArchiveBox tasks={archived} planned />
                  </>
                )}
              </div>
            )
          })}

          <div className="quick-add">
            <input
              placeholder={state.nlQuickAdd
                // The example keeps its English keywords: the parser only reads English.
                ? t('Add a task…  (try: essay tue 4pm p:PHIL due fri 17:00)')
                : t('Add a task… (unscheduled)')}
              value={quickAdd}
              onChange={(e) => setQuickAdd(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitQuickAdd()}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The full projects tree. Class projects render first as their own cards, then
 * one group per calendar (Personal first) — each calendar has exactly one
 * project. Unfiled tasks (projectId null) live in their own group at the
 * bottom with drag & drop reordering and pinning.
 */
export default function ProjectTree() {
  const { state, dispatch } = useStore()
  const [unfiledPinOpen, setUnfiledPinOpen] = useState(true)
  const [dragId, setDragId] = useState<ID | null>(null)
  const [overUnfiled, setOverUnfiled] = useState(false)

  const classRoots = state.projects.filter((p) => p.classId != null)
  const calGroups = [
    { id: 'personal', name: 'Personal' },
    ...state.customCalendars.map((c) => ({ id: c.id, name: c.name })),
  ].map((cal) => ({
    ...cal,
    project: state.projects.find((p) => p.classId == null && (p.calendarId ?? 'personal') === cal.id),
  }))

  const unfiled = sortTaskList(state.tasks.filter((t) => t.projectId === null))
  // Pinned tasks float to the top; within each group the drag order holds.
  // Completed ones drop out of both, into the Archive at the end.
  const unfiledPinned = unfiled.filter((t) => t.pinned && !t.done)
  const unfiledRest = unfiled.filter((t) => !t.pinned && !t.done)
  const unfiledArchived = sortArchived(unfiled.filter((t) => t.done))

  const unfiledDrop = {
    onDragOver: (e: React.DragEvent) => {
      if (!isTaskDrag(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (!overUnfiled) setOverUnfiled(true)
    },
    onDragLeave: () => setOverUnfiled(false),
    onDrop: (e: React.DragEvent) => {
      setOverUnfiled(false)
      setDragId(null)
      const src = taskDragId(e)
      if (!src) return
      e.preventDefault()
      dispatch({ type: 'moveTask', id: src, projectId: null, sectionId: null, beforeId: null })
    },
  }

  return (
    <DragCtx.Provider value={setDragId}>
      <div>
        {classRoots.map((p) => <ProjectNode key={p.id} project={p} />)}
        {calGroups.map((g) =>
          g.project ? (
            <div key={g.id} className="cal-group">
              {/* Only the built-in Personal calendar has a translatable name —
                  the rest are whatever the user called them. */}
              <div className="cal-group-title">{g.id === 'personal' ? t(g.name) : g.name}</div>
              <ProjectNode project={g.project} />
            </div>
          ) : null,
        )}

        {unfiled.length > 0 ? (
          <div className={`date-group unfiled-group${overUnfiled ? ' drop-into' : ''}`}
            style={{ marginTop: 14 }} {...unfiledDrop}>
            <div className="dg-title">{t('Unfiled')}</div>
            {unfiledPinned.length > 0 && (
              <div className="pin-box">
                <div className="pin-box-head" onClick={() => setUnfiledPinOpen((v) => !v)}>
                  <span className={`caret ${unfiledPinOpen ? 'open' : ''}`}>▶</span>
                  <span className="pin-glyph">⚲</span>
                  {t('Pinned')} <span className="dg-count">{unfiledPinned.length}</span>
                </div>
                {unfiledPinOpen && (
                  <div className="pin-box-body">
                    {unfiledPinned.map((t) => <TaskRow key={t.id} task={t} />)}
                  </div>
                )}
              </div>
            )}
            {unfiledRest.map((t) => <TaskRow key={t.id} task={t} />)}
            <ArchiveBox tasks={unfiledArchived} />
          </div>
        ) : (
          // With nothing unfiled there is no bin to aim at, so one appears for
          // the duration of a drag.
          dragId != null && (
            <div className={`date-group unfiled-group empty${overUnfiled ? ' drop-into' : ''}`}
              style={{ marginTop: 14 }} {...unfiledDrop}>
              <div className="dg-title">{t('Unfiled')}</div>
              <div className="empty-hint">{t('Drop here to take a task out of its project')}</div>
            </div>
          )
        )}
      </div>
    </DragCtx.Provider>
  )
}
