import { useMemo, useState } from 'react'
import type { StaticImportInit } from '../../App'
import { classColorGroups, uid, useStore } from '../../store'
import type { AppState, CalEvent } from '../../types'
import { PERSONAL_COLOR } from '../../utils/color'
import { fmtFriendly, fmtTime } from '../../utils/date'
import type { ParsedIcsEvent } from '../../utils/ics'
import { moduleCodeFrom } from '../../utils/sync'
import ColorSelect, { type ColorGroup } from '../ColorSelect'
import Modal from './Modal'

/** Sentinel target values; anything else is `class:<id>` or `cal:<id>`. */
const UNSET = ''
const PERSONAL = 'personal'

/** Letters+digits only, lower case — so "CHEM 101-003" and "CHEM101" compare equal. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Matching keys for one calendar: its whole name, the course code buried in
 * that name ("CHEM 101-003" → "chem101") and its hidden module code.
 * Keys shorter than 4 characters are dropped — they match far too much.
 */
function keysFor(name: string, code?: string): string[] {
  const keys = [norm(name)]
  const m = name.match(/([A-Za-z]{2,4})\s*-?\s*(\d{2,4})/)
  if (m) keys.push(norm(m[1] + m[2]))
  if (code) keys.push(norm(code))
  return [...new Set(keys)].filter((k) => k.length >= 4)
}

/**
 * Best guess for where an imported event belongs, from EXISTING classes and
 * custom calendars only — a static file import never creates classes (that
 * stays exclusive to the live sync). Returns UNSET when nothing matches.
 */
function guessTarget(title: string, state: AppState): string {
  const hay = norm(title)
  const code = moduleCodeFrom(title)
  const candidates: { value: string; keys: string[] }[] = [
    ...state.classes.map((c) => ({ value: `class:${c.id}`, keys: keysFor(c.name, c.code) })),
    ...state.customCalendars.map((c) => ({ value: `cal:${c.id}`, keys: keysFor(c.name) })),
  ]
  let best = { value: UNSET, len: 0 }
  for (const c of candidates) {
    for (const k of c.keys) {
      const hit = hay.includes(k) || (code ? norm(code) === k : false)
      if (hit && k.length > best.len) best = { value: c.value, len: k.length }
    }
  }
  return best.value
}

interface Row {
  key: string
  ev: ParsedIcsEvent
  checked: boolean
  target: string
}

function whenText(e: ParsedIcsEvent): string {
  return e.allDay ? `${fmtFriendly(e.date)} · all day` : `${fmtFriendly(e.date)} · ${fmtTime(e.startMin)}–${fmtTime(e.endMin)}`
}

/** Review + assign the events found in an .ics file, then import them in one step. */
export default function StaticImportModal({ init, onClose }: { init: StaticImportInit; onClose: () => void }) {
  const { state, dispatch } = useStore()

  // Laid out like the calendar sidebar: placeholder, "My calendars", then the
  // classes under their folder headings.
  const groups = useMemo<ColorGroup[]>(() => [
    { options: [{ value: UNSET, label: 'please select', muted: true }] },
    {
      heading: 'My calendars',
      options: [
        { value: PERSONAL, label: 'Personal', color: PERSONAL_COLOR },
        ...state.customCalendars.map((c) => ({ value: `cal:${c.id}`, label: c.name, color: c.color })),
      ],
    },
    ...classColorGroups(state, (id) => `class:${id}`),
  ], [state])

  const [rows, setRows] = useState<Row[]>(() =>
    [...init.events]
      .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin)
      .map((ev, i) => ({
        key: `${ev.uid}-${i}`,
        ev,
        checked: true,
        target: guessTarget(ev.title, state),
      })),
  )

  const allChecked = rows.every((r) => r.checked)
  const chosen = rows.filter((r) => r.checked)
  const patch = (key: string, p: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)))

  const doImport = () => {
    const events: CalEvent[] = chosen.map((r) => {
      const [kind, id] = r.target.split(':')
      return {
        id: uid(),
        title: r.ev.title,
        classId: kind === 'class' ? id : null,
        calendarId: kind === 'cal' ? id : null,
        date: r.ev.date,
        allDay: r.ev.allDay,
        startMin: r.ev.startMin,
        endMin: r.ev.endMin,
        // Static imports are a one-off copy: no repeat, and no icsUid/origin,
        // so the live sync never adopts, edits or removes them.
        repeat: 'none',
        location: r.ev.location || undefined,
        notes: r.ev.description || undefined,
      }
    })
    dispatch({ type: 'importEvents', events, source: init.fileName })
    onClose()
  }

  return (
    <Modal title="Import ICS file" onClose={onClose} wide>
      <p className="modal-blurb">
        {init.events.length} event{init.events.length === 1 ? '' : 's'} found in <strong>{init.fileName}</strong>.
        Pick which ones to add and which calendar each belongs to. These events are copied in once —
        they are not kept in sync with the file.
      </p>

      <div className="imp-table">
        <div className="imp-row imp-head">
          <input
            type="checkbox" className="cb" checked={allChecked}
            title={allChecked ? 'Deselect all' : 'Select all'}
            onChange={() => setRows((rs) => rs.map((r) => ({ ...r, checked: !allChecked })))}
          />
          <span>Event</span>
          <span>When</span>
          <span>Add to</span>
        </div>
        {rows.map((r) => (
          <div key={r.key} className={`imp-row ${r.checked ? '' : 'off'}`}>
            <input
              type="checkbox" className="cb" checked={r.checked}
              onChange={() => patch(r.key, { checked: !r.checked })}
            />
            <span className="imp-title" title={r.ev.title}>{r.ev.title}</span>
            <span className="imp-when">{whenText(r.ev)}</span>
            <ColorSelect
              value={r.target}
              groups={groups}
              placeholder="please select"
              onChange={(v) => patch(r.key, { target: v })}
            />
          </div>
        ))}
      </div>

      <p className="imp-foot">
        Rows left on <em>please select</em> are imported to your Personal calendar.
      </p>

      <div className="modal-actions">
        <div className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={doImport} disabled={chosen.length === 0}>
          Import {chosen.length} event{chosen.length === 1 ? '' : 's'}
        </button>
      </div>
    </Modal>
  )
}
