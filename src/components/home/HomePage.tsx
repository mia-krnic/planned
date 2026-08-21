import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store'
import type { AppState, StudySession, WeatherKind } from '../../types'
import { addDays, fromISO, toISO, todayISO } from '../../utils/date'
import { earliestUserDate } from '../../utils/daylog'
import { derivedBreaks, fmtDuration, sessionDuration, sessionsOnDay } from '../../utils/study'
import { fetchArchive, fetchForecast, geocode, WX_SYNC_KEY, type GeoPoint, type TodayWeather } from '../../utils/weather'
import { homePicks } from '../../data/homePicks'
import { WALLPAPERS, wallpaperUrl } from '../../data/wallpapers'
import InfoIcon from '../InfoIcon'
import { useDayLog } from '../daylog/DayLogControls'
import { WeatherGlyph } from '../daylog/glyphs'
import HomeLibrary, { FavHeart } from './HomeLibrary'

/**
 * The landing page: a clock, the day's mantra, one goal, and — top right —
 * how much focused study is behind you and what it is doing outside.
 *
 * Nothing here is a task list or a dashboard on purpose. It is the page the app
 * opens on, so it stays quiet: everything that ticks does so on the slowest
 * interval that still looks alive (a minute for the clock, half a minute for
 * the focus ring), and anything that could fail — the weather — simply is not
 * drawn when it does.
 */

/* ---------------- Clock ---------------- */

/** HH:MM, 24-hour like the rest of the app, repainted on the minute. */
function Clock() {
  const [now, setNow] = useState(() => new Date())

  // A 60s interval started at, say, :00:59 would repaint a second late every
  // minute forever. Each tick instead schedules itself for the next minute
  // boundary, so the digits always turn over when the minute does.
  useEffect(() => {
    let timer = 0
    const schedule = () => {
      const d = new Date()
      const ms = 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds())
      timer = window.setTimeout(() => {
        setNow(new Date())
        schedule()
      }, ms + 30)
    }
    schedule()
    return () => window.clearTimeout(timer)
  }, [])

  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return (
    <div className="home-clock" aria-label={`Time ${hh}:${mm}`}>
      {hh}<span className="home-clock-sep">:</span>{mm}
    </div>
  )
}

/* ---------------- The day's one goal ---------------- */

const GOAL_PROMPT = 'What is your main goal for today?'

/**
 * One line, stored on today's day log. It is a reminder and nothing else —
 * there is no tick, no done state and no carry-over to tomorrow, because the
 * moment it can be completed it is a task, and tasks have their own page.
 *
 * Empty → an underlined input. Set → calm text that turns back into the input
 * when clicked.
 */
function GoalLine({ date }: { date: string }) {
  const [log, patch] = useDayLog(date)
  const goal = log?.goal ?? ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(goal)

  // An edit made elsewhere (or midnight rolling the date over) lands here as
  // long as the field is not the one being typed in.
  useEffect(() => {
    if (!editing) setDraft(goal)
  }, [goal, editing])

  const commit = () => {
    setEditing(false)
    if (draft.trim() !== goal) patch({ goal: draft })
  }

  if (goal && !editing) {
    return (
      <button type="button" className="home-goal-set" title="Edit today's goal"
        onClick={() => { setDraft(goal); setEditing(true) }}>
        <span className="home-goal-text">{goal}</span>
        <span className="home-goal-pencil" aria-hidden="true">✎</span>
      </button>
    )
  }

  return (
    <input
      type="text"
      className="home-goal-input"
      placeholder={GOAL_PROMPT}
      aria-label={GOAL_PROMPT}
      value={draft}
      autoFocus={editing}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setEditing(true)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') { setDraft(goal); setEditing(false); e.currentTarget.blur() }
      }}
    />
  )
}

/* ---------------- Focus ring ---------------- */

const RING_INFO =
  'Focused minutes are wall time minus breaks, across every session logged today — '
  + 'a running session counts up to right now. Set a daily goal in the Timer page to fill the ring.'

/** Minutes since midnight, with seconds, so a running session ticks smoothly. */
function minutesNow(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
}

/** Wall-clock minutes actually studied in a session, breaks removed. */
function activeMinutes(s: StudySession, nowMin: number): number {
  const brk = derivedBreaks(s, nowMin).reduce((n, b) => n + b.durMin, 0)
  return Math.max(0, sessionDuration(s, nowMin) - brk)
}

