import { useRef, useState } from 'react'
import { useUI } from '../App'
import { exportBackup, importBackup } from '../api/backup'
import { clearFiles } from '../api/files'
import { t } from '../i18n'
import { blankState, exampleState, groupedClasses, migrate, useStore } from '../store'
import type { Birthday, ClassFolder, ClassInfo } from '../types'
import { BIRTHDAY_CAL_ID } from '../types'
import { PERSONAL_COLOR } from '../utils/color'
import BirthdayPopover, { GiftMark } from './modals/BirthdayPopover'
import { parseIcs } from '../utils/ics'
import { allowDrop, getDragPayload, isDragKind, setDragPayload } from '../utils/dnd'
import ExamCountdown from './ExamCountdown'
import MiniMonth from './MiniMonth'
import PaletteBundles from './PaletteBundles'

interface Props {
  anchor: string
  setAnchor: (iso: string) => void
}

/**
 * A row takes the drop itself — keeps the folder group behind it from lighting
 * up. A folder drag is never about one class row, so it falls through to the
 * folder block behind, which reorders folders.
 */
function overRow(e: React.DragEvent) {
  if (isDragKind(e, 'folder')) return
  e.preventDefault()
  e.stopPropagation()
}

/**
 * A folder and its classes as one drop target: a class dropped anywhere in the
 * block — heading, a gap, below the last class — joins the folder. The rows
 * inside stop propagation, so dropping on one still inserts at that position.
 * A *folder* dragged over the same block means something else entirely (insert
 * that folder above this one), so the two kinds get different affordances: the
 * block lights up for a class, a line above it for a folder.
 */
function FolderGroup({ self, onDropHere, children }: {
  /** True while this very folder is the one being dragged (no self-indicator). */
  self?: boolean
  onDropHere: (e: React.DragEvent) => void
  children: React.ReactNode
}) {
  const [over, setOver] = useState<'into' | 'before' | null>(null)
  return (
    <div className={`cal-folder-group${over === 'into' ? ' drop-into' : ''}${over === 'before' ? ' folder-drop-above' : ''}`}
      onDragOver={(e) => {
        allowDrop(e)
        const next = isDragKind(e, 'folder') ? (self ? null : 'before') : 'into'
        if (over !== next) setOver(next)
      }}
      onDragLeave={() => setOver(null)}
      onDrop={(e) => { setOver(null); onDropHere(e) }}>
      {children}
    </div>
  )
}

