import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Pos {
  top?: number
  bottom?: number
  left: number
  width: number
}

/**
 * A dashed "+ …" button that opens a small searchable list under itself —
 * the pattern the study timer uses for linking to-dos mid-session.
 *
 * The panel is position:fixed off the button's viewport rect (like ColorSelect)
 * so a scrolling ancestor — a modal body, the binder page — can never clip it.
 * `children` gets the lower-cased search needle and a `close` callback, and
 * owns the list itself; the popover only handles opening, placing and filtering.
 */
export default function PickerPopover({ label, placeholder, minWidth = 280, children, footer }: {
  label: string
  placeholder: string
  minWidth?: number
  children: (needle: string, close: () => void) => ReactNode
  /** Optional row pinned under the list — an escape hatch like "upload a new one". */
  footer?: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState<Pos>()
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const toggleOpen = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) {
      const width = Math.max(r.width, minWidth)
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
      const below = window.innerHeight - r.bottom
      setPos(below < 300 && r.top > below
        ? { bottom: window.innerHeight - r.top + 4, left, width }
        : { top: r.bottom + 4, left, width })
    }
    setQ('')
    setOpen((o) => !o)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    // Stopped so Escape closes the popover without also closing the modal behind it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  const close = () => setOpen(false)

  return (
    <div className="qt-wrap pk-wrap" ref={wrapRef}>
      <button type="button" className="qt-add" ref={btnRef} onClick={toggleOpen}>{label}</button>
      {open && (
        <div className="qt-pop pk-pop" style={pos}>
          <input className="qt-search" autoFocus placeholder={placeholder} value={q}
            onChange={(e) => setQ(e.target.value)} />
          <div className="qt-list">{children(q.trim().toLowerCase(), close)}</div>
          {footer && <div className="pk-foot">{footer(close)}</div>}
        </div>
      )}
    </div>
  )
}