const RING_SIZE = 68
const RING_STROKE = 5

/**
 * Today's focused study against the daily goal. Past 100% the ✓ appears and
 * the minutes keep climbing — the goal is a floor, not a ceiling.
 */
function FocusRing({ state, nowMin }: { state: AppState; nowMin: number }) {
  const goal = state.studyGoalMin ?? null
  const todayMin = sessionsOnDay(state, todayISO()).reduce((n, s) => n + activeMinutes(s, nowMin), 0)

  const pct = goal ? Math.min(1, todayMin / goal) : 0
  const hit = goal != null && todayMin >= goal
  const r = (RING_SIZE - RING_STROKE) / 2
  const c = 2 * Math.PI * r

  return (
    <div className="home-focus">
      <svg className="home-ring" width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        role="img" aria-label={`${fmtDuration(todayMin)} focused today${goal ? ` of a ${fmtDuration(goal)} goal` : ''}`}>
        <circle className="home-ring-bg" cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} fill="none" strokeWidth={RING_STROKE} />
        {goal != null && (
          <circle
            className={`home-ring-fg ${hit ? 'done' : ''}`}
            cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} fill="none"
            strokeWidth={RING_STROKE} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        )}
        {hit && <text className="home-ring-tick" x="50%" y="54%" textAnchor="middle" dominantBaseline="middle">✓</text>}
      </svg>
      <div className="home-focus-label">
        <span className="home-focus-num">{fmtDuration(todayMin)}</span>
        <span className="home-focus-word">Focused today{goal == null && <InfoIcon text={RING_INFO} />}</span>
      </div>
    </div>
  )
}

/* ---------------- Weather ---------------- */

const LOCATION_INFO =
  'Type where you are into the ⚙ view-settings menu in the top bar and today\'s weather shows up here — '
  + 'and the daily log fills its weather in for you.'

/**
 * Icon, temperature, place. Absent entirely whenever it cannot be had: no
 * location set gets the quiet hint instead, and a failed or offline fetch
 * renders nothing at all rather than an error nobody can act on.
 */
function WeatherChip({ label, wx }: { label: string | undefined; wx: TodayWeather | null }) {
  if (!label) {
    return (
      <div className="home-wx home-wx-hint">
        <span>Set a location ⚙</span>
        <InfoIcon text={LOCATION_INFO} />
      </div>
    )
  }
  if (!wx || !wx.kind) return null
  return (
    <div className="home-wx" title={label}>
      <span className="home-wx-icon" aria-hidden="true"><WeatherGlyph kind={wx.kind} size={44} /></span>
      {wx.tempC != null && <span className="home-wx-temp">{Math.round(wx.tempC)}°</span>}
      <span className="home-wx-place">{label}</span>
    </div>
  )
}

/* ---------------- Weather auto-fill ---------------- */

/** Days covered when the app holds nothing dated to reach back to. */
const FALLBACK_DAYS = 30

/**
 * Claimed by the first mount that gets as far as having a location, so the
 * back-fill's archive call and its burst of dispatches happen once per browser
 * session. StrictMode's double mount is exactly what this is here for.
 */
let backfillClaimed = false

/**
 * Fetches the current conditions, and once a calendar day back-fills the daily
 * log's weather from the archive.
 *
 * The rule that matters: a day whose weather the USER picked is never touched.
 * Only days with no weather at all, or with the `weatherAuto` flag still on
 * from a previous back-fill, are candidates — and of those, only the ones whose
 * mark actually differs are dispatched, so a second run over unchanged data
 * writes nothing. One archive response covers the whole range; the per-day loop
 * is a diff against it, not a request each.
 */
