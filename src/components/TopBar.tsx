import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Drawer, Page, View } from '../App'
import { useUI } from '../App'
import { useStore } from '../store'
import type { AppState } from '../types'
import { addDays, fromISO, MONTHS, startOfWeek, toISO, todayISO } from '../utils/date'
import { useClampedPos } from '../utils/popover'
import InfoIcon from './InfoIcon'
import NotificationCenter from './NotificationCenter'
import TimeSelect from './TimeSelect'

interface Props {
  page: Page
  setPage: (p: Page) => void
  view: View
  setView: (v: View) => void
  anchor: string
  setAnchor: (a: string) => void
  /** Drawer layout is on. False on desktop, where none of it renders at all. */
  narrow: boolean
  drawer: Drawer
  setDrawer: (d: Drawer) => void
}

/** ☰ — opens the calendars drawer. */
function BurgerGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 4h12M2 8h12M2 12h12"
        fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

/** A ticked checklist — opens the tasks drawer. */
function TasksGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.6 4.5 3 5.9 5.7 3.1 M1.6 11.1 3 12.5 5.7 9.7"
        fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.2 4.7h6.2M8.2 11.3h6.2"
        fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/**
 * The narrow-screen stand-in for the three "+ Event / + Task / + Log study"
 * buttons: one ＋ that drops a small menu. Portalled onto <body> so the top
 * bar can keep `overflow` on its scrolling page tabs without clipping it.
 */
