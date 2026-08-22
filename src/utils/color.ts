import type React from 'react'

/** Inline style that tints a .cb checkbox (custom-painted via --cb-color). */
export function cbTint(color: string): React.CSSProperties {
  return { '--cb-color': color } as React.CSSProperties
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Readable title tint: pushes the raw calendar color toward the theme text color. */
export function titleTint(color: string): string {
  return `color-mix(in srgb, ${color} 65%, var(--text))`
}

/** WCAG relative luminance of an #rrggbb colour, 0 (black) … 1 (white). */
export function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const lin = [0, 2, 4]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

/**
 * What to print *on* an accent colour. The cut sits at 0.28 because that is
 * the gap the two shipped --accent-text pairings already straddle: the light
 * theme's deep blue lands under it and keeps white, the dark theme's pale blue
 * lands over it and keeps near-black. Every palette bundle's accent clears
 * 3.9:1 against the side it falls on.
 */
export function accentText(hex: string): string {
  return luminance(hex) > 0.28 ? '#0e1013' : '#ffffff'
}

/** Muted task colour for the small "due …" print under a task row. */
export function dueTint(color: string): React.CSSProperties {
  return { color: `color-mix(in srgb, ${color} 55%, var(--text-faint))` }
}

export const PERSONAL_COLOR = '#8a97a8'
