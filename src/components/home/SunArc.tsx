import { useId, useLayoutEffect, useRef, useState } from 'react'
import MoonIcon from '../daylog/MoonIcon'

/**
 * The day's solar journey, drawn edge to edge across the Home page: one
 * unbroken wave, arching over the horizon between sunrise and sunset and
 * sinking under it through the night, with the sun riding it by day and the
 * real moon by night.
 *
 * Two decisions carry the whole thing.
 *
 * The wave is smooth THROUGH the horizon, not merely on either side of it. Day
 * and night are half sines whose amplitudes are set from their own lengths, so
 * the tangents match where they cross and there is no corner to give the joint
 * away — see `makeWave`.
 *
 * And the layer is measured into the empty band between the centred text and
 * the quote at the foot rather than placed behind them. Nothing it crosses has
 * words in it, which is what lets it be drawn at full strength instead of
 * whispering along at an opacity that made it invisible over a photograph.
 */

/* ---------------- Sizes ---------------- */

const MIN_PER_DAY = 1440

/**
 * The traveller is the live element — the one thing on the page that has moved
 * since you last looked — so it is drawn at about twice the three fixed marks
 * it travels between, and it is the only part of the layer that carries a glow.
 */
const SUN_R = 9.75
const SUN_HALO_R = 13.5
const SUN_GLOW_R = 18
const MOON_SIZE = 23.5

/** Room above the traveller for the small time that always rides over it. */
const TIME_ROOM = 15
/** Clear air kept at the top and bottom of the layer for the traveller. */
const TOP_CLEAR = SUN_GLOW_R + 1 + TIME_ROOM
const BOTTOM_CLEAR = MOON_SIZE / 2 + 1
/** How far inside the left and right edges the traveller is held. */
const EDGE_HOLD = SUN_GLOW_R + 1

/** Breathing room between the layer and the two text blocks it sits between. */
const BAND_MARGIN = 8
/** A band shorter than this has no room for a wave worth drawing. */
const MIN_BAND = 85
/** Narrower than this and there is no page to speak of. */
const MIN_WIDTH = 320

/** Minutes between samples of the wave. See `pathOf` for why this is plenty. */
const SAMPLE_MIN = 10

/** A plain temperate day, for when the sky has not been asked. */
const FALLBACK_SUNRISE = 6 * 60 + 30
const FALLBACK_SUNSET = 19 * 60 + 45

/* ---------------- The wave ---------------- */

/**
 * The located sunrise and sunset when there are any, and an ordinary day when
 * there are not: no location set, a fetch that failed, or one of the polar
 * months where the sun does not do this at all. The arc is a picture of the
 * SHAPE of a day, and that is better drawn approximately than not at all.
 */
function sunTimes(sunrise: number | null, sunset: number | null): { rise: number; set: number } {
  if (sunrise != null && sunset != null
    && sunrise >= 0 && sunset < MIN_PER_DAY && sunset > sunrise + 60) {
    return { rise: sunrise, set: sunset }
  }
  return { rise: FALLBACK_SUNRISE, set: FALLBACK_SUNSET }
}

/**
 * The height of the wave at any minute of the day.
 *
 * Day and night are each half a sine — the day's arch above the horizon, the
 * night's trough below it. The two night pieces are halves of the SAME trough,
 * the one that began at yesterday's sunset and ends at tomorrow's sunrise,
 * which is what makes the curve meet itself at midnight instead of restarting
 * there.
 *
 * The amplitudes are what make it smooth. A half sine leaves its zero at a
 * slope of amplitude·π/length, so the tangents match across the horizon when
 * A_night/A_day is nightLen/dayLen — and because the two lengths add to a day,
 * simply giving each amplitude that share of the available height satisfies it
 * exactly, at any size. A long summer day therefore arches high over a shallow
 * night and a winter one hangs low under a deep one, and neither has a corner
 * where it crosses.
 */
function makeWave(rise: number, set: number, horizon: number, aDay: number, aNight: number) {
  const dayLen = set - rise
  const nightLen = MIN_PER_DAY - dayLen
  return (min: number): number => {
    if (min >= rise && min <= set) {
      return horizon - aDay * Math.sin((Math.PI * (min - rise)) / dayLen)
    }
    // Before dawn we are on the tail of the trough that started last night.
    const from = min < rise ? set - MIN_PER_DAY : set
    return horizon + aNight * Math.sin((Math.PI * (min - from)) / nightLen)
  }
}

/**
 * The whole day as one path: a single `M` and then nothing but points, so
 * there is no seam anywhere in it for the eye to catch on.
 *
 * Sampling every ten minutes sounds coarse and is not: the wave's curvature is
 * gentlest exactly where the samples are furthest apart in pixels, and the
 * chord error at these amplitudes works out under a fortieth of a pixel.
 */
function pathOf(wave: (min: number) => number, w: number): string {
  const pts: string[] = []
  for (let m = 0; m <= MIN_PER_DAY; m += SAMPLE_MIN) {
    pts.push(`${((m / MIN_PER_DAY) * w).toFixed(1)},${wave(m).toFixed(2)}`)
  }
  return `M${pts.join('L')}`
}

