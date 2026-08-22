import { useEffect, useMemo, useState } from 'react'
import ColorSelect, { type ColorGroup } from './ColorSelect'
import { t } from '../i18n'
import { classById, classColorGroups, useStore } from '../store'
import type { AnkiLog, ID } from '../types'
import { addDays, fromISO, MONTHS, startOfWeek, toISO, todayISO, WEEKDAYS } from '../utils/date'
import { hexToRgba } from '../utils/color'
import {
  daysBetween, HEATMAP_RANGES, heatmapRangeDays, LEVELS, level, monthChunks, monthLabels,
  streakOf, weekColumns, type HeatmapRange,
} from './insights/heatmapGrid'

/**
 * Manual Anki / flashcard review tracker.
 *
 * `full` is the collapsible panel at the top of the Tasks page: a GitHub-style
 * heatmap over a selectable range, deck filter and a log/edit row.
 * `tab` is the same panel without its own card chrome or collapse row, for the
 * Insights heatmaps card — which supplies both, and also supplies the `range`:
 * inside that card the span follows the page's interval toggle, so the range
 * pills are hidden and everything else (deck filter, layout, the log row) stays
 * exactly as it is here. Without a `range` prop the tracker owns its own pills.
 * `sidebar` is a read-only glance — one stats line plus a 12-week mini strip
 * that flips to the Tasks page when clicked.
 *
 * There is exactly one number per (date, deck), so "logging" and "correcting a
 * past day" are the same gesture (see the `logAnki` action).
 */

/** Neutral grey used everywhere for unassigned things (here: the General deck). */
const GENERAL_COLOR = '#9aa0a6'
/** Dropdown value for the unassigned bucket (a class id can never be this). */
const GENERAL_KEY = 'general'
/** Dropdown value for "no filter". */
const ALL_KEY = 'all'
/** "All" always covers at least this far back, even with no logs that old. */
const EARLIEST_ALL = '2026-01-01'
const COLLAPSE_KEY = 'planned.ankiTracker.collapsed'
/** Text-style glyph (a grid of cards) — no colour emoji anywhere in the app. */
const GLYPH = '▦'
/** Weeks shown in the condensed sidebar strip. */
const MINI_WEEKS = 12

type Layout = 'strip' | 'months'

/* ---------- pure helpers ---------- */

/** Fills {name} placeholders in a t()'d template (see src/i18n/zh.ts). */
function fill(tpl: string, v: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''))
}

const deckKey = (classId: ID | null) => classId ?? GENERAL_KEY

/** date → total cards, for the decks the current filter lets through. */
function dayCounts(logs: AnkiLog[], filter: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of logs) {
    if (filter === GENERAL_KEY ? l.classId !== null : filter !== ALL_KEY && l.classId !== filter) continue
    m.set(l.date, (m.get(l.date) ?? 0) + l.count)
  }
  return m
}

function tooltip(iso: string, n: number): string {
  const d = fromISO(iso)
  const when = `${t(WEEKDAYS[d.getDay()])} ${d.getDate()} ${t(MONTHS[d.getMonth()].slice(0, 3))}`
  return n > 0
    ? fill(t(n === 1 ? '{when} — {n} card' : '{when} — {n} cards'), { when, n })
    : fill(t('{when} — no reviews'), { when })
}

const fmtNum = (n: number) => n.toLocaleString()

/* ---------- component ---------- */

