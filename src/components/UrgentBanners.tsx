import { useEffect, useRef, useState } from 'react'
import { useUI } from '../App'
import { t } from '../i18n'
import { useStore } from '../store'
import { URGENT_MARKS, urgentDueGroups } from '../utils/agenda'
import { hexToRgba, titleTint } from '../utils/color'
import { todayISO } from '../utils/date'

/** Why a task still counts as urgent — the hover text behind its marks. */
function markHint(done: boolean, submitted: boolean): string {
  if (!done && !submitted) return t('Not done, not submitted')
  return done ? t('Done — not submitted yet') : t('Submitted — not ticked off yet')
}

/**
 * Everything due today, on every page, without covering anything: a single
 * small chip pinned top-centre — the count plus one dot per class — that
 * expands into the full per-class stack on click and tucks itself away on
 * outside click or Escape. There is still no dismiss by design: the chip
 * itself only leaves once every task is both done and submitted, or its
 * deadline moves.
 */
export default function UrgentBanners() {
  const { state } = useStore()
  const ui = useUI()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const groups = urgentDueGroups(state, todayISO())

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (groups.length === 0) return null
  const count = groups.reduce((n, g) => n + g.tasks.length, 0)
  const worst = groups.some((g) => g.tasks.some((t) => t.marks === 2)) ? 2 : 1

  return (
    <div className="urgent-wrap" ref={wrapRef}>
      <button type="button" className="urgent-chip" aria-expanded={open}
        title={open ? t('Hide the list') : t('Show what is due today')}
        onClick={() => setOpen((o) => !o)}>
        <span className="uc-mark">{URGENT_MARKS[worst as 1 | 2]}</span>
        {count} {t('due today')}
        <span className="uc-dots" aria-hidden="true">
          {groups.map((g) => <span key={g.key} className="uc-dot" style={{ background: g.color }} />)}
        </span>
      </button>

      {open && (
        <div className="urgent-banners">
          {groups.map((g) => (
            <div key={g.key} className="urgent-banner"
              style={{ background: hexToRgba(g.color, 0.16), borderLeftColor: g.color }}>
              <span className="ub-class" style={{ color: titleTint(g.color) }}>{g.name}</span>
              <span className="ub-due">{t('due today')}</span>
              <span className="ub-tasks">
                {g.tasks.map(({ task, marks }) => (
                  <button key={task.id} type="button" className="ub-task"
                    title={markHint(task.done, !!task.submitted)}
                    onClick={() => ui.openTask({ task })}>
                    <span className="ub-mark" style={{ color: g.color }}>{URGENT_MARKS[marks]}</span>
                    <span className="ub-title">{task.title}</span>
                  </button>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
