/**
 * What the Home page shows on a given day.
 *
 * The three picks — photo, mantra, quote — are drawn INDEPENDENTLY from one
 * string hash of the date plus a per-slot salt. Independently matters: the
 * mantra and the quote used to be two halves of one QUOTE_PAIRS entry indexed
 * by the day number, so they marched through the list together and the photo
 * marched beside them. Hashing decorrelates the three while keeping the whole
 * thing a pure function of the ISO date: the same day looks the same on every
 * device, all day, and turns over at midnight with nothing stored.
 *
 * A pick the user applied from the library (state.homeOverrides) wins over the
 * draw, per slot, so choosing a wallpaper for today leaves today's words alone.
 */
import { MANTRAS, QUOTES, type Quote } from './quotes'
import { MANTRAS_ZH, QUOTES_ZH } from './quotesZh'
import { WALLPAPERS, type Wallpaper } from './wallpapers'
import { lang } from '../i18n'
import type { AppState, ID } from '../types'

/** FNV-1a over the string, then an xorshift-multiply finaliser. */
export function hashStr(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  // FNV alone leaves neighbouring inputs close in the low bits, and the low
  // bits are exactly what `% len` reads. The avalanche below fixes that.
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15
  h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return h >>> 0
}

/** An index into a list of `len` items, deterministic from `seed`. */
export function pickIndex(seed: string, len: number): number {
  return len > 0 ? hashStr(seed) % len : 0
}

/**
 * The built-in pools for the language the app is in. The Chinese lists are
 * separate works, not translations (see quotesZh), so switching language
 * switches the day's words as well as the page's labels — and switching back
 * restores them, because the draw below is still a pure function of the date
 * and nothing about the pick is stored.
 *
 * Read at call time, never hoisted into a module const: `lang()` is only
 * correct during render.
 */
function builtinMantras(): string[] {
  return lang() === 'zh' ? MANTRAS_ZH : MANTRAS
}

function builtinQuotes(): Quote[] {
  return lang() === 'zh' ? QUOTES_ZH : QUOTES
}

/** A mantra from either pool. `customId` marks one the user wrote (deletable). */
export interface HomeMantra {
  text: string
  customId?: ID
}

/** A long quote from either pool. `customId` marks one the user wrote. */
export interface HomeQuote {
  text: string
  author?: string
  customId?: ID
}

export function mantraPool(state: AppState): HomeMantra[] {
  return [
    ...builtinMantras().map((text) => ({ text })),
    ...(state.customMantras ?? []).map((m) => ({ text: m.text, customId: m.id })),
  ]
}

export function quotePool(state: AppState): HomeQuote[] {
  return [
    ...builtinQuotes().map((q) => ({ text: q.text, author: q.author })),
    ...(state.customQuotes ?? []).map((q) => ({ text: q.text, author: q.author, customId: q.id })),
  ]
}

export interface HomePicks {
  wallpaper: Wallpaper
  mantra: HomeMantra
  quote: HomeQuote
}

/**
 * The day's three picks. Overrides are stored as the same keys favourites use
 * (wallpaper file / mantra text / quote text); an override whose text is no
 * longer in the pool — the user deleted their own quote — still displays, it
 * just loses the author it never had.
 */
export function homePicks(state: AppState, iso: string): HomePicks {
  const ov = state.homeOverrides?.[iso]
  const mantras = mantraPool(state)
  const quotes = quotePool(state)

  const wallpaper =
    (ov?.wallpaper ? WALLPAPERS.find((w) => w.file === ov.wallpaper) : undefined)
    ?? WALLPAPERS[pickIndex(`${iso}wp`, WALLPAPERS.length)]

  // The daily draw comes from the BUILT-IN pools only, never the user's own
  // entries: a given date then shows the exact same photo, mantra and quote to
  // everyone on the same version — half the charm of a daily pick is knowing
  // someone else is looking at it too. Custom entries live in the library, to
  // favourite or apply as an override by hand.
  //
  // The seed strings stay the same in either language: the index is drawn from
  // the date alone and only then taken modulo the active pool's length, so
  // everyone reading the app in Chinese shares today's line just as everyone
  // reading it in English shares theirs.
  const mantraPicks = builtinMantras()
  const quotePicks = builtinQuotes()

  const mantra = ov?.mantra
    ? mantras.find((m) => m.text === ov.mantra) ?? { text: ov.mantra }
    : { text: mantraPicks[pickIndex(`${iso}mantra`, mantraPicks.length)] }

  const drawn = quotePicks[pickIndex(`${iso}quote`, quotePicks.length)]
  const quote = ov?.quote
    ? quotes.find((q) => q.text === ov.quote) ?? { text: ov.quote }
    : { text: drawn.text, author: drawn.author }

  return { wallpaper, mantra, quote }
}
