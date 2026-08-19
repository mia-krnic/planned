import { createContext, useContext, useEffect, useState } from 'react'
import type { CalEvent, ClassInfo, CustomCalendar, ID, RecurringTask, Task } from './types'
import { todayISO } from './utils/date'
import TopBar from './components/TopBar'
import SidebarLeft from './components/SidebarLeft'
import WeekGrid from './components/WeekGrid'
import MonthGrid from './components/MonthGrid'
import TasksPanel from './components/TasksPanel'
import UrgentBanners from './components/UrgentBanners'
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

export type Page = 'calendar' | 'tasks' | 'timer' | 'binder' | 'insights' | 'journal'
export type View = 'day' | 'week' | 'month'

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
export interface RecurringModalInit { rt?: RecurringTask; projectId?: ID; sectionId?: ID | null; occurrence?: string }
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
  const [page, setPage] = useState<Page>('calendar')
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
  // Tasks sidebar on the timer page — handy while timing, collapsible when it's in the way.
  const [timerTasks, setTimerTasks] = useState(true)

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
        <div className="main">
          {page === 'calendar' ? (
            <>
              <SidebarLeft anchor={anchor} setAnchor={setAnchor} />
              <div className="calendar-area">
                {/* Everything due today, one banner per class, above the grid. */}
                <UrgentBanners />
                {view === 'month'
                  ? <MonthGrid anchor={anchor} />
                  : <WeekGrid anchor={anchor} days={view === 'day' ? 1 : 7} />}
              </div>
              <TasksPanel mode="sidebar" onExpand={() => setPage('tasks')} />
            </>
          ) : page === 'tasks' ? (
            <TasksPanel mode="full" onExpand={() => setPage('calendar')} />
          ) : page === 'timer' ? (
            <>
              <StudyTimerPage />
              <button
                className={`timer-tasks-handle ${timerTasks ? '' : 'collapsed'}`}
                title={timerTasks ? 'Hide tasks' : 'Show tasks'}
                onClick={() => setTimerTasks((v) => !v)}
              >
                <span className="tth-arrow">{timerTasks ? '›' : '‹'}</span>
                {!timerTasks && <span className="tth-label">Tasks</span>}
              </button>
              {/* Narrow: the panel is a drawer, so the handle that hides it is
                  gone and the panel is always mounted for the topbar toggle. */}
              {(timerTasks || narrow) && <TasksPanel mode="sidebar" onExpand={() => setPage('tasks')} />}
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
