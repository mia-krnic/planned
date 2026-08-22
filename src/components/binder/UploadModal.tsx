import { useMemo, useRef, useState } from 'react'
import { deleteFiles, putFile } from '../../api/files'
import { t } from '../../i18n'
import { uid, useStore } from '../../store'
import type { BinderAttach, BinderFile, BinderUpload, ID } from '../../types'
import { addDays, fmtFriendly, fmtTime, todayISO, toISO, fromISO } from '../../utils/date'
import { eventOccursOn } from '../../utils/occur'
import Modal from '../modals/Modal'

export interface UploadModalInit {
  classId: ID
  upload?: BinderUpload
  sectionId?: ID // default section for a new upload
}

const ATTACH_PAST_DAYS = 120
const ATTACH_FUTURE_DAYS = 60

interface AttachOption {
  value: string
  label: string
  attach: BinderAttach
}

export default function UploadModal({ init, onClose }: { init: UploadModalInit; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const existing = init.upload
  const sections = state.binderSections.filter((s) => s.classId === init.classId)

  const [title, setTitle] = useState(existing?.title ?? '')
  const [caption, setCaption] = useState(existing?.caption ?? '')
  const [sectionId, setSectionId] = useState<string>(existing?.sectionId ?? init.sectionId ?? sections[0]?.id ?? '')
  const [keptFiles, setKeptFiles] = useState<BinderFile[]>(existing?.files ?? [])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [attachValue, setAttachValue] = useState<string>(() => {
    const a = existing?.attach
    if (!a) return ''
    return a.kind === 'event' ? `evt|${a.id}|${a.date}` : `task|${a.id}`
  })
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Attachable items: occurrences of this class's events in a window around
  // today, plus tasks filed under the class's project subtree.
  const attachOptions = useMemo<AttachOption[]>(() => {
    const out: AttachOption[] = []
    const events = state.events.filter((e) => e.classId === init.classId)
    const start = addDays(fromISO(todayISO()), -ATTACH_PAST_DAYS)
    for (let i = 0; i <= ATTACH_PAST_DAYS + ATTACH_FUTURE_DAYS; i++) {
      const iso = toISO(addDays(start, i))
      for (const ev of events) {
        if (!eventOccursOn(ev, iso)) continue
        const label = `${ev.title} — ${fmtFriendly(iso)}${ev.allDay ? '' : ' ' + fmtTime(ev.startMin)}`
        out.push({
          value: `evt|${ev.id}|${iso}`,
          label,
          attach: { kind: 'event', id: ev.id, date: iso, label: ev.title },
        })
      }
    }
    const classProject = state.projects.find((p) => p.classId === init.classId)
    if (classProject) {
      // Resolved before the loop, whose `t` parameter shadows the translation helper.
      const taskPrefix = t('Task:')
      for (const t of state.tasks.filter((t) => t.projectId === classProject.id)) {
        out.push({
          value: `task|${t.id}`,
          label: `${taskPrefix} ${t.title}${t.date ? ' — ' + fmtFriendly(t.date) : ''}`,
          attach: { kind: 'task', id: t.id, date: t.date, label: t.title },
        })
      }
    }
    return out
  }, [state, init.classId])

  const removeKept = (id: string) => setKeptFiles((fs) => fs.filter((f) => f.id !== id))

  const save = async () => {
    if (!title.trim() || !sectionId || saving) return
    setSaving(true)
    // Store new blobs first, then commit metadata.
    const added: BinderFile[] = []
    for (const f of newFiles) {
      const id = uid()
      await putFile(id, f)
      added.push({ id, name: f.name, type: f.type || 'application/octet-stream', size: f.size })
    }
    const removed = (existing?.files ?? []).filter((f) => !keptFiles.some((k) => k.id === f.id))
    if (removed.length) void deleteFiles(removed.map((f) => f.id))

    const attach = attachOptions.find((o) => o.value === attachValue)?.attach
    const upload: BinderUpload = {
      id: existing?.id ?? uid(),
      classId: init.classId,
      sectionId,
      title: title.trim(),
      caption: caption.trim() || undefined,
      files: [...keptFiles, ...added],
      attach,
      pinned: existing?.pinned,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }
    dispatch({ type: existing ? 'updateBinderUpload' : 'addBinderUpload', upload })
    onClose()
  }

  const remove = () => {
    if (!existing) return
    const msg = t('Delete "{name}" and its {n} file(s)?')
      .replace('{name}', existing.title)
      .replace('{n}', String(existing.files.length))
    if (!window.confirm(msg)) return
    void deleteFiles(existing.files.map((f) => f.id))
    dispatch({ type: 'deleteBinderUpload', id: existing.id })
    onClose()
  }

  return (
    <Modal title={existing ? t('Edit upload') : t('New upload')} onClose={onClose}>
      <div className="field">
        <label>{t('Title')}</label>
        <input type="text" autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder={t('e.g. "Week 2 resources", "Seminar 5 notes"')} />
      </div>

      <div className="field">
        <label>{t('Section')}</label>
        <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div className="field">
        <label>{t('Files')}</label>
        {keptFiles.length > 0 && (
          <div className="upload-file-list">
            {keptFiles.map((f) => (
              <div key={f.id} className="upload-file-row">
                <span className="file-name">{f.name}</span>
                <button className="btn icon" title={t('Remove file')} onClick={() => removeKept(f.id)}>×</button>
              </div>
            ))}
          </div>
        )}
        {newFiles.length > 0 && (
          <div className="upload-file-list">
            {newFiles.map((f, i) => (
              <div key={i} className="upload-file-row">
                <span className="file-name">{f.name}</span>
                <button className="btn icon" title={t('Remove file')}
                  onClick={() => setNewFiles((fs) => fs.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
          </div>
        )}
        <button className="btn" onClick={() => fileRef.current?.click()}>{t('+ Add files…')}</button>
        <input
          ref={fileRef} type="file" multiple hidden
          onChange={(e) => {
            // Read files before clearing the input — the lazy state updater
            // would otherwise see an already-emptied FileList.
            const picked = Array.from(e.target.files ?? [])
            setNewFiles((fs) => [...fs, ...picked])
            e.target.value = ''
          }}
        />
      </div>

      <div className="field">
        <label>{t('Caption / notes (optional)')}</label>
        <textarea value={caption} onChange={(e) => setCaption(e.target.value)}
          placeholder={t('e.g. Make sure to bring textbook X!')} />
      </div>

      <div className="field">
        <label>{t('Attach to an event or task (optional — dates the upload)')}</label>
        <select value={attachValue} onChange={(e) => setAttachValue(e.target.value)}>
          <option value="">{t('Not attached')}</option>
          {attachOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="modal-actions">
        {existing && <button className="btn danger" onClick={remove}>{t('Delete')}</button>}
        <div className="spacer" />
        <button className="btn" onClick={onClose}>{t('Cancel')}</button>
        <button className="btn primary" onClick={() => void save()} disabled={saving}>
          {saving ? t('Saving…') : existing ? t('Save') : t('Add upload')}
        </button>
      </div>
    </Modal>
  )
}
