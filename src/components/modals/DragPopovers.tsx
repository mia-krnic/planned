import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { EditScope } from '../../utils/occur'
import { DUE_EOD_MIN } from '../../types'
import { fmtFriendly, fmtTime } from '../../utils/date'
import { useClampedPos } from '../../utils/popover'
import InfoIcon from '../InfoIcon'

interface ShellProps {
  x: number
  y: number
  onCancel: () => void
  children: ReactNode
}

/**
 * The little box a drag lands in when it needs one more answer before it can
 * commit. Portalled onto <body> like the slot chooser: inside the grid it would
 * share a stacking context with the day columns and end up under them.
 * Escape or a click outside cancels the whole drag.
 */
function DragPopover({ x, y, onCancel, children }: ShellProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  // Drawn centred on the drop point, so a drop near an edge needs pulling back.
  const pos = useClampedPos(boxRef, x, y, true)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) onCancel()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    // Next tick, so the pointerup that opened this box doesn't close it.
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onCancel])

  return createPortal(
    <div className="drag-pop" ref={boxRef} style={{ left: pos.x, top: pos.y }}>{children}</div>,
    document.body,
  )
}

const SCOPE_VALUES: EditScope[] = ['one', 'future', 'all']

/**
 * Which occurrences a dragged repeating item should move (see EventModal).
 * `noun` names what is repeating — events, or the occurrences of a recurring
 * task — so the same box reads right for both.
 */
export function ScopePopover({ x, y, noun = 'event', onPick, onCancel }: {
  x: number
  y: number
  noun?: 'event' | 'occurrence'
  onPick: (s: EditScope) => void
  onCancel: () => void
}) {
  const plural = noun === 'event' ? 'events' : 'occurrences'
  const labels: Record<EditScope, string> = {
    one: `Only this ${noun}`,
    future: 'This and future',
    all: `All ${plural}`,
  }
  return (
    <DragPopover x={x} y={y} onCancel={onCancel}>
      <div className="drag-pop-head">Move which {plural}?</div>
      <div className="drag-pop-opts">
        {SCOPE_VALUES.map((value) => (
          <button key={value} type="button" onClick={() => onPick(value)}>{labels[value]}</button>
        ))}
      </div>
    </DragPopover>
  )
}

/**
 * A due bar dragged to a LATER day asks the same question the task editor does:
 * was it an official extension (old deadline stays on the calendar, struck
 * through) or a plain reschedule? Earlier moves never get here.
 */
export function ExtensionPopover({
  x, y, from, to, onSave, onCancel,
}: {
  x: number
  y: number
  from: { dueDate: string; dueMin: number | null }
  to: { dueDate: string; dueMin: number | null }
  onSave: (granted: boolean) => void
  onCancel: () => void
}) {
  const [granted, setGranted] = useState(true)
  return (
    <DragPopover x={x} y={y} onCancel={onCancel}>
      <div className="drag-pop-head">Due date moved later</div>
      <div className="drag-pop-sub">
        {fmtFriendly(from.dueDate)} {fmtTime(from.dueMin ?? DUE_EOD_MIN)}
        {' → '}
        {fmtFriendly(to.dueDate)} {fmtTime(to.dueMin ?? DUE_EOD_MIN)}
      </div>
      <label className="check-line" style={{ marginBottom: 0 }}>
        <input type="checkbox" className="cb" checked={granted}
          onChange={(e) => setGranted(e.target.checked)} />
        Extension granted
        <InfoIcon text="Keeps the old deadline on its original day, faded and struck through with an “extension granted” note. Leave it off if you're simply rescheduling." />
      </label>
      <div className="drag-pop-actions">
        <button className="btn small" type="button" onClick={onCancel}>Cancel</button>
        <button className="btn small primary" type="button" onClick={() => onSave(granted)}>Save</button>
      </div>
    </DragPopover>
  )
}
