import { useRef, useState } from 'react'
import { useUI } from '../App'
import { useStore } from '../store'
import type { HabitGoal } from '../types'
import { fromISO, MONTHS, todayISO } from '../utils/date'
import {
  goalsForMonth, isTicked, isYearGoal, monthDates, prevMonthPeriod, progress,
} from '../utils/habits'
import InfoIcon from './InfoIcon'

/**
 * Hands a goal to the recurring-task editor, prefilled and unsaved: a daily
 * repeat on the Personal project. The goal is deliberately left in place —
 * whether a promoted goal keeps its gantt row is the user's call.
 */
export function usePromoteGoal(): (goal: HabitGoal) => void {
  const { state } = useStore()
  const ui = useUI()
  return (goal) => {
    const personal = state.projects.find((p) => p.classId == null && (p.calendarId ?? 'personal') === 'personal')
    ui.openRecurring({ title: goal.title, projectId: personal?.id, sectionId: null })
  }
}

/** The hover row of a goal: rename, promote, delete. */
function GoalActions({ goal, onRename }: { goal: HabitGoal; onRename: () => void }) {
  const { dispatch } = useStore()
  const promote = usePromoteGoal()
  return (
    <span className="hg-acts">
      <button type="button" className="hover-btn" title="Rename goal"
        onClick={(e) => { e.stopPropagation(); onRename() }}>✎</button>
      <button type="button" className="hover-btn hg-act-task" title="Promote to a recurring task"
        onClick={(e) => { e.stopPropagation(); promote(goal) }}>→ task</button>
      <button type="button" className="hover-btn" title="Delete goal"
        onClick={(e) => {
          e.stopPropagation()
          if (window.confirm(`Delete goal "${goal.title}"? Its ticks go with it.`)) {
            dispatch({ type: 'deleteHabitGoal', id: goal.id })
          }
        }}>×</button>
    </span>
  )
}

/**
 * A goal's name cell: the ⟳ marker for a year goal, the title, the hover
 * actions, and the inline rename input those actions swap it for.
 */
export function GoalName({ goal }: { goal: HabitGoal }) {
  const { dispatch } = useStore()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(goal.title)

  const commit = () => {
    dispatch({ type: 'renameHabitGoal', id: goal.id, title: value })
    setEditing(false)
  }

  if (editing) {
    return (
      <input className="hg-rename" autoFocus value={value}
        aria-label="Goal name"
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
        }} />
    )
  }
  return (
    <>
      {isYearGoal(goal) && (
        <span className="hg-year-tag" title={`Year goal — shows in every month of ${goal.period}`}>⟳</span>
      )}
      <span className="hg-title" title={goal.title}>{goal.title}</span>
      <GoalActions goal={goal} onRename={() => { setValue(goal.title); setEditing(true) }} />
    </>
  )
}

const GANTT_INFO =
  'One row per goal, one column per day of the month. Year goals (⟳) trickle down into every month; '
  + 'the rest belong to this month alone and start fresh next month. The figure on the right is the share '
  + 'of the days lived so far that you ticked.'

