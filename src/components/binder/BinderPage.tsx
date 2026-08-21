import { useState } from 'react'
import { useUI } from '../../App'
import { folderNameOf, groupedClasses, uid, useStore } from '../../store'
import type { BinderPost, BinderSection, BinderUpload, ClassInfo, ClassMeta, ID } from '../../types'
import { hexToRgba } from '../../utils/color'
import { fmtFriendly } from '../../utils/date'
import { allowDrop, getDragPayload, isDragKind, setDragPayload } from '../../utils/dnd'
import AmbientWallpaper from '../AmbientWallpaper'
import { ProjectNode } from '../ProjectTree'
import FileChip from './FileChip'
import GradesTab from './GradesTab'
import UploadModal, { type UploadModalInit } from './UploadModal'

/**
 * "My binder": per-class pages for posts, notes, handouts and resources.
 * A collapsible class sidebar switches between classes; each class page has a
 * Stream tab (everything chronological, Classroom-style) and a Collation tab
 * (the customisable sections system).
 */

/**
 * Chrome does not reliably initiate HTML5 drags on form controls (button/input),
 * so draggable rows/cards are rendered as `<div role="button">` instead. That
 * means a drag that ends over the element would otherwise also fire its click
 * handler (navigation/selection) — this module-level flag suppresses exactly
 * one click right after a drag completes.
 */
let suppressClickAfterDrag = false
function markDragStart() {
  suppressClickAfterDrag = true
}
function markDragEnd() {
  // Let the click event (which fires after dragend on the same interaction)
  // observe the flag before we clear it on a subsequent, unrelated click.
  setTimeout(() => { suppressClickAfterDrag = false }, 0)
}
function guardedClick(fn: () => void) {
  if (suppressClickAfterDrag) {
    suppressClickAfterDrag = false
    return
  }
  fn()
}

/**
 * A row/card takes the drop itself — keeps the group behind it from lighting
 * up. A folder drag is never about one class, so it falls through to the group
 * behind, which reorders folders.
 */
function overRow(e: React.DragEvent) {
  if (isDragKind(e, 'folder')) return
  e.preventDefault()
  e.stopPropagation()
}

/**
 * Cards in the PINNED box are second copies of classes that also live in a
 * folder group, so the box has no meaningful folder/order of its own: a drop
 * landing on one is swallowed rather than turned into a move. (The box is not
 * wrapped in a DropGroup either, so nothing behind it takes the drop.) The
 * copies stay *draggable* — dragging either copy moves the one real class.
 */
function swallowDrop(e: React.DragEvent) {
  e.preventDefault()
  e.stopPropagation()
}

/**
 * A whole class group — folder heading, its rows/cards and the whitespace
 * around them — as one drop target: a class dropped anywhere but on another
 * class joins the group at the end. Rows and cards stop propagation, so a drop
 * on one of them still inserts at that exact position.
 */
function DropGroup({ className, folder, self, onDropHere, children }: {
  className: string
  /** False for the unfoldered group: it has no folder, so folders can't land there. */
  folder?: boolean
  /** True while this very folder is the one being dragged (no self-indicator). */
  self?: boolean
  onDropHere: (e: React.DragEvent) => void
  children: React.ReactNode
}) {
  const [over, setOver] = useState<'into' | 'before' | null>(null)
  return (
    <div className={`${className}${over === 'into' ? ' drop-into' : ''}${over === 'before' ? ' folder-drop-above' : ''}`}
      onDragOver={(e) => {
        // A folder dragged over a group means "insert above this folder", so it
        // gets a line rather than the class-into-folder block highlight.
        if (isDragKind(e, 'folder')) {
          if (!folder) return // nowhere to insert: not a valid drop
          allowDrop(e)
          const next = self ? null : 'before'
          if (over !== next) setOver(next)
          return
        }
        allowDrop(e)
        if (over !== 'into') setOver('into')
      }}
      onDragLeave={() => setOver(null)}
      onDrop={(e) => { setOver(null); onDropHere(e) }}>
      {children}
    </div>
  )
}

