import {
  useEffect, useMemo, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode,
} from 'react'
import { t } from '../../i18n'
import { groupedClasses, uid, useStore } from '../../store'
import type { ClassInfo, ID, StudyBreak, StudyMode, StudySession, Task } from '../../types'
import { cbTint, hexToRgba, titleTint } from '../../utils/color'
import { fmtTime, hmToMin, minToHm, nowMinutes, toISO } from '../../utils/date'
import AmbientWallpaper from '../AmbientWallpaper'
import ColorSelect, { type ColorGroup } from '../ColorSelect'
import InfoIcon from '../InfoIcon'
import TaskCheck from '../TaskCheck'
import TimeSelect from '../TimeSelect'
import {
  BreakTagChips, BreaksEditor, SegmentsEditor, UploadPicker, classOnlyGroups, mergeBreakTags, normalizeBreaks,
  type SegmentPatch,
} from './SessionEditors'
import {
  DAY_END, NEUTRAL_COLOR, clampCustomBreak, clampCustomWork, classIdAt, currentPhase, cycleFor, cycleLabel,
  derivedBreaks, fmtClock, fmtDuration, isPomodoro, modeLabel, openTasksForClass, runningSession, segmentSpans,
  sessionColor, sessionDuration, sessionsOnDay, withClassSwitch,
} from '../../utils/study'

/** Fills {name} placeholders in a t()'d template (see src/i18n/zh.ts). */
function fill(tpl: string, v: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''))
}

/* ---------------- The set-up dial ---------------- */

const DIAL_SIZE = 224
const DIAL_MID = DIAL_SIZE / 2
const R_FOCUS = 90
const R_BREAK = 62
/** One full lap of each ring, in minutes: 2 h of focus, 1 h of break. */
const FOCUS_LAP = 120
const BREAK_LAP = 60
const DIAL_SNAP = 5
/** Shortest either ring may be dragged to. */
const DIAL_FLOOR = 5
/** A pomodoro sitting is this many focus sessions before the marks wrap. */
const SITTING = 4

const PRESETS = [{ work: 25, brk: 5 }, { work: 50, brk: 10 }]

/** Minutes under the pointer: 0 at 12 o'clock, one lap clockwise, snapped. */
function dialMinutes(rect: DOMRect, clientX: number, clientY: number, lap: number): number {
  const dx = clientX - (rect.left + rect.width / 2)
  const dy = rect.top + rect.height / 2 - clientY
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI
  const raw = (((deg % 360) + 360) % 360) / 360 * lap
  return Math.round(raw / DIAL_SNAP) * DIAL_SNAP
}

/**
 * Where a drag should move the handle to. Taking the SHORT way round from
 * where the handle already is — and clamping rather than wrapping — is what
 * stops a drag across 12 o'clock from teleporting to the far end of the scale.
 */
function dialStep(prev: number, raw: number, lap: number): number {
  let d = raw - prev
  if (d > lap / 2) d -= lap
  if (d < -lap / 2) d += lap
  return Math.max(DIAL_FLOOR, Math.min(prev + d, lap))
}

/** A pie wedge from 12 o'clock, clockwise, `frac` of the way round. */
function piePath(c: number, r: number, frac: number): string {
  const a = Math.min(Math.max(frac, 0), 0.9999) * 2 * Math.PI
  const x = (c + r * Math.sin(a)).toFixed(2)
  const y = (c - r * Math.cos(a)).toFixed(2)
  return `M ${c} ${c} L ${c} ${c - r} A ${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${x} ${y} Z`
}

type DialRing = 'focus' | 'break'

/**
 * The clock face the session is set up on: an outer ring for the focus length
 * (one lap = 2 h) and an inner ring for the break (one lap = 1 h), both in
 * 5-minute snaps. Dragging is pointer-captured so a finger may wander off the
 * ring without losing it, and each ring is a keyboard slider as well.
 */
