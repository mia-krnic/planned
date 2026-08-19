import { useState } from 'react'
import { useStore } from '../store'
import {
  BIRTHDAY_COLOR, birthdayLabel, birthdaysForDay, dueColorsForDay, examColorsForDay, examRingBackground, isDayOff,
} from '../utils/agenda'
import { hexToRgba } from '../utils/color'
import { fromISO, isSameDay, monthMatrix, MONTHS, toISO, weekdayLabels } from '../utils/date'

interface Props {
  anchor: string
  onSelect: (iso: string) => void
}

/** Condensed month with today marker + colored dots for tasks due that day. */
export default function MiniMonth({ anchor, onSelect }: Props) {
  const { state } = useStore()
  const [display, setDisplay] = useState(() => {
    const d = fromISO(anchor)
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const today = new Date()
  const anchorDate = fromISO(anchor)
  const matrix = monthMatrix(new Date(display.y, display.m, 1), state.weekStart)

  const nav = (dir: number) => {
    const d = new Date(display.y, display.m + dir, 1)
    setDisplay({ y: d.getFullYear(), m: d.getMonth() })
  }

  return (
    <div className="mini-month">
      <div className="mm-head">
        <span className="mm-title">{MONTHS[display.m]} {display.y}</span>
        <span className="mm-nav">
          <button onClick={() => nav(-1)} aria-label="Previous month">‹</button>
          <button onClick={() => nav(1)} aria-label="Next month">›</button>
        </span>
      </div>
      <div className="mm-grid">
        {weekdayLabels(state.weekStart).map((d, i) => (
          <div key={i} className="mm-dow">{d[0]}</div>
        ))}
        {matrix.flat().map((d) => {
          const iso = toISO(d)
          const cls = [
            'mm-cell',
            d.getMonth() !== display.m ? 'outside' : '',
            isSameDay(d, today) ? 'today' : '',
            isSameDay(d, anchorDate) && !isSameDay(d, today) ? 'selected' : '',
          ].join(' ')
          const examBg = examRingBackground(examColorsForDay(state, iso))
          const bdays = birthdaysForDay(state, iso)
          const dayOff = isDayOff(state, iso)
          // Birthdays take the same tinted box behind the number as an exam
          // day. An exam outranks them (its pie carries per-class meaning), so
          // a day with both keeps the pie and the birthday drops to a dot.
          const bdayBox = bdays.length > 0 && !examBg
          const bdayTip = bdays.map((b) => birthdayLabel(b, iso)).join(' · ')
          return (
            <button key={iso} className={cls} onClick={() => onSelect(iso)}
              title={bdayTip || undefined}>
              {/* Exam fill lives on a layer BELOW .mm-num so today's solid
                  accent circle always paints on top of it. */}
              {examBg && <span className="exam-box" style={{ background: examBg }} />}
              {bdayBox && (
                <span className="exam-box bday-box" style={{ background: hexToRgba(BIRTHDAY_COLOR, 0.38) }} />
              )}
              <span className="mm-num">
                {dayOff && <span className="dayoff-box" />}
                {d.getDate()}
              </span>
              {/* Dots mark DEADLINES only — one per distinct colour of task
                  due that day, up to three — plus a warm one for a birthday
                  that lost its box to an exam. */}
              <span className="mm-dots">
                {dueColorsForDay(state, iso).map((c, i) => (
                  <span key={i} className="mm-dot" style={{ background: c }} />
                ))}
                {bdays.length > 0 && examBg && (
                  <span className="mm-dot mm-dot-bday" style={{ background: BIRTHDAY_COLOR }} />
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
