import type { ReactElement, ReactNode } from 'react'
import { t } from '../../i18n'
import type { WeatherKind } from '../../types'

/**
 * The daily log's icon set. All monochrome and drawn in currentColor on a
 * 16×16 grid, so one glyph works at 12px in a day header and at 16px in the
 * journal, and picks up the accent simply by the parent changing colour.
 */

interface GlyphProps {
  size?: number
  className?: string
}

function Svg({ size = 14, className, children, label }: GlyphProps & { children: ReactNode; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className}
      fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"
      role={label ? 'img' : 'presentation'} aria-label={label} aria-hidden={label ? undefined : true}>
      {children}
    </svg>
  )
}

/** Eight rays around a disc — reused at two sizes by the sun and lunch icons. */
function rays(cx: number, cy: number, r0: number, r1: number) {
  return Array.from({ length: 8 }, (_, i) => {
    const t = (i * Math.PI) / 4
    const cos = Math.cos(t)
    const sin = Math.sin(t)
    return (
      <line key={i}
        x1={(cx + r0 * cos).toFixed(2)} y1={(cy + r0 * sin).toFixed(2)}
        x2={(cx + r1 * cos).toFixed(2)} y2={(cy + r1 * sin).toFixed(2)} />
    )
  })
}

const CLOUD = 'M4.7 12.3h6.6a2.6 2.6 0 0 0 .3-5.2 3.6 3.6 0 0 0-6.7-1 2.8 2.8 0 0 0-.2 6.2z'

export function SunGlyph(p: GlyphProps) {
  return <Svg {...p}><circle cx="8" cy="8" r="2.9" fill="currentColor" stroke="none" />{rays(8, 8, 4.4, 6.2)}</Svg>
}

