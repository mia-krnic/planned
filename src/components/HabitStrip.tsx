import { useStore } from '../store'
import type { RecurringTask } from '../types'
import { fromISO, todayISO, WEEKDAYS } from '../utils/date'
import { isRecurringDone, recentOccurrences } from '../utils/occur'

/** Last-7-occurrence habit tracker strip; boxes are clickable to backfill/uncheck. */
export default function HabitStrip({ rt, color }: { rt: RecurringTask; color: string }) {
  const { dispatch } = useStore()
  const today = todayISO()
  const days = recentOccurrences(rt, today, 7)

  return (
    <div className="habit-strip">
      {days.map((iso) => {
        const done = isRecurringDone(rt, iso)
        return (
          <div key={iso} className={`cell ${iso === today ? 'today' : ''}`}>
            <button
              className={`box ${done ? 'done' : ''}`}
              style={done ? { background: color } : undefined}
              title={iso}
              onClick={() => dispatch({ type: 'toggleRecurring', id: rt.id, date: iso })}
            >
              {done ? '✓' : ''}
            </button>
            <div className="lbl">{iso === today ? 'today' : WEEKDAYS[fromISO(iso).getDay()][0]}</div>
          </div>
        )
      })}
    </div>
  )
}
