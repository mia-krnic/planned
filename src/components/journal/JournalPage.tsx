import {
  useLayoutEffect, useMemo, useRef, useState,
  type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject,
} from 'react'
import { useStore } from '../../store'
import type { DayLog } from '../../types'
import { earliestUserDate, fmtSleep } from '../../utils/daylog'
import { addDays, fromISO, MONTHS, toISO, todayISO, WEEKDAYS } from '../../utils/date'
import { DayLogBlock, JournalBox } from '../daylog/DayLogControls'
import { MOOD_LABEL, MOOD_LEVELS, MoodFace, PencilGlyph } from '../daylog/glyphs'

/**
 * The journal, read the way a diary is read: newest first, grouped by year and
 * month. Everything on a row is the same store-backed control the calendar day
 * header uses (see DayLogControls), so editing here and editing there are the
 * same act — there is nothing to sync.
 *
 * Which days get a row: EVERY day from the first day the user has any data on
 * (see earliestUserDate) through today, never further. Blank days are rows too,
 * carrying the same empty controls — a diary you can turn back to any page of,
 * rather than a list of the days that happen to be filled in.
 */

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

/** Every day from `from` through `to`, inclusive and in order. */
function daysThrough(from: string, to: string): string[] {
  const out: string[] = []
  let d = fromISO(from)
  for (let guard = 0; guard < 20000; guard++) {
    const iso = toISO(d)
    out.push(iso)
    if (iso >= to) break
    d = addDays(d, 1)
  }
  return out
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
    // The diary runs from the user's first dated anything up to today — and
    // stops there: tomorrow has not happened, so it gets no page.
    const earliest = earliestUserDate(state)
    const first = earliest && earliest < today ? earliest : today
    const byMonth = new Map<string, string[]>()
    for (const iso of daysThrough(first, today).reverse()) {
      const k = monthKey(iso)
      const list = byMonth.get(k)
      if (list) list.push(iso)
      else byMonth.set(k, [iso])
    }
    return { months: monthsDescending(monthKey(first), thisMonth), byMonth }
  }, [state, today, thisMonth])

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

  // Every day now has a row, so a plain row count would only ever restate the
  // length of the month. The badges count the days actually written on instead.
  const loggedIn = (month: string): number =>
    (model.byMonth.get(month) ?? []).reduce((n, iso) => n + (state.dayLogs[iso] ? 1 : 0), 0)

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
          const yearLogged = months.reduce((n, m) => n + loggedIn(m), 0)
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
                <span className="jp-year-count">
                  {searching
                    ? <>{yearRows} day{yearRows === 1 ? '' : 's'}</>
                    : <>{yearLogged} logged</>}
                </span>
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
                      <span className="jp-month-count">{searching ? rows.length : loggedIn(m)}</span>
                    </button>
                    {open && (
                      <MonthRows dates={rows} today={today} q={q} todayRef={todayRef} />
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

/* ---------- One month's rows, with the sleep graph beside them ---------- */

/** Where one rendered row sits inside its month block, in pixels from its top. */
interface Band { top: number; h: number }

/**
 * The rows of one open month, plus the sleep graph running down their left.
 *
 * The graph never assumes anything about how tall a row is: the rows are
 * measured after every layout (and again whenever one of them resizes — the
 * journal boxes grow as they are typed into), so the dots stay on their rows
 * whatever else the month does.
 */
function MonthRows({ dates, today, q, todayRef }: {
  dates: string[]
  today: string
  q: string
  todayRef: RefObject<HTMLDivElement>
}) {
  const rowsRef = useRef<HTMLDivElement>(null)
  const [geom, setGeom] = useState<{ bands: Band[]; h: number }>({ bands: [], h: 0 })
  // The dates array is rebuilt on every render; its content is what matters.
  const key = dates.join('|')

  useLayoutEffect(() => {
    const el = rowsRef.current
    if (!el) return
    let raf = 0
    const measure = () => {
      raf = 0
      const base = el.getBoundingClientRect()
      const bands = (Array.from(el.children) as HTMLElement[]).map((k) => {
        const r = k.getBoundingClientRect()
        return { top: r.top - base.top, h: r.height }
      })
      // Bailing out when nothing moved keeps the observer from re-triggering
      // itself through the state update.
      setGeom((prev) => {
        if (prev.h === base.height && prev.bands.length === bands.length
          && prev.bands.every((b, i) => b.top === bands[i].top && b.h === bands[i].h)) return prev
        return { bands, h: base.height }
      })
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(measure) }
    measure()
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    for (const k of Array.from(el.children)) ro.observe(k)
    return () => { ro.disconnect(); if (raf) cancelAnimationFrame(raf) }
  }, [key])

  return (
    <div className="jp-rowsblock">
      <SleepColumn dates={dates} bands={geom.bands} h={geom.h} />
      <div className="jp-rows" ref={rowsRef}>
        {dates.map((iso) => (
          <DayRow key={iso} iso={iso} today={today} q={q}
            rowRef={iso === today ? todayRef : undefined} />
        ))}
      </div>
    </div>
  )
}

/* ---------- The sleep graph ---------- */

/** The graph's full width in hours: a night longer than this pins to the edge. */
const SLEEP_SCALE_MIN = 12 * 60
/** Dragging lands on quarter hours. */
const SLEEP_SNAP = 15
const COL_W = 84
const COL_PAD = 8

/**
 * A dot-to-dot of how much was slept, read downwards: one dot per rendered row,
 * on that row's own line, further right the longer the night. Gaps in the data
 * break the line rather than being drawn through.
 *
 * Any row's slot can be dragged sideways to set that night's length (a blank
 * day's empty slot too — a click there puts a dot where it was clicked). The
 * value is only written to the store when the pointer is released, so a drag
 * across a month is one undo step, not fifty.
 */
function SleepColumn({ dates, bands, h }: { dates: string[]; bands: Band[]; h: number }) {
  const { state, dispatch } = useStore()
  const [drag, setDrag] = useState<{ i: number; min: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Before the first measurement there is nothing to draw against.
  if (bands.length !== dates.length || h <= 0) return <div className="jp-sleepcol" aria-hidden="true" />

  const xOf = (min: number) =>
    COL_PAD + (Math.min(min, SLEEP_SCALE_MIN) / SLEEP_SCALE_MIN) * (COL_W - 2 * COL_PAD)

  /** Pointer position → a snapped number of minutes. */
  const minAt = (clientX: number): number => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r || r.width <= 2 * COL_PAD) return 0
    const t = (clientX - r.left - COL_PAD) / (r.width - 2 * COL_PAD)
    const raw = t * SLEEP_SCALE_MIN
    return Math.max(0, Math.min(SLEEP_SCALE_MIN, Math.round(raw / SLEEP_SNAP) * SLEEP_SNAP))
  }

  const minFor = (i: number): number =>
    (drag && drag.i === i ? drag.min : state.dayLogs[dates[i]]?.sleepMin ?? 0)

  const cyOf = (i: number) => bands[i].top + bands[i].h / 2

  const down = (i: number) => (e: ReactPointerEvent<SVGRectElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ i, min: minAt(e.clientX) })
  }
  const move = (i: number) => (e: ReactPointerEvent<SVGRectElement>) => {
    if (!drag || drag.i !== i) return
    const min = minAt(e.clientX)
    if (min !== drag.min) setDrag({ i, min })
  }
  const up = (i: number) => (e: ReactPointerEvent<SVGRectElement>) => {
    if (!drag || drag.i !== i) return
    // Capture may already have been dropped (a cancelled pointer); releasing an
    // id that is no longer captured throws.
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    dispatch({ type: 'updateDayLog', date: dates[i], patch: { sleepMin: drag.min } })
    setDrag(null)
  }

  // Runs of consecutive rows that have a value: the line is drawn per run, so a
  // day with nothing logged leaves a break instead of a false straight line.
  const runs: string[][] = []
  let run: string[] = []
  for (let i = 0; i < dates.length; i++) {
    const m = minFor(i)
    if (m > 0) run.push(`${xOf(m).toFixed(2)},${cyOf(i).toFixed(2)}`)
    else { if (run.length > 1) runs.push(run); run = [] }
  }
  if (run.length > 1) runs.push(run)

  return (
    <div className="jp-sleepcol" style={{ height: h }}>
      <svg ref={svgRef} className="jp-sleepsvg" width={COL_W} height={h}
        viewBox={`0 0 ${COL_W} ${h}`} role="img" aria-label="Hours slept">
        {/* A quiet eight-hour mark to read the dots against. */}
        <line className="jp-sleep-grid" x1={xOf(8 * 60)} y1={0} x2={xOf(8 * 60)} y2={h} />
        {runs.map((pts, i) => (
          <polyline key={i} className="jp-sleep-line" points={pts.join(' ')} />
        ))}
        {dates.map((iso, i) => {
          const m = minFor(i)
          const dragging = drag?.i === i
          return (
            <g key={iso}>
              {m > 0 && (
                <circle className={`jp-sleep-dot ${dragging ? 'dragging' : ''}`}
                  cx={xOf(m)} cy={cyOf(i)} r={dragging ? 3.4 : 2.4} />
              )}
              {dragging && (
                <text className="jp-sleep-label" x={COL_W / 2} y={cyOf(i) - 8} textAnchor="middle">
                  {fmtSleep(m)}
                </text>
              )}
              <rect className="jp-sleep-hit" x={0} y={bands[i].top} width={COL_W} height={bands[i].h}
                onPointerDown={down(i)} onPointerMove={move(i)}
                onPointerUp={up(i)} onPointerCancel={up(i)}>
                <title>{`${iso} · ${m > 0 ? `${fmtSleep(m)} slept` : 'no sleep logged'} — drag to set`}</title>
              </rect>
            </g>
          )
        })}
      </svg>
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