export function SunCloudGlyph(p: GlyphProps) {
  return (
    <Svg {...p}>
      <circle cx="5.4" cy="5" r="2.1" fill="currentColor" stroke="none" />
      {[-2.75, -2.36, -1.57, -0.79, -0.39].map((t, i) => (
        <line key={i}
          x1={(5.4 + 3.2 * Math.cos(t)).toFixed(2)} y1={(5 + 3.2 * Math.sin(t)).toFixed(2)}
          x2={(5.4 + 4.5 * Math.cos(t)).toFixed(2)} y2={(5 + 4.5 * Math.sin(t)).toFixed(2)} />
      ))}
      <path d="M6.6 13.4h5.6a2.3 2.3 0 0 0 .3-4.6 3.1 3.1 0 0 0-5.8-.9 2.4 2.4 0 0 0-.1 5.5z"
        fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function CloudGlyph(p: GlyphProps) {
  return <Svg {...p}><path d={CLOUD} fill="currentColor" stroke="none" /></Svg>
}

/** Rain, as an umbrella: filled canopy plus a hooked handle. */
export function RainGlyph(p: GlyphProps) {
  return (
    <Svg {...p}>
      <path d="M2.3 8.5a5.7 5.7 0 0 1 11.4 0z" fill="currentColor" stroke="none" />
      <path d="M8 8.5v3.9a1.6 1.6 0 0 1-3.2 0" />
    </Svg>
  )
}

export function StormGlyph(p: GlyphProps) {
  return (
    <Svg {...p}>
      <path d="M9.8 1.6 4.4 8.9h3.2L6.2 14.4l5.4-7.3H8.4z" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function SnowGlyph(p: GlyphProps) {
  const arms = [0, 1, 2].map((i) => {
    const t = (i * Math.PI) / 3 + Math.PI / 2
    const dx = 5.4 * Math.cos(t)
    const dy = 5.4 * Math.sin(t)
    return <line key={i} x1={(8 - dx).toFixed(2)} y1={(8 - dy).toFixed(2)} x2={(8 + dx).toFixed(2)} y2={(8 + dy).toFixed(2)} />
  })
  const ticks = [0, 1, 2, 3, 4, 5].map((i) => {
    const t = (i * Math.PI) / 3 + Math.PI / 2
    const ex = 8 + 5.4 * Math.cos(t)
    const ey = 8 + 5.4 * Math.sin(t)
    const a = t + Math.PI - 0.5
    const b = t + Math.PI + 0.5
    return (
      <path key={i} d={`M${(ex + 1.9 * Math.cos(a)).toFixed(2)},${(ey + 1.9 * Math.sin(a)).toFixed(2)} L${ex.toFixed(2)},${ey.toFixed(2)} L${(ex + 1.9 * Math.cos(b)).toFixed(2)},${(ey + 1.9 * Math.sin(b)).toFixed(2)}`} />
    )
  })
  return <Svg {...p}>{arms}{ticks}</Svg>
}

export function WindGlyph(p: GlyphProps) {
  return (
    <Svg {...p}>
      {[4.6, 8, 11.4].map((y) => <path key={y} d={`M1.8 ${y}q1.8-1.7 3.6 0t3.6 0t3.6 0`} />)}
    </Svg>
  )
}

export const WEATHER_KINDS: WeatherKind[] = ['sun', 'suncloud', 'cloud', 'rain', 'storm', 'snow', 'wind']

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  sun: 'Sunny', suncloud: 'Sun and cloud', cloud: 'Cloudy', rain: 'Rain',
  storm: 'Storm', snow: 'Snow', wind: 'Windy',
}

const WEATHER_GLYPH: Record<WeatherKind, (p: GlyphProps) => ReactElement> = {
  sun: SunGlyph, suncloud: SunCloudGlyph, cloud: CloudGlyph, rain: RainGlyph,
  storm: StormGlyph, snow: SnowGlyph, wind: WindGlyph,
}

export function WeatherGlyph({ kind, size, className }: GlyphProps & { kind: WeatherKind }) {
  const G = WEATHER_GLYPH[kind]
  return <G size={size} className={className} />
}

/* ---------- Meals ---------- */

/** Breakfast: a half sun rising over the horizon. */
export function SunriseGlyph(p: GlyphProps) {
  return (
    <Svg {...p}>
      <path d="M4.7 11.3a3.3 3.3 0 0 1 6.6 0z" fill="currentColor" stroke="none" />
      <line x1="1.8" y1="11.3" x2="14.2" y2="11.3" />
      <line x1="8" y1="6.7" x2="8" y2="5.1" />
      <line x1="11.7" y1="7.9" x2="12.9" y2="6.7" />
      <line x1="4.3" y1="7.9" x2="3.1" y2="6.7" />
    </Svg>
  )
}

/** Dinner: a crescent, cut out of the disc by a second arc. */
export function CrescentGlyph(p: GlyphProps) {
  return (
    <Svg {...p}>
      <path d="M11.4 13A6 6 0 1 1 11.4 3 7.4 7.4 0 0 0 11.4 13z" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export const MEAL_GLYPH = { b: SunriseGlyph, l: SunGlyph, d: CrescentGlyph }
export const MEAL_LABEL = { b: 'Breakfast', l: 'Lunch', d: 'Dinner' }
export const MEAL_KEYS = ['b', 'l', 'd'] as const

/* ---------- Mood ---------- */

export type MoodLevel = 1 | 2 | 3 | 4 | 5

export const MOOD_LEVELS: MoodLevel[] = [1, 2, 3, 4, 5]

export const MOOD_LABEL: Record<MoodLevel, string> = {
  1: 'Rough day', 2: 'Not great', 3: 'Okay', 4: 'Good', 5: 'Great day',
}

/** Mouth curve per level: a deep frown through flat to a broad smile. */
const MOUTH: Record<MoodLevel, string> = {
  1: 'M5 11.6Q8 8.2 11 11.6',
  2: 'M5.2 11.1Q8 9.2 10.8 11.1',
  3: 'M5.4 10.4H10.6',
  4: 'M5.2 9.6Q8 11.7 10.8 9.6',
  5: 'M4.9 9.2Q8 12.6 11.1 9.2',
}

export function MoodFace({ level, size = 14, className }: GlyphProps & { level: MoodLevel }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className}
      role="img" aria-label={t(MOOD_LABEL[level])}
      fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round">
      <circle className="mf-disc" cx="8" cy="8" r="6.3" />
      <circle cx="5.8" cy="6.3" r="0.85" fill="currentColor" stroke="none" />
      <circle cx="10.2" cy="6.3" r="0.85" fill="currentColor" stroke="none" />
      <path d={MOUTH[level]} />
    </svg>
  )
}

/* ---------- Washing up ---------- */

/**
 * The showerhead at the end of the water row. Drawn like the water glasses:
 * one grey outline, and a strike through it once the day's shower is done.
 */
export function ShowerGlyph({ size = 13, struck = false }: GlyphProps & { struck?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      {/* Wall pipe, bending down into the head. */}
      <path d="M13.4 2v2.4a1.8 1.8 0 0 1-1.8 1.8H8" />
      <line x1="8" y1="6.2" x2="8" y2="7.4" />
      {/* The head itself: a shallow dome. */}
      <path d="M3.4 9.6q0-2.2 4.6-2.2t4.6 2.2z" fill="currentColor" stroke="none" />
      {/* Falling water. */}
      <line x1="5.2" y1="11.3" x2="5.2" y2="12.8" />
      <line x1="8" y1="11.6" x2="8" y2="13.6" />
      <line x1="10.8" y1="11.3" x2="10.8" y2="12.8" />
      {struck && <line x1="1.6" y1="14.4" x2="14.4" y2="1.6" strokeWidth={1.5} />}
    </svg>
  )
}

/**
 * One of the pair of teeth on the mood row: a molar in outline — a crown with
 * two soft bumps and a dip between them, tapering into two roots. Drawn as one
 * stroked path so it survives being shrunk to 13px, and struck through in the
 * same grey once that brush is done.
 */
export function ToothGlyph({ size = 13, struck = false }: GlyphProps & { struck?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.7 8C2.45 4.3 4.2 2.2 6.1 2.2C7.15 2.2 7.5 3.6 8 3.6C8.5 3.6 8.85 2.2 9.9 2.2C11.8 2.2 13.55 4.3 13.3 8C13.15 9.8 12.5 11.6 11.8 13.4C11.45 14.3 10.5 14.5 10.25 13.4C10 12.2 9.5 10.4 8 10.4C6.5 10.4 6 12.2 5.75 13.4C5.5 14.5 4.55 14.3 4.2 13.4C3.5 11.6 2.85 9.8 2.7 8Z" />
      {struck && <line x1="1.6" y1="14.4" x2="14.4" y2="1.6" strokeWidth={1.5} />}
    </svg>
  )
}

/* ---------- Sleep ---------- */

/**
 * The crescent heading the hours-slept row. Outlined rather than filled, so it
 * never reads as the (solid) dinner crescent two rows above it.
 */
export function SleepMoonGlyph(p: GlyphProps) {
  return (
    <Svg {...p}>
      <path d="M11.4 13A6 6 0 1 1 11.4 3 7.4 7.4 0 0 0 11.4 13z" />
    </Svg>
  )
}

/** The pencil that heads every journal box and the Journal tab. */
export function PencilGlyph({ size = 12, className }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.4 2.2 13.8 4.6 5.6 12.8 2.4 13.6 3.2 10.4z" />
      <line x1="9.9" y1="3.7" x2="12.3" y2="6.1" />
    </svg>
  )
}
