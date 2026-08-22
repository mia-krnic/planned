import { useEffect, useRef, useState } from 'react'
import { t } from '../../i18n'
import { useStore } from '../../store'
import type { BinderUpload, ID } from '../../types'
import { fmtFriendly } from '../../utils/date'
import { uploadsForClass } from '../../utils/study'
import PickerPopover from './PickerPopover'
import UploadModal, { type UploadModalInit } from './UploadModal'
import { uploadChipTitle, uploadGlyph } from './uploadGlyph'

/** Search matches a title, a caption or any of the upload's file names. */
export function uploadMatches(u: BinderUpload, needle: string): boolean {
  if (!needle) return true
  return u.title.toLowerCase().includes(needle)
    || !!u.caption?.toLowerCase().includes(needle)
    || u.files.some((f) => f.name.toLowerCase().includes(needle))
}

/**
 * The binder uploads attached to one task — the bottom block of the task editor
 * for tasks filed under a class. Attaching is how a handout, a brief or a marked
 * script reaches the grade tracker, which reads documents through tasks only.
 *
 * Uploads are offered newest first. "+ Upload new to binder" reuses the binder's
 * own upload modal; whatever it adds to this class is attached on close (the
 * modal reports nothing back, so the new ids are found by diffing against the
 * set that existed when it opened).
 */
export default function TaskAttachments({ classId, value, onChange }: {
  classId: ID
  value: ID[]
  onChange: (ids: ID[]) => void
}) {
  const { state } = useStore()
  const [newUpload, setNewUpload] = useState<UploadModalInit | null>(null)
  const beforeRef = useRef<Set<ID> | null>(null)
  const [awaiting, setAwaiting] = useState(false)

  const uploads = uploadsForClass(state, classId)
  // Dangling ids are simply not drawn; the stored list is left alone.
  const attached = value.flatMap((id) => state.binderUploads.find((u) => u.id === id) ?? [])

  useEffect(() => {
    if (!awaiting) return
    const before = beforeRef.current
    beforeRef.current = null
    setAwaiting(false)
    if (!before) return
    const fresh = state.binderUploads
      .filter((u) => u.classId === classId && !before.has(u.id))
      .map((u) => u.id)
      .filter((id) => !value.includes(id))
    if (fresh.length) onChange([...value, ...fresh])
  }, [awaiting, state.binderUploads, classId, value, onChange])

  const toggle = (id: ID) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])

  const openUploadModal = (close: () => void) => {
    beforeRef.current = new Set(state.binderUploads.filter((u) => u.classId === classId).map((u) => u.id))
    close()
    setNewUpload({ classId })
  }

  return (
    <div className="attach-box">
      {attached.length === 0 ? (
        <div className="attach-empty">{t('Nothing attached.')}</div>
      ) : (
        <div className="attach-list">
          {attached.map((u) => (
            <div key={u.id} className="attach-row" title={uploadChipTitle(u)}>
              <span className="attach-glyph">{uploadGlyph(u.files)}</span>
              <span className="attach-title">{u.title}</span>
              <button type="button" className="attach-x" title={t('Detach from this task')}
                onClick={() => toggle(u.id)}>×</button>
            </div>
          ))}
        </div>
      )}

      <PickerPopover label={t('+ Attach from binder')} placeholder={t('Search the binder…')}
        footer={(close) => (
          <button type="button" className="pk-foot-btn" onClick={() => openUploadModal(close)}>
            {t('+ Upload new to binder')}
          </button>
        )}>
        {(needle) => {
          const shown = uploads.filter((u) => uploadMatches(u, needle))
          if (!shown.length) {
            return (
              <div className="st-empty">
                {uploads.length ? t('No uploads match.') : t('This class has no binder uploads yet.')}
              </div>
            )
          }
          return shown.map((u) => (
            <button key={u.id} type="button"
              className={`qt-opt pk-opt ${value.includes(u.id) ? 'sel' : ''}`}
              title={uploadChipTitle(u)}
              onClick={() => toggle(u.id)}>
              <span className="qt-tick">{value.includes(u.id) ? '✓' : ''}</span>
              <span className="attach-glyph">{uploadGlyph(u.files)}</span>
              <span className="pk-opt-title">{u.title}</span>
              <span className="pk-opt-when">{fmtFriendly(u.createdAt.slice(0, 10))}</span>
            </button>
          ))
        }}
      </PickerPopover>

      {newUpload && (
        <UploadModal init={newUpload}
          onClose={() => { setNewUpload(null); setAwaiting(true) }} />
      )}
    </div>
  )
}
