import { useState } from 'react'
import { t } from '../../i18n'
import AnkiTracker from '../AnkiTracker'
import InfoIcon from '../InfoIcon'
import StudyHeatmap from './StudyHeatmap'
import { heatmapRangeFor, heatmapRangeNoun } from './heatmapGrid'
import { fill, intervalMeta, type IntervalKey, type Unit } from './insightsData'

/**
 * Section 5 — the two contribution grids, one card and two tabs. The card owns
 * the collapse toggle so neither grid needs a header of its own, and both tabs
 * stay mounted-on-demand so switching keeps each tab's own layout/scope choice.
 *
 * Neither grid picks its own span any more: the card derives one range from the
 * page's interval and hands it to both, so the heatmaps and every chart below
 * them are always talking about the same stretch of time. The per-tab
 * customisations — strip vs. months, the class scope, the deck filter, the Anki
 * log row — are untouched by this and stay local to their tab.
 */

const TABS: { key: Tab; label: string }[] = [
  { key: 'study', label: '▦ Study time' },
  { key: 'anki', label: '▦ Anki reviews' },
]

type Tab = 'study' | 'anki'

export default function HeatmapsCard({ ival, unit }: { ival: IntervalKey; unit: Unit }) {
  const [tab, setTab] = useState<Tab>('study')
  const [open, setOpen] = useState(true)

  const range = heatmapRangeFor(ival)
  const note =
    fill(t('Both grids follow the interval chosen at the top of the page — "{ival}" shows {span}.'),
      { ival: t(intervalMeta(ival).label), span: heatmapRangeNoun(range) }) + ' ' +
    t('Past day and Past week share the 30-day grid, since a heatmap of a single day would be one square. Layout, class scope and deck filter are per-tab and stay where you left them.')

  return (
    <section className="ins2-card">
      <div className="ins2-card-head">
        <button type="button" className="ins2-collapse" onClick={() => setOpen((o) => !o)}
          title={t(open ? 'Collapse' : 'Expand')} aria-label={t(open ? 'Collapse' : 'Expand')}>
          <span className="ins2-collapse-glyph">{open ? '⊖' : '⊕'}</span>
        </button>
        <h2 className="ins2-h2">{t('Heatmaps')}</h2>
        <InfoIcon text={note} />
        {open && (
          <div className="ins2-tabs" role="tablist">
            {TABS.map((tb) => (
              <button key={tb.key} type="button" role="tab" aria-selected={tab === tb.key}
                className={tab === tb.key ? 'active' : ''} onClick={() => setTab(tb.key)}>
                {t(tb.label)}
              </button>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="ins2-tabpane">
          {tab === 'study'
            ? <StudyHeatmap unit={unit} range={range} />
            : <AnkiTracker mode="tab" range={range} />}
        </div>
      )}
    </section>
  )
}