export default function AnkiTracker({ mode, onExpand, range: fixedRange }: {
  mode: 'full' | 'tab' | 'sidebar'
  onExpand?: () => void
  /** Supplied by the Insights heatmaps card; hides the range pills when set. */
  range?: HeatmapRange
}) {
  const { state, dispatch } = useStore()
  const today = todayISO()
  /** Hosted inside the Insights heatmaps card: no card border, no collapse row. */
  const bare = mode === 'tab'

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')
  const [ownRange, setOwnRange] = useState<HeatmapRange>('100')
  const range = fixedRange ?? ownRange
  const [layout, setLayout] = useState<Layout>('strip')
  const [filter, setFilter] = useState<string>(ALL_KEY)

  const [logDate, setLogDate] = useState(today)
  const [logDeck, setLogDeck] = useState<string>(GENERAL_KEY)
  const [logCount, setLogCount] = useState('')

  const logs = state.ankiLogs

  // A filter pointing at a class that has since been deleted falls back to "all".
  useEffect(() => {
    if (filter !== ALL_KEY && filter !== GENERAL_KEY && !classById(state, filter)) setFilter(ALL_KEY)
  }, [filter, state])

  // Picking a date + deck that already has a number pre-fills the field, so
  // correcting a past day is the same gesture as logging a new one.
  const existing = logs.find((l) => l.date === logDate && deckKey(l.classId) === logDeck)?.count ?? 0
  useEffect(() => {
    setLogCount(existing ? String(existing) : '')
  }, [logDate, logDeck, existing])

  const filterColor = filter === ALL_KEY || filter === GENERAL_KEY
    ? GENERAL_COLOR
    : classById(state, filter)?.color ?? GENERAL_COLOR

  const counts = useMemo(() => dayCounts(logs, filter), [logs, filter])

  const start = useMemo(() => {
    if (mode === 'sidebar') return toISO(startOfWeek(addDays(fromISO(today), -(MINI_WEEKS * 7 - 1))))
    const days = heatmapRangeDays(range)
    if (days) return toISO(addDays(fromISO(today), -(days - 1)))
    const earliest = logs.reduce((m, l) => (l.date < m ? l.date : m), today)
    return earliest < EARLIEST_ALL ? earliest : EARLIEST_ALL
  }, [mode, range, logs, today])

  const days = useMemo(() => daysBetween(start, today), [start, today])
  const stats = useMemo(() => {
    let total = 0
    let best = 0
    let bestDay = ''
    for (const iso of days) {
      const n = counts.get(iso) ?? 0
      total += n
      if (n > best) {
        best = n
        bestDay = iso
      }
    }
    return { total, best, bestDay, avg: days.length ? Math.round(total / days.length) : 0 }
  }, [days, counts])
  const max = Math.max(1, stats.best)
  const streak = useMemo(() => streakOf(counts, today), [counts, today])

  /* ----- condensed sidebar variant ----- */

  if (mode === 'sidebar') {
    const weeks = weekColumns(days)
    return (
      <button
        type="button"
        className="anki-mini"
        title={fill(t('Flashcard reviews — last {n} weeks. Click to open the tracker.'), { n: MINI_WEEKS })}
        onClick={onExpand}
      >
        <div className="am-line">
          <span className="am-glyph">{GLYPH}</span>
          {fill(t('{n} cards'), { n: fmtNum(stats.total) })}
          <span className="am-sep">·</span>
          {fill(t('{n}-day streak'), { n: streak })}
        </div>
        <div className="am-strip" style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}>
          {weeks.map((wk, wi) =>
            wk.map((iso, di) => {
              const n = iso ? counts.get(iso) ?? 0 : 0
              const lv = iso ? level(n, max) : 0
              return (
                <span
                  key={`${wi}-${di}`}
                  className={`am-cell ${!iso ? 'blank' : ''} ${iso === today ? 'today' : ''}`}
                  style={lv ? { background: hexToRgba(GENERAL_COLOR, LEVELS[lv - 1]) } : undefined}
                />
              )
            }),
          )}
        </div>
      </button>
    )
  }

  /* ----- full / tab variant ----- */

  const deckGroups: ColorGroup[] = [
    { options: [{ value: GENERAL_KEY, label: t('General'), color: GENERAL_COLOR }] },
    ...classColorGroups(state),
  ]
  const filterGroups: ColorGroup[] = [
    { options: [{ value: ALL_KEY, label: t('All decks') }, { value: GENERAL_KEY, label: t('General'), color: GENERAL_COLOR }] },
    ...classColorGroups(state),
  ]

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
      return !c
    })
  }
  const bump = (d: number) => setLogCount(String(Math.max(0, (parseInt(logCount, 10) || 0) + d)))
  const submit = () => {
    dispatch({
      type: 'logAnki',
      date: logDate,
      classId: logDeck === GENERAL_KEY ? null : logDeck,
      count: parseInt(logCount, 10) || 0,
    })
  }

  const cell = (iso: string | null, key: string) => {
    if (!iso) return <span key={key} className="ak-cell blank" />
    const n = counts.get(iso) ?? 0
    const lv = level(n, max)
    return (
      <span
        key={key}
        className={`ak-cell ${iso === today ? 'today' : ''}`}
        title={tooltip(iso, n)}
        style={lv ? { background: hexToRgba(filterColor, LEVELS[lv - 1]) } : undefined}
      />
    )
  }

  const weeks = weekColumns(days)
  const labels = monthLabels(weeks)
  // The same range, cut into one mini-grid per calendar month.
  const months = monthChunks(days)

  return (
    <section className={bare ? 'ins2-hm' : 'anki-card'}>
      {!bare && (
        <div className="ak-head">
          <button type="button" className="ak-toggle" onClick={toggleCollapsed}
            title={collapsed ? t('Show the review tracker') : t('Hide the review tracker')}>
            <span className="ak-caret">{collapsed ? '▸' : '▾'}</span>
            <span className="ak-title">{GLYPH} {t('Flashcard reviews')}</span>
          </button>
          {collapsed && (
            <span className="ak-head-sum">
              {fill(t('{n} cards · {streak}-day streak'), { n: fmtNum(stats.total), streak })}
            </span>
          )}
        </div>
      )}

      {(bare || !collapsed) && (
        <>
          <div className="ak-stats">
            <div className="ak-stat"><b>{fmtNum(stats.total)}</b><span>{t('cards')}</span></div>
            <div className="ak-stat"><b>{streak}</b><span>{t('day streak')}</span></div>
            <div className="ak-stat" title={stats.bestDay ? tooltip(stats.bestDay, stats.best) : undefined}>
              <b>{fmtNum(stats.best)}</b><span>{t('best day')}</span>
            </div>
            <div className="ak-stat"><b>{fmtNum(stats.avg)}</b><span>{t('daily avg')}</span></div>
          </div>

          <div className="ak-controls">
            {/* Hidden when the host supplies the range — see the header note. */}
            {!fixedRange && (
              <div className="ak-pills">
                {HEATMAP_RANGES.map((r) => (
                  <button key={r.key} type="button" className={range === r.key ? 'active' : ''}
                    onClick={() => setOwnRange(r.key)}>{t(r.label)}</button>
                ))}
              </div>
            )}
            <div className="ak-pills right">
              <button type="button" className={layout === 'strip' ? 'active' : ''}
                title={t('Continuous strip')} onClick={() => setLayout('strip')}>▤ {t('Strip')}</button>
              <button type="button" className={layout === 'months' ? 'active' : ''}
                title={t('Separate month blocks')} onClick={() => setLayout('months')}>▥ {t('Months')}</button>
            </div>
          </div>

          <div className="ak-scroll">
            {layout === 'strip' ? (
              <div className="ak-strip">
                <div className="ak-dows">
                  <span />{['Mon', 'Wed', 'Fri'].map((d) => <span key={d}>{t(d)}</span>)}
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
            ) : (
              <div className="ak-months-wrap">
                {months.map((m) => (
                  <div key={m.key} className="ak-month">
                    <div className="ak-month-label">{m.label}</div>
                    <div className="ak-grid" style={{ gridTemplateColumns: `repeat(${m.weeks.length}, 13px)` }}>
                      {m.weeks.map((wk, wi) => wk.map((iso, di) => cell(iso, `${wi}-${di}`)))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ak-legend">
            <div className="ak-filter">
              <ColorSelect value={filter} groups={filterGroups} onChange={setFilter} title={t('Filter by deck')} />
            </div>
            <span className="ak-scale">
              {t('less')}
              <span className="ak-cell tiny" />
              {LEVELS.map((a, i) => (
                <span key={i} className="ak-cell tiny" style={{ background: hexToRgba(filterColor, a) }} />
              ))}
              {t('more')}
            </span>
          </div>

          <div className="ak-input">
            <input type="date" value={logDate} max={today} onChange={(e) => setLogDate(e.target.value)}
              title={t('Day to log')} />
            <div className="ak-deck">
              <ColorSelect value={logDeck} groups={deckGroups} onChange={setLogDeck} title={t('Deck')} />
            </div>
            <div className="ak-num">
              <input
                type="text" inputMode="numeric" placeholder={existing ? String(existing) : '0'}
                value={logCount} title={t('Cards reviewed')}
                onChange={(e) => setLogCount(e.target.value.replace(/[^0-9]/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
              />
              <span className="ak-spin">
                <button type="button" title={t('Increase')} onClick={() => bump(1)}>▴</button>
                <button type="button" title={t('Decrease')} onClick={() => bump(-1)}>▾</button>
              </span>
            </div>
            <button type="button" className="btn primary small" onClick={submit}>{t('Log')}</button>
          </div>
          <div className="ak-hint">
            {existing > 0
              ? fill(t('Already logged: {n} cards — logging replaces it (0 clears the day).'), { n: fmtNum(existing) })
              : t('Logging sets the total for that day and deck.')}
          </div>
        </>
      )}
    </section>
  )
}
