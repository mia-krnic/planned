import { useEffect, useState } from 'react'
import { useUI } from '../App'
import { useStore } from '../store'
import type { CalEvent } from '../types'
import { eventColor } from '../utils/agenda'
import { eventOccursOn } from '../utils/occur'
import { addDays, fromISO, todayISO, toISO } from '../utils/date'

const LOOKAHEAD_DAYS = 120

/** Compact per-exam countdown rows ("D-3 · 14h 22m") under the mini month. */
export default function ExamCountdown() {
  const { state } = useStore()
  const ui = useUI()
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  const now = new Date()
  const start = fromISO(todayISO())
  const upcoming: { ev: CalEvent; target: Date }[] = []
  for (const ev of state.events.filter((e) => e.isExam)) {
    // Next future occurrence (handles repeating events too).
    for (let i = 0; i <= LOOKAHEAD_DAYS; i++) {
      const d = addDays(start, i)
      if (!eventOccursOn(ev, toISO(d))) continue
      const target = new Date(d)
      target.setMinutes(ev.allDay ? 0 : ev.startMin)
      if (target.getTime() > now.getTime()) {
        upcoming.push({ ev, target })
        break
      }
    }
  }
  upcoming.sort((a, b) => a.target.getTime() - b.target.getTime())
  if (upcoming.length === 0) return null

  return (
    <div className="exam-countdown">
      <h3>Exams</h3>
      {upcoming.map(({ ev, target }) => {
        const ms = target.getTime() - now.getTime()
        const days = Math.floor(ms / 86_400_000)
        const hours = Math.floor((ms % 86_400_000) / 3_600_000)
        const mins = Math.floor((ms % 3_600_000) / 60_000)
        return (
          <button key={ev.id} className="exam-row" onClick={() => ui.openEvent({ event: ev, date: toISO(target) })}>
            <span className="swatch" style={{ background: eventColor(state, ev) }} />
            <span className="exam-title">{ev.title}</span>
            <span className="exam-dday">
              {days > 0 ? `D-${days}` : 'Today'} · {days > 0 ? `${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`}
            </span>
          </button>
        )
      })}
    </div>
  )
}
