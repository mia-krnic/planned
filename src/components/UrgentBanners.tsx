import { useUI } from '../App'
import { useStore } from '../store'
import { URGENT_MARKS, urgentDueGroups } from '../utils/agenda'
import { hexToRgba, titleTint } from '../utils/color'
import { todayISO } from '../utils/date'

/** Why a task still counts as urgent — the hover text behind its marks. */
function markHint(done: boolean, submitted: boolean): string {
  if (!done && !submitted) return 'Not done, not submitted'
  return done ? 'Done — not submitted yet' : 'Submitted — not ticked off yet'
}

/**
 * One-line banners at the top of the calendar, one per class, listing that
 * class's tasks due today. There is no dismiss button by design: a banner
 * clears only when the work is both done and submitted, or the deadline moves.
 */
export default function UrgentBanners() {
  const { state } = useStore()
  const ui = useUI()
  const groups = urgentDueGroups(state, todayISO())
  if (groups.length === 0) return null

  return (
    <div className="urgent-banners">
      {groups.map((g) => (
        <div key={g.key} className="urgent-banner"
          style={{ background: hexToRgba(g.color, 0.16), borderLeftColor: g.color }}>
          <span className="ub-class" style={{ color: titleTint(g.color) }}>{g.name}</span>
          <span className="ub-due">due today</span>
          <span className="ub-tasks">
            {g.tasks.map(({ task, marks }) => (
              <button key={task.id} type="button" className="ub-task"
                title={markHint(task.done, !!task.submitted)}
                onClick={() => ui.openTask({ task })}>
                <span className="ub-mark" style={{ color: g.color }}>{URGENT_MARKS[marks]}</span>
                <span className="ub-title">{task.title}</span>
              </button>
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}
