import { useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useStore } from '../../store'
import type { AppState, DayLog } from '../../types'
import { addDays, fromISO, MONTHS, startOfWeek, toISO, todayISO, WEEKDAYS } from '../../utils/date'
import { DayLogBlock, JournalBox } from '../daylog/DayLogControls'
import { MOOD_LABEL, MOOD_LEVELS, MoodFace, PencilGlyph } from '../daylog/glyphs'

/**
 * The journal, read the way a diary is read: newest first, grouped by year and
 * month. Everything on a row is the same store-backed control the calendar day
 * header uses (see DayLogControls), so editing here and editing there are the
 * same act — there is nothing to sync.
 *
 * Which days get a row: every day that has anything logged, plus the days of
 * the current week, so today is always ready to be written on. Empty months
 * still appear as a slim header, back through the earliest month below, so the
 * shape of the year is visible even where nothing was written.
 */

/** The grouping always reaches at least this far back. */
const EARLIEST_MONTH = '2025-01'

const monthKey = (iso: string) => iso.slice(0, 7)

/** Every 'YYYY-MM' from `from` up to `to`, inclusive, newest first. */
function monthsDescending(from: string, to: string): string[] {
  const out: string[] = []
  let y = Number(to.slice(0, 4))
  let m = Number(to.slice(5, 7))
  const stop = from
  for (let guard = 0; guard < 600; guard++) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    out.push(key)
    if (key <= stop) break
    m -= 1
    if (m === 0) { m = 12; y -= 1 }
  }
  return out
}

/** The searchable text of one day: the meals plus the entry. */
function haystack(log: DayLog | undefined): string {
  if (!log) return ''
  const m = log.meals
  return [m?.b, m?.l, m?.d, log.journal].filter(Boolean).join('\n').toLowerCase()
}

interface Match { label: string; text: string }

/** The fields a query hit, with the journal cut down to a window around the hit. */
function matchesFor(log: DayLog | undefined, q: string): Match[] {
  if (!log || !q) return []
  const out: Match[] = []
  const push = (label: string, text: string | undefined) => {
    if (text && text.toLowerCase().includes(q)) out.push({ label, text })
  }
  push('Breakfast', log.meals?.b)
  push('Lunch', log.meals?.l)
  push('Dinner', log.meals?.d)
  const j = log.journal
  if (j && j.toLowerCase().includes(q)) {
    const at = j.toLowerCase().indexOf(q)
    const from = Math.max(0, at - 42)
    const to = Math.min(j.length, at + q.length + 42)
    out.push({
      label: 'Journal',
      text: `${from > 0 ? '…' : ''}${j.slice(from, to)}${to < j.length ? '…' : ''}`,
    })
  }
  return out
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const lower = text.toLowerCase()
  const parts: ReactNode[] = []
  let i = 0
  for (let guard = 0; guard < 200; guard++) {
    const at = lower.indexOf(q, i)
    if (at < 0) break
    if (at > i) parts.push(text.slice(i, at))
    parts.push(<mark key={at} className="jp-hl">{text.slice(at, at + q.length)}</mark>)
    i = at + q.length
  }
  parts.push(text.slice(i))
  return <>{parts}</>
}

/** Days of the week `today` falls in, so the tab always offers today's row. */
function currentWeekDates(today: string, weekStart: AppState['weekStart']): string[] {
  const s = startOfWeek(fromISO(today), weekStart)
  return Array.from({ length: 7 }, (_, i) => toISO(addDays(s, i)))
}