function useWeather(): TodayWeather | null {
  const { state, dispatch } = useStore()
  const [wx, setWx] = useState<TodayWeather | null>(null)
  const label = state.location?.label?.trim() || ''

  // The back-fill reads the whole store once, at the moment it has its data.
  // A ref keeps that read fresh without making the effect depend on (and so
  // re-run against) every unrelated state change.
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    if (!label) { setWx(null); return }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return

    // Claimed synchronously, before any await, so two mounts cannot both pass.
    const doBackfill = !backfillClaimed
    backfillClaimed = true

    // Guards setState only. The back-fill dispatches into a store that outlives
    // this component, so an unmount must not cancel it half-written.
    let live = true

    const run = async () => {
      const point: GeoPoint | null = await geocode(label)
      if (!point) return

      const today = todayISO()
      const forecast = await fetchForecast(point)
      if (forecast && live) setWx(forecast.today)
      if (!doBackfill) return

      // The stamp guards the day-log writes only — the chip still refreshes its
      // temperature on every load.
      let stamped: string | null = null
      try { stamped = localStorage.getItem(WX_SYNC_KEY) } catch { stamped = null }
      if (stamped === today) return

      const snapshot = stateRef.current
      const from = earliestUserDate(snapshot) ?? toISO(addDays(fromISO(today), -FALLBACK_DAYS))
      if (from > today) return

      const archive = await fetchArchive(point, from, today)
      if (!archive && !forecast) return

      // The archive lags real time by a few days; the forecast call already
      // carries those days, and being nearer the present it wins any overlap.
      const marks: Record<string, WeatherKind> = { ...(archive ?? {}), ...(forecast?.daily ?? {}) }
      if (forecast?.today.kind) marks[today] = forecast.today.kind

      for (let iso = from; iso <= today; iso = toISO(addDays(fromISO(iso), 1))) {
        const kind = marks[iso]
        if (!kind) continue
        const log = snapshot.dayLogs[iso]
        const had = log?.weather ?? []
        // A mark the user set by hand carries no `weatherAuto` flag. It is theirs.
        if (had.length && !log?.weatherAuto) continue
        if (had.length === 1 && had[0] === kind) continue
        dispatch({ type: 'updateDayLog', date: iso, patch: { weather: [kind], weatherAuto: true } })
      }

      try { localStorage.setItem(WX_SYNC_KEY, today) } catch { /* private mode: we simply run again next load */ }
    }

    void run()
    return () => { live = false }
  }, [label, dispatch])

  return wx
}

/* ---------------- How bright the photo is ---------------- */

/**
 * Whether each part of the page has something too pale behind it to carry
 * white type. A snowfield or a blown-out sky needs dark text; almost every
 * other photo does not.
 */
interface Regions { centre: boolean; corner: boolean; bottom: boolean }

const ALL_DARK: Regions = { centre: false, corner: false, bottom: false }

/** Mean relative luminance above which a region flips to dark type. */
const LIGHT_AT = 0.66

/** Sampling grid. Tiny on purpose: this is a mood reading, not a histogram. */
const SAMPLE_W = 32
const SAMPLE_H = 18

function toLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/**
 * Reads the photo through a 32×18 canvas and averages relative luminance over
 * three bands: the middle (clock, mantra, goal), the top-right corner (focus
 * ring, weather) and the bottom strip (quote, library row).
 *
 * The photo is painted with `background-size: cover`, so this measures the
 * whole image rather than the exact visible crop — close enough to tell a
 * snowfield from a night sky, which is the only question being asked. The
 * images are bundled and same-origin, so the canvas is never tainted; the
 * try/catch is there for the cases that are not about CORS at all (no 2d
 * context, a decode that silently produced nothing), and any of them simply
 * leaves the page white over the photo.
 */
function sampleRegions(img: HTMLImageElement): Regions | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE_W
    canvas.height = SAMPLE_H
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, SAMPLE_W, SAMPLE_H)
    const { data } = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H)

    // Bounds are fractions of the image, so the grid can change size freely.
    const mean = (x0: number, x1: number, y0: number, y1: number) => {
      let sum = 0
      let n = 0
      for (let y = Math.floor(y0 * SAMPLE_H); y < Math.ceil(y1 * SAMPLE_H); y++) {
        for (let x = Math.floor(x0 * SAMPLE_W); x < Math.ceil(x1 * SAMPLE_W); x++) {
          const i = (y * SAMPLE_W + x) * 4
          sum += 0.2126 * toLinear(data[i]) + 0.7152 * toLinear(data[i + 1]) + 0.0722 * toLinear(data[i + 2])
          n++
        }
      }
      return n ? sum / n : 0
    }

    return {
      centre: mean(0.15, 0.85, 0.28, 0.72) > LIGHT_AT,
      corner: mean(0.6, 1, 0, 0.2) > LIGHT_AT,
      bottom: mean(0, 1, 0.78, 1) > LIGHT_AT,
    }
  } catch {
    return null
  }
}

