import { useLayoutEffect, useState, type RefObject } from 'react'

/** Breathing room kept between a popover and the edge of the screen. */
const EDGE = 8

/**
 * Keeps a `position: fixed` popover inside the viewport.
 *
 * The anchor point a popover is opened at — a click, a button's corner — says
 * nothing about how wide the box turns out to be, so on a phone a list opened
 * near the right edge used to hang off it. The box is measured once it is in
 * the DOM (before paint, so nothing flashes) and its anchor nudged back until
 * every edge fits. On a roomy screen the point comes back exactly as given.
 *
 * `centred` describes boxes drawn with `transform: translateX(-50%)` — the
 * slot chooser, the drag popovers — whose `x` is their centre, not their left.
 */
export function useClampedPos(
  ref: RefObject<HTMLElement | null>,
  x: number,
  y: number,
  centred = false,
): { x: number; y: number } {
  const [pos, setPos] = useState({ x, y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) {
      setPos({ x, y })
      return
    }
    const { offsetWidth: w, offsetHeight: h } = el
    // Half a centred box's width is what its anchor has to stay clear of.
    const half = centred ? w / 2 : 0
    const lo = EDGE + half
    const hi = window.innerWidth - EDGE - w + half
    const bottom = window.innerHeight - EDGE - h
    setPos({
      // A box wider than the screen can't satisfy both edges: pin the left one.
      x: hi < lo ? lo : Math.min(Math.max(x, lo), hi),
      y: Math.min(Math.max(y, EDGE), Math.max(EDGE, bottom)),
    })
  }, [ref, x, y, centred])

  return pos
}
