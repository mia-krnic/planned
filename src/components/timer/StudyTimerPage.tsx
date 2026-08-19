import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { groupedClasses, uid, useStore } from '../../store'
import type { ClassInfo, ID, StudyBreak, StudyMode, StudySession, Task } from '../../types'
import { cbTint, hexToRgba, titleTint } from '../../utils/color'
import { fmtTime, hmToMin, minToHm, nowMinutes, toISO } from '../../utils/date'
import ColorSelect, { type ColorGroup } from '../ColorSelect'
import InfoIcon from '../InfoIcon'
import TaskCheck from '../TaskCheck'
import TimeSelect from '../TimeSelect'
import {
  BreakTagChips, BreaksEditor, SegmentsEditor, UploadPicker, classOnlyGroups, mergeBreakTags, normalizeBreaks,
  type SegmentPatch,
} from './SessionEditors'
import {
  DAY_END, NEUTRAL_COLOR, clampCustomBreak, clampCustomWork, classIdAt, currentPhase, CUSTOM_BREAK_DEFAULT,
  CUSTOM_BREAK_MAX, CUSTOM_BREAK_MIN, CUSTOM_WORK_DEFAULT, CUSTOM_WORK_MAX, CUSTOM_WORK_MIN, cycleLabel,
  derivedBreaks, fmtClock, fmtDuration, isPomodoro, modeLabel, openTasksForClass, runningSession, sessionColor,
  sessionDuration, sessionsOnDay, STUDY_MODES, withClassSwitch,
} from '../../utils/study'

/** Small integer field with its own spinner (matches the Anki logger's box). */
function NumBox({ value, onChange, min, max, title }: {
  value: string
  onChange: (v: string) => void
  min: number
  max: number
  title: string
}) {
  const bump = (d: number) => {
    const n = parseInt(value, 10)
    onChange(String(Math.max(min, Math.min((Number.isFinite(n) ? n : min) + d, max))))
  }
  return (
    <div className="st-num">
      <input type="text" inputMode="numeric" title={title} value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
        onBlur={() => {
          const n = parseInt(value, 10)
          onChange(String(Number.isFinite(n) ? Math.max(min, Math.min(n, max)) : min))
        }} />
      <span className="st-spin">
        <button type="button" title="Increase" onClick={() => bump(1)}>▴</button>
        <button type="button" title="Decrease" onClick={() => bump(-1)}>▾</button>
      </span>
    </div>
  )
}

/**
 * The phase ring: a circle that is full when the current phase starts and empty
 * when it ends, in the colour of the class being studied right now. Purely
 * derived from `frac`, so the page's 1s repaint tick animates it for free.
 *
 * The arc is drawn with a single dash of the circumference and a NEGATIVE
 * dash offset, so the visible length is exactly `frac` of the ring and the
 * offset slides from 0 down to -c as the phase drains.
 */
function PhaseRing({ frac, color, size = 200, children }: {
  frac: number
  color: string
  size?: number
  children: ReactNode
}) {
  const f = Math.max(0, Math.min(frac, 1))
  const r = (size - 14) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="st-ring-wrap" style={{ width: size, height: size }}>
      <svg className="st-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="st-ring-bg" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={8} />
        <circle
          className="st-ring-fg"
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={8} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={-(c * (1 - f))}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="st-ring-inner">{children}</div>
    </div>
  )
}

/**
 * Seconds-since-midnight, ticking once a second. Display only — every piece of
 * timer *logic* derives from the stored session plus wall-clock, so leaving the
 * page (or reloading) never interrupts a running session.
 */
function useSecondTick(): number {
  const secOfDay = () => {
    const n = new Date()
    return n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds()
  }
  const [sec, setSec] = useState(secOfDay)
  useEffect(() => {
    const t = setInterval(() => setSec(secOfDay()), 1000)
    return () => clearInterval(t)
  }, [])
  return sec
}

/* ---------------- Daily study goal ---------------- */

const GOAL_INFO =
  'Your daily study target, in focused minutes (breaks do not count). It is what the Insights page '
  + 'measures your Target Achievement Rate against — the share of days you hit this goal. Clear it to stop tracking.'