export default function BinderPage() {
  const { state, dispatch } = useStore()
  const ui = useUI()
  const [openClassId, setOpenClassId] = useState<ID | null>(null)
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [navPinOpen, setNavPinOpen] = useState(true)
  const [indexPinOpen, setIndexPinOpen] = useState(true)
  // The folder being dragged (drives the "move to the end" strip).
  const [dragFolder, setDragFolder] = useState<ID | null>(null)
  const [overEnd, setOverEnd] = useState(false)

  const openClass = state.classes.find((c) => c.id === openClassId) ?? null
  const pinnedBinder = state.classes.filter((c) => c.pinnedBinder)
  const groups = groupedClasses(state, true)

  const dropOnClass = (target: ClassInfo) => (e: React.DragEvent) => {
    const p = getDragPayload(e)
    if (p?.kind !== 'class') return // a folder drag: the group behind takes it
    e.preventDefault()
    e.stopPropagation()
    if (p.id !== target.id) {
      dispatch({ type: 'moveClass', id: p.id, folderId: target.folderId ?? null, beforeClassId: target.id })
    }
  }
  /** Drop anywhere in a group (heading, whitespace, past the last card): append. */
  const dropOnFolder = (folderId: ID | null) => (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const p = getDragPayload(e)
    setDragFolder(null)
    if (p?.kind === 'class') dispatch({ type: 'moveClass', id: p.id, folderId })
    if (p?.kind === 'folder' && folderId && p.id !== folderId) {
      dispatch({ type: 'reorderFolder', id: p.id, beforeId: folderId })
    }
  }
  /** Drag handlers shared by both folder headings (nav rail and large view). */
  const folderDrag = (id: ID) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { markDragStart(); setDragPayload(e, { kind: 'folder', id }); setDragFolder(id) },
    onDragEnd: () => { markDragEnd(); setDragFolder(null); setOverEnd(false) },
  })

  /**
   * A binder-pinned class that lives in a folder is listed TWICE: in the pinned
   * box and again in its folder's group, so browsing the folder finds it there.
   * One with no folder would gain nothing from a second copy (there is no group
   * to find it in), so it stays only in the pinned box.
   */
  const showInGroup = (c: ClassInfo) => !c.pinnedBinder || !!c.folderId

  const navClassRow = (c: ClassInfo, opts?: { hint?: boolean; indent?: boolean; noDrop?: boolean }) => (
    <div key={c.id} role="button" tabIndex={0}
      className={`binder-nav-row ${openClassId === c.id ? 'active' : ''} ${opts?.indent ? 'in-folder' : ''}`}
      title={c.name} draggable
      onDragStart={(e) => { markDragStart(); setDragPayload(e, { kind: 'class', id: c.id }) }}
      onDragEnd={markDragEnd}
      onDragOver={overRow}
      onDrop={opts?.noDrop ? swallowDrop : dropOnClass(c)}
      onClick={() => guardedClick(() => setOpenClassId(c.id))}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpenClassId(c.id)}>
      <span className="swatch" style={{ background: c.color }} />
      {!navCollapsed && (
        <>
          <span className="name">{c.name}</span>
          {opts?.hint && folderNameOf(state, c) && <span className="folder-hint">{folderNameOf(state, c)}</span>}
        </>
      )}
    </div>
  )

  return (
    <div className="binder-layout">
      <div className={`binder-nav ${navCollapsed ? 'collapsed' : ''}`}>
        <button className="binder-nav-toggle" title={navCollapsed ? 'Expand class list' : 'Collapse class list'}
          onClick={() => setNavCollapsed((c) => !c)}>
          {navCollapsed ? '»' : '«'}
        </button>
        <button className={`binder-nav-row ${openClassId === null ? 'active' : ''}`}
          title="All classes" onClick={() => setOpenClassId(null)}>
          <span className="swatch" style={{ background: 'var(--text-faint)' }}>≡</span>
          {!navCollapsed && <span className="name">All classes</span>}
        </button>

        {/* Pinned to the top of the binder (kept even when foldered) */}
        {pinnedBinder.length > 0 &&
          (navCollapsed ? (
            pinnedBinder.map((c) => navClassRow(c, { hint: true, noDrop: true }))
          ) : (
            <div className="pin-box compact">
              <div className="pin-box-head" onClick={() => setNavPinOpen((v) => !v)}>
                <span className={`caret ${navPinOpen ? 'open' : ''}`}>▶</span>
                <span className="pin-glyph">⚲</span>
                Pinned <span className="dg-count">{pinnedBinder.length}</span>
              </div>
              {navPinOpen && (
                <div className="pin-box-body">
                  {pinnedBinder.map((c) => navClassRow(c, { hint: true, noDrop: true }))}
                </div>
              )}
            </div>
          ))}

        {navCollapsed
          ? // Collapsed, the rail is one flat swatch list with no folder groups,
            // so a second copy would have no folder to be found in.
            state.classes.filter((c) => !c.pinnedBinder).map((c) => navClassRow(c))
          : groups.map((g) =>
              g.folder === null ? (
                g.classes.filter(showInGroup).map((c) => navClassRow(c))
              ) : (
                <DropGroup key={g.folder.id} className="binder-nav-group" folder
                  self={dragFolder === g.folder.id} onDropHere={dropOnFolder(g.folder.id)}>
                  <div className="binder-nav-row folder-row" role="button" tabIndex={0}
                    {...folderDrag(g.folder.id)}
                    onClick={() => guardedClick(() => dispatch({ type: 'toggleFolderCollapse', id: g.folder!.id }))}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && dispatch({ type: 'toggleFolderCollapse', id: g.folder!.id })}>
                    <span className={`caret ${g.folder.collapsed ? '' : 'open'}`}>▶</span>
                    <span className="name folder-name">{g.folder.name}</span>
                  </div>
                  {!g.folder.collapsed &&
                    g.classes.filter(showInGroup).map((c) => navClassRow(c, { indent: true }))}
                </DropGroup>
              ),
            )}
      </div>

      {openClass ? (
        <ClassBinder key={openClass.id} cls={openClass} />
      ) : (
        <div className="binder-page">
          <AmbientWallpaper variant="full" />
          <h2 className="binder-title">My binder</h2>
          <p className="binder-sub">
            Posts, notes, handouts and resources — one page per class. Drag cards to rearrange or refolder.
          </p>

          {pinnedBinder.length > 0 && (
            <div className="pin-box">
              <div className="pin-box-head" onClick={() => setIndexPinOpen((v) => !v)}>
                <span className={`caret ${indexPinOpen ? 'open' : ''}`}>▶</span>
                <span className="pin-glyph">⚲</span>
                Pinned <span className="dg-count">{pinnedBinder.length}</span>
              </div>
              {indexPinOpen && (
                <div className="pin-box-body">
                  <IndexCards classes={pinnedBinder} hint onOpen={setOpenClassId} />
                </div>
              )}
            </div>
          )}

          {groups.map((g) => {
            const visible = g.classes.filter(showInGroup)
            // Folder-pinned classes get their own row above the rest of the folder.
            const folderPinned = g.folder ? visible.filter((c) => c.pinnedFolder) : []
            const rest = g.folder ? visible.filter((c) => !c.pinnedFolder) : visible
            return (
              <DropGroup key={g.folder?.id ?? 'root'} className="binder-group"
                folder={!!g.folder} self={!!g.folder && dragFolder === g.folder.id}
                onDropHere={dropOnFolder(g.folder?.id ?? null)}>
                {g.folder && (
                  <div className="binder-group-head folder" title="Drag to reorder folders"
                    {...folderDrag(g.folder.id)}>{g.folder.name}</div>
                )}
                {folderPinned.length > 0 && (
                  <div className="folder-pin-row">
                    <IndexCards classes={folderPinned}
                      onOpen={setOpenClassId} onDropClass={dropOnClass} />
                  </div>
                )}
                <IndexCards classes={rest}
                  onOpen={setOpenClassId} onDropClass={dropOnClass} />
              </DropGroup>
            )
          })}

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
              }}>Move to the end</div>
          )}

          {state.classes.length === 0 && (
            <div className="empty-hint">
              No classes yet — add one in the calendar sidebar and its binder page appears here.
            </div>
          )}
          <button className="add-inline" onClick={() => ui.openClass({})}>+ Add class</button>
        </div>
      )}
    </div>
  )
}

