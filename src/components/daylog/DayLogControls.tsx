import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../../store'
import type { DayLog, WeatherKind } from '../../types'
import MoonIcon from './MoonIcon'
import {
  MEAL_GLYPH, MEAL_KEYS, MEAL_LABEL, MOOD_LEVELS, MOOD_LABEL, MoodFace, WEATHER_KINDS, WEATHER_LABEL, WeatherGlyph,
  type MoodLevel,
} from './glyphs'

/**
 * The daily log's controls, shared by the calendar day headers and the Journal
 * tab so both render the same thing from the same store — an edit in either
 * place is visible in the other immediately, with no syncing of any kind.
 *
 * Text fields commit on blur or Enter rather than per keystroke: the store is
 * history-backed, and a keystroke-per-undo-step would make Ctrl+Z useless.
 */

export const JOURNAL_MAX = 500

/** Where the counter starts showing itself. */
const COUNTER_FROM = 440

/** Draft state for a field that only writes back on blur / Enter. */
function useDraft(value: string, commit: (v: string) => void) {
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)
  // While the field has focus its draft is the truth; otherwise it follows the
  // store, so an edit made elsewhere (the other view) lands here straight away.
  useEffect(() => {
    if (!focused.current) setDraft(value)
  }, [value])
  return {
    draft,
    setDraft,
    onFocus: () => { focused.current = true },
    onBlur: () => {
      focused.current = false
      if (draft !== value) commit(draft)
      else setDraft(value)
    },
  }
}

/** Dispatches a merge patch into one day's log. */
export function useDayLog(date: string): [DayLog | undefined, (patch: Partial<DayLog>) => void] {
  const { state, dispatch } = useStore()
  return [state.dayLogs[date], (patch) => dispatch({ type: 'updateDayLog', date, patch })]
}

/* ---------- Weather ---------- */

export function WeatherRow({ date }: { date: string }) {
  const [log, patch] = useDayLog(date)
  const on = log?.weather ?? []
  const toggle = (k: WeatherKind) =>
    patch({ weather: on.includes(k) ? on.filter((w) => w !== k) : [...on, k] })

  return (
    <div className="dl-weather">
      {WEATHER_KINDS.map((k) => (
        <button key={k} type="button"
          className={`dl-wx ${on.includes(k) ? 'on' : ''}`}
          title={WEATHER_LABEL[k]} aria-label={WEATHER_LABEL[k]} aria-pressed={on.includes(k)}
          onClick={() => toggle(k)}>
          <WeatherGlyph kind={k} size={13} />
        </button>
      ))}
      <span className="dl-moon"><MoonIcon date={date} /></span>
    </div>
  )
}

/* ---------- Meals ---------- */

function MealRow({ date, mealKey }: { date: string; mealKey: 'b' | 'l' | 'd' }) {
  const [log, patch] = useDayLog(date)
  const value = log?.meals?.[mealKey] ?? ''
  const f = useDraft(value, (v) => {
    const meals: NonNullable<DayLog['meals']> = {}
    meals[mealKey] = v
    patch({ meals })
  })
  const Glyph = MEAL_GLYPH[mealKey]

  return (
    <label className="dl-meal" title={MEAL_LABEL[mealKey]}>
      <span className="dl-meal-icon" aria-hidden="true"><Glyph size={12} /></span>
      <input
        type="text"
        className="dl-meal-input"
        value={f.draft}
        aria-label={MEAL_LABEL[mealKey]}
        onChange={(e) => f.setDraft(e.target.value)}
        onFocus={f.onFocus}
        onBlur={f.onBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') { f.setDraft(value); e.currentTarget.blur() }
        }}
      />
    </label>
  )
}

export function MealRows({ date }: { date: string }) {
  return (
    <div className="dl-meals">
      {MEAL_KEYS.map((k) => <MealRow key={k} date={date} mealKey={k} />)}
    </div>
  )
}

/* ---------- Water ---------- */

export const WATER_MAX = 8

/**
 * Eight glasses to cross off through the day. Clicking the n-th glass fills
 * everything up to it; clicking the last crossed one un-drinks it, so the
 * count moves one glass at a time in either direction. Synced through the
 * day's log like every other row, so the Journal tab edits the same number.
 */