/** The month view's habit gantt: goals down the side, the month's days across. */
export default function HabitGantt({ anchor }: { anchor: string }) {
  const { state, dispatch } = useStore()
  const d = fromISO(anchor)
  const period = anchor.slice(0, 7)
  const year = anchor.slice(0, 4)
  const dates = monthDates(d.getFullYear(), d.getMonth())
  const today = todayISO()
  const goals = goalsForMonth(state, period)
  const shut = state.collapseHabits ?? false

  const [draft, setDraft] = useState('')
  const addRef = useRef<HTMLInputElement>(null)
  const addGoal = (p: string) => {
    if (!draft.trim()) { addRef.current?.focus(); return }
    dispatch({ type: 'addHabitGoal', title: draft, period: p })
    setDraft('')
  }

  // Carry-over is offered only on a month that has no goals of its own yet and
  // follows one that did — the "start of the month" moment, and no other.
  const ownCount = state.habitGoals.filter((g) => g.period === period).length
  const carried = state.habitGoals
    .filter((g) => g.period === prevMonthPeriod(period))
    .sort((a, b) => a.order - b.order)
  const carryOver = () => {
    for (const g of carried) dispatch({ type: 'addHabitGoal', title: g.title, period })
  }

  const tickedToday = today.slice(0, 7) === period
    ? goals.filter((g) => isTicked(state, g.id, today)).length
    : null

  return (
    <section className={`habit-gantt${shut ? ' hg-shut' : ''}`}>
      <div className="hg-bar">
        <button type="button" className="hg-toggle" aria-expanded={!shut}
          title={shut ? 'Show the habit gantt' : 'Collapse the habit gantt'}
          onClick={() => dispatch({ type: 'setCollapseHabits', on: !shut })}>
          <span className={`caret ${shut ? '' : 'open'}`}>▶</span>
          <span className="hg-heading">Habits</span>
        </button>
        <InfoIcon text={GANTT_INFO} />
        <span className="hg-summary">
          {goals.length === 0 ? 'no goals' : `${goals.length} goal${goals.length === 1 ? '' : 's'}`}
          {tickedToday != null && goals.length > 0 && ` · ${tickedToday}/${goals.length} today`}
        </span>
      </div>

      {!shut && (
        <>
          <div className="hg-scroll">
            <div className="hg-table">
              <div className="hg-row hg-headrow">
                <div className="hg-name hg-name-head">{MONTHS[d.getMonth()]}</div>
                {dates.map((iso) => (
                  <div key={iso} className={`hg-cell hg-dnum${iso === today ? ' hg-today' : ''}`}>
                    {Number(iso.slice(8))}
                  </div>
                ))}
                <div className="hg-pct hg-pct-head">%</div>
              </div>

              {goals.map((g) => {
                const p = progress(state, g.id, dates[0], dates[dates.length - 1], today)
                return (
                  <div key={g.id} className="hg-row">
                    <div className="hg-name"><GoalName goal={g} /></div>
                    {dates.map((iso) => {
                      const on = isTicked(state, g.id, iso)
                      return (
                        <button key={iso} type="button" aria-pressed={on}
                          className={`hg-cell hg-tick${on ? ' on' : ''}${iso === today ? ' hg-today' : ''}${iso > today ? ' hg-future' : ''}`}
                          title={`${g.title} — ${iso}`}
                          onClick={() => dispatch({ type: 'toggleHabitTick', goalId: g.id, date: iso })}>
                          {on ? '✓' : ''}
                        </button>
                      )
                    })}
                    <div className="hg-pct"
                      title={p.pct == null ? 'This month has not started yet' : `${p.done} of ${p.elapsed} days so far`}>
                      {p.pct == null ? '–' : `${p.pct}%`}
                    </div>
                  </div>
                )
              })}

              {goals.length === 0 && <div className="hg-empty">Nothing tracked this month yet.</div>}
            </div>
          </div>

          <div className="hg-foot">
            {ownCount === 0 && carried.length > 0 && (
              <button type="button" className="hg-carry" onClick={carryOver}
                title={`Recreate the ${carried.length} goal${carried.length === 1 ? '' : 's'} of ${prevMonthPeriod(period)} for this month`}>
                Carry over last month's goals ↻
              </button>
            )}
            <div className="hg-add">
              <input ref={addRef} className="hg-add-input" placeholder="+ Add goal"
                aria-label={`Add a goal for ${MONTHS[d.getMonth()]}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); addGoal(period) }
                  if (e.key === 'Escape') { e.preventDefault(); setDraft('') }
                }} />
              <button type="button" className="hg-add-year"
                title={`File what you typed as a year goal instead — it shows in every month of ${year}`}
                onClick={() => addGoal(year)}>
                + year goal
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
