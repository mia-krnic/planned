import { useRef, useState } from 'react'
import type { View } from '../App'
import { useStore } from '../store'
import {
  BIRTHDAY_COLOR, birthdayLabel, birthdaysForDay, dueColorsForDay, examColorsForDay, examRingBackground, isDayOff,
} from '../utils/agenda'
import { hexToRgba } from '../utils/color'
import { fromISO, isSameDay, monthMatrix, MONTHS, toISO, todayISO, weekdayLabels } from '../utils/date'
import { isTicked, monthDates, progress, yearGoals } from '../utils/habits'
import { GoalName } from './HabitGantt'
import InfoIcon from './InfoIcon'

interface Props {
  anchor: string
  setAnchor: (iso: string) => void
  setView: (v: View) => void
}

const YEAR_INFO =
  'Year goals run the whole year and trickle down into every month and week grid. '
  + 'Each square is a day — click it to tick it. The figure by the name is the share of the days '
  + 'lived so far that you ticked.'

/**
 * A read-only month in the sidebar mini-month's visual language: the same
 * numbers, today pill, exam pie, birthday tint and deadline dots, minus the
 * month navigation. Picking a day opens the week it falls in.
 */
function YearMiniMonth({ year, month, onPick }: { year: number; month: number; onPick: (iso: string) => void }) {
  const { state } = useStore()
  const today = new Date()
  const matrix = monthMatrix(new Date(year, month, 1), state.weekStart)

  return (
    <div className="mini-month yv-mm">
      <div className="mm-head"><span className="mm-title">{MONTHS[month]}</span></div>
      <div className="mm-grid">
        {weekdayLabels(state.weekStart).map((d, i) => (
          <div key={i} className="mm-dow">{d[0]}</div>
        ))}
        {matrix.flat().map((d) => {
          const iso = toISO(d)
          const cls = [
            'mm-cell',
            d.getMonth() !== month ? 'outside' : '',
            isSameDay(d, today) ? 'today' : '',
          ].join(' ')
          const examBg = examRingBackground(examColorsForDay(state, iso))
          const bdays = birthdaysForDay(state, iso)
          const bdayBox = bdays.length > 0 && !examBg
          const bdayTip = bdays.map((b) => birthdayLabel(b, iso)).join(' · ')
          return (
            <button key={iso} className={cls} onClick={() => onPick(iso)}
              title={bdayTip || undefined}>
              {examBg && <span className="exam-box" style={{ background: examBg }} />}
              {bdayBox && (
                <span className="exam-box bday-box" style={{ background: hexToRgba(BIRTHDAY_COLOR, 0.38) }} />
              )}
              <span className="mm-num">
                {isDayOff(state, iso) && <span className="dayoff-box" />}
                {d.getDate()}
              </span>
              <span className="mm-dots">
                {dueColorsForDay(state, iso).map((c, i) => (
                  <span key={i} className="mm-dot" style={{ background: c }} />
                ))}
                {bdays.length > 0 && examBg && (
                  <span className="mm-dot mm-dot-bday" style={{ background: BIRTHDAY_COLOR }} />
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** The year page: the year-goal gantt on top, twelve mini months below. */
export default function YearView({ anchor, setAnchor, setView }: Props) {
  const { state, dispatch } = useStore()
  const year = fromISO(anchor).getFullYear()
  const period = String(year)
  const goals = yearGoals(state, period)
  const today = todayISO()

  // One flat run of dates for the rows, plus the per-month lengths the header
  // groups are sized from — the two have to agree or the columns drift.
  const months = Array.from({ length: 12 }, (_, m) => monthDates(year, m))
  const dates = months.flat()
  const from = dates[0]
  const to = dates[dates.length - 1]

  const [draft, setDraft] = useState('')
  const addRef = useRef<HTMLInputElement>(null)
  const addGoal = () => {
    if (!draft.trim()) { addRef.current?.focus(); return }
    dispatch({ type: 'addHabitGoal', title: draft, period })
    setDraft('')
  }

  const jumpToWeek = (iso: string) => {
    setAnchor(iso)
    setView('week')
  }

  return (
    <div className="year-view">
      <div className="yv-head">
        <h2 className="yv-year">{year}</h2>
        <span className="yv-sub">
          {goals.length === 0 ? 'no year goals yet' : `${goals.length} year goal${goals.length === 1 ? '' : 's'}`}
        </span>
        <InfoIcon text={YEAR_INFO} />
      </div>

      <section className="yv-card">
        <div className="yv-scroll">
          <div className="yv-table">
            <div className="yv-row yv-monthrow">
              <div className="yv-name yv-name-head">
                <span className="yv-goal-head">Goal</span>
                <span className="yv-pct yv-pct-head">%</span>
              </div>
              {months.map((ds, m) => (
                <div key={m} className="yv-mhead" style={{ width: `calc(${ds.length} * var(--yv-cell))` }}>
                  <span className="yv-mhead-txt">{MONTHS[m].slice(0, 1)}</span>
                </div>
              ))}
            </div>

            {goals.map((g) => {
              const p = progress(state, g.id, from, to, today)
              return (
                <div key={g.id} className="yv-row">
                  <div className="yv-name">
                    <GoalName goal={g} />
                    <span className="yv-pct"
                      title={p.pct == null ? 'This year has not started yet' : `${p.done} of ${p.elapsed} days so far`}>
                      {p.pct == null ? '–' : `${p.pct}%`}
                    </span>
                  </div>
                  {dates.map((iso) => {
                    const on = isTicked(state, g.id, iso)
                    return (
                      <button key={iso} type="button" aria-pressed={on}
                        className={`yv-cell${on ? ' on' : ''}${iso === today ? ' yv-today' : ''}${iso > today ? ' yv-future' : ''}${iso.slice(8) === '01' ? ' yv-mstart' : ''}`}
                        title={`${g.title} — ${iso}`}
                        onClick={() => dispatch({ type: 'toggleHabitTick', goalId: g.id, date: iso })} />
                    )
                  })}
                </div>
              )
            })}

            {goals.length === 0 && <div className="yv-empty">No year goals yet — add one below.</div>}
          </div>
        </div>

        <div className="yv-add">
          <input ref={addRef} className="hg-add-input" placeholder="+ Add year goal"
            aria-label={`Add a year goal for ${year}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addGoal() }
              if (e.key === 'Escape') { e.preventDefault(); setDraft('') }
            }} />
        </div>
      </section>

      <div className="yv-months">
        {months.map((_, m) => (
          <YearMiniMonth key={m} year={year} month={m} onPick={jumpToWeek} />
        ))}
      </div>
    </div>
  )
}
