import { useEffect, useRef, useState } from 'react'

export interface ColorOption {
  value: string
  label: string
  /** Calendar colour shown as a dot left of the label. Omit for "no calendar". */
  color?: string
  /** Greyed + italic (the "please select" placeholder row). */
  muted?: boolean
}

/** A block of options under an optional heading (a class folder, "My calendars"…). */
export interface ColorGroup {
  heading?: string
  options: ColorOption[]
}

/**
 * A dropdown that can show a colour dot per option — the one thing a native
 * <select> can't do (browsers won't paint inside <option>).
 *
 * The dot sits to the LEFT of the label, both in the closed button and in the
 * popover list. An option without a colour (the "please select" placeholder, or
 * "no class") gets no dot. The open list mirrors the calendar sidebar: option
 * blocks under small grey folder headings, which are labels only — nothing to
 * click.
 */
export default function ColorSelect({ value, groups, onChange, placeholder, title }: {
  value: string
  groups: ColorGroup[]
  onChange: (value: string) => void
  /** Text shown (grey + italic) when `value` matches no option at all. */
  placeholder?: string
  title?: string
}) {
  const [open, setOpen] = useState(false)
  // Viewport coordinates: the popover is position:fixed so a scrolling ancestor
  // (the import review table, the modal itself) can't clip it.
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number }>()
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const sel = groups.flatMap((g) => g.options).find((o) => o.value === value)

  const toggle = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) {
      const below = window.innerHeight - r.bottom
      setPos(below < 260 && r.top > below
        ? { bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width }
        : { top: r.bottom + 4, left: r.left, width: r.width })
    }
    setOpen((o) => !o)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation() // don't also close the modal behind us
        setOpen(false)
      }
    }
    // The list is pinned to the viewport, so anything that moves the button
    // underneath it closes the list rather than leaving it stranded.
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

  return (
    <div className={`cs-wrap ${open ? 'open' : ''}`} ref={wrapRef}>
      <button type="button" className="cs-btn" title={title} ref={btnRef} onClick={toggle}>
        {sel?.color && <span className="cs-dot" style={{ background: sel.color }} />}
        <span className={`cs-label ${sel && !sel.muted ? '' : 'cs-placeholder'}`}>
          {sel ? sel.label : placeholder ?? 'please select'}
        </span>
        <span className="cs-caret">▾</span>
      </button>
      {open && (
        <div className="cs-pop" role="listbox" style={pos}>
          {groups.map((g, gi) => (
            <div key={g.heading ?? `g${gi}`} className="cs-group">
              {g.heading && <div className="cs-head">{g.heading}</div>}
              {g.options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  className={`cs-opt ${g.heading ? 'in-group' : ''} ${o.value === value ? 'sel' : ''}`}
                  onClick={() => { onChange(o.value); setOpen(false) }}
                >
                  <span className="cs-dot" style={o.color ? { background: o.color } : { visibility: 'hidden' }} />
                  <span className={`cs-label ${o.muted ? 'cs-placeholder' : ''}`}>{o.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
