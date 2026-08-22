import { t } from '../../i18n'
import InfoIcon from '../InfoIcon'
import { fill, fmtMins, intervalIn, intervalMeta, pct, type IntervalData, type IntervalKey, type Unit } from './insightsData'

/**
 * Section 1 — the four headline numbers. Every one of them is derived from the
 * same interval slice, so they always tell one consistent story.
 */
export default function CoreStats({ data, ival, unit }: {
  data: IntervalData
  ival: IntervalKey
  unit: Unit
}) {
  const meta = intervalMeta(ival)
  // "All time" has no fixed length — every day count comes off the built window.
  const nDays = data.days.length
  const hasStudy = data.totalMin > 0
  const goalSet = !!data.goalMin && data.goalMin > 0
  const rateShown = goalSet && hasStudy

  return (
    <section className="ins2-card">
      <h2 className="ins2-h2">{t('Core Time Statistics')}</h2>
      <div className="ins2-tiles">
        <div className="ins2-tile">
          <div className="ins2-tile-label">{t('Total study time')}</div>
          <div className="ins2-tile-value">{fmtMins(data.totalMin, unit)}</div>
          <div className="ins2-tile-sub">{t('breaks excluded')} · {t(meta.noun)}</div>
        </div>

        <div className="ins2-tile">
          <div className="ins2-tile-label">
            {t('Daily average')}
            <InfoIcon text={fill(t('Total study time divided by every day in the interval ({n} {days}{extra}), including days with nothing logged.'), { n: nDays, days: t(nDays === 1 ? 'day' : 'days'), extra: ival === 'all' ? t(', counted from your first logged day') : '' })} />
          </div>
          <div className="ins2-tile-value">{fmtMins(data.dailyAvgMin, unit)}</div>
          <div className="ins2-tile-sub">{t('per day')}</div>
        </div>

        <div className="ins2-tile">
          <div className="ins2-tile-label">
            {t('Target achievement rate')}
            {!rateShown && (
              <InfoIcon
                text={
                  !goalSet
                    ? t('Set a daily study goal in the study timer to track this.')
                    : t('No study time recorded in this interval.')
                }
              />
            )}
          </div>
          <div className={`ins2-tile-value ${rateShown ? '' : 'na'}`}>
            {rateShown ? `${pct(data.goalDays, nDays)} %` : t('n/a %')}
          </div>
          <div className="ins2-tile-sub">
            {rateShown
              ? fill(t('{done} of {total} {days} hit {goal}'), { done: data.goalDays, total: nDays, days: t(nDays === 1 ? 'day' : 'days'), goal: fmtMins(data.goalMin ?? 0, unit) })
              : t('days meeting the daily goal')}
          </div>
        </div>

        <div className="ins2-tile">
          <div className="ins2-tile-label">
            {t('Maximum continuous focus')}
            <InfoIcon text={t('The longest stretch studied without pausing. Breaks end a stretch; switching class mid-session does not.')} />
          </div>
          <div className="ins2-tile-value">{hasStudy ? fmtMins(data.maxFocusMin, unit) : '—'}</div>
          <div className="ins2-tile-sub">{t('longest unbroken stretch')}</div>
        </div>
      </div>
      {!hasStudy && (
        <div className="ins2-empty">{fill(t('No study time logged {span} — start a session in the study timer.'), { span: intervalIn(ival) })}</div>
      )}
    </section>
  )
}