/* ---------------- The dead band ---------------- */

/** The layer's box, in CSS pixels, against .home-page's padding box. */
interface Frame { w: number; h: number; top: number }

type Box = { current: HTMLElement | null }

/**
 * The band of empty page between the bottom of the centre stack — clock,
 * mantra, goal, whatever lines the day has grown — and the top of the quote.
 *
 * Measuring it rather than guessing at it is the whole reason the arc can be
 * drawn boldly: the band contains no text by construction, so a day that grows
 * an evening prompt or a birthday shrinks the band and the arc gets shorter,
 * instead of the text arriving on top of the curve.
 *
 * Offsets are used rather than client rects so that a scrolled page cannot
 * skew the answer, and because both blocks and the layer's own `top` are then
 * all in one frame: .home-page's padding box.
 */
function useFrame(centreRef: Box, quoteRef: Box, pageRef: Box, layerRef: Box): Frame | null {
  const [frame, setFrame] = useState<Frame | null>(null)

  // Deliberately no dependency array: the blocks this measures are not always
  // in the first commit (a cold production load grows the page in pieces), and
  // an effect that bails once on a missing ref must get another chance on the
  // next render — the page re-renders with every clock tick, so it always
  // comes. Re-running is safe because measure() only ever publishes a CHANGED
  // frame: an identical measurement keeps the old object and causes nothing.
  useLayoutEffect(() => {
    const centre = centreRef.current
    const quote = quoteRef.current
    const page = pageRef.current
    const layer = layerRef.current
    if (!centre || !quote || !page || !layer) return

    const measure = () => {
      const bandTop = centre.offsetTop + centre.offsetHeight
      const bandH = quote.offsetTop - bandTop
      if (bandH < MIN_BAND) { setFrame(null); return }
      const next: Frame = {
        w: layer.clientWidth,
        h: bandH - BAND_MARGIN * 2,
        top: bandTop + BAND_MARGIN,
      }
      setFrame((prev) =>
        prev && prev.w === next.w && prev.h === next.h && prev.top === next.top ? prev : next)
    }

    measure()
    // A block can only be moved by something being resized, so watching the two
    // that bound the band and the page that carries them covers every way the
    // band can change. The layer is absolutely positioned inside the band and
    // cannot move any of them, so this cannot feed itself.
    const ro = new ResizeObserver(measure)
    ro.observe(centre)
    ro.observe(quote)
    ro.observe(page)
    return () => ro.disconnect()
  })

  return frame
}

/* ---------------- Sunrise, midday, sunset ---------------- */

/* The three marks are held to about ten pixels — half the traveller, which has
   to be the thing the eye lands on first. */

/** Six stubs around the midday sun. */
const RAYS = Array.from({ length: 6 }, (_, i) => {
  const a = (i * Math.PI) / 3
  const [cx, cy] = [Math.cos(a), Math.sin(a)]
  return `M${(cx * 4).toFixed(2)},${(cy * 4).toFixed(2)}`
    + `L${(cx * 5.6).toFixed(2)},${(cy * 5.6).toFixed(2)}`
}).join('')

/** Half a disc standing on the horizon, and the way the day is taking it. */
const HALF_DISC = 'M-3.9,0A3.9,3.9 0 0 1 3.9,0'
const BASE_LINE = 'M-5.6,0H5.6'
const RISING = 'M-2,-6.7 0,-8.6 2,-6.7'
const SETTING = 'M-2,-8.6 0,-6.7 2,-8.6'

/**
 * One turning point of the day, sitting on the curve. The glyph is ten pixels
 * of hairline; the invisible disc under it is the hover target, and hovering
 * raises the mark's name over its time. The noon mark lives at the apex where
 * there is no sky above it, so its caption hangs below instead.
 */
function Mark({ x, y, glyph, name, time }: {
  x: number; y: number; glyph: 'rise' | 'noon' | 'set'; name: string; time: string
}) {
  const below = glyph === 'noon'
  return (
    <g className="home-sunarc-mark" transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
      <circle className="home-sunarc-hit" r="14" />
      {glyph === 'noon' ? (
        <>
          <circle className="home-sunarc-mark-disc" r="2.6" />
          <path className="home-sunarc-mark-line" d={RAYS} />
        </>
      ) : (
        <path className="home-sunarc-mark-line"
          d={HALF_DISC + BASE_LINE + (glyph === 'rise' ? RISING : SETTING)} />
      )}
      <g className="home-sunarc-tip">
        <text className="home-sunarc-tip-name" y={below ? 17 : -25}>{name}</text>
        <text className="home-sunarc-tip-time" y={below ? 29 : -13}>{time}</text>
      </g>
    </g>
  )
}

