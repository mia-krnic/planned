import { useMemo, useState } from 'react'
import { t } from '../../i18n'
import { useStore } from '../../store'
import InfoIcon from '../InfoIcon'
import { todayISO } from '../../utils/date'
import { MOOD_LABEL, MOOD_LEVELS, MoodFace, type MoodLevel } from '../daylog/glyphs'
import { heatmapRangeNoun, monthChunks, monthLabels, weekColumns, type HeatmapRange } from './heatmapGrid'
import { fill, intervalMeta, type IntervalKey } from './insightsData'
import { MOOD_COLOR, dayLabel, journalSpan, moodStats } from './journalData'

/**
 * Section 6 — how the days felt, on the study heatmap's own grid.
 *
 * Same Sunday-first columns, same 13px pitch, same Strip/Months layout toggle
 * and the same span-follows-the-page-interval rule as StudyHeatmap, so the two
 * grids read as one family. The one deliberate difference is the cell: mood is
 * a five-point scale, not a magnitude, so an opacity ramp would be a lie. Each
 * logged day draws the mood's own little face in the mood's own colour instead,
 * and days with no mood keep the plain empty cell.
 */

type Layout = 'strip' | 'months'

export default function MoodHeatmap({ ival, range }: { ival: IntervalKey; range: HeatmapRange }) {
  const { state } = useStore()
  const today = todayISO()
  const [layout, setLayout] = useState<Layout>('strip')

  const days = useMemo(() => journalSpan(state, range), [state, range])
  const stats = useMemo(() => moodStats(state, days), [state, days])

  const note =
    fill(t('One cell per day over {span} — the span follows the interval chosen at the top of the page ("{ival}").'),
      { span: heatmapRangeNoun(range), ival: t(intervalMeta(ival).label) }) + ' ' +
    t("A day you rated draws that mood's face in its own colour; a day with no mood recorded stays an empty cell, and is never counted as an average day. Mood is set in the daily log under each day.")

  const tooltip = (iso: string, lvl: MoodLevel | undefined) =>
    lvl ? `${dayLabel(iso)} — ${t(MOOD_LABEL[lvl])}` : `${dayLabel(iso)} — ${t('no mood logged')}`

  const cell = (iso: string | null, key: string) => {
    if (!iso) return <span key={key} className="ak-cell blank" />
    const lvl = stats.byDay.get(iso)
    if (!lvl) {
      return <span key={key} className={`ak-cell ${iso === today ? 'today' : ''}`} title={tooltip(iso, undefined)} />
    }
    return (
      <span key={key} className={`ak-cell ins2-mood-cell ${iso === today ? 'today' : ''}`}
        title={tooltip(iso, lvl)} style={{ color: MOOD_COLOR[lvl] }}>
        <MoodFace level={lvl} size={11} />
      </span>
    )
  }

  const weeks = weekColumns(days)
  const labels = monthLabels(weeks)
  const months = monthChunks(days)

  return (
    <section className="ins2-card">
      <div className="ins2-card-head">
        <h2 className="ins2-h2">{t('Mood')}</h2>
        <InfoIcon text={note} />
      </div>

      <div className="ins2-hm">
        <div className="ak-stats">
          <div className="ak-stat">
            <b>{stats.logged}</b><span>{t('days rated')}</span>
          </div>
          <div className="ak-stat">
            <b>{stats.logged ? stats.avg.toFixed(1) : '—'}</b><span>{t('avg mood')}</span>
          </div>
          <div className="ak-stat">
            <b>{stats.top ? t(MOOD_LABEL[stats.top]) : '—'}</b><span>{t('most often')}</span>
          </div>
        </div>

        <div className="ak-controls">
          <div className="ak-pills right">
            <button type="button" className={layout === 'strip' ? 'active' : ''}
              title={t('Continuous strip')} onClick={() => setLayout('strip')}>{t('▤ Strip')}</button>
            <button type="button" className={layout === 'months' ? 'active' : ''}
              title={t('Separate month blocks')} onClick={() => setLayout('months')}>{t('▥ Months')}</button>
          </div>
        </div>

        <div className="ak-scroll">
          {layout === 'strip' ? (
            <div className="ak-strip">
              <div className="ak-dows">
                <span />{['Mon', 'Wed', 'Fri'].map((d) => <span key={d}>{t(d)}</span>)}
              </div>
              <div className="ak-cols">
                <div className="ak-months" style={{ gridTemplateColumns: `repeat(${weeks.length}, 13px)` }}>
                  {labels.map((l, i) => <span key={i}>{l}</span>)}
                </div>
                <div className="ak-grid" style={{ gridTemplateColumns: `repeat(${weeks.length}, 13px)` }}>
                  {weeks.map((wk, wi) => wk.map((iso, di) => cell(iso, `${wi}-${di}`)))}
                </div>
              </div>
            </div>
          ) : (
            <div className="ak-months-wrap">
              {months.map((m) => (
                <div key={m.key} className="ak-month">
                  <div className="ak-month-label">{m.label}</div>
                  <div className="ak-grid" style={{ gridTemplateColumns: `repeat(${m.weeks.length}, 13px)` }}>
                    {m.weeks.map((wk, wi) => wk.map((iso, di) => cell(iso, `${wi}-${di}`)))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* The legend doubles as the distribution: every face carries its own
            count for the span, so the grid needs no separate bar chart. */}
        <div className="ins2-mood-legend">
          {MOOD_LEVELS.map((l) => (
            <span key={l} className={`ins2-mood-key ${stats.counts[l] ? '' : 'zero'}`}
              title={`${t(MOOD_LABEL[l])} — ${stats.counts[l]} ${t(stats.counts[l] === 1 ? 'day' : 'days')}`}>
              <span className="ins2-mood-key-face" style={{ color: MOOD_COLOR[l] }}>
                <MoodFace level={l} size={15} />
              </span>
              <b>{stats.counts[l]}</b>
            </span>
          ))}
        </div>

        {stats.logged === 0 && (
          <div className="ins2-empty">
            {t('No moods logged in this range yet — tap a face in the daily log and the grid fills in.')}
          </div>
        )}
      </div>
    </section>
  )
}
