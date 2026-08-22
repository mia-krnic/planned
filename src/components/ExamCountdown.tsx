import { useEffect, useState } from 'react'
import { useUI } from '../App'
import { t } from '../i18n'
import { useStore } from '../store'
import type { CalEvent } from '../types'
import { eventColor } from '../utils/agenda'
import { eventOccursOn } from '../utils/occur'
import { addDays, fromISO, todayISO, toISO } from '../utils/date'

const LOOKAHEAD_DAYS = 120

/** Fills {name} placeholders in a t()'d template (see src/i18n/zh.ts). */
function fill(tpl: string, v: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''))
}

/** Compact per-exam countdown rows ("D-3 · 14h 22m") under the mini month. */
export default function ExamCountdown() {
  const { state } = useStore()
  const ui = useUI()
  const [, setTick] = useState(0)
  useEffect(() => {
    // Named `timer`, not `t`: `t` is the translation function imported above.
    const timer = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(timer)
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
      <h3>{t('Exams')}</h3>
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
              {days > 0 ? `D-${days}` : t('Today')} ·{' '}
              {days > 0
                ? fill(t('{h}h'), { h: hours })
                : hours > 0
                  ? fill(t('{h}h {m}m'), { h: hours, m: mins })
                  : fill(t('{m}m'), { m: mins })}
            </span>
          </button>
        )
      })}
    </div>
  )
}
