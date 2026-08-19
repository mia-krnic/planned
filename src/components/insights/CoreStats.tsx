import InfoIcon from '../InfoIcon'
import { fmtMins, intervalIn, intervalMeta, pct, type IntervalData, type IntervalKey, type Unit } from './insightsData'

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
      <h2 className="ins2-h2">Core Time Statistics</h2>
      <div className="ins2-tiles">
        <div className="ins2-tile">
          <div className="ins2-tile-label">Total study time</div>
          <div className="ins2-tile-value">{fmtMins(data.totalMin, unit)}</div>
          <div className="ins2-tile-sub">breaks excluded · {meta.noun}</div>
        </div>

        <div className="ins2-tile">
          <div className="ins2-tile-label">
            Daily average
            <InfoIcon text={`Total study time divided by every day in the interval (${nDays} ${nDays === 1 ? 'day' : 'days'}${ival === 'all' ? ', counted from your first logged day' : ''}), including days with nothing logged.`} />
          </div>
          <div className="ins2-tile-value">{fmtMins(data.dailyAvgMin, unit)}</div>
          <div className="ins2-tile-sub">per day</div>
        </div>

        <div className="ins2-tile">
          <div className="ins2-tile-label">
            Target achievement rate
            {!rateShown && (
              <InfoIcon
                text={
                  !goalSet
                    ? 'Set a daily study goal in the study timer to track this.'
                    : 'No study time recorded in this interval.'
                }
              />
            )}
          </div>
          <div className={`ins2-tile-value ${rateShown ? '' : 'na'}`}>
            {rateShown ? `${pct(data.goalDays, nDays)} %` : 'n/a %'}
          </div>
          <div className="ins2-tile-sub">
            {rateShown
              ? `${data.goalDays} of ${nDays} ${nDays === 1 ? 'day' : 'days'} hit ${fmtMins(data.goalMin ?? 0, unit)}`
              : 'days meeting the daily goal'}
          </div>
        </div>

        <div className="ins2-tile">
          <div className="ins2-tile-label">
            Maximum continuous focus
            <InfoIcon text="The longest stretch studied without pausing. Breaks end a stretch; switching class mid-session does not." />
          </div>
          <div className="ins2-tile-value">{hasStudy ? fmtMins(data.maxFocusMin, unit) : '—'}</div>
          <div className="ins2-tile-sub">longest unbroken stretch</div>
        </div>
      </div>
      {!hasStudy && (
        <div className="ins2-empty">No study time logged {intervalIn(ival)} — start a session in the study timer.</div>
      )}
    </section>
  )
}