function AddMenu({ anchor }: { anchor: string }) {
  const ui = useUI()
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState({ x: 0, y: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const pos = useClampedPos(popRef, at.x, at.y)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!popRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (fn: () => void) => () => { setOpen(false); fn() }

  return (
    <div className="tb-group tb-add-mob">
      <button ref={btnRef} className="tb-add tb-add-plus" aria-label="Add" aria-expanded={open}
        onClick={() => {
          const r = btnRef.current?.getBoundingClientRect()
          // Right-aligned under the button; useClampedPos pulls it back on if
          // that would put an edge off-screen.
          if (r) setAt({ x: r.right - ADD_MENU_W, y: r.bottom + 6 })
          setOpen((o) => !o)
        }}>
        ＋
      </button>
      {open && createPortal(
        <div className="add-menu" ref={popRef} style={{ left: pos.x, top: pos.y }} role="menu">
          <button type="button" onClick={pick(() => ui.openEvent({ date: anchor }))}>Event</button>
          <button type="button" onClick={pick(() => ui.openTask({ date: todayISO() }))}>Task</button>
          <button type="button" onClick={pick(() => ui.openLogStudy({ date: anchor }))}>Log study</button>
        </div>,
        document.body,
      )}
    </div>
  )
}

/** Kept in step with `.add-menu { width }` in the mobile CSS block. */
const ADD_MENU_W = 176

function rangeLabel(view: View, anchor: string, weekStart: AppState['weekStart']): string {
  const d = fromISO(anchor)
  if (view === 'month') return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
  if (view === 'day') return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
  const start = startOfWeek(d, weekStart)
  const end = addDays(start, 6)
  const sm = MONTHS[start.getMonth()].slice(0, 3)
  const em = MONTHS[end.getMonth()].slice(0, 3)
  return sm === em
    ? `${sm} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`
    : `${sm} ${start.getDate()} – ${em} ${end.getDate()}, ${end.getFullYear()}`
}

export default function TopBar({
  page, setPage, view, setView, anchor, setAnchor, narrow, drawer, setDrawer,
}: Props) {
  const { state, dispatch, canUndo, canRedo } = useStore()
  const ui = useUI()
  const toggleDrawer = (which: Exclude<Drawer, null>) =>
    setDrawer(drawer === which ? null : which)

  const step = (dir: 1 | -1) => {
    const d = fromISO(anchor)
    if (view === 'month') setAnchor(toISO(new Date(d.getFullYear(), d.getMonth() + dir, 1)))
    else setAnchor(toISO(addDays(d, dir * (view === 'day' ? 1 : 7))))
  }

  return (
    // `tb-cal` says this header carries a date-navigation cluster. On a narrow
    // screen that cluster gets a row of its own, and the class is what tells
    // the CSS to force the line break. Nothing targets it on desktop.
    <div className={`topbar${page === 'calendar' ? ' tb-cal' : ''}`}>
      {/* Drawer toggles: narrow screens only, one per side. */}
      {narrow && page === 'calendar' && (
        <button className="drawer-btn db-left" title="Calendars" aria-label="Calendars"
          aria-expanded={drawer === 'left'} onClick={() => toggleDrawer('left')}>
          <BurgerGlyph />
        </button>
      )}

      <div className="brand"><span className="logo">✓</span><span className="brand-word">planned</span></div>

      <div className="page-tabs">
        <button className={page === 'calendar' ? 'active' : ''} onClick={() => setPage('calendar')}>Calendar</button>
        <button className={page === 'tasks' ? 'active' : ''} onClick={() => setPage('tasks')}>Tasks</button>
        <button className={page === 'timer' ? 'active' : ''} onClick={() => setPage('timer')}>Timer</button>
        <button className={page === 'binder' ? 'active' : ''} onClick={() => setPage('binder')}>Binder</button>
        <button className={page === 'insights' ? 'active' : ''} onClick={() => setPage('insights')}>Insights</button>
        <button className={page === 'journal' ? 'active' : ''} onClick={() => setPage('journal')}>Journal</button>
      </div>

      {page === 'calendar' && (
        <>
          <button className="btn primary" onClick={() => setAnchor(todayISO())}>Today</button>
          <button className="btn icon" onClick={() => step(-1)} aria-label="Previous">‹</button>
          <button className="btn icon" onClick={() => step(1)} aria-label="Next">›</button>
          <span className="range-label">{rangeLabel(view, anchor, state.weekStart)}</span>
          <select className="view-select" value={view} onChange={(e) => setView(e.target.value as View)}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </>
      )}

      <div className="spacer" />

      {/* Creation actions live in their own box, apart from the utility icons.
          Narrow screens swap the three for the single ＋ menu below. */}
      <div className="tb-group tb-adds" role="group" aria-label="Add">
        <button className="tb-add" onClick={() => ui.openEvent({ date: anchor })}>+ Event</button>
        <button className="tb-add" onClick={() => ui.openTask({ date: todayISO() })}>+ Task</button>
        {/* The trailing word is dropped at tablet widths, leaving "+ Log". */}
        <button className="tb-add tb-add-log" onClick={() => ui.openLogStudy({ date: anchor })}>
          + Log<span className="tb-add-word"> study</span>
        </button>
      </div>
      {narrow && <AddMenu anchor={anchor} />}
      <div className="tb-group tb-tools" role="group" aria-label="Tools">
        <button className="btn icon" title="Search (⌘K)" aria-label="Search" onClick={() => ui.openSearch()}>⌕</button>
        <button
          className="btn icon history-btn"
          title="Undo (⌘Z)"
          aria-label="Undo"
          disabled={!canUndo}
          onClick={() => dispatch({ type: 'undo' })}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M6.3 2.6 2.9 6 6.3 9.4 M2.9 6 h7.2 a3.6 3.6 0 0 1 0 7.2 H6.6"
              fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          className="btn icon history-btn"
          title="Redo (⌘Y)"
          aria-label="Redo"
          disabled={!canRedo}
          onClick={() => dispatch({ type: 'redo' })}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M9.7 2.6 13.1 6 9.7 9.4 M13.1 6 H5.9 a3.6 3.6 0 0 0 0 7.2 h3.5"
              fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <NotificationCenter />
        <ViewSettings narrow={narrow} />
      </div>

      {narrow && (page === 'calendar' || page === 'timer') && (
        <button className="drawer-btn db-right" title="Tasks" aria-label="Tasks"
          aria-expanded={drawer === 'tasks'} onClick={() => toggleDrawer('tasks')}>
          <TasksGlyph />
        </button>
      )}
    </div>
  )
}

const WEEK_START_OPTIONS: { value: AppState['weekStart']; label: string }[] = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 6, label: 'Saturday' },
]

const THEME_MODE_OPTIONS: { value: AppState['themeConfig']['mode']; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'Auto' },
]

const CHECK_STYLE_OPTIONS: { value: 'checkbox' | 'ypt'; label: string }[] = [
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'ypt', label: 'YPT-style' },
]

const GHOST_OPTIONS: { value: boolean; label: string }[] = [
  { value: true, label: 'Show' },
  { value: false, label: 'Hide' },
]

const HEMISPHERE_OPTIONS: { value: 'N' | 'S'; label: string }[] = [
  { value: 'N', label: 'N' },
  { value: 'S', label: 'S' },
]

