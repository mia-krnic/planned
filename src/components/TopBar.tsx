import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Drawer, Page, View } from '../App'
import { useUI } from '../App'
import { useStore } from '../store'
import { t } from '../i18n'
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

/** One page-tab icon: a single stroked path at 13px. */
function TabGlyph({ d }: { d: string }) {
  return (
    <svg className="tab-glyph" width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.4"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
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
      <button ref={btnRef} className="tb-add tb-add-plus" aria-label={t('Add')} aria-expanded={open}
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
          <button type="button" onClick={pick(() => ui.openEvent({ date: anchor }))}>{t('Event')}</button>
          <button type="button" onClick={pick(() => ui.openTask({ date: todayISO() }))}>{t('Task')}</button>
          <button type="button" onClick={pick(() => ui.openLogStudy({ date: anchor }))}>{t('Log study')}</button>
        </div>,
        document.body,
      )}
    </div>
  )
}

/** Kept in step with `.add-menu { width }` in the mobile CSS block. */
const ADD_MENU_W = 176

/** Fills {name} placeholders in a t()'d template (see src/i18n/zh.ts). */
function fill(tpl: string, v: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''))
}

/* Date ranges are the one place piecewise translation breaks down: Chinese
   puts the year first and hangs 年/月/日 off the numbers, so each shape is a
   whole-template entry. In English `t` returns the key unchanged and `fill`
   rebuilds exactly the string that used to be written inline. */
function rangeLabel(view: View, anchor: string, weekStart: AppState['weekStart']): string {
  const d = fromISO(anchor)
  if (view === 'year') return fill(t('{year}'), { year: d.getFullYear() })
  if (view === 'month') {
    return fill(t('{month} {year}'), { month: t(MONTHS[d.getMonth()]), year: d.getFullYear() })
  }
  if (view === 'day') {
    return fill(t('{month} {day}, {year}'),
      { month: t(MONTHS[d.getMonth()]), day: d.getDate(), year: d.getFullYear() })
  }
  const start = startOfWeek(d, weekStart)
  const end = addDays(start, 6)
  const sm = t(MONTHS[start.getMonth()].slice(0, 3))
  const em = t(MONTHS[end.getMonth()].slice(0, 3))
  return sm === em
    ? fill(t('{m1} {d1} – {d2}, {year}'),
      { m1: sm, d1: start.getDate(), d2: end.getDate(), year: end.getFullYear() })
    : fill(t('{m1} {d1} – {m2} {d2}, {year}'),
      { m1: sm, d1: start.getDate(), m2: em, d2: end.getDate(), year: end.getFullYear() })
}

