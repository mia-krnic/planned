import { createContext, useContext, useEffect, useState } from 'react'
import type { CalEvent, ClassInfo, CustomCalendar, ID, RecurringTask, Task } from './types'
import { todayISO } from './utils/date'
import { useStore } from './store'
import TopBar from './components/TopBar'
import SidebarLeft from './components/SidebarLeft'
import WeekGrid from './components/WeekGrid'
import MonthGrid from './components/MonthGrid'
import HabitGantt from './components/HabitGantt'
import YearView from './components/YearView'
import TasksPanel from './components/TasksPanel'
import UrgentBanners from './components/UrgentBanners'
import HomePage from './components/home/HomePage'
import BinderPage from './components/binder/BinderPage'
import StudyTimerPage from './components/timer/StudyTimerPage'
import SessionModal from './components/timer/SessionModal'
import EventModal from './components/modals/EventModal'
import TaskModal from './components/modals/TaskModal'
import RecurringModal from './components/modals/RecurringModal'
import ClassModal from './components/modals/ClassModal'
import CalendarModal from './components/modals/CalendarModal'
import LiveIcsModal from './components/modals/LiveIcsModal'
import StaticImportModal from './components/modals/StaticImportModal'
import LogStudyModal, { type LogStudyModalInit } from './components/modals/LogStudyModal'
import InsightsPage from './components/insights/InsightsPage'
import JournalPage from './components/journal/JournalPage'
import SearchOverlay from './components/search/SearchOverlay'
import type { ParsedIcsEvent } from './utils/ics'

export type Page = 'home' | 'calendar' | 'tasks' | 'timer' | 'binder' | 'insights' | 'journal'
export type View = 'day' | 'week' | 'month' | 'year'

/** Below this width the two side panels stop being columns and become drawers.
 *  The same number is the `max-width` the mobile CSS block keys off. */
export const MOBILE_BP = 768
/** Which off-canvas panel is open. Always `null` on a desktop-width screen. */
export type Drawer = 'left' | 'tasks' | null

/** True while the window is narrow enough for the drawer layout. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.innerWidth <= MOBILE_BP)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BP}px)`)
    const onChange = () => setNarrow(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow
}

/**
 * The strip that shuts a tasks sidebar away. It lives on the host rather than
 * inside TasksPanel because the panel's header row is already full at sidebar
 * width, and because the calendar and the timer each remember their own state.
 * Collapsed it widens a touch and names what it is hiding, the way the binder's
 * collapsed class rail does. Hidden entirely on a narrow screen, where the
 * panel is a drawer and the top bar already toggles it.
 */
function TasksHandle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      className={`tasks-handle${collapsed ? ' collapsed' : ''}`}
      title={collapsed ? 'Expand tasks' : 'Collapse tasks'}
      onClick={onToggle}
    >
      <span className="th-arrow">{collapsed ? '«' : '»'}</span>
      {collapsed && <span className="panel-rail-label">Tasks</span>}
    </button>
  )
}

/** `startMin`/`endMin` prefill a NEW event's times — a drag-created block passes both. */
export interface EventModalInit { event?: CalEvent; date?: string; startMin?: number; endMin?: number; allDay?: boolean }
/** Likewise for a new task: `startMin` sets its time, `endMin` its expected-time block. */
export interface TaskModalInit {
  task?: Task
  date?: string | null
  startMin?: number
  endMin?: number
  projectId?: ID | null
  sectionId?: ID | null
}
/** `occurrence` = the date the rule generated the clicked occurrence on: its
 *  presence turns the editor into a scoped (only this / future / all) edit. */
export interface RecurringModalInit {
  rt?: RecurringTask
  projectId?: ID
  sectionId?: ID | null
  occurrence?: string
  /** Prefilled name for a NEW rule — a habit goal promoting itself into a task. */
  title?: string
}
export interface ClassModalInit { cls?: ClassInfo; folderId?: ID | null }
export interface CalendarModalInit { cal?: CustomCalendar }
export interface SessionModalInit { id: ID }
/** Events parsed out of a user-picked .ics file, awaiting review. */
export interface StaticImportInit { events: ParsedIcsEvent[]; fileName: string }