/* ---------------- The page ---------------- */

export default function HomePage() {
  const { state, dispatch } = useStore()
  const today = todayISO()
  const { wallpaper, mantra, quote } = homePicks(state, today)
  const wx = useWeather()
  const [libOpen, setLibOpen] = useState(false)

  // The photo fades in only once decoded, so a slow load shows the gradient
  // rather than a top-down trickle — and the previous photo stays up until the
  // next one is ready, so switching wallpapers never blinks through the
  // gradient. Its brightness is measured in the same breath, because both
  // answers have to arrive together or the text recolours a frame late.
  const [bg, setBg] = useState<{ url: string; lum: Regions } | null>(null)
  useEffect(() => {
    const url = wallpaperUrl(wallpaper.file)
    let live = true
    const img = new Image()
    img.onload = () => { if (live) setBg({ url, lum: sampleRegions(img) ?? ALL_DARK }) }
    img.src = url
    return () => { live = false; img.onload = null }
  }, [wallpaper.file])

  /** Today's photo swapped for a random other one — a nudge, not a setting. */
  const nextWallpaper = () => {
    if (WALLPAPERS.length < 2) return
    let file = wallpaper.file
    while (file === wallpaper.file) file = WALLPAPERS[Math.floor(Math.random() * WALLPAPERS.length)].file
    dispatch({ type: 'setHomeOverride', date: today, patch: { wallpaper: file } })
  }

  // The focus ring's only heartbeat: half a minute is plenty for a figure shown
  // to the minute, and cheap enough to leave running on the landing page. The
  // clock keeps its own, slower one — see Clock.
  const [nowMin, setNowMin] = useState(minutesNow)
  useEffect(() => {
    const id = window.setInterval(() => setNowMin(minutesNow()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  // `has-photo` hands the whole page over to the Momentum look — white type, no
  // boxes — whatever theme the app is in; the lum-* classes hand individual
  // regions back to dark type where the photo is too pale for white.
  const cls = [
    'home-page',
    bg ? 'has-photo' : '',
    bg?.lum.centre ? 'lum-centre-light' : '',
    bg?.lum.corner ? 'lum-corner-light' : '',
    bg?.lum.bottom ? 'lum-bottom-light' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cls}>
      {/* The gradient layer stays underneath; the day's photo fades in over it
          once decoded, carrying its own edge darkening (see the CSS). */}
      <div className="home-bg" aria-hidden="true" />
      <div className={`home-bg home-photo${bg ? ' loaded' : ''}`} aria-hidden="true"
        style={bg ? { backgroundImage: `url("${bg.url}")` } : undefined} />

      <div className="home-corner">
        <FocusRing state={state} nowMin={nowMin} />
        <WeatherChip label={state.location?.label?.trim() || undefined} wx={wx} />
      </div>

      <div className="home-centre">
        <Clock />
        <div className="home-mantra">
          <span className="home-mantra-text">{mantra.text}</span>
          <FavHeart kind="mantras" itemKey={mantra.text} label="this mantra" />
        </div>
        <div className="home-goal">
          <GoalLine date={today} />
        </div>
      </div>

      <div className="home-quote">
        <span className="home-quote-text">“{quote.text}”</span>
        <span className="home-quote-foot">
          {quote.author && <span className="home-quote-author">— {quote.author}</span>}
          <FavHeart kind="quotes" itemKey={quote.text} label="this quote" />
        </span>
      </div>

      {/* The bottom rail: the library on the left, the photo's own two controls
          on the right, both quiet until the pointer is on the page. */}
      <div className="home-dock">
        <button type="button" className="home-dock-btn" onClick={() => setLibOpen(true)}>
          <span aria-hidden="true">♡</span> Library
        </button>
        <div className="home-dock-right">
          <FavHeart kind="wallpapers" itemKey={wallpaper.file} label="this wallpaper" />
          <button type="button" className="home-dock-btn" onClick={nextWallpaper}
            title="Show a different photo today">
            next wallpaper <span aria-hidden="true">⤳</span>
          </button>
        </div>
      </div>

      {libOpen && <HomeLibrary date={today} onClose={() => setLibOpen(false)} />}
    </div>
  )
}