export function WaterRow({ date }: { date: string }) {
  const [log, patch] = useDayLog(date)
  const count = log?.water ?? 0
  return (
    <div className="dl-water" role="group" aria-label="Glasses of water">
      {Array.from({ length: WATER_MAX }, (_, i) => {
        const on = i < count
        return (
          <button key={i} type="button" className={`dl-drop ${on ? 'on' : ''}`}
            title={`Water · ${on ? i + 1 : i + 1} of ${WATER_MAX}`}
            aria-pressed={on}
            onClick={() => patch({ water: i < count ? i : i + 1 })}>
            <svg width="10" height="12" viewBox="0 0 16 19" aria-hidden="true">
              {/* A tumbler, three quarters full. */}
              <path d="M3.2 1.8 L4.6 16 a1.3 1.3 0 0 0 1.3 1.2 h4.2 a1.3 1.3 0 0 0 1.3 -1.2 L12.8 1.8"
                fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M4.6 6.2 L5.5 15.5 h5 L11.4 6.2 Z"
                fill="currentColor" opacity={on ? 1 : 0.4} />
              {on && <line x1="1.6" y1="17.4" x2="14.4" y2="1.6" stroke="var(--bg-raised)" strokeWidth="2" />}
            </svg>
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Mood ---------- */

export function MoodRow({ date }: { date: string }) {
  const [log, patch] = useDayLog(date)
  const mood = log?.mood
  return (
    <div className="dl-mood">
      {MOOD_LEVELS.map((m: MoodLevel) => (
        <button key={m} type="button"
          className={`dl-face ${mood === m ? 'on' : ''}`}
          title={MOOD_LABEL[m]} aria-label={MOOD_LABEL[m]} aria-pressed={mood === m}
          // Clicking the selected face clears the day's mood again.
          onClick={() => patch({ mood: mood === m ? undefined : m })}>
          <MoodFace level={m} size={14} />
        </button>
      ))}
    </div>
  )
}

/* ---------- The whole block ---------- */

/**
 * Weather + moon, the three meals, then mood. `variant` only changes the
 * scale: 'header' is the compact form squeezed into a calendar day header,
 * 'journal' the roomier one on the Journal tab.
 */
export function DayLogBlock({ date, variant = 'header' }: { date: string; variant?: 'header' | 'journal' }) {
  return (
    <div className={`daylog daylog-${variant}`}>
      <WeatherRow date={date} />
      <MealRows date={date} />
      <WaterRow date={date} />
      <MoodRow date={date} />
    </div>
  )
}

/* ---------- Journal entry ---------- */

interface JournalBoxProps {
  date: string
  placeholder?: string
  minRows?: number
}

/** Auto-expanding entry box for one day, committed on blur. */
export function JournalBox({ date, placeholder = 'How was today?', minRows = 2 }: JournalBoxProps) {
  const [log, patch] = useDayLog(date)
  const value = log?.journal ?? ''
  const f = useDraft(value, (v) => patch({ journal: v }))
  const ref = useRef<HTMLTextAreaElement>(null)

  // Grow to fit the text: reset to auto first so it can also shrink back.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    // scrollHeight stops at the padding edge; the box is border-box, so the
    // borders have to be added back or every growth step loses two pixels.
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }, [f.draft])

  const left = JOURNAL_MAX - f.draft.length

  return (
    <div className="dl-journal">
      <textarea
        ref={ref}
        className="dl-journal-input"
        rows={minRows}
        maxLength={JOURNAL_MAX}
        placeholder={placeholder}
        aria-label="Journal entry"
        value={f.draft}
        onChange={(e) => f.setDraft(e.target.value)}
        onFocus={f.onFocus}
        onBlur={f.onBlur}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { f.setDraft(value); e.currentTarget.blur() }
        }}
      />
      {f.draft.length >= COUNTER_FROM && (
        <span className={`dl-journal-count ${left <= 0 ? 'full' : ''}`}>{left}</span>
      )}
    </div>
  )
}