/** Mini month + per-class calendar visibility toggles. */
export default function SidebarLeft({ anchor, setAnchor }: Props) {
  const { state, dispatch } = useStore()
  const ui = useUI()
  const importRef = useRef<HTMLInputElement>(null)
  const icsRef = useRef<HTMLInputElement>(null)
  const [addingFolder, setAddingFolder] = useState(false)
  const [newFolder, setNewFolder] = useState('')
  const [renamingFolder, setRenamingFolder] = useState<{ id: string; name: string } | null>(null)
  // The folder currently being dragged (drives the "move to the end" strip).
  const [dragFolder, setDragFolder] = useState<string | null>(null)
  const [overEnd, setOverEnd] = useState(false)
  // The Birthdays row's ＋ / ✎ popup, anchored at the click.
  const [bdayPop, setBdayPop] = useState<{ x: number; y: number; init?: Birthday | null; browse?: boolean } | null>(null)

  const submitFolder = () => {
    const name = newFolder.trim()
    if (name) dispatch({ type: 'addFolder', name })
    setNewFolder('')
    setAddingFolder(false)
  }

  const onImportFile = async (file: File | undefined) => {
    if (!file) return
    if (!window.confirm(t('Importing a backup replaces ALL current data. Continue?'))) return
    try {
      const restored = await importBackup(file)
      // An imported backup is real user data — never auto-replaced by a reseed.
      dispatch({ type: 'replaceState', state: { ...migrate(restored), userOwned: true } })
    } catch (err) {
      window.alert(`${t('Import failed')}: ${err instanceof Error ? err.message : err}`)
    }
  }

  /** Static .ics import: parse here, review + assign in the modal. */
  const onIcsFile = async (file: File | undefined) => {
    if (!file) return
    const events = parseIcs(await file.text())
    if (!events.length) {
      window.alert(t("No events found in that file — are you sure it's an .ics calendar?"))
      return
    }
    ui.openStaticImport({ events, fileName: file.name })
  }

  const row = (id: string, name: string, color: string, editable: boolean) => {
    const hidden = state.hiddenCalendars.includes(id)
    return (
      <div key={id} className={`cal-row ${hidden ? 'hidden-cal' : ''}`}
        onClick={() => dispatch({ type: 'toggleCalendar', id })}>
        <span className="swatch" style={{ background: hidden ? 'var(--border-strong)' : color }}>
          {hidden ? '' : '✓'}
        </span>
        <span className="name">{name}</span>
        {editable && (
          <button
            className="edit-btn"
            title={t('Edit class')}
            onClick={(e) => {
              e.stopPropagation()
              ui.openClass({ cls: state.classes.find((c) => c.id === id) })
            }}
          >✎</button>
        )}
      </div>
    )
  }

  const classRow = (c: ClassInfo, inFolder: boolean) => {
    const hidden = state.hiddenCalendars.includes(c.id)
    return (
      <div key={c.id} className={`cal-row ${hidden ? 'hidden-cal' : ''} ${inFolder ? 'in-folder' : ''}`}
        draggable
        onDragStart={(e) => setDragPayload(e, { kind: 'class', id: c.id })}
        onDragOver={overRow}
        onDrop={(e) => {
          const p = getDragPayload(e)
          if (p?.kind !== 'class') return
          e.stopPropagation()
          if (p.id !== c.id) {
            dispatch({ type: 'moveClass', id: p.id, folderId: c.folderId ?? null, beforeClassId: c.id })
          }
        }}
        onClick={() => dispatch({ type: 'toggleCalendar', id: c.id })}>
        <span className="swatch" style={{ background: hidden ? 'var(--border-strong)' : c.color }}>
          {hidden ? '' : '✓'}
        </span>
        <span className="name">{c.name}</span>
        <button className="edit-btn" title={t('Edit class')}
          onClick={(e) => { e.stopPropagation(); ui.openClass({ cls: c }) }}>✎</button>
      </div>
    )
  }

  const dropInFolder = (f: ClassFolder) => (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const p = getDragPayload(e)
    setDragFolder(null)
    if (p?.kind === 'class') dispatch({ type: 'moveClass', id: p.id, folderId: f.id })
    if (p?.kind === 'folder' && p.id !== f.id) dispatch({ type: 'reorderFolder', id: p.id, beforeId: f.id })
  }

  const folderRow = (f: ClassFolder, classes: ClassInfo[]) => (
    <FolderGroup key={f.id} self={dragFolder === f.id} onDropHere={dropInFolder(f)}>
      <div className="cal-row folder-row"
        draggable
        onDragStart={(e) => { setDragPayload(e, { kind: 'folder', id: f.id }); setDragFolder(f.id) }}
        onDragEnd={() => { setDragFolder(null); setOverEnd(false) }}
        onClick={() => dispatch({ type: 'toggleFolderCollapse', id: f.id })}>
        <span className={`caret ${f.collapsed ? '' : 'open'}`}>▶</span>
        {renamingFolder?.id === f.id ? (
          <input className="folder-rename" autoFocus value={renamingFolder.name}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setRenamingFolder({ id: f.id, name: e.target.value })}
            onBlur={() => {
              if (renamingFolder.name.trim()) dispatch({ type: 'renameFolder', id: f.id, name: renamingFolder.name.trim() })
              setRenamingFolder(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        ) : (
          <span className="name folder-name">{f.name}</span>
        )}
        <span className="folder-count">{classes.length}</span>
        <button className="edit-btn" title={`${t('Add class to')} ${f.name}`}
          onClick={(e) => { e.stopPropagation(); ui.openClass({ folderId: f.id }) }}>＋</button>
        <button className="edit-btn" title={t('Rename folder')}
          onClick={(e) => { e.stopPropagation(); setRenamingFolder({ id: f.id, name: f.name }) }}>✎</button>
        <button className="edit-btn" title={t('Delete folder (classes stay)')}
          onClick={(e) => {
            e.stopPropagation()
            if (window.confirm(`${t('Delete folder')} "${f.name}"? ${t('Its classes stay, just unfoldered.')}`)) {
              dispatch({ type: 'deleteFolder', id: f.id })
            }
          }}>🗑</button>
      </div>
      {!f.collapsed && classes.map((c) => classRow(c, true))}
    </FolderGroup>
  )

  return (
    <div className="sidebar-left">
      <MiniMonth anchor={anchor} onSelect={setAnchor} />
      <ExamCountdown />

      <div className="cal-list">
        <div className="cal-list-head">
          <h3>{t('My calendars')}</h3>
          <span className="spacer" />
          <button className="head-icon" title={t('Add calendar')} onClick={() => ui.openCalendar({})}>＋</button>
        </div>
        {row('personal', t('Personal'), PERSONAL_COLOR, false)}
        {/* Built-in Birthdays calendar: ＋ adds one, ✎ browses what's there.
            Both open the same little popup (see BirthdayPopover). */}
        {(() => {
          const hidden = state.hiddenCalendars.includes(BIRTHDAY_CAL_ID)
          return (
            <div className={`cal-row ${hidden ? 'hidden-cal' : ''}`}
              onClick={() => dispatch({ type: 'toggleCalendar', id: BIRTHDAY_CAL_ID })}>
              <span className="swatch bday-swatch" style={hidden ? { background: 'var(--border-strong)' } : undefined}>
                {hidden ? '' : <GiftMark size={11} />}
              </span>
              <span className="name">{t('Birthdays')}</span>
              <button className="edit-btn" title={t('Add a birthday')}
                onClick={(e) => { e.stopPropagation(); setBdayPop({ x: e.clientX, y: e.clientY }) }}>＋</button>
              <button className="edit-btn" title={t('Edit birthdays')}
                onClick={(e) => { e.stopPropagation(); setBdayPop({ x: e.clientX, y: e.clientY, browse: true }) }}>✎</button>
            </div>
          )
        })()}
        <div className={`cal-row ${state.showTasksOnCalendar ? '' : 'hidden-cal'}`}
          onClick={() => dispatch({ type: 'toggleTasksOnCalendar' })}>
          <span className="swatch" style={{ background: state.showTasksOnCalendar ? 'var(--accent)' : 'var(--border-strong)' }}>
            {state.showTasksOnCalendar ? '✓' : ''}
          </span>
          <span className="name">{t('Tasks')}</span>
        </div>
        {state.customCalendars.map((c) => (
          <div key={c.id} className={`cal-row ${state.hiddenCalendars.includes(c.id) ? 'hidden-cal' : ''}`}
            onClick={() => dispatch({ type: 'toggleCalendar', id: c.id })}>
            <span className="swatch" style={{ background: state.hiddenCalendars.includes(c.id) ? 'var(--border-strong)' : c.color }}>
              {state.hiddenCalendars.includes(c.id) ? '' : '✓'}
            </span>
            <span className="name">{c.name}</span>
            <button className="edit-btn" title={t('Edit calendar')}
              onClick={(e) => { e.stopPropagation(); ui.openCalendar({ cal: c }) }}>✎</button>
          </div>
        ))}
      </div>

      <div className="cal-list">
        <div className="cal-list-head"
          // Unfoldering target for classes only — folders have nowhere to go here.
          onDragOver={(e) => { if (!isDragKind(e, 'folder')) allowDrop(e) }}
          onDrop={(e) => {
            const p = getDragPayload(e)
            if (p?.kind === 'class') dispatch({ type: 'moveClass', id: p.id, folderId: null })
          }}
          title={t('Drop a class here to remove it from its folder')}>
          <h3>{t('Classes')}</h3>
          <span className="spacer" />
          <PaletteBundles />
          <button className="head-icon" title={t('Add class')} onClick={() => ui.openClass({})}>＋</button>
          <button className="head-icon" title={t('Add folder')} onClick={() => setAddingFolder(true)}>
            <svg width="15" height="13" viewBox="0 0 15 13" aria-hidden="true">
              <path d="M1.5 2.5 h4 l1.5 1.7 h6.5 a1 1 0 0 1 1 1 v6.3 a1 1 0 0 1 -1 1 h-12 a1 1 0 0 1 -1 -1 v-8 a1 1 0 0 1 1 -1 z"
                fill="none" stroke="currentColor" strokeWidth="1.3" />
              <path d="M7.5 6.2 v3.6 M5.7 8 h3.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {addingFolder && (
          <input className="folder-rename" autoFocus value={newFolder} placeholder={t('Folder name…')}
            onChange={(e) => setNewFolder(e.target.value)}
            onBlur={submitFolder}
            onKeyDown={(e) => e.key === 'Enter' && submitFolder()} />
        )}
        {groupedClasses(state).map((g) =>
          g.folder === null ? g.classes.map((c) => classRow(c, false)) : folderRow(g.folder, g.classes),
        )}
        {/* "Insert above" alone can never make a folder last, so a target for
            the end of the list appears for the duration of a folder drag. */}
        {dragFolder != null && state.folders.length > 1 && (
          <div className={`folder-drop-end${overEnd ? ' over' : ''}`}
            onDragOver={(e) => { if (!isDragKind(e, 'folder')) return; allowDrop(e); if (!overEnd) setOverEnd(true) }}
            onDragLeave={() => setOverEnd(false)}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setOverEnd(false)
              setDragFolder(null)
              const p = getDragPayload(e)
              if (p?.kind === 'folder') dispatch({ type: 'reorderFolder', id: p.id, beforeId: null })
            }}>{t('Move to the end')}</div>
        )}
      </div>

      <div className="cal-list backup-block">
        <h3>{t('Backup')}</h3>

        <div className="backup-label">{t('Calendars')}</div>
        <div className="backup-row">
          <button className="backup-btn" title={t('Import live ICS')} onClick={() => ui.openLiveIcs()}>
            <span className="backup-glyph">⇣</span>{t('Live ICS')}
          </button>
          <button className="backup-btn" title={t('Import ICS file')} onClick={() => icsRef.current?.click()}>
            <span className="backup-glyph">⇣</span>{t('ICS file')}
          </button>
        </div>
        <input
          ref={icsRef} type="file" accept=".ics,text/calendar" hidden
          onChange={(e) => {
            void onIcsFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />

        <div className="backup-label">{t('App data')}</div>
        <div className="backup-row">
          <button className="backup-btn" title={t('Export data')} onClick={() => void exportBackup(state)}>
            <span className="backup-glyph">⬇</span>{t('Export')}
          </button>
          <button className="backup-btn" title={t('Import data')} onClick={() => importRef.current?.click()}>
            <span className="backup-glyph">⬆</span>{t('Import')}
          </button>
        </div>
        <input
          ref={importRef} type="file" accept="application/json,.json" hidden
          onChange={(e) => {
            void onImportFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />

        <button
          className="backup-btn"
          title={t('Replace everything with the example data')}
          onClick={() => {
            if (!window.confirm(t('Load the example data? Everything currently here is replaced — export a backup first if you might want it back.'))) return
            void clearFiles()
            dispatch({ type: 'replaceState', state: exampleState() })
          }}
        ><span className="backup-glyph">↻</span>{t('Example data')}</button>
        <button
          className="backup-btn backup-danger"
          title={t('Delete all data')}
          onClick={() => {
            if (!window.confirm(t('Are you sure you want to clear all data? This removes every event, task, project, class and binder file. Export a backup first if you might want it back.'))) return
            void clearFiles()
            dispatch({ type: 'replaceState', state: blankState(state.theme) })
          }}
        ><span className="backup-glyph">✕</span>{t('Delete all data')}</button>
      </div>

      {bdayPop && (
        <BirthdayPopover x={bdayPop.x} y={bdayPop.y} init={bdayPop.init} browse={bdayPop.browse}
          onClose={() => setBdayPop(null)} />
      )}
    </div>
  )
}
