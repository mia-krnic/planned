import { useEffect, useRef, useState } from 'react'
import { useUI } from '../App'
import { useStore } from '../store'
import type { AppNotification } from '../types'
import { runIcsSync } from '../utils/liveSync'
import { simulateFeed } from '../utils/sync'
import { todayISO } from '../utils/date'

const KIND_ICON: Record<AppNotification['kind'], string> = {
  imported: '⬇',
  added: '＋',
  removed: '⚠',
  edited: '✎',
}

const KIND_LABEL: Record<AppNotification['kind'], string> = {
  imported: 'Events imported',
  added: 'New event on your timetable',
  removed: 'Event removed from your live calendar',
  edited: 'Event changed on your live calendar',
}

function fmtAt(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function NotificationCenter() {
  const { state, dispatch } = useStore()
  const [open, setOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const bootRef = useRef(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const bound = !!state.icsUrl

  const sync = async () => {
    if (!bound) return // nothing to sync against until the user binds a feed
    setSyncing(true)
    setError(await runIcsSync(state.icsUrl, dispatch))
    setSyncing(false)
  }

  // Sync the bound feed once per app open (ref guards StrictMode re-run).
  // A feed bound later in the session is synced by the modal that bound it.
  useEffect(() => {
    if (bootRef.current || !state.icsUrl) return
    bootRef.current = true
    void sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const simulate = () => {
    dispatch({ type: 'applySync', parsed: simulateFeed(state.events, todayISO()) })
  }

  const notifs = [...state.notifications].sort((a, b) => b.at.localeCompare(a.at))
  const count = notifs.length

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button className="btn icon notif-bell" title="Notifications" onClick={() => setOpen((o) => !o)}>
        {/* Amber so it stands out among the grey utility icons (user request). */}
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 1.6 a4.1 4.1 0 0 0 -4.1 4.1 c0 2.9 -1.2 4.1 -1.2 4.1 h10.6 s-1.2 -1.2 -1.2 -4.1 A4.1 4.1 0 0 0 8 1.6 Z M6.5 12.4 a1.6 1.6 0 0 0 3 0"
            fill="#e8b06c" stroke="#e8b06c" strokeWidth="0.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {count > 0 && <span className="notif-badge">{count > 9 ? '9+' : count}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-head">
            <strong>Notifications</strong>
            <span className="notif-status">
              {!bound ? 'No live calendar bound'
                : syncing ? 'Syncing…'
                : error ? error
                : state.lastSync ? `Synced ${fmtAt(state.lastSync)}`
                : 'Not synced yet'}
            </span>
            <button className="btn small" onClick={sync} disabled={syncing || !bound}
              title={bound ? 'Check the live feed now' : 'Bind a live calendar first (sidebar → Import live ICS)'}>
              Sync now
            </button>
            <button className="btn small" onClick={simulate} title="Demo: pretend the feed added, edited and removed events">
              Simulate
            </button>
          </div>
          <div className="notif-list">
            {notifs.length === 0 && <div className="empty-hint">No notifications — your timetable is up to date.</div>}
            {notifs.map((n) => <NotifCard key={n.id} n={n} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function NotifCard({ n }: { n: AppNotification }) {
  const { state, dispatch } = useStore()
  const ui = useUI()
  const ev = n.eventId ? state.events.find((e) => e.id === n.eventId) : undefined
  const [checked, setChecked] = useState<string[]>(() => (n.diffs ?? []).map((d) => d.key))

  const toggle = (key: string) =>
    setChecked((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]))

  return (
    <div className={`notif-card kind-${n.kind}`}>
      <div className="notif-top">
        <span className="notif-icon">{KIND_ICON[n.kind]}</span>
        <div className="notif-titles">
          <div className="notif-kind">{KIND_LABEL[n.kind]}</div>
          <div className="notif-title">
            {ev ? (
              <button className="linkish" onClick={() => ui.openEvent({ event: ev })}>{n.title}</button>
            ) : n.title}
          </div>
          {n.body && <div className="notif-body">{n.body}</div>}
          <div className="notif-at">{fmtAt(n.at)}</div>
        </div>
        {(n.kind === 'imported' || n.kind === 'added') && (
          <button className="btn icon notif-x" title="Dismiss" onClick={() => dispatch({ type: 'dismissNotification', id: n.id })}>×</button>
        )}
      </div>

      {n.kind === 'removed' && (
        <div className="notif-actions">
          <span className="notif-hint">Keep it on your calendar, or delete it?</span>
          <button className="btn small" onClick={() => dispatch({ type: 'resolveRemoved', notifId: n.id, keep: true })}>Keep</button>
          <button className="btn small danger" onClick={() => dispatch({ type: 'resolveRemoved', notifId: n.id, keep: false })}>Delete</button>
        </div>
      )}

      {n.kind === 'edited' && (
        <>
          <div className="diff-list">
            {(n.diffs ?? []).map((d) => (
              <label key={d.key} className="diff-row">
                <input type="checkbox" className="cb" checked={checked.includes(d.key)} onChange={() => toggle(d.key)} />
                <span className="diff-label">{d.label}</span>
                <span className="diff-old">{d.oldText}</span>
                <span className="diff-arrow">→</span>
                <span className="diff-new">{d.newText}</span>
              </label>
            ))}
          </div>
          <div className="notif-actions">
            <span className="notif-hint">Ticked changes are applied; unticked keep your version.</span>
            <button className="btn small" onClick={() => dispatch({ type: 'applyEdited', notifId: n.id, keys: [] })}>Keep mine</button>
            <button className="btn small primary" onClick={() => dispatch({ type: 'applyEdited', notifId: n.id, keys: checked })}>Apply</button>
          </div>
        </>
      )}
    </div>
  )
}
