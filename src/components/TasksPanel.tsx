import { useState, type ReactNode } from 'react'
import { useUI } from '../App'
import { classById, projectById, taskColor, useStore } from '../store'
import type { Task } from '../types'
import { DUE_EOD_MIN } from '../types'
import { t } from '../i18n'
import { addDays, fmtFriendly, fmtTime, fromISO, toISO, todayISO } from '../utils/date'
import { cbTint, dueTint, hexToRgba, titleTint } from '../utils/color'
import { DUE_FLAG, fmtDue } from '../utils/agenda'
import { occurrencesOn, recurringCount, recurringTimes, type RecurOccurrence } from '../utils/occur'
import AmbientWallpaper from './AmbientWallpaper'
import ProjectTree from './ProjectTree'
import InfoIcon from './InfoIcon'
import TaskCheck, { RecurringCheck } from './TaskCheck'

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

  // Named `task`, not `t`: `t` is the translation function in this file now.
  const taskRow = (task: Task) => {
    const color = taskColor(state, task.projectId)
    const label = projectLabel(task.projectId)
    const overdue = !task.done && task.date != null && task.date < today
    return (
      <div key={task.id} className="task-row" onClick={() => ui.openTask({ task })}>
        <TaskCheck task={task} color={color} />
        <div className="body">
          {label && (
            <span className="tag" style={{ background: hexToRgba(color, 0.22), color }}>{label}</span>
          )}
          <div className={`title ${task.done ? 'done-strike' : ''}`} style={{ color: titleTint(color) }}>{task.title}</div>
          {task.date && (
            <div className={`due ${overdue ? 'overdue' : ''}`}>
              {overdue ? `${t('Overdue')} · ` : `${t('Scheduled')} `}{fmtFriendly(task.date)}
              {task.startMin != null ? ` ${t('at')} ${fmtTime(task.startMin)}` : ''}
            </div>
          )}
          {fmtDue(task) && (
            <div className="due-note" style={dueTint(color)}>
              {DUE_FLAG} {fmtDue(task)}{task.extensions?.length ? ` · ${t('extended')}` : ''}
            </div>
          )}
          {task.submitted && <div className="submitted-note">✓ {t('submitted')}</div>}
          {task.location && <div className="loc-note">⌖ {task.location}</div>}
        </div>
        <button className={`pin-btn ${task.pinned ? 'pinned' : ''}`}
          title={task.pinned ? t('Unpin') : t('Pin to top')}
          onClick={(e) => { e.stopPropagation(); dispatch({ type: 'toggleTaskPin', id: task.id }) }}>⚲</button>
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
        <RecurringCheck rt={rt} date={occ.key} color={color} />
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
      {mode === 'full' && <AmbientWallpaper variant="sides" />}
      <div className="tp-head">
        <h2>{t('Tasks')}</h2>
        <div className="tp-tabs">
          <button className={tab === 'upcoming' ? 'active' : ''} onClick={() => setTab('upcoming')}>{t('Upcoming')}</button>
          <button className={tab === 'projects' ? 'active' : ''} onClick={() => setTab('projects')}>{t('Projects')}</button>
        </div>
        <button className="btn icon" title={t('Add task')} onClick={() => ui.openTask({ date: today })}>＋</button>
        <button className="btn icon" title={mode === 'sidebar' ? t('Expand to full screen') : t('Back to calendar')} onClick={onExpand}>
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
              {t('Natural-language quick add')}
              <InfoIcon text={t("When on, the quick-add inputs in the projects tree parse things like 'essay draft tue 4pm p:PHIL due fri 17:00 @library' into title/date/time/project/due/location. When off, whatever you type is used verbatim as the title.")} />
            </label>
            <button className="btn small nlqa-syntax-btn" onClick={() => setSyntaxOpen((v) => !v)}>
              {syntaxOpen ? t('Hide syntax') : t('Show syntax')}
            </button>
            {/* The syntax the parser accepts is English and stays English — only
                the labels around the examples are translated. */}
            {syntaxOpen && (
              <div className="nlqa-syntax">
                <div><b>{t('Dates:')}</b> today, tomorrow, tmrw, mon…sun, aug 30, 30/8</div>
                <div><b>{t('Times:')}</b> 4pm, 4:30pm, 16:30</div>
                <div><b>{t('Due:')}</b> <code>due &lt;date&gt; [time]</code> — {t('e.g.')} <code>due fri 17:00</code></div>
                <div><b>{t('Project:')}</b> <code>p:&lt;name&gt;</code> — {t('case-insensitive prefix match')}</div>
                <div><b>{t('Location:')}</b> <code>@place</code></div>
                <div><b>{t('Title:')}</b> {t('anything unmatched')}</div>
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
                  {t('Pinned')} <span className="dg-count">{pinned.length}</span>
                </div>
                {pinnedOpen && <div className="pin-box-body">{pinned.map(taskRow)}</div>}
              </div>
            )}
            {dueAll.length > 0 && (
              <div className="date-group due-group">
                <div className="dg-title dg-title-clickable dg-title-due" onClick={() => setDueOpen((v) => !v)}>
                  <span className={`caret ${dueOpen ? 'open' : ''}`}>▶</span>
                  {t('Due')} <span className="dg-count">{dueAll.length}</span>
                </div>
                {dueOpen && dueAll.map(taskRow)}
              </div>
            )}
            {group(t('Overdue'), overdue.map(taskRow), 'overdue')}
            {group(t('Today'), [...recToday.map(recurringRow), ...dueToday.map(taskRow)])}
            {group(t('Tomorrow'), dueTomorrow.map(taskRow))}
            {group(t('This week'), thisWeek.map(taskRow))}
            {group(t('Later'), later.map(taskRow))}
            {group(t('Someday'), someday.map(taskRow))}
            {pinned.length + dueAll.length + overdue.length + dueToday.length + recToday.length + dueTomorrow.length +
              thisWeek.length + later.length + someday.length === 0 && (
              <div className="empty-hint">{t('Nothing here — add a task with ＋')}</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