function TimerDial({ focus, brk, popped, onFocus, onBreak }: {
  focus: number
  brk: number
  popped: boolean
  onFocus: (v: number) => void
  onBreak: (v: number) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState<DialRing | null>(null)
  // Where the handle stands mid-drag, so every move can take the short way round.
  const live = useRef(0)

  const ring = (which: DialRing) => {
    const lap = which === 'focus' ? FOCUS_LAP : BREAK_LAP
    const set = which === 'focus' ? onFocus : onBreak
    const value = () => (which === 'focus' ? focus : brk)
    // A press jumps straight to where it landed; only moves take the short way.
    const apply = (e: ReactPointerEvent, jump: boolean) => {
      const r = svgRef.current?.getBoundingClientRect()
      if (!r) return
      const raw = dialMinutes(r, e.clientX, e.clientY, lap)
      const next = jump ? Math.max(DIAL_FLOOR, Math.min(raw, lap)) : dialStep(live.current, raw, lap)
      live.current = next
      if (next !== value()) set(next)
    }
    return {
      role: 'slider' as const,
      tabIndex: 0,
      'aria-label': which === 'focus' ? t('Focus length') : t('Break length'),
      'aria-valuemin': DIAL_FLOOR,
      'aria-valuemax': lap,
      'aria-valuenow': value(),
      'aria-valuetext': `${value()} ${t('minutes')}`,
      onPointerDown: (e: ReactPointerEvent<SVGCircleElement>) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        live.current = value()
        setDragging(which)
        apply(e, true)
      },
      onPointerMove: (e: ReactPointerEvent<SVGCircleElement>) => {
        if (dragging === which) apply(e, false)
      },
      onPointerUp: (e: ReactPointerEvent<SVGCircleElement>) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
        setDragging(null)
      },
      onPointerCancel: (e: ReactPointerEvent<SVGCircleElement>) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
        setDragging(null)
      },
      onKeyDown: (e: ReactKeyboardEvent) => {
        const step = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? DIAL_SNAP
          : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -DIAL_SNAP
          : 0
        if (step) {
          e.preventDefault()
          set(Math.max(DIAL_FLOOR, Math.min(value() + step, lap)))
        } else if (e.key === 'Home') {
          e.preventDefault()
          set(DIAL_FLOOR)
        } else if (e.key === 'End') {
          e.preventDefault()
          set(lap)
        }
      },
    }
  }

  const cF = 2 * Math.PI * R_FOCUS
  const cB = 2 * Math.PI * R_BREAK
  const spin = `rotate(-90 ${DIAL_MID} ${DIAL_MID})`

  return (
    <div className={`dial-wrap ${dragging ? 'dragging' : ''} ${popped ? 'popped' : ''}`}>
      <svg ref={svgRef} className="dial" width={DIAL_SIZE} height={DIAL_SIZE}
        viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}>
        <circle className="dial-track" cx={DIAL_MID} cy={DIAL_MID} r={R_FOCUS} />
        <circle className="dial-track" cx={DIAL_MID} cy={DIAL_MID} r={R_BREAK} />
        {[R_FOCUS, R_BREAK].flatMap((r, ri) => [1, 2, 3].map((q) => (
          <circle key={`${ri}-${q}`} className="dial-tick" r={1.6}
            cx={DIAL_MID + r * Math.sin((q * Math.PI) / 2)}
            cy={DIAL_MID - r * Math.cos((q * Math.PI) / 2)} />
        )))}
        <circle className="dial-arc focus" cx={DIAL_MID} cy={DIAL_MID} r={R_FOCUS} transform={spin}
          strokeDasharray={cF} strokeDashoffset={cF * (1 - focus / FOCUS_LAP)} />
        <circle className="dial-arc brk" cx={DIAL_MID} cy={DIAL_MID} r={R_BREAK} transform={spin}
          strokeDasharray={cB} strokeDashoffset={cB * (1 - brk / BREAK_LAP)} />
        <g className="dial-swing" transform={`rotate(${(focus / FOCUS_LAP) * 360} ${DIAL_MID} ${DIAL_MID})`}>
          <circle className="dial-knob focus" cx={DIAL_MID} cy={DIAL_MID - R_FOCUS} r={9} />
        </g>
        <g className="dial-swing" transform={`rotate(${(brk / BREAK_LAP) * 360} ${DIAL_MID} ${DIAL_MID})`}>
          <circle className="dial-knob brk" cx={DIAL_MID} cy={DIAL_MID - R_BREAK} r={7.5} />
        </g>
        {/* Wide transparent bands last, so the whole ring is grabbable. */}
        <circle className="dial-hit" cx={DIAL_MID} cy={DIAL_MID} r={R_FOCUS} strokeWidth={26} {...ring('focus')} />
        <circle className="dial-hit" cx={DIAL_MID} cy={DIAL_MID} r={R_BREAK} strokeWidth={24} {...ring('break')} />
      </svg>
      <div className="dial-read" aria-hidden="true">
        <div className="dial-read-big">{focus}<span className="dial-read-unit">{t('min')}</span></div>
        <div className="dial-read-sub">{t('focus')}</div>
        <div className="dial-read-brk">+ {brk} {t('min break')}</div>
      </div>
    </div>
  )
}

