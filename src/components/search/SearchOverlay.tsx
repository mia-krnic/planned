import { useEffect, useMemo, useRef, useState } from 'react'
import { useUI } from '../../App'
import { useStore } from '../../store'
import type { CalEvent, BinderPost, BinderUpload, StudySession, Task } from '../../types'
import { fmtFriendly, fmtTime } from '../../utils/date'

/**
 * Command-K global search across events, tasks, binder posts/uploads and
 * study-session reflections. Substring, case-insensitive, ranked by earliest
 * match position. Keyboard driven: ↑/↓ to move, Enter to open, Esc to close.
 */

type ResultKind = 'event' | 'task' | 'binder-upload' | 'binder-post' | 'session'

interface Result {
  key: string
  kind: ResultKind
  title: string
  subtitle?: string
  matchAt: number
  /** Small text-glyph in the row (no colour emoji anywhere in the app). */
  glyph: string
  action: () => void
}

const KIND_LABEL: Record<ResultKind, string> = {
  event: 'Events',
  task: 'Tasks',
  'binder-upload': 'Binder uploads',
  'binder-post': 'Binder posts',
  session: 'Study reflections',
}

const KIND_ORDER: ResultKind[] = ['event', 'task', 'binder-upload', 'binder-post', 'session']

function score(hay: string | undefined | null, needle: string): number {
  if (!hay) return -1
  return hay.toLowerCase().indexOf(needle)
}

/** Best score across any of the provided haystack strings; -1 if none match. */
function bestScore(hays: (string | undefined | null)[], needle: string): number {
  let best = -1
  for (const h of hays) {
    const s = score(h, needle)
    if (s < 0) continue
    if (best < 0 || s < best) best = s
  }
  return best
}

export default function SearchOverlay({ onClose, onGotoPage }: {
  onClose: () => void
  onGotoPage: (page: 'binder' | 'timer') => void
}) {
  const { state } = useStore()
  const ui = useUI()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const out: Result[] = []

    for (const ev of state.events) {
      const at = bestScore([ev.title, ev.location, ev.notes], q)
      if (at < 0) continue
      const when = ev.allDay ? `${fmtFriendly(ev.date)} · all day` : `${fmtFriendly(ev.date)} · ${fmtTime(ev.startMin)}`
      out.push({
        key: `e-${ev.id}`, kind: 'event', title: ev.title,
        subtitle: [when, ev.location].filter(Boolean).join(' · '),
        matchAt: at, glyph: '▤',
        action: () => { ui.openEvent({ event: ev as CalEvent, date: ev.date }); onClose() },
      })
    }

    for (const t of state.tasks) {
      const at = bestScore([t.title, t.notes, t.location], q)
      if (at < 0) continue
      out.push({
        key: `t-${t.id}`, kind: 'task', title: t.title,
        subtitle: [
          t.date ? `Scheduled ${fmtFriendly(t.date)}${t.startMin != null ? ' at ' + fmtTime(t.startMin) : ''}` : null,
          t.dueDate ? `due ${fmtFriendly(t.dueDate)}` : null,
        ].filter(Boolean).join(' · ') || 'Someday',
        matchAt: at, glyph: '☐',
        action: () => { ui.openTask({ task: t as Task }); onClose() },
      })
    }

    for (const u of state.binderUploads) {
      const at = bestScore([u.title, u.caption, ...u.files.map((f) => f.name)], q)
      if (at < 0) continue
      const cls = state.classes.find((c) => c.id === u.classId)
      out.push({
        key: `bu-${u.id}`, kind: 'binder-upload', title: u.title,
        subtitle: cls ? cls.name : 'Binder',
        matchAt: at, glyph: '❒',
        action: () => { onGotoPage('binder'); onClose() },
      })
      void (u satisfies BinderUpload)
    }

    for (const p of state.binderPosts) {
      const at = bestScore([p.text], q)
      if (at < 0) continue
      const cls = state.classes.find((c) => c.id === p.classId)
      const preview = p.text.length > 80 ? p.text.slice(0, 77) + '…' : p.text
      out.push({
        key: `bp-${p.id}`, kind: 'binder-post', title: preview,
        subtitle: cls ? cls.name : 'Binder',
        matchAt: at, glyph: '✎',
        action: () => { onGotoPage('binder'); onClose() },
      })
      void (p satisfies BinderPost)
    }

    for (const s of state.studySessions) {
      const at = bestScore([s.reflection], q)
      if (at < 0) continue
      const cls = state.classes.find((c) => c.id === s.classId)
      out.push({
        key: `s-${s.id}`, kind: 'session', title: s.reflection ?? '(no reflection)',
        subtitle: `${cls ? cls.name + ' · ' : ''}${fmtFriendly(s.date)}`,
        matchAt: at, glyph: '◷',
        action: () => {
          if (ui.openSession) { ui.openSession({ id: s.id }); onClose() }
          else { onGotoPage('timer'); onClose() }
        },
      })
      void (s satisfies StudySession)
    }

    // Group by kind (fixed order), sort each group by earliest match position.
    out.sort((a, b) => {
      const ka = KIND_ORDER.indexOf(a.kind)
      const kb = KIND_ORDER.indexOf(b.kind)
      if (ka !== kb) return ka - kb
      if (a.matchAt !== b.matchAt) return a.matchAt - b.matchAt
      return a.title.localeCompare(b.title)
    })
    return out.slice(0, 60)
  }, [query, state, ui, onClose, onGotoPage])

  useEffect(() => {
    setCursor(0)
  }, [query])

  const clampedCursor = results.length ? Math.max(0, Math.min(cursor, results.length - 1)) : 0

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, Math.max(0, results.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(0, c - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const r = results[clampedCursor]
      if (r) r.action()
    }
  }

  // Group rows by kind but keep a flat index (matching the sorted results array)
  // so the cursor and keyboard move through the visible list in one continuous run.
  const grouped: { kind: ResultKind; items: { r: Result; flat: number }[] }[] = []
  results.forEach((r, i) => {
    const last = grouped[grouped.length - 1]
    if (last && last.kind === r.kind) last.items.push({ r, flat: i })
    else grouped.push({ kind: r.kind, items: [{ r, flat: i }] })
  })

  return (
    <div className="search-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={onKey}>
      <div className="search-panel" role="dialog" aria-label="Search">
        <input
          ref={inputRef}
          className="search-input"
          type="text"
          placeholder="Search events, tasks, binder, reflections…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          autoFocus
        />
        <div className="search-results">
          {query.trim() === '' ? (
            <div className="search-hint">Type to search across your calendar, tasks, binder and study reflections.</div>
          ) : results.length === 0 ? (
            <div className="search-hint">No matches.</div>
          ) : (
            grouped.map((g) => (
              <div key={g.kind} className="search-group">
                <div className="search-group-head">{KIND_LABEL[g.kind]}</div>
                {g.items.map(({ r, flat }) => (
                  <button
                    key={r.key}
                    type="button"
                    className={`search-row ${flat === clampedCursor ? 'active' : ''}`}
                    onMouseEnter={() => setCursor(flat)}
                    onClick={r.action}
                  >
                    <span className="search-glyph">{r.glyph}</span>
                    <span className="search-row-body">
                      <span className="search-title">{r.title}</span>
                      {r.subtitle && <span className="search-sub">{r.subtitle}</span>}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
        <div className="search-footer">
          <span>↑ ↓ to navigate</span>
          <span>↵ to open</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  )
}
