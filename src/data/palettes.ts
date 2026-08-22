import { PALETTE } from '../types'

/**
 * A one-click recolour of every class, plus the accent it is meant to sit
 * against. Applied by the `applyPaletteBundle` action, which cycles `colors`
 * over the classes in order — so a bundle needs enough colours that a normal
 * timetable never repeats one, but not so many that the set stops reading as
 * a single family.
 *
 * The colours live in the same register as the app's default PALETTE:
 * mid-lightness and slightly muted, so they carry a readable title tint in the
 * light theme and don't glare as event fills in the dark one.
 */
export interface PaletteBundle {
  id: string
  name: string
  colors: string[]
  /** Accent per theme — the light one is deep, the dark one pale (see accentText). */
  accent: { light: string; dark: string }
}

/**
 * The bundle that means "no override": applying it puts the classes back on
 * the app's own PALETTE and clears state.accent, so the accent falls back to
 * whatever the theme tokens say. Kept as an id rather than a flag on the
 * bundle so the accent pair below can still describe the swatch it draws.
 */
export const DEFAULT_BUNDLE_ID = 'classic'

export const PALETTE_BUNDLES: PaletteBundle[] = [
  {
    id: DEFAULT_BUNDLE_ID,
    name: 'Classic',
    // The whole default palette, not a trimmed set: this is the restore.
    colors: [...PALETTE],
    accent: { light: '#3b82d6', dark: '#5b9be0' },
  },
  {
    id: 'fall',
    name: 'Fall',
    colors: ['#c47f4e', '#a8894f', '#8f6f52', '#b5654b', '#9a9455', '#d1a05e', '#7f8c5c', '#c0906f'],
    accent: { light: '#96562f', dark: '#c98a5c' },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    colors: ['#4f93b8', '#5fb3ba', '#7aa8dd', '#57a58f', '#8fc6d8', '#6c7fc0', '#3f8f9e', '#9ad0c4'],
    accent: { light: '#2a7194', dark: '#5aa9cb' },
  },
  {
    id: 'spring',
    name: 'Spring',
    colors: ['#a8d5a2', '#f2b8c6', '#f7d9a0', '#b8d8ec', '#d9c2e8', '#f6c8a8', '#c8e3b0', '#a9dcd4'],
    accent: { light: '#a84f68', dark: '#eda1b4' },
  },
  {
    id: 'berry',
    name: 'Berry',
    colors: ['#a85173', '#7d5a9e', '#b0526b', '#5f7fb5', '#4f8f7a', '#c06a8a', '#6a5fa8', '#5f97a8'],
    accent: { light: '#8e4a7d', dark: '#c07fae' },
  },
  {
    id: 'forest',
    name: 'Forest',
    colors: ['#5f8f5a', '#7fa86a', '#4f7f6a', '#8f9f5f', '#6a9f8f', '#a8b06f', '#5a7f4f', '#9fb98a'],
    accent: { light: '#3f7a52', dark: '#6faa7f' },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    colors: ['#e2745f', '#e08a5f', '#e8a86f', '#e8c07f', '#d96f8a', '#c06f9f', '#a86fa8', '#f0b48f'],
    accent: { light: '#b4553c', dark: '#e8916f' },
  },
  {
    id: 'lavender',
    name: 'Lavender dusk',
    colors: ['#9b8fd0', '#b89fd8', '#8f9fd8', '#c9a8d8', '#7f8fc0', '#a8b0e0', '#b58fc0', '#8fa8c9'],
    accent: { light: '#665aa8', dark: '#a596e0' },
  },
  {
    id: 'slate',
    name: 'Slate',
    // Near-greys, separated by a hint of hue rather than by lightness — the
    // set for a timetable you would rather read than colour-code.
    colors: ['#5f6f80', '#7b8794', '#98a2ae', '#b3bbc4', '#6f7f77', '#8c8f9e', '#9e9288', '#7a8fa0'],
    accent: { light: '#55677a', dark: '#93a6ba' },
  },
]