/** ⚙ popover for view-level prefs: week start day + theme. Mirrors NotificationCenter's open/close-on-outside-click pattern. */
function ViewSettings({ narrow }: { narrow: boolean }) {
  const { state, dispatch, canUndo, canRedo } = useStore()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  // The place name is free text, so it commits on blur / Enter rather than
  // writing to the store on every keystroke.
  const [loc, setLoc] = useState(state.location?.label ?? '')
  useEffect(() => setLoc(state.location?.label ?? ''), [state.location?.label])
  const commitLoc = () => dispatch({ type: 'setLocation', location: { ...state.location, label: loc } })

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const setThemeMode = (mode: AppState['themeConfig']['mode']) =>
    dispatch({ type: 'setThemeConfig', config: { ...state.themeConfig, mode } })

  return (
    <div className="settings-wrap" ref={wrapRef}>
      <button className="btn icon" title="View settings" aria-label="View settings" onClick={() => setOpen((o) => !o)}>
        ⚙︎
      </button>

      {open && (
        <div className="settings-panel">
          {/* Undo/redo lose their top-bar buttons on a narrow screen; this is
              where they go, rather than off the edge of a cramped header. */}
          {narrow && (
            <div className="settings-section">
              <div className="proj-section-label">Editing</div>
              <div className="pill-row">
                <button type="button" className="pill" disabled={!canUndo}
                  onClick={() => dispatch({ type: 'undo' })}>↶ Undo</button>
                <button type="button" className="pill" disabled={!canRedo}
                  onClick={() => dispatch({ type: 'redo' })}>↷ Redo</button>
              </div>
            </div>
          )}

          <div className="settings-section">
            <div className="proj-section-label">Week starts on</div>
            <div className="pill-row">
              {WEEK_START_OPTIONS.map((o) => (
                <button key={o.value} type="button"
                  className={`pill ${state.weekStart === o.value ? 'active' : ''}`}
                  onClick={() => dispatch({ type: 'setWeekStart', weekStart: o.value })}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-section">
            <div className="proj-section-label">
              Task checking
              <InfoIcon text="Checkbox is the classic tick. YPT-style replaces it with a three-step glyph — □ not started, ◺ half done, ⊘ done — that you click to cycle. Half-done states survive switching modes: a task you tick off in checkbox mode shows as done here, and anything left half done comes back as ◺. Recurring tasks keep a plain checkbox, since they are ticked off per day." />
            </div>
            <div className="pill-row">
              {CHECK_STYLE_OPTIONS.map((o) => (
                <button key={o.value} type="button"
                  className={`pill ${(state.taskCheckStyle ?? 'checkbox') === o.value ? 'active' : ''}`}
                  onClick={() => dispatch({ type: 'setTaskCheckStyle', style: o.value })}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-section">
            <div className="proj-section-label">
              Reschedule ghosts
              <InfoIcon text="When a scheduled task moves to another day, the slot it left keeps a faint → marker so you can see what slipped. Dismiss single ghosts with their ×; switching this back on brings every dismissed ghost back." />
            </div>
            <div className="pill-row">
              {GHOST_OPTIONS.map((o) => (
                <button key={String(o.value)} type="button"
                  className={`pill ${(state.showGhosts ?? true) === o.value ? 'active' : ''}`}
                  onClick={() => dispatch({ type: 'setShowGhosts', on: o.value })}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-section">
            <div className="proj-section-label">
              Location
              <InfoIcon text="Only used for the moon-phase icon on the daily log: south of the equator the moon is seen the other way round, so the lit side is mirrored. The place name is just a note to yourself — nothing is sent anywhere." />
            </div>
            <div className="settings-loc-row">
              <input
                type="text"
                className="settings-loc-input"
                placeholder="Where you are"
                aria-label="Location"
                value={loc}
                onChange={(e) => setLoc(e.target.value)}
                onBlur={commitLoc}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') { setLoc(state.location?.label ?? ''); e.currentTarget.blur() }
                }}
              />
              <div className="pill-row">
                {HEMISPHERE_OPTIONS.map((o) => (
                  <button key={o.value} type="button"
                    title={o.value === 'N' ? 'Northern hemisphere' : 'Southern hemisphere'}
                    className={`pill ${(state.location?.hemisphere ?? 'N') === o.value ? 'active' : ''}`}
                    onClick={() => dispatch({ type: 'setLocation', location: { ...state.location, hemisphere: o.value } })}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="settings-section">
            <div className="proj-section-label">Theme</div>
            <div className="pill-row">
              {THEME_MODE_OPTIONS.map((o) => (
                <button key={o.value} type="button"
                  className={`pill ${state.themeConfig.mode === o.value ? 'active' : ''}`}
                  onClick={() => setThemeMode(o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
            {state.themeConfig.mode === 'auto' && (
              <div className="settings-time-row">
                <div className="field">
                  <label>Light from</label>
                  <TimeSelect value={state.themeConfig.lightStart}
                    onChange={(v) => dispatch({ type: 'setThemeConfig', config: { ...state.themeConfig, lightStart: v } })} />
                </div>
                <div className="field">
                  <label>Dark from</label>
                  <TimeSelect value={state.themeConfig.darkStart}
                    onChange={(v) => dispatch({ type: 'setThemeConfig', config: { ...state.themeConfig, darkStart: v } })} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
