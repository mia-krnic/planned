import { t } from '../../i18n'
import InfoIcon from '../InfoIcon'
import { fill, fmtMins, intervalIn, intervalMeta, pct, type IntervalData, type IntervalKey, type Unit } from './insightsData'

/**
 * Section 4 — the other half of a study session: the pauses.
 *
 * Pomodoro rhythms generate their breaks automatically, so those land in the
 * untagged bucket; only breaks the user tagged when pausing get a category.
 */
export default function BreakAnalytics({ data, ival, unit }: {
  data: IntervalData
  ival: IntervalKey
  unit: Unit
}) {
  const meta = intervalMeta(ival)
  const maxTagMin = Math.max(1, ...data.tagBuckets.map((b) => b.mins))

  return (
    <section className="ins2-card">
      <h2 className="ins2-h2">{t('Break & Distraction Analytics')}</h2>

      <div className="ins2-tiles ins2-tiles-two">
        <div className="ins2-tile">
          <div className="ins2-tile-label">
            {t('Total break duration')}
            <InfoIcon text={t('Time spent paused inside a study session — pomodoro breaks included. This time is never counted as study time.')} />
          </div>
          <div className="ins2-tile-value">{fmtMins(data.breakMin, unit)}</div>
          <div className="ins2-tile-sub">
            {data.totalMin + data.breakMin > 0
              ? `${pct(data.breakMin, data.totalMin + data.breakMin)}% ${t('of time at the desk')}`
              : t(meta.noun)}
          </div>
        </div>

        <div className="ins2-tile">
          <div className="ins2-tile-label">{t('Break frequency')}</div>
          <div className="ins2-tile-value">{data.breakCount}</div>
          <div className="ins2-tile-sub">
            {fill(t('{pauses} {span}'), { pauses: t(data.breakCount === 1 ? 'pause' : 'pauses'), span: intervalIn(ival) })}
          </div>
        </div>

      </div>

      <div className="ins2-sub-head">
        <h3>{t('Break tag categories')}</h3>
        {!data.taggedBreakCount && (
          <InfoIcon text={t('Tag your breaks when pausing the timer to see this breakdown.')} />
        )}
      </div>

      {!data.taggedBreakCount ? (
        <div className="ins2-na-line">{t('n/a')}</div>
      ) : (
        <div className="ins2-bars">
          {data.tagBuckets.map((b) => (
            <div key={b.tag || 'untagged'} className={`ins2-bar-row ${b.tag ? '' : 'untagged'}`}>
              <span className="ins2-bar-label">{b.label}</span>
              <span className="ins2-bar-track">
                <span className="ins2-bar-fill" style={{ width: `${(b.mins / maxTagMin) * 100}%` }} />
              </span>
              <span className="ins2-bar-num">
                {b.count}× · {fmtMins(b.mins, unit)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