/**
 * The sitting's progress while a pomodoro runs: one mark per focus session,
 * the current one filling as its focus phase does. Nothing new is stored — the
 * count is elapsed time over the rhythm's span, wrapped every SITTING so a long
 * sitting opens a fresh row instead of growing a longer one.
 */
function SessionMarks({ session, nowMin, color }: {
  session: StudySession
  nowMin: number
  color: string
}) {
  const cyc = cycleFor(session)
  if (!cyc) return null
  const span = cyc.work + cyc.brk
  const elapsed = Math.max(0, nowMin - session.startMin)
  const done = Math.floor(elapsed / span)
  const idx = done % SITTING
  const frac = Math.min(1, (elapsed - done * span) / cyc.work)
  return (
    <div className="st-marks">
      <span className="st-marks-row" aria-hidden="true">
        {Array.from({ length: SITTING }, (_, i) => (
          <svg key={i} className="st-mark" width={17} height={17} viewBox="0 0 20 20">
            <circle className="st-mark-ring" cx={10} cy={10} r={7.4} stroke={color} />
            {i < idx && <circle cx={10} cy={10} r={7.4} fill={color} />}
            {i === idx && frac > 0 && <path d={piePath(10, 7.4, frac)} fill={color} />}
          </svg>
        ))}
      </span>
      <span className="st-marks-lbl">
        {fill(t('session {n} of {total}'), { n: idx + 1, total: SITTING })}
      </span>
    </div>
  )
}

/**
 * The session so far as one bar: a block per class stretch, sized by its time,
 * the last one growing with the clock. Switching class APPENDS a block rather
 * than recolouring the bar — which is the explanation nobody has to read.
 */
