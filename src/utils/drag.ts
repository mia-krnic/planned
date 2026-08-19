/**
 * Pointer-drag helpers shared by the calendar grids.
 *
 * Calendar drags are continuous positioning (a time and a day), not list
 * reordering, so they use pointer events rather than HTML5 drag & drop: HTML5
 * gives no live coordinates, no sub-row precision and no way to cancel mid-way.
 * A press only becomes a drag once the pointer has travelled DRAG_THRESHOLD_PX,
 * which is what keeps plain clicks opening the editors.
 */

/** Times snap to quarter hours while dragging. */
export const SNAP_MIN = 15
/** Pointer travel (px) before a press turns into a drag. */
export const DRAG_THRESHOLD_PX = 4
/** Shortest block a resize may leave behind. */
export const MIN_BLOCK_MIN = 15

export const snapMin = (min: number): number => Math.round(min / SNAP_MIN) * SNAP_MIN

export const clampMin = (min: number, lo = 0, hi = 24 * 60): number => Math.max(lo, Math.min(hi, min))

/** Minutes-since-midnight at viewport y, given a day column's viewport top. */
export function minutesAtY(colTop: number, clientY: number, hourH: number): number {
  return ((clientY - colTop) / hourH) * 60
}

/**
 * Index of the column whose rect contains `clientX`, else the nearest one —
 * dragging off the side of the grid parks on the edge column instead of
 * losing the drag.
 */
export function columnAtX(rects: (DOMRect | null | undefined)[], clientX: number): number {
  let best = 0
  let bestDist = Infinity
  rects.forEach((r, i) => {
    if (!r) return
    if (clientX >= r.left && clientX < r.right) {
      best = i
      bestDist = -1
      return
    }
    if (bestDist === -1) return
    const d = clientX < r.left ? r.left - clientX : clientX - r.right
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  })
  return best
}

/** Did the pointer travel far enough to count as a drag? */
export function pastThreshold(x0: number, y0: number, x: number, y: number): boolean {
  return Math.abs(x - x0) >= DRAG_THRESHOLD_PX || Math.abs(y - y0) >= DRAG_THRESHOLD_PX
}