function IndexCards({ classes, hint, onOpen, onDropClass }: {
  classes: ClassInfo[]
  hint?: boolean
  onOpen: (id: ID) => void
  /** Omitted in the pinned box, whose cards are copies and take no drops. */
  onDropClass?: (c: ClassInfo) => (e: React.DragEvent) => void
}) {
  const { state, dispatch } = useStore()
  if (classes.length === 0) return null
  return (
    <div className="binder-index">
      {classes.map((c) => {
        const uploads = state.binderUploads.filter((u) => u.classId === c.id)
        const posts = state.binderPosts.filter((p) => p.classId === c.id)
        const fileCount = uploads.reduce((n, u) => n + u.files.length, 0)
        return (
          <div key={c.id} className="binder-card" role="button" tabIndex={0} draggable
            onDragStart={(e) => { markDragStart(); setDragPayload(e, { kind: 'class', id: c.id }) }}
            onDragEnd={markDragEnd}
            onDragOver={overRow}
            onDrop={onDropClass ? onDropClass(c) : swallowDrop}
            onClick={() => guardedClick(() => onOpen(c.id))}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen(c.id)}
            style={{ borderTopColor: c.color, background: `color-mix(in srgb, ${c.color} 7%, var(--bg-raised))` }}>
            <div className="corner-pins">
              <button className={`corner-pin ${c.pinnedBinder ? 'on' : ''}`}
                title={c.pinnedBinder ? 'Unpin from top of binder' : 'Pin to top of binder'}
                onClick={(e) => { e.stopPropagation(); dispatch({ type: 'toggleClassPin', id: c.id, scope: 'binder' }) }}>⚲</button>
              {c.folderId && (
                <button className={`corner-pin ${c.pinnedFolder ? 'on' : ''}`}
                  title={c.pinnedFolder ? 'Unpin from top of folder' : 'Pin to top of its folder'}
                  onClick={(e) => { e.stopPropagation(); dispatch({ type: 'toggleClassPin', id: c.id, scope: 'folder' }) }}>
                  <svg className="folder-glyph" width="14" height="12" viewBox="0 0 15 13" aria-hidden="true">
                    <path d="M1.5 2.5 h4 l1.5 1.7 h6.5 a1 1 0 0 1 1 1 v6.3 a1 1 0 0 1 -1 1 h-12 a1 1 0 0 1 -1 -1 v-8 a1 1 0 0 1 1 -1 z"
                      fill="none" stroke="currentColor" strokeWidth="1.3" />
                  </svg>
                </button>
              )}
            </div>
            <span className="binder-card-name">
              {c.name}
              {hint && folderNameOf(state, c) && <span className="folder-hint">{folderNameOf(state, c)}</span>}
            </span>
            {c.meta?.professor && <span className="binder-card-meta">{c.meta.professor}</span>}
            {c.meta?.room && <span className="binder-card-meta">{c.meta.room}</span>}
            <span className="binder-card-count">
              {posts.length + uploads.length} post{posts.length + uploads.length === 1 ? '' : 's'} · {fileCount} file{fileCount === 1 ? '' : 's'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ---------- One class's binder page ---------- */

const META_FIELDS: { key: keyof ClassMeta; label: string; placeholder: string }[] = [
  { key: 'professor', label: 'Professor', placeholder: 'e.g. Dr M. Sinclair' },
  { key: 'room', label: 'Room', placeholder: 'e.g. MS.01' },
  { key: 'homework', label: 'Homework', placeholder: 'e.g. problem sheet due Fridays' },
]

function ClassBinder({ cls }: { cls: ClassInfo }) {
  const { state, dispatch } = useStore()
  const [tab, setTab] = useState<'stream' | 'collation' | 'tasks' | 'grades'>('stream')
  const [uploadModal, setUploadModal] = useState<UploadModalInit | null>(null)
  const [newSection, setNewSection] = useState('')
  const [classPinOpen, setClassPinOpen] = useState(true)

  const sections = state.binderSections.filter((s) => s.classId === cls.id)
  const uploads = state.binderUploads.filter((u) => u.classId === cls.id)
  const posts = state.binderPosts.filter((p) => p.classId === cls.id)
  const classPinned = uploads.filter((u) => u.pinned === 'class')

  const setMeta = (key: keyof ClassMeta, value: string) => {
    dispatch({ type: 'updateClass', cls: { ...cls, meta: { ...cls.meta, [key]: value || undefined } } })
  }

  const addSection = () => {
    const name = newSection.trim()
    if (!name) return
    dispatch({ type: 'addBinderSection', classId: cls.id, name })
    setNewSection('')
  }

  return (
    <div className="binder-page">
      <div className="binder-head">
        <h2 className="binder-title" style={{ color: cls.color }}>{cls.name}</h2>
        {folderNameOf(state, cls) && <span className="folder-hint big">{folderNameOf(state, cls)}</span>}
        <button className={`btn icon pin-btn ${cls.pinnedBinder ? 'on' : ''}`}
          title={cls.pinnedBinder ? 'Unpin from top of binder' : 'Pin to top of binder'}
          onClick={() => dispatch({ type: 'toggleClassPin', id: cls.id, scope: 'binder' })}>⚲</button>
        {cls.folderId && (
          <button className={`btn icon pin-btn ${cls.pinnedFolder ? 'on' : ''}`}
            title={cls.pinnedFolder ? 'Unpin from top of folder' : 'Pin to top of its folder'}
            onClick={() => dispatch({ type: 'toggleClassPin', id: cls.id, scope: 'folder' })}>
            <svg className="folder-glyph" width="14" height="12" viewBox="0 0 15 13" aria-hidden="true">
              <path d="M1.5 2.5 h4 l1.5 1.7 h6.5 a1 1 0 0 1 1 1 v6.3 a1 1 0 0 1 -1 1 h-12 a1 1 0 0 1 -1 -1 v-8 a1 1 0 0 1 1 -1 z"
                fill="none" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </button>
        )}
        <div className="binder-tabs">
          <button className={tab === 'stream' ? 'active' : ''} onClick={() => setTab('stream')}>Stream</button>
          <button className={tab === 'collation' ? 'active' : ''} onClick={() => setTab('collation')}>Collation</button>
          <button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>Tasks</button>
          <button className={tab === 'grades' ? 'active' : ''} onClick={() => setTab('grades')}>Grades</button>
        </div>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setUploadModal({ classId: cls.id })}>+ Upload</button>
      </div>

      {/* Class details — all optional, saved as you type */}
      <div className="binder-meta">
        {META_FIELDS.map((f) => (
          <label key={f.key} className="binder-meta-field">
            <span>{f.label}</span>
            <input type="text" value={cls.meta?.[f.key] ?? ''} placeholder={f.placeholder}
              onChange={(e) => setMeta(f.key, e.target.value)} />
          </label>
        ))}
        <label className="binder-meta-field wide">
          <span>Other important info</span>
          <textarea value={cls.meta?.other ?? ''} rows={2}
            placeholder="Anything else worth keeping at the top — office hours, textbook, marking scheme…"
            onChange={(e) => setMeta('other', e.target.value)} />
        </label>
      </div>

      {tab === 'grades' ? (
        // Opening a document jumps straight into the upload's own editor — the
        // binder's existing way of looking at one.
        <GradesTab cls={cls} onOpenUpload={(u) => setUploadModal({ classId: cls.id, upload: u })} />
      ) : tab === 'tasks' ? (
        // The class's live project tree — same data as the Tasks page, fully synced.
        <div className="binder-tasks">
          {(() => {
            const proj = state.projects.find((p) => p.classId === cls.id)
            return proj
              ? <ProjectNode project={proj} />
              : <div className="empty-hint">This class has no project yet.</div>
          })()}
        </div>
      ) : tab === 'stream' ? (
        <StreamTab cls={cls} posts={posts} uploads={uploads}
          sections={sections} onEditUpload={(u) => setUploadModal({ classId: cls.id, upload: u })} />
      ) : (
        <>
          {classPinned.length > 0 && (
            <div className="pin-box">
              <div className="pin-box-head" onClick={() => setClassPinOpen((v) => !v)}>
                <span className={`caret ${classPinOpen ? 'open' : ''}`}>▶</span>
                <span className="pin-glyph">⚲</span>
                Pinned <span className="dg-count">{classPinned.length}</span>
              </div>
              {classPinOpen && (
                <div className="pin-box-body">
                  {classPinned.map((u) => (
                    <UploadCard key={u.id} upload={u} sectionName={sections.find((s) => s.id === u.sectionId)?.name}
                      onEdit={() => setUploadModal({ classId: cls.id, upload: u })} />
                  ))}
                </div>
              )}
            </div>
          )}

          {sections.map((sec) => (
            <SectionBlock key={sec.id} section={sec} canDelete={sections.length > 1}
              uploads={uploads.filter((u) => u.sectionId === sec.id && u.pinned !== 'class')}
              onAdd={() => setUploadModal({ classId: cls.id, sectionId: sec.id })}
              onEdit={(u) => setUploadModal({ classId: cls.id, upload: u })} />
          ))}

          <div className="binder-add-section">
            <input type="text" value={newSection} placeholder="New section name…"
              onChange={(e) => setNewSection(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSection()} />
            <button className="btn" onClick={addSection}>+ Add section</button>
          </div>
        </>
      )}

      {uploadModal && <UploadModal init={uploadModal} onClose={() => setUploadModal(null)} />}
    </div>
  )
}

/* ---------- Stream tab ---------- */

type StreamItem =
  | { kind: 'post'; date: string; pinned: boolean; post: BinderPost }
  | { kind: 'upload'; date: string; pinned: boolean; upload: BinderUpload }

function StreamTab({ cls, posts, uploads, sections, onEditUpload }: {
  cls: ClassInfo
  posts: BinderPost[]
  uploads: BinderUpload[]
  sections: BinderSection[]
  onEditUpload: (u: BinderUpload) => void
}) {
  const { dispatch } = useStore()
  const [draft, setDraft] = useState('')
  const [streamPinOpen, setStreamPinOpen] = useState(true)

  const items: StreamItem[] = [
    ...posts.map((p): StreamItem => ({ kind: 'post', date: p.createdAt, pinned: !!p.pinned, post: p })),
    ...uploads.map((u): StreamItem => ({
      kind: 'upload',
      // Attached uploads sort by their event/task date; the rest by post time.
      date: u.attach?.date ? `${u.attach.date}T12:00:00` : u.createdAt,
      pinned: !!u.pinnedStream,
      upload: u,
    })),
  ].sort((a, b) => (a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : a.date < b.date ? 1 : -1))

  const pinnedItems = items.filter((it) => it.pinned)
  const restItems = items.filter((it) => !it.pinned)

  const renderItem = (it: StreamItem) =>
    it.kind === 'post' ? (
      <PostCard key={it.post.id} post={it.post} />
    ) : (
      <UploadCard key={it.upload.id} upload={it.upload} stream
        sectionName={sections.find((s) => s.id === it.upload.sectionId)?.name}
        onEdit={() => onEditUpload(it.upload)} />
    )

  const submitPost = () => {
    const text = draft.trim()
    if (!text) return
    dispatch({ type: 'addBinderPost', post: { id: uid(), classId: cls.id, text, createdAt: new Date().toISOString() } })
    setDraft('')
  }

  return (
    <div className="stream">
      <div className="stream-composer">
        <textarea rows={2} value={draft} placeholder={`Post to the ${cls.name} stream — a reminder, a thought, anything…`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && submitPost()} />
        <button className="btn primary" onClick={submitPost} disabled={!draft.trim()}>Post</button>
      </div>

      {items.length === 0 && <div className="empty-hint">Nothing in the stream yet — post a note or add an upload.</div>}
      {pinnedItems.length > 0 && (
        <div className="pin-box">
          <div className="pin-box-head" onClick={() => setStreamPinOpen((v) => !v)}>
            <span className={`caret ${streamPinOpen ? 'open' : ''}`}>▶</span>
            <span className="pin-glyph">⚲</span>
            Pinned <span className="dg-count">{pinnedItems.length}</span>
          </div>
          {streamPinOpen && <div className="pin-box-body">{pinnedItems.map(renderItem)}</div>}
        </div>
      )}
      {restItems.map(renderItem)}
    </div>
  )
}

function fmtAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function PostCard({ post }: { post: BinderPost }) {
  const { dispatch } = useStore()
  const [editing, setEditing] = useState<string | null>(null)

  const commit = () => {
    if (editing?.trim()) dispatch({ type: 'updateBinderPost', post: { ...post, text: editing.trim() } })
    setEditing(null)
  }

  return (
    <div className="upload-card post-card">
      <div className="corner-pins">
        <button className={`corner-pin ${post.pinned ? 'on' : ''}`}
          title={post.pinned ? 'Unpin from stream' : 'Pin to top of stream'}
          onClick={() => dispatch({ type: 'updateBinderPost', post: { ...post, pinned: !post.pinned } })}>⚲</button>
      </div>
      <div className="upload-head">
        <span className="post-icon">💬</span>
        {editing !== null ? (
          <textarea className="post-edit" autoFocus rows={2} value={editing}
            onChange={(e) => setEditing(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && commit()} />
        ) : (
          <span className="post-text">{post.text}</span>
        )}
        <div className="spacer" />
        <div className="upload-actions">
          <button className="hover-btn" title="Edit post" onClick={() => setEditing(post.text)}>✎</button>
          <button className="hover-btn" title="Delete post"
            onClick={() => window.confirm('Delete this post?') && dispatch({ type: 'deleteBinderPost', id: post.id })}>🗑</button>
        </div>
      </div>
      <div className="upload-created">{fmtAt(post.createdAt)}</div>
    </div>
  )
}

/* ---------- A collation section of uploads ---------- */

/**
 * Ordering inside a section: pinned first, then event/task-attached uploads
 * chronologically, then unattached ones in creation order.
 */
function orderUploads(uploads: BinderUpload[]): BinderUpload[] {
  const pinned = uploads.filter((u) => u.pinned === 'section')
  const dated = uploads
    .filter((u) => u.pinned !== 'section' && u.attach?.date)
    .sort((a, b) => (a.attach!.date! < b.attach!.date! ? -1 : 1))
  const rest = uploads
    .filter((u) => u.pinned !== 'section' && !u.attach?.date)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  return [...pinned, ...dated, ...rest]
}

function SectionBlock({ section, uploads, canDelete, onAdd, onEdit }: {
  section: BinderSection
  uploads: BinderUpload[]
  canDelete: boolean
  onAdd: () => void
  onEdit: (u: BinderUpload) => void
}) {
  const { dispatch } = useStore()
  const [renaming, setRenaming] = useState<string | null>(null)
  const [pinOpen, setPinOpen] = useState(true)

  const ordered = orderUploads(uploads)
  const pinnedUploads = ordered.filter((u) => u.pinned === 'section')
  const restUploads = ordered.filter((u) => u.pinned !== 'section')

  const commitRename = () => {
    if (renaming?.trim()) dispatch({ type: 'renameBinderSection', id: section.id, name: renaming.trim() })
    setRenaming(null)
  }

  const remove = () => {
    if (!canDelete) return
    const msg = uploads.length
      ? `Delete section "${section.name}"? Its ${uploads.length} upload(s) move to another section.`
      : `Delete section "${section.name}"?`
    if (window.confirm(msg)) dispatch({ type: 'deleteBinderSection', id: section.id })
  }

  return (
    <div className="binder-section">
      <div className="binder-section-head">
        {renaming !== null ? (
          <input className="sec-rename" autoFocus value={renaming}
            onChange={(e) => setRenaming(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => e.key === 'Enter' && commitRename()} />
        ) : (
          <span className="sec-name">{section.name}</span>
        )}
        <button className="hover-btn" title="Rename section" onClick={() => setRenaming(section.name)}>✎</button>
        {canDelete && <button className="hover-btn" title="Delete section" onClick={remove}>🗑</button>}
        <div className="spacer" />
        <button className="btn small" onClick={onAdd}>+ Upload here</button>
      </div>
      {uploads.length === 0 && <div className="empty-hint">Nothing here yet.</div>}
      {pinnedUploads.length > 0 && (
        <div className="pin-box">
          <div className="pin-box-head" onClick={() => setPinOpen((v) => !v)}>
            <span className={`caret ${pinOpen ? 'open' : ''}`}>▶</span>
            <span className="pin-glyph">⚲</span>
            Pinned <span className="dg-count">{pinnedUploads.length}</span>
          </div>
          {pinOpen && (
            <div className="pin-box-body">
              {pinnedUploads.map((u) => <UploadCard key={u.id} upload={u} onEdit={() => onEdit(u)} />)}
            </div>
          )}
        </div>
      )}
      {restUploads.map((u) => (
        <UploadCard key={u.id} upload={u} onEdit={() => onEdit(u)} />
      ))}
    </div>
  )
}

/* ---------- One upload ---------- */

function UploadCard({ upload, sectionName, stream, onEdit }: {
  upload: BinderUpload
  sectionName?: string
  stream?: boolean
  onEdit: () => void
}) {
  const { dispatch } = useStore()

  const patch = (p: Partial<BinderUpload>) =>
    dispatch({ type: 'updateBinderUpload', upload: { ...upload, ...p } })

  return (
    <div className="upload-card">
      <div className="corner-pins">
        {stream ? (
          <button className={`corner-pin ${upload.pinnedStream ? 'on' : ''}`}
            title={upload.pinnedStream ? 'Unpin from stream' : 'Pin to top of stream'}
            onClick={() => patch({ pinnedStream: !upload.pinnedStream })}>⚲</button>
        ) : (
          <>
            <button className={`corner-pin ${upload.pinned === 'section' ? 'on' : ''}`}
              title={upload.pinned === 'section' ? 'Unpin from top of section' : 'Pin to top of section'}
              onClick={() => patch({ pinned: upload.pinned === 'section' ? undefined : 'section' })}>⚲</button>
            <button className={`corner-pin ${upload.pinned === 'class' ? 'on' : ''}`}
              title={upload.pinned === 'class' ? 'Unpin from the collation tab' : 'Pin to top of the collation tab'}
              onClick={() => patch({ pinned: upload.pinned === 'class' ? undefined : 'class' })}>★</button>
          </>
        )}
      </div>
      <div className="upload-head">
        <span className="upload-title">{upload.title}</span>
        {sectionName && <span className="upload-sec-tag">{sectionName}</span>}
        {upload.attach && (
          <span className="upload-attach" title={`Attached to ${upload.attach.kind}`}>
            🔗 {upload.attach.label}{upload.attach.date ? ` · ${fmtFriendly(upload.attach.date)}` : ''}
          </span>
        )}
        <div className="spacer" />
        <div className="upload-actions">
          <button className="hover-btn" title="Edit upload" onClick={onEdit}>✎</button>
        </div>
      </div>
      {upload.caption && <div className="upload-caption">{upload.caption}</div>}
      {upload.files.length > 0 && (
        <div className="upload-files">
          {upload.files.map((f) => <FileChip key={f.id} file={f} />)}
        </div>
      )}
      <div className="upload-created">added {fmtFriendly(upload.createdAt.slice(0, 10))}</div>
    </div>
  )
}
