import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../../store'
import type { AppState } from '../../types'
import { addDays, fromISO, toISO } from '../../utils/date'
import { earliestUserDate } from '../../utils/daylog'
import { homePicks, mantraPool, quotePool, type HomeMantra, type HomeQuote } from '../../data/homePicks'
import { WALLPAPERS, wallpaperUrl } from '../../data/wallpapers'
import { lang, t } from '../../i18n'

/**
 * The Home page's library: everything the page can show, with the user's
 * favourites first, what it has already shown them, and a way to add words of
 * their own.
 *
 * Nothing here is stored history. Because a day's picks are a pure function of
 * its date (see homePicks), the "Recently shown" strip is recomputed by walking
 * backwards from today — no log to keep, and it stays correct for days the user
 * overrode by hand because the override is part of that same function.
 */

export type FavKind = 'wallpapers' | 'quotes' | 'mantras'

/* ---------------- The heart ---------------- */

/**
 * Shared by the page and the library, because the same key has to reach the
 * same list from both. Filled hearts stay visible; empty ones are revealed by
 * hovering their line (CSS) so the page stays quiet until asked.
 */
export function FavHeart({ kind, itemKey, label }: { kind: FavKind; itemKey: string; label: string }) {
  const { state, dispatch } = useStore()
  const on = (state.homeFavs?.[kind] ?? []).includes(itemKey)
  // `label` arrives as English ("this mantra") from both call sites; the verb
  // wraps round it in Chinese instead of bracketing it, so the sentence is
  // written per language rather than assembled from translated halves.
  const what = lang() === 'zh'
    ? (on ? `取消收藏${t(label)}` : `收藏${t(label)}`)
    : (on ? `Remove ${label} from favourites` : `Add ${label} to favourites`)
  return (
    <button
      type="button"
      className={`home-fav${on ? ' on' : ''}`}
      aria-pressed={on}
      title={what}
      aria-label={what}
      onClick={(e) => { e.stopPropagation(); dispatch({ type: 'toggleHomeFav', kind, key: itemKey }) }}
    >
      {on ? '♥' : '♡'}
    </button>
  )
}

/* ---------------- Recently shown ---------------- */

/** Days walked back when the app holds nothing dated to reach back to. */
const FALLBACK_DAYS = 30
/** Hard floor on the walk, so a years-old backup does not turn this into a loop. */
const MAX_DAYS = 730
const HISTORY_CAP = 60

/**
 * The keys this slot has shown, most recent first, de-duplicated. The walk
 * stops early once the cap is full — with 159 wallpapers that is a few months,
 * with twenty mantras it simply runs out of range and returns what there is.
 */
function recentlyShown(state: AppState, today: string, slot: FavKind): string[] {
  const floor = toISO(addDays(fromISO(today), -MAX_DAYS))
  let from = earliestUserDate(state) ?? toISO(addDays(fromISO(today), -FALLBACK_DAYS))
  if (from < floor) from = floor
  if (from > today) from = today

  const seen: string[] = []
  const known = new Set<string>()
  for (let iso = today; iso >= from; iso = toISO(addDays(fromISO(iso), -1))) {
    const p = homePicks(state, iso)
    const key = slot === 'wallpapers' ? p.wallpaper.file : slot === 'mantras' ? p.mantra.text : p.quote.text
    if (!known.has(key)) {
      known.add(key)
      seen.push(key)
      if (seen.length >= HISTORY_CAP) break
    }
  }
  return seen
}

/* ---------------- Pieces ---------------- */

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="hl-section">
      <h3 className="hl-h">
        {title}
        {count != null && <span className="hl-count">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="hl-empty">{text}</p>
}

/* ---------------- The panel ---------------- */

