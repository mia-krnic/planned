import { useMemo, useState } from 'react'
import AmbientWallpaper from '../AmbientWallpaper'
import { t } from '../../i18n'
import { useStore } from '../../store'
import { nowMinutes } from '../../utils/date'
import BreakAnalytics from './BreakAnalytics'
import CoreStats from './CoreStats'
import HeatmapsCard from './HeatmapsCard'
import JournallingCard from './JournallingCard'
import MoodHeatmap from './MoodHeatmap'
import SectionDivider from './SectionDivider'
import SleepChart from './SleepChart'
import SubjectBreakdown from './SubjectBreakdown'
import TimelinePatterns from './TimelinePatterns'
import WaterCard from './WaterCard'
import WeatherCard from './WeatherCard'
import WeeklyMomentum from './WeeklyMomentum'
import { heatmapRangeFor } from './heatmapGrid'
import { INTERVALS, buildIntervalData, intervalMeta, type IntervalKey, type Unit } from './insightsData'

/**
 * Study-time and daily-log analytics.
 *
 * Two controls at the top drive the whole page: the interval (a rolling window
 * ending today) and the unit every duration below is printed in. Everything is
 * derived from state.studySessions and state.dayLogs on the fly — no stored
 * aggregates, so the numbers always match the source, and calendars never enter
 * into it.
 *
 * The page reads as two halves, split by a labelled rule. Above "Journal
 * insights" everything is about time at the desk; below it everything comes from
 * the daily log — mood, sleep, water, journalling, weather. The second half
 * takes its span from the same interval toggle, mapped through `heatmapRangeFor`
 * so a one-day interval still draws a month's worth of cells rather than one.
 */

const UNITS: { key: Unit; label: string }[] = [
  { key: 'hrs', label: 'hrs' },
  { key: 'mins', label: 'mins' },
]

export default function InsightsPage() {
  const { state } = useStore()
  const nowMin = nowMinutes()
  const [ival, setIval] = useState<IntervalKey>('week')
  const [unit, setUnit] = useState<Unit>('hrs')

  const data = useMemo(() => buildIntervalData(state, ival, nowMin), [state, ival, nowMin])
  const meta = intervalMeta(ival)
  // Every journal card covers the same stretch the heatmaps do.
  const jrange = heatmapRangeFor(ival)

  return (
    <div className="insights-page">
      <AmbientWallpaper variant="sides" />
      <div className="ins2-wrap">
        <header className="ins2-head">
          <div className="ins2-title">
            <h1>{t('Insights')}</h1>
            <span className="ins2-sub">{t('Study sessions & daily log')} · {t(meta.noun)}</span>
          </div>
          <div className="ins2-controls">
            <div className="ins2-seg" role="tablist" aria-label={t('Interval')}>
              {INTERVALS.map((i) => (
                <button key={i.key} type="button" role="tab" aria-selected={ival === i.key}
                  className={ival === i.key ? 'active' : ''} onClick={() => setIval(i.key)}>
                  {t(i.label)}
                </button>
              ))}
            </div>
            <div className="ins2-seg ins2-seg-unit" role="tablist" aria-label={t('Duration unit')}>
              {UNITS.map((u) => (
                <button key={u.key} type="button" role="tab" aria-selected={unit === u.key}
                  className={unit === u.key ? 'active' : ''} onClick={() => setUnit(u.key)}
                  title={u.key === 'hrs' ? t('Show durations as hours and minutes') : t('Show durations in minutes')}>
                  {t(u.label)}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* The grids lead: they are the one view of the whole span at a glance,
            and they take their range from the interval toggle right above. */}
        <HeatmapsCard ival={ival} unit={unit} />
        <SectionDivider label={t('Productivity insights')} note={t('Study sessions & time at the desk')} />
        <CoreStats data={data} ival={ival} unit={unit} />
        <SubjectBreakdown state={state} data={data} ival={ival} unit={unit} />
        {/* Calendar-week card — only meaningful next to the 7-day interval. It sits
            below the breakdown so its height never buries the sections every
            interval shares (the user read that as "breakdown missing in week"). */}
        {ival === 'week' && <WeeklyMomentum state={state} unit={unit} nowMin={nowMin} />}
        <TimelinePatterns state={state} data={data} ival={ival} unit={unit} />
        <BreakAnalytics data={data} ival={ival} unit={unit} />

        {/* Second half: everything below comes from the daily log, not the timer. */}
        <SectionDivider label={t('Journal insights')} note={t('From your daily log')} />
        <MoodHeatmap ival={ival} range={jrange} />
        <SleepChart ival={ival} range={jrange} />
        <WaterCard ival={ival} range={jrange} />
        <JournallingCard ival={ival} range={jrange} />
        <WeatherCard ival={ival} range={jrange} />
      </div>
    </div>
  )
}
