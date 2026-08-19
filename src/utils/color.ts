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

/** Muted task colour for the small "due …" print under a task row. */
export function dueTint(color: string): React.CSSProperties {
  return { color: `color-mix(in srgb, ${color} 55%, var(--text-faint))` }
}

export const PERSONAL_COLOR = '#8a97a8'