const clampGoal = (n: number) => Math.max(1, Math.min(Math.round(n), 24 * 60))

/** Accepts "90", "90m", "1:30" or "1h30" — anything else is rejected (null). */
function parseGoalInput(raw: string): number | null {
  const s = raw.trim().toLowerCase()
  if (!s) return null
  const hm = /^(\d{1,2})\s*[:h]\s*(\d{1,2})?\s*m?$/.exec(s)
  if (hm) return clampGoal(Number(hm[1]) * 60 + Number(hm[2] ?? 0))
  const mins = /^(\d{1,4})\s*m?$/.exec(s)
  if (mins) return clampGoal(Number(mins[1]))
  return null
}

/** "1:30" — the edit box's own round-trip format. */
function goalToInput(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
}

/** Wall-clock minutes actually studied in a session, breaks removed. */
function activeMinutes(s: StudySession, nowMin: number): number {
  const total = sessionDuration(s, nowMin)
  const brk = derivedBreaks(s, nowMin).reduce((n, b) => n + b.durMin, 0)
  return Math.max(0, total - brk)
}

/**
 * "Today 1h 25m / 1h 30m goal" plus a slim bar. Sits next to the clock in both
 * the set-up and the running view, and is the only place the goal is edited.
 */
function DailyGoal({ todayMin }: { todayMin: number }) {
  const { state, dispatch } = useStore()
  const goal = state.studyGoalMin ?? null
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const beginEdit = () => {
    setDraft(goal ? goalToInput(goal) : '1:00')
    setEditing(true)
  }
  const commit = () => {
    const parsed = parseGoalInput(draft)
    if (parsed != null) dispatch({ type: 'setStudyGoal', minutes: parsed })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="st-goal editing">
        <span className="st-goal-lbl">Daily goal</span>
        <input className="st-goal-input" autoFocus value={draft} placeholder="90 or 1:30"
          title="Minutes (90) or hours:minutes (1:30)"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
          }} />
        <button type="button" className="btn st-goal-btn primary" onClick={commit}>Save</button>
        <button type="button" className="btn st-goal-btn" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    )
  }

  const pct = goal ? Math.min(100, Math.round((todayMin / goal) * 100)) : 0
  const hit = goal != null && todayMin >= goal
  return (
    <div className="st-goal">
      <div className="st-goal-head">
        <span className="st-goal-lbl">
          Daily goal
          <InfoIcon text={GOAL_INFO} />
        </span>
        {goal == null ? (
          <>
            <span className="st-goal-none">not set</span>
            <button type="button" className="btn st-goal-btn" onClick={beginEdit}>Set a goal</button>
          </>
        ) : (
          <>
            <span className="st-goal-num">
              Today <strong>{fmtDuration(todayMin)}</strong> / {fmtDuration(goal)} goal
              {hit ? ' ✓' : ''}
            </span>
            <button type="button" className="btn st-goal-btn" onClick={beginEdit}>Edit</button>
            <button type="button" className="btn st-goal-btn"
              onClick={() => dispatch({ type: 'setStudyGoal', minutes: null })}>Clear</button>
          </>
        )}
      </div>
      {goal != null && (
        <div className="st-goal-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`st-goal-fill ${hit ? 'done' : ''}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}

/* ---------------- Mid-session quick switching ---------------- */

/**
 * One-click class switching while a session runs: every class as a chip in
 * calendar-sidebar order, plus a grey "Unassigned" chip, in a strip that scrolls
 * sideways when there are more classes than fit. The chip in force is filled
 * with its own colour. Clicking one records a ClassSegment via withClassSwitch —
 * the same mechanism the (still available) segment editor writes through.
 */
function ClassSwitchStrip({ classes, current, onPick }: {
  classes: ClassInfo[]
  current: ID | null
  onPick: (id: ID | null) => void
}) {
  const chip = (key: string, id: ID | null, label: string, color: string) => {
    const on = current === id
    return (
      <button key={key} type="button" className={`qs-chip ${on ? 'on' : ''}`} aria-pressed={on}
        title={on ? `${label} — studying now` : `Switch to ${label}`}
        style={on
          ? { background: hexToRgba(color, 0.24), borderColor: hexToRgba(color, 0.65), color: titleTint(color) }
          : undefined}
        onClick={() => onPick(id)}>
        <span className="qs-dot" style={{ background: color }} />
        <span className="qs-name">{label}</span>
      </button>
    )
  }
  return (
    <div className="qs-strip" role="group" aria-label="Switch class">
      {chip('none', null, 'Unassigned', NEUTRAL_COLOR)}
      {classes.map((c) => chip(c.id, c.id, c.name, c.color))}
    </div>
  )
}

interface TaskGroup {
  key: string
  heading: string
  color: string
  tasks: Task[]
}

/**
 * Attaching a to-do mid-session in one click: the attached ones sit inline as
 * chips (tick to mark done, × to detach), and "+ Link a to-do" opens a small
 * searchable popover of every open task grouped by class in sidebar order.
 *
 * The popover is position:fixed off the button's viewport rect so the study
 * page's own scroll container can't clip it (same trick as ColorSelect).
 */
function TaskQuickPicker({ groups, attached, color, onToggle, onToggleDone }: {
  groups: TaskGroup[]
  attached: Task[]
  color: string
  onToggle: (id: ID) => void
  onToggleDone: (id: ID) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number }>()
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const toggleOpen = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) {
      const width = Math.max(r.width, 260)
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
      const below = window.innerHeight - r.bottom
      setPos(below < 300 && r.top > below
        ? { bottom: window.innerHeight - r.top + 4, left, width }
        : { top: r.bottom + 4, left, width })
    }
    setQ('')
    setOpen((o) => !o)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  const needle = q.trim().toLowerCase()
  const shown = needle
    ? groups
        .map((g) => ({ ...g, tasks: g.tasks.filter((t) => t.title.toLowerCase().includes(needle)) }))
        .filter((g) => g.tasks.length > 0)
    : groups
  const attachedIds = attached.map((t) => t.id)

  return (
    <div className="qt-wrap" ref={wrapRef}>
      <div className="qt-chips">
        {attached.map((t) => (
          <span key={t.id} className="qt-chip" style={{ borderColor: hexToRgba(color, 0.5) }}>
            <TaskCheck task={t} color={color} />
            <span className={t.done ? 'done-strike' : ''}>{t.title}</span>
            <button type="button" className="qt-x" title="Unlink from this session"
              onClick={() => onToggle(t.id)}>×</button>
          </span>
        ))}
        <button type="button" className="qt-add" ref={btnRef} onClick={toggleOpen}>
          + Link a to-do
        </button>
      </div>
      {open && (
        <div className="qt-pop" style={pos}>
          <input className="qt-search" autoFocus placeholder="Search to-dos…" value={q}
            onChange={(e) => setQ(e.target.value)} />
          <div className="qt-list">
            {shown.length === 0 && <div className="st-empty">No open to-dos match.</div>}
            {shown.map((g) => (
              <div key={g.key} className="qt-group">
                <div className="qt-head">
                  <span className="qs-dot" style={{ background: g.color }} />
                  {g.heading}
                </div>
                {g.tasks.map((t) => (
                  <button key={t.id} type="button"
                    className={`qt-opt ${attachedIds.includes(t.id) ? 'sel' : ''}`}
                    onClick={() => onToggle(t.id)}>
                    <span className="qt-tick">{attachedIds.includes(t.id) ? '✓' : ''}</span>
                    <span className={t.done ? 'done-strike' : ''}>{t.title}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Shared multi-select checklist of tasks (the pre-start set-up form). */
function TaskPicker({ tasks, selected, onToggle, color, empty }: {
  tasks: Task[]
  selected: ID[]
  onToggle: (id: ID) => void
  color: string
  empty: string
}) {
  if (!tasks.length) return <div className="st-empty">{empty}</div>
  return (
    <div className="st-list">
      {tasks.map((t) => (
        <label key={t.id} className="st-item">
          <input type="checkbox" className="cb" style={cbTint(color)}
            checked={selected.includes(t.id)} onChange={() => onToggle(t.id)} />
          <span className={t.done ? 'done-strike' : ''}>{t.title}</span>
        </label>
      ))}
    </div>
  )
}

/** Two-step end popup: confirm the finish, then confirm keeping the log. */
type EndStage = 'confirm' | 'kept'

export default function StudyTimerPage() {
  const { state, dispatch } = useStore()
  const sec = useSecondTick()
  const running = runningSession(state)

  // Set-up form (pre-start)
  const [mode, setMode] = useState<StudyMode>('pomodoro25')
  const [customWork, setCustomWork] = useState(String(CUSTOM_WORK_DEFAULT))
  const [customBreak, setCustomBreak] = useState(String(CUSTOM_BREAK_DEFAULT))
  const [classId, setClassId] = useState<string>('')
  const [taskIds, setTaskIds] = useState<ID[]>([])
  const [uploadIds, setUploadIds] = useState<ID[]>([])
  // The session just finished — its reflection box stays open until dismissed.
  const [endedId, setEndedId] = useState<ID | null>(null)
  const [reflection, setReflection] = useState('')
  // Collapsed by default: the running view is mostly a clock, these are escape hatches.
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [reflectOpen, setReflectOpen] = useState(false)
  // Ending is a two-step popup so neither the finish nor the log is accidental.
  const [endStage, setEndStage] = useState<EndStage | null>(null)

  const todayIso = toISO(new Date())
  const nowMin = sec / 60

  // A session belongs to a CLASS or to nothing — never to a calendar.
  const classGroups = useMemo<ColorGroup[]>(() => classOnlyGroups(state), [state])
  // Calendar-sidebar order, flattened: what the quick-switch strip walks.
  const sidebarClasses = useMemo(() => groupedClasses(state).flatMap((g) => g.classes), [state])

  // Every open to-do, grouped by class in sidebar order, unfiled last.
  const taskGroups = useMemo<TaskGroup[]>(() => {
    const out: TaskGroup[] = []
    for (const c of groupedClasses(state).flatMap((g) => g.classes)) {
      const list = openTasksForClass(state, c.id)
      if (list.length) out.push({ key: c.id, heading: c.name, color: c.color, tasks: list })
    }
    const unfiled = openTasksForClass(state, null)
    if (unfiled.length) out.push({ key: '_unfiled', heading: 'Unfiled', color: NEUTRAL_COLOR, tasks: unfiled })
    return out
  }, [state])

  // Focused minutes logged today — the daily goal's numerator.
  const todayMin = sessionsOnDay(state, todayIso).reduce((n, s) => n + activeMinutes(s, nowMin), 0)

  const formTasks = useMemo(() => openTasksForClass(state, classId || null), [state, classId])
  const formColor = sessionColor(state, classId || null)

  const pickClass = (id: string) => {
    setClassId(id)
    setTaskIds([])
    setUploadIds([])
  }
  const toggle = (list: ID[], set: (v: ID[]) => void) => (id: ID) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const start = () => {
    const session: StudySession = {
      id: uid(), classId: classId || null, taskIds, eventIds: [],
      uploadIds: uploadIds.length ? uploadIds : undefined,
      date: todayIso, startMin: nowMinutes(), endMin: null, mode, breaks: [],
      ...(mode === 'custom'
        ? {
            customWork: clampCustomWork(parseInt(customWork, 10) || CUSTOM_WORK_DEFAULT),
            customBreak: clampCustomBreak(parseInt(customBreak, 10) || CUSTOM_BREAK_DEFAULT),
          }
        : {}),
    }
    dispatch({ type: 'startStudySession', session })
    setEndedId(null)
    setTaskIds([])
    setUploadIds([])
  }

  /**
   * End the running session, then put back any break tags the reducer's
   * pomodoro materialisation would otherwise discard (it rebuilds `breaks` from
   * the rhythm; the tags only live on the session's own break records).
   */
  const endSession = (s: StudySession) => {
    const endMin = nowMinutes()
    dispatch({ type: 'endStudySession', id: s.id, endMin })
    const ended: StudySession = { ...s, endMin: Math.min(Math.max(endMin, s.startMin), DAY_END) }
    const materialised = derivedBreaks(ended, ended.endMin!)
    const tagged = mergeBreakTags(s.breaks, materialised)
    if (tagged.some((b, i) => b.tag !== materialised[i].tag)) {
      dispatch({ type: 'updateStudySession', session: { ...ended, breaks: tagged } })
    }
  }

  /* ---------------- The two-step end popup ---------------- */
  // Rendered by both the running view and the "just finished" view: the second
  // step happens *after* the session ended, so the popup has to outlive it.
  const endPopup = endStage && (
    <div className="scrim st-end-scrim">
      <div className={`modal modal-compact st-end-pop ${endStage === 'kept' ? 'open' : ''}`}>
        <div className="st-end-q">
          {endStage === 'kept' ? '✓ Session ended' : 'End this study session?'}
        </div>
        {endStage === 'confirm' && (
          <div className="st-end-actions">
            <button className="btn" onClick={() => setEndStage(null)}>Cancel</button>
            <div className="spacer" />
            <button className="btn danger" onClick={() => {
              if (!running) return
              endSession(running)
              setEndedId(running.id)
              setReflection(running.reflection ?? '')
              setEndStage('kept')
            }}>
              End session
            </button>
          </div>
        )}
        <div className="st-end-reveal">
          <div className="st-end-q2">Session ended — keep this log?</div>
          <div className="st-end-actions">
            <button className="btn danger" onClick={() => {
              if (endedId) dispatch({ type: 'deleteStudySession', id: endedId })
              setEndedId(null)
              setEndStage(null)
            }}>
              Delete log
            </button>
            <div className="spacer" />
            <button className="btn primary" onClick={() => setEndStage(null)}>Keep log</button>
          </div>
        </div>
      </div>
    </div>
  )

  /* ---------------- Running ---------------- */
  if (running) {
    // Everything colour- and list-related follows the class in force RIGHT NOW,
    // which is the last segment the session switched to (or its only one).
    const curClassId = classIdAt(running, nowMin)
    const color = sessionColor(state, curClassId)
    const elapsedSec = Math.max(0, sec - running.startMin * 60)
    const phase = currentPhase(running, nowMin)
    const onBreak = phase.phase === 'break'
    const ringed = isPomodoro(running.mode) && phase.leftMin != null && phase.totalMin != null
    const frac = ringed ? phase.leftMin! / phase.totalMin! : 0
    const linked = running.uploadIds ?? []
    const patch = (p: Partial<StudySession>) =>
      dispatch({ type: 'updateStudySession', session: { ...running, ...p } })
    const switchClass = (v: ID | null) => {
      const p = withClassSwitch(running, nowMin, v)
      if (p) patch(p)
    }

    // The break happening right now, as a window. For pomodoro it is derived
    // from the rhythm and only exists in `breaks` once the user tags it.
    const curBreak: StudyBreak | null =
      derivedBreaks(running, nowMin).find((b) => nowMin >= b.startMin && nowMin < b.startMin + b.durMin) ?? null
    const curTag = curBreak ? running.breaks.find((b) => b.startMin === curBreak.startMin)?.tag : undefined
    const tagCurrentBreak = (tag: string | undefined) => {
      if (!curBreak) return
      const known = running.breaks.some((b) => b.startMin === curBreak.startMin)
      patch({
        breaks: known
          ? running.breaks.map((b) => (b.startMin === curBreak.startMin ? { ...b, tag } : b))
          : [...running.breaks, { ...curBreak, tag }],
      })
    }

    // Attached to-dos, resolved and shown as chips even when done or filed
    // under a class the session has since switched away from.
    const attached = running.taskIds.flatMap((id) => state.tasks.find((t) => t.id === id) ?? [])
    const toggleTaskLink = (id: ID) => patch({
      taskIds: running.taskIds.includes(id)
        ? running.taskIds.filter((x) => x !== id)
        : [...running.taskIds, id],
    })

    const clock = <div className="st-clock" style={{ color: titleTint(color) }}>{fmtClock(elapsedSec)}</div>
    const ratio = cycleLabel(running)

    return (
      <div className="study-page">
        <div className="study-card running" style={{ borderColor: hexToRgba(color, 0.55) }}>
          <div className="st-mode-line">
            {modeLabel(running.mode)}
            {running.mode === 'custom' && ratio ? ` ${ratio}` : ''} · started {fmtTime(running.startMin)}
          </div>

          {ringed
            ? <PhaseRing frac={frac} color={color}>{clock}</PhaseRing>
            : clock}

          <div className="st-phase" style={{ background: hexToRgba(color, 0.22), color: titleTint(color) }}>
            <strong>{onBreak ? '◌ Break' : '◉ Work'}</strong>
            {phase.leftMin != null && (
              <span className="st-left">
                {fmtClock(phase.leftMin * 60)} {onBreak ? 'until work' : 'until break'}
              </span>
            )}
          </div>

          {onBreak && curBreak && (
            <BreakTagChips value={curTag} color={color} onChange={tagCurrentBreak} />
          )}

          <DailyGoal todayMin={todayMin} />

          <div className="field">
            <label>
              Studying
              <InfoIcon text="One click switches the running session to another class — the time before the switch stays with the class you were on. Fine-tune the switch times under “Adjust times”." />
              {running.classSegments?.length ? <span className="st-switched"> — switched mid-session</span> : null}
            </label>
            <ClassSwitchStrip classes={sidebarClasses} current={curClassId} onPick={switchClass} />
          </div>

          <div className="field">
            <label>
              Working on
              <InfoIcon text="To-dos you are working through this session. Tick one to mark it done, × to unlink it." />
            </label>
            <TaskQuickPicker groups={taskGroups} attached={attached} color={color}
              onToggle={toggleTaskLink}
              onToggleDone={(id) => dispatch({ type: 'toggleTask', id })} />
          </div>

          <div className="field">
            <label>Link binder files (optional) — notes you made or handouts you revised</label>
            <UploadPicker classId={curClassId} linked={linked} color={color}
              onToggle={(id) => patch({
                uploadIds: linked.includes(id) ? linked.filter((x) => x !== id) : [...linked, id],
              })} />
          </div>

          <div className="field st-adjust">
            <button type="button" className="st-adjust-toggle" onClick={() => setReflectOpen((v) => !v)}>
              {reflectOpen ? '▾' : '▸'} ✎ Reflection
            </button>
            {reflectOpen && (
              <div className="st-adjust-body">
                <textarea value={running.reflection ?? ''} placeholder="How is it going? Notes for next time…"
                  onChange={(e) => patch({ reflection: e.target.value || undefined })} />
              </div>
            )}
          </div>

          <div className="field st-adjust">
            <button type="button" className="st-adjust-toggle" onClick={() => setAdjustOpen((v) => !v)}>
              {adjustOpen ? '▾' : '▸'} ✎ Adjust times
            </button>
            {adjustOpen && (
              <div className="st-adjust-body">
                <div className="field">
                  <label>Start time</label>
                  <TimeSelect value={minToHm(running.startMin)} onChange={(v) => {
                    const nowFloor = Math.floor(nowMin)
                    const newStart = Math.max(0, Math.min(hmToMin(v), nowFloor - 1))
                    patch({ startMin: newStart, breaks: normalizeBreaks(running.breaks, newStart, nowFloor) })
                  }} />
                </div>
                <div className="field">
                  <label>Classes studied — start time of each switch</label>
                  <SegmentsEditor session={running}
                    endMin={Math.max(running.startMin + 1, Math.floor(nowMin))}
                    onChange={(p: SegmentPatch) => patch(p)} />
                </div>
                <div className="field">
                  <label>Breaks</label>
                  {running.mode === 'normal' ? (
                    <BreaksEditor breaks={running.breaks}
                      bound={{ startMin: running.startMin, endMin: Math.floor(nowMin) }}
                      onChange={(next) => patch({ breaks: next })} />
                  ) : (
                    <div className="st-empty">
                      Pomodoro breaks are automatic while running — editable after you end the session.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="st-actions">
            {running.mode === 'normal' && !onBreak && (
              <>
                <button className="btn" onClick={() => dispatch({ type: 'startBreak', id: running.id, durMin: 5 })}>
                  5 min break
                </button>
                <button className="btn" onClick={() => dispatch({ type: 'startBreak', id: running.id, durMin: 15 })}>
                  15 min break
                </button>
              </>
            )}
            {running.mode === 'normal' && onBreak && (
              <button className="btn" onClick={() => dispatch({ type: 'endBreakNow', id: running.id })}>
                End break now
              </button>
            )}
            <div className="spacer" />
            <button className="btn danger" onClick={() => setEndStage('confirm')}>
              End session
            </button>
          </div>

          <p className="st-note">
            The timer runs off the clock, not a countdown — switch pages or reload and it keeps going.
          </p>
        </div>
        {endPopup}
      </div>
    )
  }

  /* ---------------- Just finished: reflection ---------------- */
  const ended = endedId ? state.studySessions.find((s) => s.id === endedId) ?? null : null
  if (ended) {
    const color = sessionColor(state, ended.classId)
    return (
      <div className="study-page">
        <div className="study-card" style={{ borderColor: hexToRgba(color, 0.55) }}>
          <h2 className="st-title">Session finished</h2>
          <div className="st-summary">
            {fmtTime(ended.startMin)} – {fmtTime(ended.endMin ?? ended.startMin)}
            {' · '}<strong>{fmtDuration(sessionDuration(ended, nowMin))}</strong>
            {' · '}{modeLabel(ended.mode)}
          </div>
          <DailyGoal todayMin={todayMin} />
          <div className="field">
            <label>How did it go? Notes for next time…</label>
            <textarea value={reflection} placeholder="How did it go? Notes for next time…"
              onChange={(e) => setReflection(e.target.value)} />
          </div>
          <div className="st-actions">
            <div className="spacer" />
            <button className="btn" onClick={() => setEndedId(null)}>Skip</button>
            <button className="btn primary" onClick={() => {
              dispatch({ type: 'updateStudySession', session: { ...ended, reflection: reflection.trim() || undefined } })
              setEndedId(null)
            }}>
              Save
            </button>
          </div>
        </div>
        {endPopup}
      </div>
    )
  }

  /* ---------------- Set up a new session ---------------- */
  return (
    <div className="study-page">
      <div className="study-card">
        <h2 className="st-title">Study timer</h2>

        <DailyGoal todayMin={todayMin} />

        <div className="field">
          <label>Mode</label>
          <div className="st-modes">
            {STUDY_MODES.map((m) => (
              <label key={m.value} className={`st-mode ${mode === m.value ? 'on' : ''}`}>
                <input type="radio" name="study-mode" checked={mode === m.value}
                  onChange={() => setMode(m.value)} />
                <span className="st-mode-name">{m.label}</span>
                <span className="st-mode-hint">{m.hint}</span>
                {m.value === 'custom' && mode === 'custom' && (
                  // Only the custom row grows a ratio editor, and only when picked.
                  <div className="st-ratio" onClick={(e) => e.preventDefault()}>
                    <span className="st-ratio-lbl">work</span>
                    <NumBox value={customWork} onChange={setCustomWork}
                      min={CUSTOM_WORK_MIN} max={CUSTOM_WORK_MAX} title="Work minutes" />
                    <span className="st-ratio-lbl">min · break</span>
                    <NumBox value={customBreak} onChange={setCustomBreak}
                      min={CUSTOM_BREAK_MIN} max={CUSTOM_BREAK_MAX} title="Break minutes" />
                    <span className="st-ratio-lbl">min</span>
                  </div>
                )}
              </label>
            ))}
          </div>
        </div>

        <div className="field">
          <label>
            Class
            <InfoIcon text="A study session belongs to a class, or to nothing at all. “Unassigned” time is still counted — it just isn't attributed to a class." />
          </label>
          <ColorSelect value={classId} groups={classGroups} onChange={pickClass} />
        </div>

        <div className="field">
          <label>{classId ? 'Tasks to work on (optional)' : 'Unfiled tasks (optional)'}</label>
          <TaskPicker tasks={formTasks} selected={taskIds} color={formColor}
            empty={classId ? 'No open tasks in this class.' : 'No unfiled tasks.'}
            onToggle={toggle(taskIds, setTaskIds)} />
        </div>

        <div className="field">
          <label>Link binder files (optional) — notes you made or handouts you revised</label>
          <UploadPicker classId={classId || null} linked={uploadIds} color={formColor}
            onToggle={toggle(uploadIds, setUploadIds)} />
        </div>

        <button className="btn primary st-start" onClick={start}>Start studying</button>
      </div>
    </div>
  )
}