function SegmentBar({ session, nowMin }: { session: StudySession; nowMin: number }) {
  const { state } = useStore()
  const spans = segmentSpans(session, nowMin)
  const name = (id: ID | null) => (id && state.classes.find((c) => c.id === id)?.name) || t('Unassigned')
  return (
    <div className="st-segbar">
      <div className="st-segbar-track">
        {spans.map((sp, i) => (
          <div key={`${sp.startMin}-${sp.classId ?? 'none'}`}
            className={`st-seg ${i === spans.length - 1 ? 'live' : ''}`}
            title={`${name(sp.classId)} · ${fmtDuration(sp.endMin - sp.startMin)}`}
            style={{
              flexGrow: Math.max(sp.endMin - sp.startMin, 0.01),
              background: hexToRgba(sessionColor(state, sp.classId), 0.8),
            }} />
        ))}
      </div>
      <div className="st-segbar-keys">
        {spans.map((sp, i) => (
          <span key={`${sp.startMin}-${sp.classId ?? 'none'}`} className="st-segbar-key">
            {i > 0 && <span className="st-segbar-arrow">→</span>}
            <span className="qs-dot" style={{ background: sessionColor(state, sp.classId) }} />
            {name(sp.classId)} {fmtDuration(sp.endMin - sp.startMin)}
          </span>
        ))}
      </div>
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

/** Concentric rings round a centre dot — the goal banner's little bullseye. */
function TargetIcon() {
  return (
    <svg className="st-goal-icon" width={19} height={19} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx={10} cy={10} r={8.2} fill="none" strokeWidth={1.5} />
      <circle cx={10} cy={10} r={4.7} fill="none" strokeWidth={1.5} />
      <circle cx={10} cy={10} r={1.7} strokeWidth={0} />
    </svg>
  )
}

/**
 * "Today 1h 25m / 1h 30m ✓" behind a little target, over a slim bar. Sits at
 * the top of the set-up card and beside the clock while running, and is the
 * only place the goal is edited — the Edit/Clear buttons stay out of the way
 * until the banner is hovered or focused.
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
        <span className="st-goal-lbl">{t('Daily goal')}</span>
        <input className="st-goal-input" autoFocus value={draft} placeholder={t('90 or 1:30')}
          title={t('Minutes (90) or hours:minutes (1:30)')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
          }} />
        <button type="button" className="btn st-goal-btn primary" onClick={commit}>{t('Save')}</button>
        <button type="button" className="btn st-goal-btn" onClick={() => setEditing(false)}>{t('Cancel')}</button>
      </div>
    )
  }

  const pct = goal ? Math.min(100, Math.round((todayMin / goal) * 100)) : 0
  const hit = goal != null && todayMin >= goal
  return (
    <div className={`st-goal ${hit ? 'hit' : ''}`}>
      <TargetIcon />
      {goal == null ? (
        <>
          <span className="st-goal-num">
            <span className="st-goal-lbl">{t('Daily goal')}</span>
            <span className="st-goal-none">{t('not set')}</span>
            <InfoIcon text={t(GOAL_INFO)} />
          </span>
          <span className="st-goal-acts bare">
            <button type="button" className="btn st-goal-btn" onClick={beginEdit}>{t('Set a goal')}</button>
          </span>
        </>
      ) : (
        <>
          <span className="st-goal-num">
            {t('Today')} <strong>{fmtDuration(todayMin)}</strong> / {fmtDuration(goal)}
            {hit ? ' ✓' : ''}
            <InfoIcon text={t(GOAL_INFO)} />
          </span>
          <span className="st-goal-acts">
            <button type="button" className="btn st-goal-btn" onClick={beginEdit}>{t('Edit')}</button>
            <button type="button" className="btn st-goal-btn"
              onClick={() => dispatch({ type: 'setStudyGoal', minutes: null })}>{t('Clear')}</button>
          </span>
          <div className="st-goal-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className={`st-goal-fill ${hit ? 'done' : ''}`} style={{ width: `${pct}%` }} />
          </div>
        </>
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
 *
 * The switch is ADDITIVE, never a re-attribution, so every affordance here says
 * so: the live chip is marked "studying now" and the rest offer to continue
 * from now on.
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
        title={on
          ? `${label} — ${t('studying now')}`
          : fill(t('Continue with {label} from now — earlier time stays where it was'), { label })}
        style={on
          ? { background: hexToRgba(color, 0.24), borderColor: hexToRgba(color, 0.65), color: titleTint(color) }
          : undefined}
        onClick={() => onPick(id)}>
        <span className="qs-dot" style={{ background: color }} />
        <span className="qs-name">{label}</span>
        {on && <span className="qs-live">{t('now')}</span>}
      </button>
    )
  }
  return (
    <div className="qs-strip" role="group" aria-label={t('Switch class')}>
      {chip('none', null, t('Unassigned'), NEUTRAL_COLOR)}
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
        {attached.map((task) => (
          <span key={task.id} className="qt-chip" style={{ borderColor: hexToRgba(color, 0.5) }}>
            <TaskCheck task={task} color={color} />
            <span className={task.done ? 'done-strike' : ''}>{task.title}</span>
            <button type="button" className="qt-x" title={t('Unlink from this session')}
              onClick={() => onToggle(task.id)}>×</button>
          </span>
        ))}
        <button type="button" className="qt-add" ref={btnRef} onClick={toggleOpen}>
          {t('+ Link a to-do')}
        </button>
      </div>
      {open && (
        <div className="qt-pop" style={pos}>
          <input className="qt-search" autoFocus placeholder={t('Search to-dos…')} value={q}
            onChange={(e) => setQ(e.target.value)} />
          <div className="qt-list">
            {shown.length === 0 && <div className="st-empty">{t('No open to-dos match.')}</div>}
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

  // Set-up form (pre-start). The dial IS the pomodoro setting; `free` swaps the
  // whole rhythm block over to free-running instead.
  const [focusMin, setFocusMin] = useState(25)
  const [breakMin, setBreakMin] = useState(5)
  const [free, setFree] = useState(false)
  // Bumped by a preset chip; drives the dial's one-off pop.
  const [pop, setPop] = useState(0)
  const [popping, setPopping] = useState(false)
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
  // Why the current pause happened; handed to the resume action as the break's tag.
  const [pauseTag, setPauseTag] = useState<string | undefined>()

  useEffect(() => {
    if (!pop) return
    setPopping(true)
    const t = setTimeout(() => setPopping(false), 460)
    return () => clearTimeout(t)
  }, [pop])

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
    if (unfiled.length) out.push({ key: '_unfiled', heading: t('Unfiled'), color: NEUTRAL_COLOR, tasks: unfiled })
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

  /**
   * The dial and the preset chips are the same thing underneath: a work/break
   * pair. A pair that happens to match a named preset starts as that mode so
   * the log reads "Pomodoro 25/5"; anything else is a custom ratio, which
   * `cycleFor` drives identically.
   */
  const startMode = (): StudyMode => {
    if (free) return 'normal'
    if (focusMin === 25 && breakMin === 5) return 'pomodoro25'
    if (focusMin === 50 && breakMin === 10) return 'pomodoro50'
    return 'custom'
  }

  const start = () => {
    const mode = startMode()
    const session: StudySession = {
      id: uid(), classId: classId || null, taskIds, eventIds: [],
      uploadIds: uploadIds.length ? uploadIds : undefined,
      date: todayIso, startMin: nowMinutes(), endMin: null, mode, breaks: [],
      ...(mode === 'custom'
        ? { customWork: clampCustomWork(focusMin), customBreak: clampCustomBreak(breakMin) }
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
    const at = Math.min(Math.max(endMin, s.startMin), DAY_END)
    // Mirror the reducer's own close of an open pause, so the follow-up update
    // below can't put `pausedAtMin` back on a session that has finished. The
    // tag the user picked mid-pause rides along here and nowhere else.
    const closed: StudySession =
      s.pausedAtMin != null
        ? {
            ...s,
            pausedAtMin: undefined,
            breaks: [
              ...s.breaks,
              { startMin: s.pausedAtMin, durMin: Math.max(0, at - s.pausedAtMin), ...(pauseTag ? { tag: pauseTag } : {}) },
            ].filter((b) => b.durMin > 0),
          }
        : s
    setPauseTag(undefined)
    const ended: StudySession = { ...closed, endMin: at }
    const materialised = derivedBreaks(ended, at)
    const tagged = mergeBreakTags(closed.breaks, materialised)
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
          {endStage === 'kept' ? t('✓ Session ended') : t('End this study session?')}
        </div>
        {endStage === 'confirm' && (
          <div className="st-end-actions">
            <button className="btn" onClick={() => setEndStage(null)}>{t('Cancel')}</button>
            <div className="spacer" />
            <button className="btn danger" onClick={() => {
              if (!running) return
              endSession(running)
              setEndedId(running.id)
              setReflection(running.reflection ?? '')
              setEndStage('kept')
            }}>
              {t('End session')}
            </button>
          </div>
        )}
        <div className="st-end-reveal">
          <div className="st-end-q2">{t('Session ended — keep this log?')}</div>
          <div className="st-end-actions">
            <button className="btn danger" onClick={() => {
              if (endedId) dispatch({ type: 'deleteStudySession', id: endedId })
              setEndedId(null)
              setEndStage(null)
            }}>
              {t('Delete log')}
            </button>
            <div className="spacer" />
            <button className="btn primary" onClick={() => setEndStage(null)}>{t('Keep log')}</button>
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
    // A pause genuinely stops the clock: every reading below is taken at the
    // minute the user paused rather than at "now", and the rhythm is read with
    // the pause lifted so the ring freezes where it stood instead of blanking.
    const pausedAt = running.pausedAtMin ?? null
    const paused = pausedAt != null
    const shownMin = pausedAt ?? nowMin
    const elapsedSec = Math.max(0, (paused ? pausedAt * 60 : sec) - running.startMin * 60)
    const phase = paused
      ? currentPhase({ ...running, pausedAtMin: undefined }, pausedAt)
      : currentPhase(running, nowMin)
    const onBreak = paused || phase.phase === 'break'
    const pauseMin = paused ? Math.max(0, nowMin - pausedAt) : 0
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
        <AmbientWallpaper variant="full" />
        <div className="study-card running" style={{ borderColor: hexToRgba(color, 0.55) }}>
          <SessionMarks session={running} nowMin={shownMin} color={color} />

          <div className="st-mode-line">
            {t(modeLabel(running.mode))}
            {running.mode === 'custom' && ratio ? ` ${ratio}` : ''}
            {' · '}{t('started')} {fmtTime(running.startMin)}
          </div>

          {ringed
            ? <PhaseRing frac={frac} color={color}>{clock}</PhaseRing>
            : clock}

          <div className={`st-phase ${paused ? 'paused' : ''}`}
            style={{ background: hexToRgba(color, 0.22), color: titleTint(color) }}>
            <strong>{paused ? t('⏸ Paused') : onBreak ? t('◌ Break') : t('◉ Work')}</strong>
            {paused ? (
              <span className="st-left">{fmtDuration(pauseMin)} {t('so far')}</span>
            ) : phase.leftMin != null && (
              <span className="st-left">
                {fmtClock(phase.leftMin * 60)} {onBreak ? t('until work') : t('until break')}
              </span>
            )}
          </div>

          {paused ? (
            <BreakTagChips value={pauseTag} color={color} onChange={setPauseTag} />
          ) : onBreak && curBreak ? (
            <BreakTagChips value={curTag} color={color} onChange={tagCurrentBreak} />
          ) : null}

          <DailyGoal todayMin={todayMin} />

          <div className="field">
            <label>
              {t('Now studying')}
              <InfoIcon text={t('Picking a class continues this session with it from now on — the time before the switch stays where it was, with the class you were on. The bar shows the split so far; fine-tune the switch times under “Adjust times”.')} />
            </label>
            <SegmentBar session={running} nowMin={shownMin} />
            <ClassSwitchStrip classes={sidebarClasses} current={curClassId} onPick={switchClass} />
            <div className="st-seghint">{t('Picking another class adds to the bar — earlier time stays where it was.')}</div>
          </div>

          <div className="field">
            <label>
              {t('Working on')}
              <InfoIcon text={t('To-dos you are working through this session. Tick one to mark it done, × to unlink it.')} />
            </label>
            <TaskQuickPicker groups={taskGroups} attached={attached} color={color}
              onToggle={toggleTaskLink}
              onToggleDone={(id) => dispatch({ type: 'toggleTask', id })} />
          </div>

          <div className="field">
            <label>{t('Link binder files (optional) — notes you made or handouts you revised')}</label>
            <UploadPicker classId={curClassId} linked={linked} color={color}
              onToggle={(id) => patch({
                uploadIds: linked.includes(id) ? linked.filter((x) => x !== id) : [...linked, id],
              })} />
          </div>

          <div className="field st-adjust">
            <button type="button" className="st-adjust-toggle" onClick={() => setReflectOpen((v) => !v)}>
              {reflectOpen ? '▾' : '▸'} ✎ {t('Reflection')}
            </button>
            {reflectOpen && (
              <div className="st-adjust-body">
                <textarea value={running.reflection ?? ''} placeholder={t('How is it going? Notes for next time…')}
                  onChange={(e) => patch({ reflection: e.target.value || undefined })} />
              </div>
            )}
          </div>

          <div className="field st-adjust">
            <button type="button" className="st-adjust-toggle" onClick={() => setAdjustOpen((v) => !v)}>
              {adjustOpen ? '▾' : '▸'} ✎ {t('Adjust times')}
            </button>
            {adjustOpen && (
              <div className="st-adjust-body">
                <div className="field">
                  <label>{t('Start time')}</label>
                  <TimeSelect value={minToHm(running.startMin)} onChange={(v) => {
                    const nowFloor = Math.floor(nowMin)
                    const newStart = Math.max(0, Math.min(hmToMin(v), nowFloor - 1))
                    patch({ startMin: newStart, breaks: normalizeBreaks(running.breaks, newStart, nowFloor) })
                  }} />
                </div>
                <div className="field">
                  <label>{t('Classes studied — start time of each switch')}</label>
                  <SegmentsEditor session={running}
                    endMin={Math.max(running.startMin + 1, Math.floor(nowMin))}
                    onChange={(p: SegmentPatch) => patch(p)} />
                </div>
                <div className="field">
                  <label>{t('Breaks')}</label>
                  {running.mode === 'normal' ? (
                    <BreaksEditor breaks={running.breaks}
                      bound={{ startMin: running.startMin, endMin: Math.floor(nowMin) }}
                      onChange={(next) => patch({ breaks: next })} />
                  ) : (
                    <div className="st-empty">
                      {t('Pomodoro breaks are automatic while running — editable after you end the session.')}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="st-play-wrap">
            <button type="button" className={`st-play ${paused ? 'is-paused' : ''}`}
              aria-label={paused ? t('Resume studying') : t('Pause studying')}
              title={paused
                ? t('Resume — the clock starts again')
                : t('Pause — the clock stops and the time counts as a break')}
              onClick={() => {
                if (paused) {
                  dispatch({ type: 'resumeStudySession', id: running.id, tag: pauseTag })
                  setPauseTag(undefined)
                } else {
                  dispatch({ type: 'pauseStudySession', id: running.id })
                }
              }}>
              <span className={`st-play-glyph ${paused ? 'tri' : ''}`}>{paused ? '▶' : '⏸'}</span>
            </button>
            <div className="st-play-cap">
              {paused ? `${t('paused')} ${fmtDuration(pauseMin)} — ${t('tap to resume')}` : t('pause')}
            </div>
          </div>

          <div className="st-actions">
            <div className="spacer" />
            <button className="btn danger" onClick={() => setEndStage('confirm')}>
              {t('End session')}
            </button>
          </div>

          <p className="st-note">
            {t('The timer runs off the clock, not a countdown — switch pages or reload and it keeps going.')}
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
        <AmbientWallpaper variant="full" />
        <div className="study-card" style={{ borderColor: hexToRgba(color, 0.55) }}>
          <h2 className="st-title">{t('Session finished')}</h2>
          <div className="st-summary">
            {fmtTime(ended.startMin)} – {fmtTime(ended.endMin ?? ended.startMin)}
            {' · '}<strong>{fmtDuration(sessionDuration(ended, nowMin))}</strong>
            {' · '}{t(modeLabel(ended.mode))}
          </div>
          <DailyGoal todayMin={todayMin} />
          <div className="field">
            <label>{t('How did it go? Notes for next time…')}</label>
            <textarea value={reflection} placeholder={t('How did it go? Notes for next time…')}
              onChange={(e) => setReflection(e.target.value)} />
          </div>
          <div className="st-actions">
            <div className="spacer" />
            <button className="btn" onClick={() => setEndedId(null)}>{t('Skip')}</button>
            <button className="btn primary" onClick={() => {
              dispatch({ type: 'updateStudySession', session: { ...ended, reflection: reflection.trim() || undefined } })
              setEndedId(null)
            }}>
              {t('Save')}
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
      <AmbientWallpaper variant="full" />
      <div className="study-card">
        <div className="st-head">
          <h2 className="st-title">{t('Study timer')}</h2>
          <DailyGoal todayMin={todayMin} />
        </div>

        <div className="field st-rhythm">
          {free ? (
            <div className="st-free">
              <div className="st-free-glyph" aria-hidden="true">∞</div>
              <div className="st-free-name">{t('Free-running')}</div>
              <div className="st-free-hint">{t('No set rhythm — pause whenever you say so.')}</div>
              <button type="button" className="st-freelink" onClick={() => setFree(false)}>
                {t('← back to the pomodoro dial')}
              </button>
            </div>
          ) : (
            <>
              <TimerDial focus={focusMin} brk={breakMin} popped={popping}
                onFocus={setFocusMin} onBreak={setBreakMin} />
              <div className="dial-presets">
                {PRESETS.map((p) => (
                  <button key={p.work} type="button"
                    className={`dial-chip ${focusMin === p.work && breakMin === p.brk ? 'on' : ''}`}
                    title={fill(t('{work} minutes of focus, {brk} of break'), { work: p.work, brk: p.brk })}
                    onClick={() => { setFocusMin(p.work); setBreakMin(p.brk); setPop((n) => n + 1) }}>
                    {p.work} · {p.brk}
                  </button>
                ))}
                <span className="dial-presets-hint">
                  {t('or drag the rings')}
                  <InfoIcon text={t('The outer ring sets the focus length — one full lap is 2 hours. The inner ring sets the break — one lap is 1 hour. Both snap to 5 minutes, and arrow keys nudge whichever ring has keyboard focus.')} />
                </span>
              </div>
              <div className="dial-sitting">
                {fill(t('a sitting is {n} focus sessions · {total} in all'), {
                  n: SITTING, total: fmtDuration(SITTING * (focusMin + breakMin)),
                })}
              </div>
              <button type="button" className="st-freelink" onClick={() => setFree(true)}>
                {t('or free-run, breaks when you say so →')}
              </button>
            </>
          )}
        </div>

        <div className="field">
          <label>
            {t('Class')}
            <InfoIcon text={t('A study session belongs to a class, or to nothing at all. “Unassigned” time is still counted — it just isn\'t attributed to a class.')} />
          </label>
          <ColorSelect value={classId} groups={classGroups} onChange={pickClass} />
        </div>

        <div className="field">
          <label>{classId ? t('Tasks to work on (optional)') : t('Unfiled tasks (optional)')}</label>
          <TaskPicker tasks={formTasks} selected={taskIds} color={formColor}
            empty={classId ? t('No open tasks in this class.') : t('No unfiled tasks.')}
            onToggle={toggle(taskIds, setTaskIds)} />
        </div>

        <div className="field">
          <label>{t('Link binder files (optional) — notes you made or handouts you revised')}</label>
          <UploadPicker classId={classId || null} linked={uploadIds} color={formColor}
            onToggle={toggle(uploadIds, setUploadIds)} />
        </div>

        <div className="st-play-wrap">
          <button type="button" className="st-play" onClick={start}
            aria-label={t('Start studying')} title={t('Start studying')}>
            <span className="st-play-glyph tri">▶</span>
          </button>
          <div className="st-play-cap">{t('start studying')}</div>
        </div>
      </div>
    </div>
  )
}