/** 24-hour and unpadded on the hour, the way the rest of the page reads times. */
function hhmm(min: number): string {
  const m = Math.round(min)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

/* ---------------- The layer ---------------- */

interface Props {
  /** Today, for the moon's phase. */
  date: string
  /** Minutes since local midnight, ticking with the rest of the page. */
  nowMin: number
  /** Today's sun, when the weather knew it. */
  sunrise: number | null
  sunset: number | null
  centreRef: Box
  quoteRef: Box
  pageRef: Box
}

export default function SunArc({ date, nowMin, sunrise, sunset, centreRef, quoteRef, pageRef }: Props) {
  const layerRef = useRef<HTMLDivElement>(null)
  const frame = useFrame(centreRef, quoteRef, pageRef, layerRef)
  // Four clip paths need names, and a document may only have one of each.
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')

  // The empty layer stays mounted whatever happens: its width is measured off
  // it, and there is nothing to measure once it is gone.
  const budget = frame ? frame.h - TOP_CLEAR - BOTTOM_CLEAR : 0
  if (!frame || frame.w < MIN_WIDTH || budget <= 0) {
    return <div ref={layerRef} className="home-sunarc" aria-hidden="true" />
  }

  const { w, h, top } = frame
  const { rise, set } = sunTimes(sunrise, sunset)

  // Each half of the day gets its share of the height, which is exactly the
  // share that makes the slopes match at the horizon (see makeWave).
  const dayLen = set - rise
  const aDay = (budget * dayLen) / MIN_PER_DAY
  const aNight = (budget * (MIN_PER_DAY - dayLen)) / MIN_PER_DAY
  const horizon = TOP_CLEAR + aDay

  const wave = makeWave(rise, set, horizon, aDay, aNight)
  const d = pathOf(wave, w)
  const xOf = (min: number) => (min / MIN_PER_DAY) * w

  const noon = Math.round((rise + set) / 2)
  const nowX = xOf(nowMin)
  // Midnight puts the traveller on the layer's edge, where the viewport would
  // slice it in half, so the glyph alone is held its own width inside. Its
  // height is read back from the held position, so it stays on the curve.
  const markX = Math.min(Math.max(nowX, EDGE_HOLD), w - EDGE_HOLD)
  const markY = wave((markX / w) * MIN_PER_DAY)
  const daylight = nowMin >= rise && nowMin < set

  return (
    <div ref={layerRef} className="home-sunarc" style={{ top, height: h }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false">
        <defs>
          <clipPath id={`${id}sky`}><rect x="0" y="0" width={w} height={horizon} /></clipPath>
          <clipPath id={`${id}ground`}><rect x="0" y={horizon} width={w} height={h - horizon} /></clipPath>
          <clipPath id={`${id}past`}><rect x="0" y="0" width={Math.max(0, nowX)} height={h} /></clipPath>
          <clipPath id={`${id}ahead`}><rect x={nowX} y="0" width={Math.max(0, w - nowX)} height={h} /></clipPath>
        </defs>

        <line className="home-sunarc-horizon" x1="0" y1={horizon} x2={w} y2={horizon} />

        {/* One path drawn four times. The clips decide which quarter of the
            picture each copy may show, so above/below the horizon and behind/
            ahead of now can each carry their own weight — and because all four
            are the same geometry, the wave stays one wave. */}
        <g clipPath={`url(#${id}ahead)`}>
          <path className="home-sunarc-line sky" d={d} clipPath={`url(#${id}sky)`} />
          <path className="home-sunarc-line ground" d={d} clipPath={`url(#${id}ground)`} />
        </g>
        <g clipPath={`url(#${id}past)`}>
          <path className="home-sunarc-line sky behind" d={d} clipPath={`url(#${id}sky)`} />
          <path className="home-sunarc-line ground behind" d={d} clipPath={`url(#${id}ground)`} />
        </g>

        <Mark x={xOf(rise)} y={horizon} glyph="rise" name="sunrise" time={hhmm(rise)} />
        <Mark x={xOf(noon)} y={TOP_CLEAR} glyph="noon" name="midday" time={hhmm(noon)} />
        <Mark x={xOf(set)} y={horizon} glyph="set" name="sunset" time={hhmm(set)} />

        {/* The traveller only ever has its position reassigned; the easing on
            the transform is what turns a half-minute step into a drift. */}
        {/* The traveller wears the current time faintly above it at all times —
            the one always-on caption in the layer, which is why the layer keeps
            TIME_ROOM of clear air over the apex. */}
        {daylight ? (
          <g className="home-sunarc-now" transform={`translate(${markX.toFixed(1)} ${markY.toFixed(1)})`}>
            <circle className="home-sunarc-halo" r={SUN_GLOW_R} />
            <circle className="home-sunarc-halo" r={SUN_HALO_R} />
            <circle className="home-sunarc-disc" r={SUN_R} />
            <text className="home-sunarc-time" y={-(SUN_GLOW_R + 6)}>{hhmm(nowMin)}</text>
          </g>
        ) : (
          // A nested svg has no centre of its own: it is placed by its corner.
          <g className="home-sunarc-now"
            transform={`translate(${(markX - MOON_SIZE / 2).toFixed(1)} ${(markY - MOON_SIZE / 2).toFixed(1)})`}>
            <MoonIcon date={date} size={MOON_SIZE} />
            <text className="home-sunarc-time" x={MOON_SIZE / 2} y={-7}>{hhmm(nowMin)}</text>
          </g>
        )}
      </svg>
    </div>
  )
}
