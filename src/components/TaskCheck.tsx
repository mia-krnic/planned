import { displayYptState, useStore } from '../store'
import type { Task } from '../types'
import { cbTint } from '../utils/color'

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
