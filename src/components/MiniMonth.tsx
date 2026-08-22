import { useState } from 'react'
import { useStore } from '../store'
import {
  BIRTHDAY_COLOR, birthdayLabel, birthdaysForDay, dueColorsForDay, examColorsForDay, examRingBackground, isDayOff,
} from '../utils/agenda'
import { hexToRgba } from '../utils/color'
import { fromISO, isSameDay, monthMatrix, MONTHS, toISO, weekdayLabels } from '../utils/date'
import { lang, t } from '../i18n'

interface Props {
  anchor: string
  onSelect: (iso: string) => void
}

/** Fills {name} placeholders in a t()'d template (see src/i18n/zh.ts). */
function fill(tpl: string, v: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''))
}

/**
 * The one-character weekday rail. English takes the initial ('Sun' → 'S');
 * Chinese takes the last character ('周一' → '一'), since a Chinese initial
 * would be '周' for every day of the week.
 */
export function dowInitial(short: string): string {
  return lang() === 'zh' ? t(short).slice(-1) : short[0]
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
        <span className="mm-title">
          {fill(t('{month} {year}'), { month: t(MONTHS[display.m]), year: display.y })}
        </span>
        <span className="mm-nav">
          <button onClick={() => nav(-1)} aria-label={t('Previous month')}>‹</button>
          <button onClick={() => nav(1)} aria-label={t('Next month')}>›</button>
        </span>
      </div>
      <div className="mm-grid">
        {weekdayLabels(state.weekStart).map((d, i) => (
          <div key={i} className="mm-dow">{dowInitial(d)}</div>
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