interface UIApi {
  openEvent(init: EventModalInit): void
  openTask(init: TaskModalInit): void
  openRecurring(init: RecurringModalInit): void
  openClass(init: ClassModalInit): void
  openCalendar(init: CalendarModalInit): void
  openSession(init: SessionModalInit): void
  openLiveIcs(): void
  openStaticImport(init: StaticImportInit): void
  openLogStudy(init?: LogStudyModalInit): void
  openSearch(): void
  gotoDay(iso: string): void
}

const UICtx = createContext<UIApi>(null!)
export const useUI = () => useContext(UICtx)

export default function App() {
  // The app opens on Home — a clock and one goal, before any of the grids.
  const [page, setPage] = useState<Page>('home')
  // A seven-column week is unreadable on a phone, so a narrow first load opens
  // on the day view instead. Only the initial choice is made here — switching
  // to week afterwards (and scrolling it sideways) is the user's call.
  const [view, setView] = useState<View>(() => (window.innerWidth <= MOBILE_BP ? 'day' : 'week'))
  const [anchor, setAnchor] = useState<string>(todayISO())

  const [eventModal, setEventModal] = useState<EventModalInit | null>(null)
  const [taskModal, setTaskModal] = useState<TaskModalInit | null>(null)
  const [recurringModal, setRecurringModal] = useState<RecurringModalInit | null>(null)
  const [classModal, setClassModal] = useState<ClassModalInit | null>(null)
  const [calendarModal, setCalendarModal] = useState<CalendarModalInit | null>(null)
  const [sessionModal, setSessionModal] = useState<SessionModalInit | null>(null)
  const [liveIcsModal, setLiveIcsModal] = useState(false)
  const [staticImport, setStaticImport] = useState<StaticImportInit | null>(null)
  const [logStudyModal, setLogStudyModal] = useState<LogStudyModalInit | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  // ---- Mobile drawers -------------------------------------------------
  // Inert on desktop: `narrow` is false there, so no toggle renders, `drawer`
  // can never leave `null`, and the shell's class list stays exactly "app".
  const narrow = useNarrow()
  const [drawer, setDrawer] = useState<Drawer>(null)

  // Widening the window puts both panels back in the layout — a drawer left
  // open behind that would float over the page it already belongs to.
  useEffect(() => {
    if (!narrow) setDrawer(null)
  }, [narrow])

  // Leaving the page a drawer belongs to closes it.
  useEffect(() => setDrawer(null), [page])

  // Escape closes; the body lock stops the page behind the scrim scrolling.
  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawer(null)
    }
    window.addEventListener('keydown', onKey)
    document.body.classList.add('drawer-lock')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('drawer-lock')
    }
  }, [drawer])

  // ---- Side-panel rails -----------------------------------------------
  // Remembered per panel *position* (see the setCollapse* actions), so the
  // tasks sidebar can be shut on the timer page and open on the calendar one.
  // Ignored while narrow: those panels are drawers there, with no rail to
  // shrink into and a topbar toggle already doing the hiding.
  const { state, dispatch } = useStore()
  const railed = (on: boolean | undefined) => !narrow && (on ?? false)

  const ui: UIApi = {
    openEvent: setEventModal,
    openTask: setTaskModal,
    openRecurring: setRecurringModal,
    openClass: setClassModal,
    openCalendar: setCalendarModal,
    openSession: setSessionModal,
    openLiveIcs: () => setLiveIcsModal(true),
    openStaticImport: setStaticImport,
    openLogStudy: (init) => setLogStudyModal(init ?? {}),
    openSearch: () => setSearchOpen(true),
    gotoDay: (iso) => {
      setAnchor(iso)
      setView('day')
      setPage('calendar')
    },
  }

  // ⌘K / Ctrl+K opens the global search overlay from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey !== e.metaKey
      if (!mod || e.altKey || e.shiftKey) return
      if (e.key.toLowerCase() !== 'k') return
      e.preventDefault()
      setSearchOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <UICtx.Provider value={ui}>
      <div className={`app${drawer ? ` drawer-open drawer-${drawer}` : ''}`}>
        <TopBar
          page={page} setPage={setPage}
          view={view} setView={setView}
          anchor={anchor} setAnchor={setAnchor}
          narrow={narrow} drawer={drawer} setDrawer={setDrawer}
        />
        {/* Everything due today floats over the top of every page — one pill
            per class, taking no layout space anywhere. */}
        <UrgentBanners />
        <div className="main">
          {page === 'home' ? (
            <HomePage setPage={setPage} />
          ) : page === 'calendar' ? (
            <>
              <SidebarLeft
                anchor={anchor} setAnchor={setAnchor}
                collapsed={railed(state.collapseCalSidebar)}
                onToggleCollapse={() => dispatch({ type: 'setCollapseCalSidebar', on: !state.collapseCalSidebar })}
              />
              <div className="calendar-area">
                {view === 'year' ? (
                  <YearView anchor={anchor} setAnchor={setAnchor} setView={setView} />
                ) : view === 'month' ? (
                  <>
                    <MonthGrid anchor={anchor} />
                    {/* The month's habit gantt sits under the grid it belongs to. */}
                    <HabitGantt anchor={anchor} />
                  </>
                ) : (
                  <WeekGrid anchor={anchor} days={view === 'day' ? 1 : 7} />
                )}
              </div>
              <TasksHandle
                collapsed={railed(state.collapseCalTasks)}
                onToggle={() => dispatch({ type: 'setCollapseCalTasks', on: !state.collapseCalTasks })}
              />
              {!railed(state.collapseCalTasks) && <TasksPanel mode="sidebar" onExpand={() => setPage('tasks')} />}
            </>
          ) : page === 'tasks' ? (
            <TasksPanel mode="full" onExpand={() => setPage('calendar')} />
          ) : page === 'timer' ? (
            <>
              <StudyTimerPage />
              <TasksHandle
                collapsed={railed(state.collapseTimerTasks)}
                onToggle={() => dispatch({ type: 'setCollapseTimerTasks', on: !state.collapseTimerTasks })}
              />
              {!railed(state.collapseTimerTasks) && <TasksPanel mode="sidebar" onExpand={() => setPage('tasks')} />}
            </>
          ) : page === 'insights' ? (
            <InsightsPage />
          ) : page === 'journal' ? (
            <JournalPage />
          ) : (
            <BinderPage />
          )}
        </div>

        {/* Only ever mounted on a narrow screen — see the drawer effects above. */}
        {drawer && (
          <div className="mob-scrim" aria-hidden="true" onClick={() => setDrawer(null)} />
        )}

        {eventModal && <EventModal init={eventModal} onClose={() => setEventModal(null)} />}
        {taskModal && <TaskModal init={taskModal} onClose={() => setTaskModal(null)} />}
        {recurringModal && <RecurringModal init={recurringModal} onClose={() => setRecurringModal(null)} />}
        {classModal && <ClassModal init={classModal} onClose={() => setClassModal(null)} />}
        {calendarModal && <CalendarModal init={calendarModal} onClose={() => setCalendarModal(null)} />}
        {sessionModal && <SessionModal init={sessionModal} onClose={() => setSessionModal(null)} />}
        {liveIcsModal && <LiveIcsModal onClose={() => setLiveIcsModal(false)} />}
        {staticImport && <StaticImportModal init={staticImport} onClose={() => setStaticImport(null)} />}
        {logStudyModal && <LogStudyModal init={logStudyModal} onClose={() => setLogStudyModal(null)} />}
        {searchOpen && (
          <SearchOverlay
            onClose={() => setSearchOpen(false)}
            onGotoPage={(p) => setPage(p)}
          />
        )}
      </div>
    </UICtx.Provider>
  )
}
