import { useState } from 'react'
import { useStore } from '../store'
import { dueColorsForDay, examColorsForDay, examRingBackground, isDayOff } from '../utils/agenda'
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
          const dayOff = isDayOff(state, iso)
          return (
            <button key={iso} className={cls} onClick={() => onSelect(iso)}>
              {/* Exam fill lives on a layer BELOW .mm-num so today's solid
                  accent circle always paints on top of it. */}
              {examBg && <span className="exam-box" style={{ background: examBg }} />}
              <span className="mm-num">
                {dayOff && <span className="dayoff-box" />}
                {d.getDate()}
              </span>
              {/* Dots mark DEADLINES only — one per distinct colour of task
                  due that day, up to three. */}
              <span className="mm-dots">
                {dueColorsForDay(state, iso).map((c, i) => (
                  <span key={i} className="mm-dot" style={{ background: c }} />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
