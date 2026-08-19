import { useState } from 'react'
import { useStore } from '../store'

/**
 * Palette swatches + custom hex picker. New hex colours are saved into the
 * shared palette; hovering a swatch reveals a × to delete it from the palette.
 */
export default function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const { state, dispatch } = useStore()
  const [custom, setCustom] = useState('#a855f7')

  const addCustom = () => {
    const c = custom.toLowerCase()
    if (!/^#[0-9a-f]{6}$/.test(c)) return
    dispatch({ type: 'addPaletteColor', color: c })
    onChange(c)
  }

  return (
    <div className="color-picker">
      <div className="color-row">
        {state.palette.map((c) => (
          <span key={c} className="color-dot-wrap">
            <button className={`color-dot ${c === value ? 'sel' : ''}`} style={{ background: c }}
              onClick={() => onChange(c)} aria-label={c} title={c} />
            <button
              className="color-del" title="Delete colour from palette" aria-label={`Delete ${c}`}
              onClick={() => dispatch({ type: 'removePaletteColor', color: c })}
            >×</button>
          </span>
        ))}
      </div>
      <div className="hex-add">
        <input type="color" value={custom} onChange={(e) => setCustom(e.target.value)} title="Pick a custom colour" />
        <input
          type="text" className="hex-input" value={custom} maxLength={7} placeholder="#rrggbb"
          onChange={(e) => setCustom(e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addCustom()}
        />
        <button className="btn small" onClick={addCustom}>Add to palette</button>
      </div>
    </div>
  )
}