export default function HomeLibrary({ date, onClose }: { date: string; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [tab, setTab] = useState<FavKind>('wallpapers')
  // The key of the item that was just applied, for the brief "applied" flash.
  const [flash, setFlash] = useState<string | null>(null)
  const flashTimer = useRef(0)

  useEffect(() => () => window.clearTimeout(flashTimer.current), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const apply = (patch: { wallpaper?: string; mantra?: string; quote?: string }, key: string) => {
    dispatch({ type: 'setHomeOverride', date, patch })
    setFlash(key)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(null), 900)
  }

  const favs = state.homeFavs?.[tab] ?? []
  const history = useMemo(() => recentlyShown(state, date, tab), [state, date, tab])
  const mantras = useMemo(() => mantraPool(state), [state])
  const quotes = useMemo(() => quotePool(state), [state])

  /* ---- wallpapers ---- */

  const wpCell = (file: string, keySuffix: string) => {
    const known = WALLPAPERS.some((w) => w.file === file)
    if (!known) return null
    return (
      <div className={`hl-wp${flash === file ? ' applied' : ''}`} key={`${keySuffix}-${file}`}>
        <button type="button" className="hl-wp-pick" title={t('Show this today')}
          aria-label={t('Show this wallpaper today')}
          onClick={() => apply({ wallpaper: file }, file)}>
          <img src={wallpaperUrl(file)} alt="" loading="lazy" decoding="async" />
        </button>
        <FavHeart kind="wallpapers" itemKey={file} label="this wallpaper" />
      </div>
    )
  }

  const wpGrid = (files: string[], keySuffix: string) => (
    <div className="hl-wp-grid">{files.map((f) => wpCell(f, keySuffix))}</div>
  )

  /* ---- words ---- */

  const textRow = (
    item: HomeMantra | HomeQuote,
    keySuffix: string,
  ) => {
    const author = 'author' in item ? item.author : undefined
    const kind: FavKind = tab === 'mantras' ? 'mantras' : 'quotes'
    const mine = item.customId
    return (
      <div className={`hl-row${flash === item.text ? ' applied' : ''}`} key={`${keySuffix}-${item.text}`}>
        <button type="button" className="hl-row-pick" title={t('Show this today')}
          onClick={() => apply(kind === 'mantras' ? { mantra: item.text } : { quote: item.text }, item.text)}>
          <span className="hl-row-text">{item.text}</span>
          {author && (
            <span className="hl-row-author">{lang() === 'zh' ? `——${author}` : `— ${author}`}</span>
          )}
          {mine && <span className="hl-mine">{t('yours')}</span>}
        </button>
        <FavHeart kind={kind} itemKey={item.text} label={kind === 'mantras' ? 'this mantra' : 'this quote'} />
        {mine && (
          <button type="button" className="hl-del" title={t('Delete this — it is yours')}
            aria-label={t('Delete')}
            onClick={() => dispatch(
              kind === 'mantras'
                ? { type: 'deleteCustomMantra', id: mine }
                : { type: 'deleteCustomQuote', id: mine },
            )}>
            ×
          </button>
        )}
      </div>
    )
  }

  const pool: (HomeMantra | HomeQuote)[] = tab === 'mantras' ? mantras : quotes
  /** A pool entry by its text, so a favourite/history key regains its author. */
  const byText = (text: string): HomeMantra | HomeQuote => pool.find((p) => p.text === text) ?? { text }

  const textList = (texts: string[], keySuffix: string) => (
    <div className="hl-list">{texts.map((text) => textRow(byText(text), keySuffix))}</div>
  )

  return createPortal(
    <div className="scrim home-lib-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="home-lib" role="dialog" aria-modal="true" aria-label={t('Home library')}>
        <header className="hl-top">
          <div className="hl-tabs" role="tablist">
            {(['wallpapers', 'quotes', 'mantras'] as FavKind[]).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k}
                className={`hl-tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>
                {k === 'wallpapers' ? t('Wallpapers') : k === 'quotes' ? t('Quotes') : t('Mantras')}
              </button>
            ))}
          </div>
          <button type="button" className="hl-close" onClick={onClose} aria-label={t('Close')}>×</button>
        </header>

        <div className="hl-body">
          <Section title={t('Favourites')} count={favs.length}>
            {favs.length === 0
              ? <Empty text={t('Nothing yet — tap a ♡ anywhere to keep it.')} />
              : tab === 'wallpapers' ? wpGrid(favs, 'fav') : textList(favs, 'fav')}
          </Section>

          <Section title={t('Recently shown')}>
            {history.length === 0
              ? <Empty text={t('Nothing shown yet.')} />
              : tab === 'wallpapers'
                ? <div className="hl-wp-strip">{history.map((f) => wpCell(f, 'hist'))}</div>
                : textList(history, 'hist')}
          </Section>

          {tab !== 'wallpapers' && <AddForm kind={tab} />}

          <Section title={t('All')} count={tab === 'wallpapers' ? WALLPAPERS.length : pool.length}>
            {tab === 'wallpapers'
              ? wpGrid(WALLPAPERS.map((w) => w.file), 'all')
              : <div className="hl-list">{pool.map((p) => textRow(p, 'all'))}</div>}
          </Section>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ---------------- Add your own ---------------- */

function AddForm({ kind }: { kind: 'quotes' | 'mantras' }) {
  const { dispatch } = useStore()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [author, setAuthor] = useState('')

  const submit = () => {
    if (!text.trim()) return
    dispatch(kind === 'quotes'
      ? { type: 'addCustomQuote', text, author: author || undefined }
      : { type: 'addCustomMantra', text })
    setText('')
    setAuthor('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button type="button" className="hl-add-open" onClick={() => setOpen(true)}>
        {t('+ Add your own')}
      </button>
    )
  }

  return (
    <form className="hl-add" onSubmit={(e) => { e.preventDefault(); submit() }}>
      <input
        type="text"
        autoFocus
        value={text}
        placeholder={kind === 'quotes' ? t('The quotation') : t('Two to four words')}
        aria-label={kind === 'quotes' ? t('Quotation') : t('Mantra')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
      />
      {kind === 'quotes' && (
        <input
          type="text"
          value={author}
          placeholder={t('Author (optional)')}
          aria-label={t('Author')}
          onChange={(e) => setAuthor(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
        />
      )}
      <button type="submit" className="btn primary" disabled={!text.trim()}>{t('Add')}</button>
      <button type="button" className="btn" onClick={() => setOpen(false)}>{t('Cancel')}</button>
    </form>
  )
}
