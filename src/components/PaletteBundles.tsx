import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { PALETTE_BUNDLES } from '../data/palettes'
import { t } from '../i18n'
import InfoIcon from './InfoIcon'

/** Painter's palette — the head-icon glyph, drawn rather than typed. */
function PaletteGlyph() {
  return (
    <svg width="15" height="14" viewBox="0 0 15 14" aria-hidden="true">
      <path
        d="M7.5 1.2c3.6 0 6.3 2.3 6.3 5.2 0 1.9-1.5 2.7-2.7 2.7h-1.3c-1 0-1.7.6-1.7 1.4 0 .5.3.8.3 1.3 0 .6-.5 1-1.2 1C3.6 12.8 1.2 10.2 1.2 6.7 1.2 3.5 3.9 1.2 7.5 1.2z"
        fill="none" stroke="currentColor" strokeWidth="1.2"
      />
      <circle cx="4.6" cy="5.3" r="0.95" fill="currentColor" />
      <circle cx="7.4" cy="3.8" r="0.95" fill="currentColor" />
      <circle cx="10.4" cy="5.1" r="0.95" fill="currentColor" />
    </svg>
  )
}

/**
 * Quick-apply colour bundles, hung off the CLASSES section header — one click
 * repaints every class row directly below it and swings the app accent to
 * match, so the change is visible in the same glance that made it.
 *
 * The open/close-on-outside-click pattern is the ⚙ panel's (see ViewSettings).
 */
export default function PaletteBundles() {
  const { state, dispatch } = useStore()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const save = () => {
    if (!name.trim()) return
    dispatch({ type: 'addCustomPalette', name })
    setName('')
    setNaming(false)
  }

  // Only the accent can say which bundle is showing: class colours are editable
  // one by one afterwards, so matching them proves nothing. Classic therefore
  // never lights up — no override is the state every custom palette starts in
  // too, and claiming "Classic" for it would be a guess.
  const activeId = state.accent
    ? PALETTE_BUNDLES.find((b) => b.accent.light === state.accent!.light && b.accent.dark === state.accent!.dark)?.id
    : undefined

  return (
    <div className="pal-wrap" ref={wrapRef}>
      <button className="head-icon" title={t('Colour palettes')} aria-label={t('Colour palettes')}
        aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <PaletteGlyph />
      </button>

      {open && (
        <div className="pal-pop">
          <div className="pal-pop-head">
            <span className="proj-section-label">{t('Palettes')}</span>
            <InfoIcon text={t("One click recolours every class and swings the app's accent colour to match — Classic puts the classes back on the default palette and hands the accent back to the theme. Class colours you set yourself are overwritten, so undo (⌘Z) if you want them back: a whole bundle reverts in one step.")} />
          </div>
          {PALETTE_BUNDLES.map((b) => (
            <button key={b.id} type="button"
              className={`pal-chip${activeId === b.id ? ' on' : ''}`}
              title={`${t('Recolour every class in')} ${t(b.name).toLowerCase()}`}
              onClick={() => {
                dispatch({ type: 'applyPaletteBundle', bundleId: b.id })
                setOpen(false)
              }}>
              <span className="pal-name">{t(b.name)}</span>
              <span className="pal-dots" aria-hidden="true">
                {b.colors.slice(0, 6).map((c) => (
                  <span key={c} className="pal-dot" style={{ background: c }} />
                ))}
              </span>
              {/* The accent sits apart from the class dots — it is the one
                  colour in the bundle that paints the app rather than a class. */}
              <span className="pal-accent" aria-hidden="true" style={{ background: b.accent[state.theme] }} />
            </button>
          ))}

          {/* The user's own bundles: snapshots of the class colours as they
              stand, deletable because they made them. Creation is the snapshot
              — the per-class colour editor is the palette editor. */}
          {(state.customPalettes ?? []).map((p) => (
            <div key={p.id} className="pal-chip pal-own">
              <button type="button" className="pal-chip-apply"
                title={`${t('Recolour every class in')} ${p.name}`}
                onClick={() => {
                  dispatch({ type: 'applyPaletteBundle', bundleId: p.id })
                  setOpen(false)
                }}>
                <span className="pal-name">{p.name}</span>
                <span className="pal-dots" aria-hidden="true">
                  {p.colors.slice(0, 6).map((c, i) => (
                    <span key={`${c}${i}`} className="pal-dot" style={{ background: c }} />
                  ))}
                </span>
                {p.accent && <span className="pal-accent" aria-hidden="true" style={{ background: p.accent[state.theme] }} />}
              </button>
              <button type="button" className="pal-del" title={t('Delete this palette — it is yours')}
                onClick={() => dispatch({ type: 'deleteCustomPalette', id: p.id })}>
                ×
              </button>
            </div>
          ))}

          {naming ? (
            <div className="pal-save-row">
              <input autoFocus value={name} placeholder={t('Name this palette')}
                aria-label={t('Name this palette')} maxLength={24}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save()
                  if (e.key === 'Escape') { setNaming(false); setName('') }
                }} />
              <button type="button" className="pal-save-go" onClick={save} disabled={!name.trim()}>
                {t('Save')}
              </button>
            </div>
          ) : (
            <button type="button" className="add-inline pal-save"
              title={t('Saves the colours your classes wear right now, and the current accent, as a palette of your own')}
              onClick={() => setNaming(true)}>
              {t('+ Save current colours')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
