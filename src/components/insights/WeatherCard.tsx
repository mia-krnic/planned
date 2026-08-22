import { useMemo } from 'react'
import { t } from '../../i18n'
import { useStore } from '../../store'
import InfoIcon from '../InfoIcon'
import { WEATHER_LABEL, WeatherGlyph } from '../daylog/glyphs'
import { heatmapRangeNoun, type HeatmapRange } from './heatmapGrid'
import { fill, intervalMeta, pct, type IntervalKey } from './insightsData'
import { journalSpan, weatherSummary } from './journalData'

/**
 * Section 10 — what the weather did over the span.
 *
 * A plain frequency list, commonest first, on the same bar rows the break-tag
 * breakdown uses. `DayLog.weather` is stored as an array purely so older records
 * still load; the log records ONE weather per day, so only element [0] is read
 * and the counts add up to the number of days marked.
 */
export default function WeatherCard({ ival, range }: { ival: IntervalKey; range: HeatmapRange }) {
  const { state } = useStore()

  const days = useMemo(() => journalSpan(state, range), [state, range])
  const summary = useMemo(() => weatherSummary(state, days), [state, days])

  const note =
    fill(t('How often each kind of weather was marked over {span} — the span follows the interval at the top of the page ("{ival}").'),
      { span: heatmapRangeNoun(range), ival: t(intervalMeta(ival).label) }) + ' ' +
    t('The daily log records one weather per day, so every marked day falls in exactly one row and the counts add up to the number of days marked. Days with no weather set are not counted at all.')

  return (
    <section className="ins2-card">
      <div className="ins2-card-head">
        <h2 className="ins2-h2">{t('Weather')}</h2>
        <InfoIcon text={note} />
      </div>

      {summary.total === 0 ? (
        <div className="ins2-empty">
          {t("No weather marked in this range yet — pick a day's weather in the daily log to fill this in.")}
        </div>
      ) : (
        <>
          <div className="ins2-weather-sum">
            <b>{summary.total}</b> {fill(t('{days} marked of {n}'), { days: t(summary.total === 1 ? 'day' : 'days'), n: days.length })}
          </div>
          <div className="ins2-bars">
            {summary.rows.map((r) => (
              <div key={r.kind} className="ins2-bar-row ins2-weather-row">
                <span className="ins2-bar-label">
                  <span className="ins2-weather-glyph"><WeatherGlyph kind={r.kind} size={14} /></span>
                  {t(WEATHER_LABEL[r.kind])}
                </span>
                <span className="ins2-bar-track">
                  <span className="ins2-bar-fill" style={{ width: `${(r.count / summary.max) * 100}%` }} />
                </span>
                <span className="ins2-bar-num">
                  {r.count}× · {pct(r.count, summary.total)}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