export default function TopBar({
  page, setPage, view, setView, anchor, setAnchor, narrow, drawer, setDrawer,
}: Props) {
  const { state, dispatch, canUndo, canRedo } = useStore()
  const ui = useUI()
  const toggleDrawer = (which: Exclude<Drawer, null>) =>
    setDrawer(drawer === which ? null : which)

  // Pages that only read: no creation buttons, no undo/redo in the bar.
  const quiet = page === 'home' || page === 'insights' || page === 'journal'

  const step = (dir: 1 | -1) => {
    const d = fromISO(anchor)
    if (view === 'year') {
      const next = new Date(d.getFullYear() + dir, d.getMonth(), d.getDate())
      // Feb 29 in a common year rolls into March; day 0 pulls it back to Feb 28.
      if (next.getMonth() !== d.getMonth()) next.setDate(0)
      setAnchor(toISO(next))
    } else if (view === 'month') setAnchor(toISO(new Date(d.getFullYear(), d.getMonth() + dir, 1)))
    else setAnchor(toISO(addDays(d, dir * (view === 'day' ? 1 : 7))))
  }

  return (
    // `tb-cal` says this header carries a date-navigation cluster. On a narrow
    // screen that cluster gets a row of its own, and the class is what tells
    // the CSS to force the line break. Nothing targets it on desktop.
    <div className={`topbar${page === 'calendar' ? ' tb-cal' : ''}`}>
      {/* Drawer toggles: narrow screens only, one per side. */}
      {narrow && page === 'calendar' && (
        <button className="drawer-btn db-left" title={t('Calendars')} aria-label={t('Calendars')}
          aria-expanded={drawer === 'left'} onClick={() => toggleDrawer('left')}>
          <BurgerGlyph />
        </button>
      )}

      <div className="brand"><span className="logo">✓</span><span className="brand-word">planned</span></div>

      {/* Home is the landing page, so it earns an icon rather than a word;
          thin dividers split the list into home · doing · reflecting. */}
      <div className="page-tabs">
        <button className={`tab-home ${page === 'home' ? 'active' : ''}`}
          title={t('Home')} aria-label={t('Home')} onClick={() => setPage('home')}>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2.6 7.6 8 2.8 l5.4 4.8 M4.2 6.9 V13 a0.6 0.6 0 0 0 0.6 0.6 h2 V10 h2.4 v3.6 h2 a0.6 0.6 0 0 0 0.6 -0.6 V6.9"
              fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="tab-sep" aria-hidden="true" />
        <button className={page === 'calendar' ? 'active' : ''} onClick={() => setPage('calendar')}>
          <TabGlyph d="M3 3.6 h10 a1 1 0 0 1 1 1 V13 a1 1 0 0 1 -1 1 H3 a1 1 0 0 1 -1 -1 V4.6 a1 1 0 0 1 1 -1 Z M2 6.8 h12 M5.4 2 v2.6 M10.6 2 v2.6" />
          {t('Calendar')}
        </button>
        <button className={page === 'tasks' ? 'active' : ''} onClick={() => setPage('tasks')}>
          <TabGlyph d="M3.4 2.6 h9.2 a1 1 0 0 1 1 1 v8.8 a1 1 0 0 1 -1 1 H3.4 a1 1 0 0 1 -1 -1 V3.6 a1 1 0 0 1 1 -1 Z M5.2 8 l2 2 3.6 -4" />
          {t('Tasks')}
        </button>
        <button className={page === 'timer' ? 'active' : ''} onClick={() => setPage('timer')}>
          <TabGlyph d="M8 14 a5.4 5.4 0 1 1 0 -10.8 a5.4 5.4 0 0 1 0 10.8 Z M8 5.6 V8.6 l2.2 1.3 M6.6 1.6 h2.8" />
          {t('Timer')}
        </button>
        <button className={page === 'binder' ? 'active' : ''} onClick={() => setPage('binder')}>
          <TabGlyph d="M4.4 2 h8 a1 1 0 0 1 1 1 v10 a1 1 0 0 1 -1 1 h-8 a1.8 1.8 0 0 1 -1.8 -1.8 V3.8 A1.8 1.8 0 0 1 4.4 2 Z M4.4 2 v12 M2.6 11.4 h1.8" />
          {t('Binder')}
        </button>
        <span className="tab-sep" aria-hidden="true" />
        <button className={page === 'insights' ? 'active' : ''} onClick={() => setPage('insights')}>
          <TabGlyph d="M3.2 13.4 V9 M8 13.4 V5 M12.8 13.4 V7.4 M2 13.4 h12" />
          {t('Insights')}
        </button>
        <button className={page === 'journal' ? 'active' : ''} onClick={() => setPage('journal')}>
          <TabGlyph d="M3.6 2.4 h8.8 a0.8 0.8 0 0 1 0.8 0.8 v9.6 a0.8 0.8 0 0 1 -0.8 0.8 H3.6 a0.8 0.8 0 0 1 -0.8 -0.8 V3.2 a0.8 0.8 0 0 1 0.8 -0.8 Z M5.4 5.4 h5.2 M5.4 8 h5.2 M5.4 10.6 h3" />
          {t('Journal')}
        </button>
      </div>

      {page === 'calendar' && (
        <>
          <button className="btn primary" onClick={() => setAnchor(todayISO())}>{t('Today')}</button>
          <button className="btn icon" onClick={() => step(-1)} aria-label={t('Previous')}>‹</button>
          <button className="btn icon" onClick={() => step(1)} aria-label={t('Next')}>›</button>
          <span className="range-label">{rangeLabel(view, anchor, state.weekStart)}</span>
          <select className="view-select" value={view} onChange={(e) => setView(e.target.value as View)}>
            <option value="day">{t('Day')}</option>
            <option value="week">{t('Week')}</option>
            <option value="month">{t('Month')}</option>
            <option value="year">{t('Year')}</option>
          </select>
        </>
      )}

      <div className="spacer" />

      {/* Creation and history only appear where creating and editing happen;
          Home, Insights and Journal keep a quiet bar (search/bell/settings).
          Narrow screens swap the three add buttons for the single ＋ menu. */}
      {!quiet && (
        <div className="tb-group tb-adds" role="group" aria-label={t('Add')}>
          <button className="tb-add" onClick={() => ui.openEvent({ date: anchor })}>{t('+ Event')}</button>
          <button className="tb-add" onClick={() => ui.openTask({ date: todayISO() })}>{t('+ Task')}</button>
          {/* The trailing word is dropped at tablet widths, leaving "+ Log". */}
          <button className="tb-add tb-add-log" onClick={() => ui.openLogStudy({ date: anchor })}>
            {t('+ Log')}<span className="tb-add-word"> {t('study')}</span>
          </button>
        </div>
      )}
      {narrow && !quiet && <AddMenu anchor={anchor} />}
      <div className="tb-group tb-tools" role="group" aria-label={t('Tools')}>
        <button className="btn icon" title={t('Search (⌘K)')} aria-label={t('Search')} onClick={() => ui.openSearch()}>⌕</button>
        {!quiet && (
          <>
            <button
              className="btn icon history-btn"
              title={t('Undo (⌘Z)')}
              aria-label={t('Undo')}
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
              title={t('Redo (⌘Y)')}
              aria-label={t('Redo')}
              disabled={!canRedo}
              onClick={() => dispatch({ type: 'redo' })}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M9.7 2.6 13.1 6 9.7 9.4 M13.1 6 H5.9 a3.6 3.6 0 0 0 0 7.2 h3.5"
                  fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}
        <NotificationCenter />
        <ViewSettings narrow={narrow} />
      </div>

      {narrow && (page === 'calendar' || page === 'timer') && (
        <button className="drawer-btn db-right" title={t('Tasks')} aria-label={t('Tasks')}
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

/* Each option is written in its own language — the row must stay findable by
   someone who cannot read the language the app is currently in. */
const LANGUAGE_OPTIONS: { value: 'en' | 'zh'; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
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
      <button className="btn icon" title={t('View settings')} aria-label={t('View settings')} onClick={() => setOpen((o) => !o)}>
        ⚙︎
      </button>

      {open && (
        <div className="settings-panel">
          {/* Undo/redo lose their top-bar buttons on a narrow screen; this is
              where they go, rather than off the edge of a cramped header. */}
          {narrow && (
            <div className="settings-section">
              <div className="proj-section-label">{t('Editing')}</div>
              <div className="pill-row">
                <button type="button" className="pill" disabled={!canUndo}
                  onClick={() => dispatch({ type: 'undo' })}>↶ {t('Undo')}</button>
                <button type="button" className="pill" disabled={!canRedo}
                  onClick={() => dispatch({ type: 'redo' })}>↷ {t('Redo')}</button>
              </div>
            </div>
          )}

          <div className="settings-section">
            <div className="proj-section-label">{t('Week starts on')}</div>
            <div className="pill-row">
              {WEEK_START_OPTIONS.map((o) => (
                <button key={o.value} type="button"
                  className={`pill ${state.weekStart === o.value ? 'active' : ''}`}
                  onClick={() => dispatch({ type: 'setWeekStart', weekStart: o.value })}>
                  {t(o.label)}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-section">
            <div className="proj-section-label">
              {t('Task checking')}
              <InfoIcon text={t('Checkbox is the classic tick. YPT-style replaces it with a three-step glyph — □ not started, ◺ half done, ⊘ done — that you click to cycle. Half-done states survive switching modes: a task you tick off in checkbox mode shows as done here, and anything left half done comes back as ◺. Recurring tasks keep a plain checkbox, since they are ticked off per day.')} />
            </div>
            <div className="pill-row">
              {CHECK_STYLE_OPTIONS.map((o) => (
                <button key={o.value} type="button"
                  className={`pill ${(state.taskCheckStyle ?? 'checkbox') === o.value ? 'active' : ''}`}
                  onClick={() => dispatch({ type: 'setTaskCheckStyle', style: o.value })}>
                  {t(o.label)}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-section">
            <div className="proj-section-label">
              {t('Reschedule ghosts')}
              <InfoIcon text={t('When a scheduled task moves to another day, the slot it left keeps a faint → marker so you can see what slipped. Dismiss single ghosts with their ×; switching this back on brings every dismissed ghost back.')} />
            </div>
            <div className="pill-row">
              {GHOST_OPTIONS.map((o) => (
                <button key={String(o.value)} type="button"
                  className={`pill ${(state.showGhosts ?? true) === o.value ? 'active' : ''}`}
                  onClick={() => dispatch({ type: 'setShowGhosts', on: o.value })}>
                  {t(o.label)}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-section">
            <div className="proj-section-label">
              {t('Location')}
              <InfoIcon text={t('Only used for the moon-phase icon on the daily log: south of the equator the moon is seen the other way round, so the lit side is mirrored. The place name is just a note to yourself — nothing is sent anywhere.')} />
            </div>
            <div className="settings-loc-row">
              <input
                type="text"
                className="settings-loc-input"
                placeholder={t('Where you are')}
                aria-label={t('Location')}
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
                    title={o.value === 'N' ? t('Northern hemisphere') : t('Southern hemisphere')}
                    className={`pill ${(state.location?.hemisphere ?? 'N') === o.value ? 'active' : ''}`}
                    onClick={() => dispatch({ type: 'setLocation', location: { ...state.location, hemisphere: o.value } })}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="settings-section">
            <div className="proj-section-label">{t('Theme')}</div>
            <div className="pill-row">
              {THEME_MODE_OPTIONS.map((o) => (
                <button key={o.value} type="button"
                  className={`pill ${state.themeConfig.mode === o.value ? 'active' : ''}`}
                  onClick={() => setThemeMode(o.value)}>
                  {t(o.label)}
                </button>
              ))}
            </div>
            {state.themeConfig.mode === 'auto' && (
              <div className="settings-time-row">
                <div className="field">
                  <label>{t('Light from')}</label>
                  <TimeSelect value={state.themeConfig.lightStart}
                    onChange={(v) => dispatch({ type: 'setThemeConfig', config: { ...state.themeConfig, lightStart: v } })} />
                </div>
                <div className="field">
                  <label>{t('Dark from')}</label>
                  <TimeSelect value={state.themeConfig.darkStart}
                    onChange={(v) => dispatch({ type: 'setThemeConfig', config: { ...state.themeConfig, darkStart: v } })} />
                </div>
              </div>
            )}
          </div>

          <div className="settings-section">
            <div className="proj-section-label">{t('Language')}</div>
            <div className="pill-row">
              {LANGUAGE_OPTIONS.map((o) => (
                <button key={o.value} type="button"
                  className={`pill ${(state.language ?? 'en') === o.value ? 'active' : ''}`}
                  onClick={() => dispatch({ type: 'setLanguage', language: o.value })}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
