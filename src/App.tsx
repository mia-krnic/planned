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
import SearchOverlay from './components/search/SearchOverlay'
import type { ParsedIcsEvent } from './utils/ics'

export type Page = 'calendar' | 'tasks' | 'timer' | 'binder' | 'insights'
export type View = 'day' | 'week' | 'month'

export interface EventModalInit { event?: CalEvent; date?: string; startMin?: number; allDay?: boolean }
export interface TaskModalInit { task?: Task; date?: string | null; projectId?: ID | null; sectionId?: ID | null }
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
  const [view, setView] = useState<View>('week')
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
      <div className="app">
        <TopBar
          page={page} setPage={setPage}
          view={view} setView={setView}
          anchor={anchor} setAnchor={setAnchor}
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
              {timerTasks && <TasksPanel mode="sidebar" onExpand={() => setPage('tasks')} />}
            </>
          ) : page === 'insights' ? (
            <InsightsPage />
          ) : (
            <BinderPage />
          )}
        </div>

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
