import { useMemo } from 'react'
import { useStore } from '../../store'
import InfoIcon from '../InfoIcon'
import { todayISO } from '../../utils/date'
import { PencilGlyph } from '../daylog/glyphs'
import { LEVELS, heatmapRangeNoun, monthLabels, weekColumns, type HeatmapRange } from './heatmapGrid'
import { intervalMeta, type IntervalKey } from './insightsData'
import { dayLabel, journalSpan, journalStats } from './journalData'

/**
 * Section 9 — how much got written, day by day.
 *
 * A contribution grid on the same pitch as the other two, ramped by the LENGTH
 * of the day's entry rather than by whether there is one: a fortnight of
 * one-liners and a fortnight of essays are both "written every day", and only
 * the ramp tells them apart.
 *
 * Three states per cell, not two: nothing logged at all is empty, a day you
 * logged but wrote no text takes the faintest step (you were there, you just did
 * not write), and everything above that is the character-count ramp.
 */

/** Ramp steps available to actual text — LEVELS[0] is reserved for "logged, no entry". */
const TEXT_STEPS = LEVELS.length - 1

function fill(alpha: number): string {
  return `color-mix(in srgb, var(--accent) ${Math.round(alpha * 100)}%, transparent)`
}

export default function JournallingCard({ ival, range }: { ival: IntervalKey; range: HeatmapRange }) {
  const { state } = useStore()
  const today = todayISO()

  const days = useMemo(() => journalSpan(state, range), [state, range])
  const stats = useMemo(() => journalStats(state, days), [state, days])

  const note =
    `One cell per day over ${heatmapRangeNoun(range)} — the span follows the interval at the top of ` +
    `the page ("${intervalMeta(ival).label}"). The shade is how LONG that day's entry is in ` +
    'characters, not just whether you wrote one, so a run of one-liners still reads differently ' +
    'from a run of long entries. A day with other log data but no written entry takes the faintest ' +
    'shade; a day with nothing logged at all stays empty.'

  const tooltip = (iso: string) => {
    const n = stats.chars.get(iso)
    if (n) return `${dayLabel(iso)} — ${n} ${n === 1 ? 'character' : 'characters'}`
    if (stats.loggedDays.has(iso)) return `${dayLabel(iso)} — logged, no journal entry`
    return `${dayLabel(iso)} — nothing logged`
  }

  const cell = (iso: string | null, key: string) => {
    if (!iso) return <span key={key} className="ak-cell blank" />
    const n = stats.chars.get(iso) ?? 0
    let alpha = 0
    if (n > 0) {
      const step = Math.min(TEXT_STEPS, Math.max(1, Math.ceil((n / stats.maxChars) * TEXT_STEPS)))
      alpha = LEVELS[step]
    } else if (stats.loggedDays.has(iso)) {
      alpha = LEVELS[0]
    }
    return (
      <span key={key} className={`ak-cell ${iso === today ? 'today' : ''}`} title={tooltip(iso)}
        style={alpha ? { background: fill(alpha) } : undefined} />
    )
  }

  const weeks = weekColumns(days)
  const labels = monthLabels(weeks)

  return (
    <section className="ins2-card">
      <div className="ins2-card-head">
        <h2 className="ins2-h2">Journalling</h2>
        <InfoIcon text={note} />
      </div>

      <div className="ins2-hm">
        <div className="ak-stats">
          <div className="ak-stat">
            <b>{stats.journalled}<span className="ins2-of"> of {days.length}</span></b>
            <span>days journalled</span>
          </div>
          <div className="ak-stat">
            <b>{stats.journalled ? Math.round(stats.avgChars) : '—'}</b><span>avg characters</span>
          </div>
          <div className="ak-stat">
            <b>{stats.maxChars || '—'}</b><span>longest entry</span>
          </div>
        </div>

        <div className="ak-scroll">
          <div className="ak-strip">
            <div className="ak-dows">
              <span />{['Mon', 'Wed', 'Fri'].map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="ak-cols">
              <div className="ak-months" style={{ gridTemplateColumns: `repeat(${weeks.length}, 13px)` }}>
                {labels.map((l, i) => <span key={i}>{l}</span>)}
              </div>
              <div className="ak-grid" style={{ gridTemplateColumns: `repeat(${weeks.length}, 13px)` }}>
                {weeks.map((wk, wi) => wk.map((iso, di) => cell(iso, `${wi}-${di}`)))}
              </div>
            </div>
          </div>
        </div>

        <div className="ak-legend">
          <span className="ins2-jr-key">
            <span className="ak-cell tiny" style={{ background: fill(LEVELS[0]) }} />
            logged, no entry
          </span>
          <span className="ak-scale">
            shorter
            {LEVELS.slice(1).map((a, i) => (
              <span key={i} className="ak-cell tiny" style={{ background: fill(a) }} />
            ))}
            longer
          </span>
        </div>

        <div className="ak-hint">
          <PencilGlyph size={11} /> Entries are written in the daily log at the bottom of each day.
        </div>

        {stats.journalled === 0 && (
          <div className="ins2-empty">
            Nothing written in this range yet — the grid fills in as you journal.
          </div>
        )}
      </div>
    </section>
  )
}
