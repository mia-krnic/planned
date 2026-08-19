import { useState, type ReactNode } from 'react'
import { useUI } from '../App'
import { classById, projectById, taskColor, useStore } from '../store'
import type { Task } from '../types'
import { DUE_EOD_MIN } from '../types'
import { addDays, fmtFriendly, fmtTime, fromISO, toISO, todayISO } from '../utils/date'
import { cbTint, dueTint, hexToRgba, titleTint } from '../utils/color'
import { DUE_FLAG, fmtDue } from '../utils/agenda'
import { occurrencesOn, recurringCount, recurringTimes, type RecurOccurrence } from '../utils/occur'
import ProjectTree from './ProjectTree'
import InfoIcon from './InfoIcon'
import TaskCheck from './TaskCheck'

interface Props {
  mode: 'sidebar' | 'full'
  onExpand: () => void
}

export default function TasksPanel({ mode, onExpand }: Props) {
  const { state, dispatch } = useStore()
  const ui = useUI()
  const [tab, setTab] = useState<'upcoming' | 'projects'>(mode === 'full' ? 'projects' : 'upcoming')
  const [pinnedOpen, setPinnedOpen] = useState(true)
  const [dueOpen, setDueOpen] = useState(true)
  const [syntaxOpen, setSyntaxOpen] = useState(false)
  const today = todayISO()
  const tomorrow = toISO(addDays(fromISO(today), 1))
  const weekOut = toISO(addDays(fromISO(today), 7))

  const projectLabel = (projectId: string | null) => {
    const p = projectById(state, projectId)
    if (!p) return null
    const cls = classById(state, p.classId)
    return cls ? cls.name : p.name
  }

  const taskRow = (t: Task) => {
    const color = taskColor(state, t.projectId)
    const label = projectLabel(t.projectId)
    const overdue = !t.done && t.date != null && t.date < today
    return (
      <div key={t.id} className="task-row" onClick={() => ui.openTask({ task: t })}>
        <TaskCheck task={t} color={color} />
        <div className="body">
          {label && (
            <span className="tag" style={{ background: hexToRgba(color, 0.22), color }}>{label}</span>
          )}
          <div className={`title ${t.done ? 'done-strike' : ''}`} style={{ color: titleTint(color) }}>{t.title}</div>
          {t.date && (
            <div className={`due ${overdue ? 'overdue' : ''}`}>
              {overdue ? 'Overdue · ' : 'Scheduled '}{fmtFriendly(t.date)}
              {t.startMin != null ? ` at ${fmtTime(t.startMin)}` : ''}
            </div>
          )}
          {fmtDue(t) && (
            <div className="due-note" style={dueTint(color)}>
              {DUE_FLAG} {fmtDue(t)}{t.extensions?.length ? ' · extended' : ''}
            </div>
          )}
          {t.submitted && <div className="submitted-note">✓ submitted</div>}
          {t.location && <div className="loc-note">⌖ {t.location}</div>}
        </div>
        <button className={`pin-btn ${t.pinned ? 'pinned' : ''}`}
          title={t.pinned ? 'Unpin' : 'Pin to top'}
          onClick={(e) => { e.stopPropagation(); dispatch({ type: 'toggleTaskPin', id: t.id }) }}>⚲</button>
      </div>
    )
  }

  const recurringRow = (occ: RecurOccurrence) => {
    const rt = occ.rt
    const color = taskColor(state, rt.projectId)
    const label = projectLabel(rt.projectId)
    const times = recurringTimes(rt)
    const count = recurringCount(rt, occ.key)
    const done = count >= times
    return (
      <div key={`${rt.id}-${occ.key}`} className="task-row"
        onClick={() => ui.openRecurring({ rt, occurrence: occ.key })}>
        <input type="checkbox" className="cb" checked={done}
          style={cbTint(color)}
          onClick={(e) => e.stopPropagation()}
          onChange={() => (times > 1
            ? dispatch({ type: 'setRecurringCount', id: rt.id, date: occ.key, count: done ? 0 : times })
            : dispatch({ type: 'toggleRecurring', id: rt.id, date: occ.key }))} />
        <div className="body">
          {label && (
            <span className="tag" style={{ background: hexToRgba(color, 0.22), color }}>{label}</span>
          )}
          <div className={`title ${done ? 'done-strike' : ''}`} style={{ color: titleTint(color) }}>
            {rt.title} ↻{times > 1 ? ` ${count}/${times}` : ''}
          </div>
        </div>
      </div>
    )
  }

  const active = state.tasks
  const pinned = active.filter((t) => t.pinned && !t.done)
  const dueAll = active
    .filter((t) => t.dueDate != null && !t.done)
    .sort((a, b) => {
      if (a.dueDate! !== b.dueDate!) return a.dueDate! < b.dueDate! ? -1 : 1
      return (a.dueMin ?? DUE_EOD_MIN) - (b.dueMin ?? DUE_EOD_MIN)
    })
  const overdue = active.filter((t) => !t.done && t.date != null && t.date < today)
  const dueToday = active.filter((t) => t.date === today)
  const recToday = state.recurring.flatMap((r) => occurrencesOn(r, today))
  const dueTomorrow = active.filter((t) => t.date === tomorrow)
  const thisWeek = active.filter((t) => t.date != null && t.date > tomorrow && t.date <= weekOut)
  const later = active.filter((t) => t.date != null && t.date > weekOut)
  const someday = active.filter((t) => t.date == null && !t.done)

  const group = (title: string, rows: ReactNode[], cls = '') =>
    rows.length > 0 && (
      <div className="date-group">
        <div className={`dg-title ${cls}`}>{title}</div>
        {rows}
      </div>
    )

  return (
    <div className={`tasks-panel ${mode === 'full' ? 'full' : ''}`}>
      <div className="tp-head">
        <h2>Tasks</h2>
        <div className="tp-tabs">
          <button className={tab === 'upcoming' ? 'active' : ''} onClick={() => setTab('upcoming')}>Upcoming</button>
          <button className={tab === 'projects' ? 'active' : ''} onClick={() => setTab('projects')}>Projects</button>
        </div>
        <button className="btn icon" title="Add task" onClick={() => ui.openTask({ date: today })}>＋</button>
        <button className="btn icon" title={mode === 'sidebar' ? 'Expand to full screen' : 'Back to calendar'} onClick={onExpand}>
          {mode === 'sidebar' ? '⤢' : '⤡'}
        </button>
      </div>

      <div className="tp-scroll">
        {/* Full-page Tasks: NL quick-add toggle + syntax help. */}
        {mode === 'full' && (
          <div className="nlqa-block">
            <label className="check-line nlqa-toggle">
              <input type="checkbox" className="cb"
                checked={!!state.nlQuickAdd}
                onChange={(e) => dispatch({ type: 'setNlQuickAdd', on: e.target.checked })} />
              Natural-language quick add
              <InfoIcon text="When on, the quick-add inputs in the projects tree parse things like 'essay draft tue 4pm p:PHIL due fri 17:00 @library' into title/date/time/project/due/location. When off, whatever you type is used verbatim as the title." />
            </label>
            <button className="btn small nlqa-syntax-btn" onClick={() => setSyntaxOpen((v) => !v)}>
              {syntaxOpen ? 'Hide syntax' : 'Show syntax'}
            </button>
            {syntaxOpen && (
              <div className="nlqa-syntax">
                <div><b>Dates:</b> today, tomorrow, tmrw, mon…sun, aug 30, 30/8</div>
                <div><b>Times:</b> 4pm, 4:30pm, 16:30</div>
                <div><b>Due:</b> <code>due &lt;date&gt; [time]</code> — e.g. <code>due fri 17:00</code></div>
                <div><b>Project:</b> <code>p:&lt;name&gt;</code> — case-insensitive prefix match</div>
                <div><b>Location:</b> <code>@place</code></div>
                <div><b>Title:</b> anything unmatched</div>
              </div>
            )}
          </div>
        )}

        {tab === 'projects' ? (
          <ProjectTree />
        ) : (
          <>
            {pinned.length > 0 && (
              <div className="pin-box">
                <div className="pin-box-head" onClick={() => setPinnedOpen((v) => !v)}>
                  <span className={`caret ${pinnedOpen ? 'open' : ''}`}>▶</span>
                  <span className="pin-glyph">⚲</span>
                  Pinned <span className="dg-count">{pinned.length}</span>
                </div>
                {pinnedOpen && <div className="pin-box-body">{pinned.map(taskRow)}</div>}
              </div>
            )}
            {dueAll.length > 0 && (
              <div className="date-group due-group">
                <div className="dg-title dg-title-clickable dg-title-due" onClick={() => setDueOpen((v) => !v)}>
                  <span className={`caret ${dueOpen ? 'open' : ''}`}>▶</span>
                  Due <span className="dg-count">{dueAll.length}</span>
                </div>
                {dueOpen && dueAll.map(taskRow)}
              </div>
            )}
            {group('Overdue', overdue.map(taskRow), 'overdue')}
            {group('Today', [...recToday.map(recurringRow), ...dueToday.map(taskRow)])}
            {group('Tomorrow', dueTomorrow.map(taskRow))}
            {group('This week', thisWeek.map(taskRow))}
            {group('Later', later.map(taskRow))}
            {group('Someday', someday.map(taskRow))}
            {pinned.length + dueAll.length + overdue.length + dueToday.length + recToday.length + dueTomorrow.length +
              thisWeek.length + later.length + someday.length === 0 && (
              <div className="empty-hint">Nothing here — add a task with ＋</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
