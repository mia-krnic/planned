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
  /* What makes a bundle usable is VARIETY WITHIN THE THEME: five classes must
     be tellable apart at a glance, so each set below spans distinct hue
     families and lets the shared register — how muted, how warm, how light —
     carry the mood instead. A theme is a scene, not a single pigment: earth
     owns teal and aubergine as much as terracotta, a sunset owns the indigo
     it fades into, a forest owns the rowan berries and the bluebells. */
  {
    id: 'fall',
    name: 'Earth tones',
    // Terracotta, ochre, olive, moss, petrol, clay rose, stone blue, aubergine.
    colors: ['#c67a52', '#c9a24e', '#97a05a', '#6f9070', '#4f8a8a', '#c78b78', '#7f92a8', '#9c6f8e'],
    accent: { light: '#96562f', dark: '#c98a5c' },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    // The whole shoreline: deep water, teal, seafoam, sand, coral, kelp,
    // indigo, driftwood — not eight cups of the same water.
    colors: ['#4f7fb5', '#45a0a0', '#7fc4a8', '#cbb083', '#d98a72', '#7f9f62', '#6f74b8', '#8fa3b0'],
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
    // Raspberry, plum, blueberry, gooseberry, redcurrant, blackberry,
    // cranberry, and the leaves they grow under.
    colors: ['#b85878', '#8f5f9f', '#6079bd', '#8faf62', '#c46257', '#75619f', '#cd7f95', '#5f9d8c'],
    accent: { light: '#8e4a7d', dark: '#c07fae' },
  },
  {
    id: 'forest',
    name: 'Forest',
    // Pine and fern, but also birch bark, mushroom, rowan red, bluebell and
    // foxglove — the forest floor, not a paint chart of green.
    colors: ['#4f8058', '#96ab7e', '#c2ab7f', '#a08363', '#b56552', '#7f8fc4', '#7fa855', '#8d6b84'],
    accent: { light: '#3f7a52', dark: '#6faa7f' },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    // The full gradient, gold through coral and magenta into the indigo it
    // sets behind.
    colors: ['#d9a84f', '#dd8a55', '#e07a6a', '#cf6a90', '#a377b3', '#7a7fc0', '#ecb388', '#bd5f52'],
    accent: { light: '#b4553c', dark: '#e8916f' },
  },
  {
    id: 'lavender',
    name: 'Lavender dusk',
    // Lavender first, then everything dusk turns: lilac, dusty rose, half-lit
    // blue, silver mauve, violet, a moonlit sage, the slate of the sky.
    colors: ['#9f8fd4', '#c495c9', '#c98ba0', '#7f9ac9', '#a89ab8', '#8072b8', '#8fa898', '#7583a3'],
    accent: { light: '#665aa8', dark: '#a596e0' },
  },
  {
    id: 'jewel',
    name: 'Jewel box',
    // Sapphire, emerald, ruby, amethyst, topaz, garnet, lapis, peridot — the
    // saturated register, muted down to the app's event-tint weight.
    colors: ['#4f72b8', '#45997a', '#b5556a', '#8f62b0', '#c99a4f', '#b06552', '#4f93a8', '#94a852'],
    accent: { light: '#6d4a9e', dark: '#a985d6' },
  },
  {
    id: 'cafe',
    name: 'Café',
    // Espresso, caramel, matcha, milk tea, cocoa rose, steel blue, cinnamon,
    // and the green of the good teapot.
    colors: ['#8a6a52', '#c49a68', '#9aa86f', '#c4ad8d', '#b58a85', '#7f95a8', '#b0714f', '#6f8f7a'],
    accent: { light: '#6f4e37', dark: '#c49a68' },
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
