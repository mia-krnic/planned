import { useMemo, useState } from 'react'
import { t } from '../../i18n'
import type { AppState } from '../../types'
import InfoIcon from '../InfoIcon'
import { fill, fmtMins, type Unit } from './insightsData'
import { buildQuarterGrid } from './chartsData'

/**
 * A quarter at a glance: every calendar week of the quarter as one cell,
 * showing the week's start date and the time studied that week.
 *
 * Weeks follow the same weekStart preference as the rest of the app, and a week
 * belongs to the quarter its first day falls in — so the cells tile the year
 * with no week appearing twice. The arrows walk backwards and forwards through
 * quarters without touching the page's interval, which stays on "past week".
 */

const NOTE =
  'Each cell is one calendar week of the quarter — the week-start date, then the time studied across those seven days. Weeks are assigned to the quarter their first day falls in, so a week straddling the boundary is counted once. The highlighted cell is the week containing today; faint cells had no study time.'

export default function QuarterWeeks({ state, unit, nowMin }: {
  state: AppState
  unit: Unit
  nowMin: number
}) {
  const [offset, setOffset] = useState(0)
  const grid = useMemo(() => buildQuarterGrid(state, nowMin, offset), [state, nowMin, offset])

  return (
    <>
      <div className="ins2-sub-head ins2-qt-head">
        <h3>{t('Weeks this quarter')}</h3>
        <InfoIcon text={t(NOTE)} />
        <div className="ins2-qt-nav">
          <button type="button" className="ins2-qt-step" aria-label={t('Previous quarter')}
            onClick={() => setOffset((o) => o - 1)}>‹</button>
          <span className="ins2-qt-label">{grid.label}</span>
          <button type="button" className="ins2-qt-step" aria-label={t('Next quarter')}
            onClick={() => setOffset((o) => o + 1)}>›</button>
        </div>
      </div>

      {!grid.cells.length ? (
        <div className="ins2-empty">{fill(t('No weeks fall inside {quarter}.'), { quarter: grid.label })}</div>
      ) : (
        <>
          <div className="ins2-qt-grid">
            {grid.cells.map((c) => (
              <div
                key={c.start}
                className={`ins2-qt-cell${c.isCurrent ? ' now' : ''}${c.mins <= 0 ? ' zero' : ''}${c.isFuture ? ' future' : ''}`}
                title={`${fill(t('Week of {date}'), { date: c.label.replace(' ~', '') })} — ${fmtMins(c.mins, unit)}`}
              >
                <span className="ins2-qt-week">{c.label}</span>
                <span className="ins2-qt-mins">{c.mins > 0 ? fmtMins(c.mins, unit) : '—'}</span>
              </div>
            ))}
          </div>
          <div className="ins2-qt-total">
            {grid.label} {t('total')} · <strong>{fmtMins(grid.totalMin, unit)}</strong> {fill(t('over {n} weeks'), { n: grid.cells.length })}
          </div>
        </>
      )}
    </>
  )
}
