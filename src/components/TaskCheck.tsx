import { displayYptState, useStore } from '../store'
import type { RecurringTask, Task } from '../types'
import { cbTint } from '../utils/color'
import { recurringCount, recurringTimes } from '../utils/occur'

/**
 * The tri-state glyphs, indexed by YptState: an empty square, a half-filled
 * square (the lower-left triangle reads as "half of it is done"), and a struck
 * circle. Text glyphs only, so they take the task's colour like a tinted
 * checkbox does.
 */
export const YPT_GLYPHS = ['□', '◺', '⊘'] as const

const YPT_TITLES = [
  'Not started — click for half done',
  'Half done — click for done',
  'Done — click to start over',
] as const

interface Props {
  task: Task
  /** The task's class/calendar colour — tints the box exactly like cbTint does. */
  color: string
  /** Extra class for context-specific sizing (e.g. the study stripe's small rows). */
  className?: string
}

/**
 * One task's completion control. In checkbox mode (the default) this is the
 * plain tinted checkbox every list has always had; in YPT mode it becomes a
 * glyph button that cycles □ → ◺ → ⊘. Either way clicking it never reaches the
 * row behind it, so the row keeps opening the editor.
 */
export default function TaskCheck({ task, color, className }: Props) {
  const { state, dispatch } = useStore()
  const cls = className ? ` ${className}` : ''

  if (state.taskCheckStyle !== 'ypt') {
    return (
      <input type="checkbox" className={`cb${cls}`} checked={task.done}
        style={cbTint(color)}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onChange={() => dispatch({ type: 'toggleTask', id: task.id })} />
    )
  }

  const s = displayYptState(task)
  return (
    <button type="button" className={`ypt-box ypt-${s}${cls}`}
      style={{ color }}
      title={YPT_TITLES[s]}
      aria-label={YPT_TITLES[s]}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); dispatch({ type: 'cycleYpt', id: task.id }) }}>
      {YPT_GLYPHS[s]}
    </button>
  )
}

/**
 * The completion control for one RECURRING occurrence. Checkbox mode keeps the
 * per-day behaviour every list has always had (a plain tick, or one box per
 * slot for "n× a day" habits). YPT mode renders the same tri-state glyph as
 * plain tasks — and the triangle finally means something literal here: a
 * partially-counted "n× a day" day shows ◺. Clicking advances the count one
 * slot at a time and wraps back to zero after a full day.
 */
export function RecurringCheck({ rt, date, color, className, compact }: {
  rt: RecurringTask
  date: string
  /** The habit's class/calendar colour. */
  color: string
  className?: string
  /** Tight spots (month chips): one box for the whole day instead of per-slot ticks. */
  compact?: boolean
}) {
  const { state, dispatch } = useStore()
  const times = recurringTimes(rt)
  const count = recurringCount(rt, date)
  const cls = className ? ` ${className}` : ''

  if (state.taskCheckStyle !== 'ypt') {
    if (compact && times > 1) {
      return (
        <input type="checkbox" className={`cb${cls}`} checked={count >= times} style={cbTint(color)}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={() => dispatch({ type: 'setRecurringCount', id: rt.id, date, count: count >= times ? 0 : times })} />
      )
    }
    if (times === 1) {
      return (
        <input type="checkbox" className={`cb${cls}`} checked={count > 0} style={cbTint(color)}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={() => dispatch({ type: 'toggleRecurring', id: rt.id, date })} />
      )
    }
    // One box per slot, filled left to right; clicking a filled box drops back to it.
    return (
      <span className="rt-slots" onPointerDown={(e) => e.stopPropagation()}>
        {Array.from({ length: times }, (_, i) => (
          <input key={i} type="checkbox" className="cb" checked={i < count} style={cbTint(color)}
            title={`${i + 1} of ${times}`}
            onClick={(e) => e.stopPropagation()}
            onChange={() => dispatch({ type: 'setRecurringCount', id: rt.id, date, count: i < count ? i : i + 1 })} />
        ))}
      </span>
    )
  }

  const s = count >= times ? 2 : count > 0 ? 1 : 0
  const title = times > 1
    ? `${count} of ${times} today — click to advance`
    : s === 2 ? 'Done — click to start over' : 'Not done — click to complete'
  return (
    <button type="button" className={`ypt-box ypt-${s}${cls}`}
      style={{ color }}
      title={title}
      aria-label={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        if (times === 1) dispatch({ type: 'toggleRecurring', id: rt.id, date })
        else dispatch({ type: 'setRecurringCount', id: rt.id, date, count: count >= times ? 0 : count + 1 })
      }}>
      {YPT_GLYPHS[s]}
    </button>
  )
}
