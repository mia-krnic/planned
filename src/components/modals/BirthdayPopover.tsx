import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { uid, useStore } from '../../store'
import type { Birthday } from '../../types'
import { MONTHS } from '../../utils/date'
import { t } from '../../i18n'
import { useClampedPos } from '../../utils/popover'
import InfoIcon from '../InfoIcon'

/**
 * The birthday marker: a little wrapped present, warm yellow/orange so it reads
 * as a gift in both themes without borrowing any calendar colour. Drawn rather
 * than typed because no text glyph says "present" without becoming an emoji.
 */
export function GiftMark({ size = 14 }: { size?: number }) {
  return (
    <svg className="gift-mark" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.2" y="6.6" width="11.6" height="7.6" rx="1.1" fill="#f0a63c" />
      <rect x="1.4" y="4.4" width="13.2" height="2.9" rx="0.9" fill="#f6c453" />
      <rect x="7" y="4.4" width="2" height="9.8" fill="#e8763f" />
      {/* bow: two ribbon loops meeting at the knot */}
      <path d="M8 4.4C8 4.4 6.6 4.5 5.6 3.9 4.7 3.4 4.9 2 6 1.9c1.1-.1 2 1.6 2 2.5z" fill="#e8763f" />
      <path d="M8 4.4C8 4.4 9.4 4.5 10.4 3.9c.9-.5.7-1.9-.4-2-1.1-.1-2 1.6-2 2.5z" fill="#e8763f" />
    </svg>
  )
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

/** The list of what's already on the calendar — the ✎ arm of the popup. */
function BirthdayList({ list, onPick, onAdd }: {
  list: Birthday[]
  onPick: (b: Birthday) => void
  onAdd: () => void
}) {
  const sorted = [...list].sort((a, b) => a.month - b.month || a.day - b.day)
  return (
    <>
      <div className="drag-pop-head">Birthdays</div>
      {sorted.length === 0 && <div className="drag-pop-sub">None yet.</div>}
      <div className="bday-list">
        {sorted.map((b) => (
          <button key={b.id} type="button" className="bday-list-row" onClick={() => onPick(b)}>
            <GiftMark size={12} />
            <span className="bday-list-name">{b.name}</span>
            <span className="bday-list-date">
              {t(MONTHS[b.month - 1].slice(0, 3))} {b.day}{b.year ? ` · ${b.year}` : ''}
            </span>
          </button>
        ))}
      </div>
      <div className="drag-pop-actions">
        <button className="btn small primary" type="button" onClick={onAdd}>Add birthday</button>
      </div>
    </>
  )
}

/** Name → year → month → day, plus the per-birthday day-off opt-out. */
function BirthdayForm({ birthday, onSave, onCancel, onDelete }: {
  birthday: Birthday | null
  onSave: (b: Birthday) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const [name, setName] = useState(birthday?.name ?? '')
  const [year, setYear] = useState(birthday?.year != null ? String(birthday.year) : '')
  const [month, setMonth] = useState(birthday?.month ?? new Date().getMonth() + 1)
  const [day, setDay] = useState(birthday?.day ?? new Date().getDate())
  const [dayOff, setDayOff] = useState(birthday?.dayOff !== false)

  const save = () => {
    if (!name.trim()) return
    const parsed = Number(year.trim())
    onSave({
      id: birthday?.id ?? uid(),
      name: name.trim(),
      month,
      day,
      year: year.trim() && parsed > 1000 ? parsed : null,
      dayOff: dayOff ? undefined : false,
    })
  }

  return (
    <>
      <div className="drag-pop-head">{birthday ? 'Edit birthday' : 'New birthday'}</div>
      <div className="field">
        <label>Name</label>
        <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="e.g. Maya" />
      </div>
      <div className="field">
        <label>
          Year born
          <InfoIcon text="Optional — leave it empty if you'd rather not track it. With a year, the marker says how old they turn." />
        </label>
        <input type="number" value={year} placeholder="optional"
          onChange={(e) => setYear(e.target.value)} />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Month</label>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {/* key and value stay the English name / month number. */}
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{t(m)}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Day</label>
          <select value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>
      <label className="check-line" style={{ marginBottom: 0 }}>
        <input type="checkbox" className="cb" checked={dayOff}
          onChange={(e) => setDayOff(e.target.checked)} />
        Day off
        <InfoIcon text="Marks the date as a day off on the calendar, hatched like any other. Turn it off for a birthday you'd still work through — the days off you marked yourself are untouched either way." />
      </label>
      <div className="drag-pop-actions">
        {onDelete && <button className="btn small danger" type="button" onClick={onDelete}>Delete</button>}
        <span className="spacer" />
        <button className="btn small" type="button" onClick={onCancel}>Cancel</button>
        <button className="btn small primary" type="button" onClick={save}>Save</button>
      </div>
    </>
  )
}

interface Props {
  x: number
  y: number
  /** The birthday to edit; omitted = the "new birthday" form. */
  init?: Birthday | null
  /** Open on the list of existing birthdays instead of a form. */
  browse?: boolean
  onClose: () => void
}

/**
 * The whole Birthdays calendar in one small popup: browse what's there, add a
 * name → year → month → day, or edit/delete one. Portalled onto <body> like the
 * drag popovers, for the same stacking reasons.
 */
export default function BirthdayPopover({ x, y, init, browse, onClose }: Props) {
  const { state, dispatch } = useStore()
  const boxRef = useRef<HTMLDivElement>(null)
  // Shares .drag-pop's centred placement, so it needs the same edge clamp.
  const pos = useClampedPos(boxRef, x, y, true)
  const [editing, setEditing] = useState<Birthday | null>(init ?? null)
  const [listing, setListing] = useState(!!browse && !init)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (boxRef.current?.contains(t)) return
      // The InfoIcon tip is portalled too, so a click on it isn't "outside".
      if (t.closest?.('.info-tip, .info-icon')) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // Next tick, so the click that opened this box doesn't close it.
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return createPortal(
    <div className="drag-pop bday-pop" ref={boxRef} style={{ left: pos.x, top: pos.y }}>
      {listing ? (
        <BirthdayList list={state.birthdays}
          onPick={(b) => { setEditing(b); setListing(false) }}
          onAdd={() => { setEditing(null); setListing(false) }} />
      ) : (
        <BirthdayForm
          key={editing?.id ?? 'new'}
          birthday={editing}
          onSave={(b) => {
            dispatch({ type: editing ? 'updateBirthday' : 'addBirthday', birthday: b })
            onClose()
          }}
          onCancel={onClose}
          onDelete={editing ? () => { dispatch({ type: 'deleteBirthday', id: editing.id }); onClose() } : undefined} />
      )}
    </div>,
    document.body,
  )
}