export default function JournalPage() {
  const { state } = useStore()
  const today = todayISO()
  const thisMonth = monthKey(today)
  const thisYear = today.slice(0, 4)

  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const searching = q.length > 0

  // Months are shut by default (bar the current one) and years are open (bar
  // the older ones): the two states are stored as the exceptions to that.
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({ [thisMonth]: true })
  const [shutYears, setShutYears] = useState<Record<string, boolean>>({})
  const todayRef = useRef<HTMLDivElement>(null)

  const model = useMemo(() => {
    const logged = Object.keys(state.dayLogs)
    const dates = new Set([...logged, ...currentWeekDates(today, state.weekStart)])
    const earliest = logged.length
      ? [...logged].sort()[0].slice(0, 7)
      : thisMonth
    const first = earliest < EARLIEST_MONTH ? earliest : EARLIEST_MONTH
    const last = [...dates].sort().slice(-1)[0] ?? today
    const byMonth = new Map<string, string[]>()
    for (const iso of [...dates].sort().reverse()) {
      const k = monthKey(iso)
      const list = byMonth.get(k)
      if (list) list.push(iso)
      else byMonth.set(k, [iso])
    }
    return { months: monthsDescending(first, monthKey(last) > thisMonth ? monthKey(last) : thisMonth), byMonth }
  }, [state.dayLogs, state.weekStart, today, thisMonth])

  // This month's moods, as a count per face.
  const moodCounts = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const [iso, log] of Object.entries(state.dayLogs)) {
      if (log.mood && monthKey(iso) === thisMonth) counts[log.mood] += 1
    }
    return counts
  }, [state.dayLogs, thisMonth])

  const totalEntries = Object.keys(state.dayLogs).length
  const totalWritten = Object.values(state.dayLogs).filter((l) => l.journal).length

  const rowsOf = (month: string): string[] => {
    const all = model.byMonth.get(month) ?? []
    if (!searching) return all
    return all.filter((iso) => haystack(state.dayLogs[iso]).includes(q))
  }

  const jumpToToday = () => {
    setQuery('')
    setOpenMonths((m) => ({ ...m, [thisMonth]: true }))
    setShutYears((y) => ({ ...y, [thisYear]: false }))
    requestAnimationFrame(() => todayRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
  }

  // Year → its months, in the order monthsDescending produced them.
  const years: { year: string; months: string[] }[] = []
  for (const m of model.months) {
    const y = m.slice(0, 4)
    const last = years[years.length - 1]
    if (last && last.year === y) last.months.push(m)
    else years.push({ year: y, months: [m] })
  }

  const hits = searching ? model.months.reduce((n, m) => n + rowsOf(m).length, 0) : 0

  return (
    <div className="journal-page">
      <div className="jp-wrap">
        <header className="jp-head">
          <div className="jp-title">
            <h1><PencilGlyph size={18} /> Journal</h1>
            <span className="jp-sub">
              {totalEntries} day{totalEntries === 1 ? '' : 's'} logged · {totalWritten} written up
            </span>
          </div>
          <div className="jp-tools">
            <div className="jp-search">
              <span className="jp-search-icon" aria-hidden="true">⌕</span>
              <input
                type="search"
                value={query}
                placeholder="Search meals and entries"
                aria-label="Search the journal"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }}
              />
            </div>
            <button type="button" className="btn" onClick={jumpToToday}>Today</button>
          </div>
        </header>

        {/* This month at a glance: how the days felt. */}
        <div className="jp-moodstrip">
          <span className="jp-moodstrip-label">{MONTHS[Number(thisMonth.slice(5, 7)) - 1]} moods</span>
          {MOOD_LEVELS.map((m) => (
            <span key={m} className={`jp-moodcount ${moodCounts[m] ? 'has' : ''}`} title={MOOD_LABEL[m]}>
              <MoodFace level={m} size={15} />
              <b>{moodCounts[m]}</b>
            </span>
          ))}
        </div>

        {totalEntries === 0 && !searching && (
          <div className="jp-empty">
            <p><b>Nothing written down yet.</b></p>
            <p>
              Every day in the week and day calendar views carries a small log at the foot of its
              header: tap the weather, jot what you ate, pick a face for how it went. Scroll past
              the last hour of a day for its journal box.
            </p>
            <p>It all lands here, newest first — the rows below are editable too.</p>
          </div>
        )}

        {searching && (
          <div className="jp-searchnote">
            {hits === 0
              ? <>No entries match “{query.trim()}”.</>
              : <>{hits} day{hits === 1 ? '' : 's'} match “{query.trim()}”.</>}
          </div>
        )}

        {years.map(({ year, months }) => {
          const yearRows = months.reduce((n, m) => n + rowsOf(m).length, 0)
          // Searching ignores both collapse states, so a hit is never hidden —
          // without disturbing what the user had open underneath.
          const yearShut = shutYears[year] ?? year !== thisYear
          const yearOpen = searching ? yearRows > 0 : !yearShut
          if (searching && yearRows === 0) return null
          return (
            <section key={year} className="jp-year-group">
              <button type="button" className="jp-year" aria-expanded={yearOpen}
                onClick={() => setShutYears((s) => ({ ...s, [year]: !yearShut }))}>
                <span className={`caret ${yearOpen ? 'open' : ''}`}>▶</span>
                <span className="jp-year-name">{year}</span>
                <span className="jp-year-count">{yearRows} day{yearRows === 1 ? '' : 's'}</span>
              </button>

              {yearOpen && months.map((m) => {
                const rows = rowsOf(m)
                const name = MONTHS[Number(m.slice(5, 7)) - 1]
                if (searching && rows.length === 0) return null
                // A month with nothing in it is a slim marker, not a control.
                if (rows.length === 0) {
                  return (
                    <div key={m} className="jp-month jp-month-empty">
                      <span className="jp-month-name">{name}</span>
                      <span className="jp-month-count">—</span>
                    </div>
                  )
                }
                const stored = openMonths[m] ?? false
                const open = searching || stored
                return (
                  <div key={m} className="jp-month-group">
                    <button type="button" className="jp-month" aria-expanded={open}
                      onClick={() => setOpenMonths((s) => ({ ...s, [m]: !stored }))}>
                      <span className={`caret ${open ? 'open' : ''}`}>▶</span>
                      <span className="jp-month-name">{name}</span>
                      <span className="jp-month-count">{rows.length}</span>
                    </button>
                    {open && (
                      <div className="jp-rows">
                        {rows.map((iso) => (
                          <DayRow key={iso} iso={iso} today={today} q={q}
                            rowRef={iso === today ? todayRef : undefined} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function DayRow({ iso, today, q, rowRef }: {
  iso: string
  today: string
  q: string
  rowRef?: RefObject<HTMLDivElement>
}) {
  const { state } = useStore()
  const d = fromISO(iso)
  const log = state.dayLogs[iso]
  const isToday = iso === today
  const matches = matchesFor(log, q)

  return (
    <div ref={rowRef} className={`jp-row ${isToday ? 'is-today' : ''}`}>
      <div className="jp-date">
        <span className="jp-dow">{WEEKDAYS[d.getDay()]}</span>
        <span className="jp-dnum">{d.getDate()} {MONTHS[d.getMonth()].slice(0, 3)}</span>
        {isToday && <span className="jp-today-pill">today</span>}
      </div>
      <div className="jp-mid">
        <DayLogBlock date={iso} variant="journal" />
      </div>
      <div className="jp-right">
        <JournalBox date={iso} minRows={3} />
        {matches.length > 0 && (
          <div className="jp-matches">
            {matches.map((mt, i) => (
              <div key={i} className="jp-match">
                <span className="jp-match-label">{mt.label}</span>
                <span className="jp-match-text"><Highlight text={mt.text} q={q} /></span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
