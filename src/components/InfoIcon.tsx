import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  text: string
}

/** Distance between the glyph and the tip, and the minimum gap to a viewport edge. */
const GAP = 6
const EDGE = 8

interface TipPos {
  top: number
  left: number
  /** Which side of the glyph the tip ended up on — drives the arrow. */
  place: 'top' | 'bottom'
  /** Arrow offset from the tip's left edge, so it keeps pointing at the glyph. */
  arrowX: number
}

/**
 * Small blue circled-i with a hover tooltip. Used to move parenthetical asides
 * out of labels while keeping the explanation one hover away.
 *
 * The tip is rendered into a portal on document.body as a position:fixed box,
 * NOT as a child of the glyph: as a child it was clipped by every scrolling or
 * overflow-hidden ancestor (the top bar most visibly). Placement is measured
 * from the glyph's viewport rect — above by default, flipped below when there
 * is no room, and clamped horizontally so it never leaves the viewport.
 *
 * It still appears on hover and keyboard focus only, and hides on leave, blur,
 * Escape, or anything that scrolls/resizes the glyph out from under it.
 */
export default function InfoIcon({ text }: Props) {
  // The glyph's viewport rect while the tip is up; null = hidden.
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [pos, setPos] = useState<TipPos | null>(null)
  const tipRef = useRef<HTMLSpanElement>(null)

  // Measure the tip once it is in the DOM, then place it. Until `pos` exists the
  // tip is rendered transparent and off-screen, so this never flashes.
  useLayoutEffect(() => {
    if (!rect) {
      setPos(null)
      return
    }
    const el = tipRef.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const place: 'top' | 'bottom' = rect.top - GAP - EDGE >= h ? 'top' : 'bottom'
    const top = Math.max(
      EDGE,
      Math.min(place === 'top' ? rect.top - h - GAP : rect.bottom + GAP, window.innerHeight - h - EDGE),
    )
    const mid = rect.left + rect.width / 2
    const left = Math.max(EDGE, Math.min(mid - w / 2, window.innerWidth - w - EDGE))
    setPos({ top, left, place, arrowX: Math.max(8, Math.min(mid - left, w - 8)) })
  }, [rect])

  // Anything that can move the glyph takes the tip down rather than stranding it.
  useEffect(() => {
    if (!rect) return
    const hide = () => setRect(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide()
    }
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    document.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [rect])

  const show = (el: HTMLElement) => setRect(el.getBoundingClientRect())

  return (
    <span
      className="info-icon"
      tabIndex={0}
      aria-label={text}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => setRect(null)}
      // Keyboard focus only: a mouse click focuses too, but not :focus-visible.
      onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) show(e.currentTarget) }}
      onBlur={() => setRect(null)}
    >
      <span className="info-glyph">ⓘ</span>
      {rect && createPortal(
        <span
          ref={tipRef}
          className={`info-tip ${pos ? `tip-${pos.place}` : ''}`}
          role="tooltip"
          style={{
            top: pos ? pos.top : -9999,
            left: pos ? pos.left : -9999,
            opacity: pos ? 1 : 0,
            ['--tip-arrow-x' as string]: pos ? `${pos.arrowX}px` : '50%',
          }}
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  )
}
