import { useState } from 'react'
import { t } from '../../i18n'
import { useStore } from '../../store'
import type { BinderUpload, ClassInfo, GradeRow, ID, Task } from '../../types'
import { fmtFriendly } from '../../utils/date'
import InfoIcon from '../InfoIcon'
import PickerPopover from './PickerPopover'
import { assignmentTasks, fmtPct, parseNumCell, summariseGrades } from './grades'
import { uploadChipTitle, uploadGlyph } from './uploadGlyph'

const AUTO_INFO =
  'Leave a weight blank and the row shares whatever is left of 100% evenly with the other blank rows. '
  + 'Type 40 into one row and leave three blank, and each of those three is worth 20.'
const CURRENT_INFO =
  "The weighted average of the components you've entered a score for — where you stand if the course "
  + 'stopped today. Components with no score yet are left out of the maths entirely.'
const RUNNING_INFO =
  'Marks already banked towards the final 100, i.e. each scored component times its weight. '
  + 'It only climbs as more work is marked.'
const DOCS_INFO =
  'The binder uploads attached to this row’s assignments. Attach a file on the task itself and it '
  + 'appears here — there is deliberately no separate place to file documents against a grade.'

/** Fills {name} placeholders in a t()'d template (see src/i18n/zh.ts). */
function fill(tpl: string, v: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''))
}

/** When a task happened, for the reverse-chronological assignment picker. */
function taskWhen(t: Task): string | null {
  return t.dueDate ?? t.date ?? null
}

/**
 * A number cell that survives half-typed input: the keystrokes live in a local
 * draft while the field has focus, so "12.5" isn't rewritten to "12" the moment
 * the dot is typed. Every recognisable value still commits immediately.
 */
function NumCell({ value, placeholder, title, onCommit }: {
  value: number | null | undefined
  placeholder?: string
  title?: string
  onCommit: (n: number | null) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (value == null ? '' : String(value))
  return (
    <input className="grade-num" type="text" inputMode="decimal"
      placeholder={placeholder} title={title} value={shown}
      onChange={(e) => {
        setDraft(e.target.value)
        const n = parseNumCell(e.target.value)
        if (n !== undefined) onCommit(n)
      }}
      onBlur={() => setDraft(null)} />
  )
}

/** Done / handed-in state of a bound assignment, as plain glyphs. */
function TaskState({ task }: { task: Task }) {
  return (
    <>
      {task.done && <span className="grade-glyph" title={t('Done')}>✓</span>}
      {task.submitted && <span className="grade-glyph" title={t('Submitted')}>▣</span>}
    </>
  )
}

/**
 * The Grades tab of a class binder: one row per assessed component, with its
 * weight, its score, the assignment tasks it is made of, and — read-only —
 * whatever those tasks have attached in the binder.
 */
export default function GradesTab({ cls, onOpenUpload }: {
  cls: ClassInfo
  onOpenUpload: (u: BinderUpload) => void
}) {
  const { state, dispatch } = useStore()
  const rows = state.gradeRows.filter((r) => r.classId === cls.id)
  const summary = summariseGrades(rows)
  const candidates = assignmentTasks(state, cls.id)
  // Resolved up here because the rows below map over tasks with `t` as the
  // parameter name, which shadows the translation helper.
  const unbindLabel = t('Unbind from this row')
  const undatedLabel = t('undated')

  const patch = (row: GradeRow, p: Partial<GradeRow>) =>
    dispatch({ type: 'updateGradeRow', row: { ...row, ...p } })

  const remove = (row: GradeRow) => {
    if (window.confirm(fill(t('Delete the "{name}" row?'), { name: row.name }))) {
      dispatch({ type: 'deleteGradeRow', id: row.id })
    }
  }

  const toggleTask = (row: GradeRow, id: ID) =>
    patch(row, {
      taskIds: row.taskIds.includes(id) ? row.taskIds.filter((x) => x !== id) : [...row.taskIds, id],
    })

  /** Uploads reached through a row's bound tasks, deduped, in binding order. */
  const docsFor = (row: GradeRow): BinderUpload[] => {
    const seen = new Set<ID>()
    const out: BinderUpload[] = []
    for (const taskId of row.taskIds) {
      const task = state.tasks.find((t) => t.id === taskId)
      for (const uploadId of task?.attachmentUploadIds ?? []) {
        if (seen.has(uploadId)) continue
        seen.add(uploadId)
        const u = state.binderUploads.find((x) => x.id === uploadId)
        if (u) out.push(u)
      }
    }
    return out
  }

  return (
    <div className="grade-wrap">
      <div className="grade-summary">
        <div className="grade-stat">
          <span className="gs-label">{t('Current grade')} <InfoIcon text={t(CURRENT_INFO)} /></span>
          <span className="gs-value">
            {summary.currentGrade == null ? '—' : `${fmtPct(summary.currentGrade)}%`}
          </span>
        </div>
        <div className="grade-stat">
          <span className="gs-label">{t('Running total')} <InfoIcon text={t(RUNNING_INFO)} /></span>
          <span className="gs-value">{fmtPct(summary.runningTotal)}<span className="gs-sub"> / 100</span></span>
        </div>
        <div className="grade-stat">
          <span className="gs-label">{t('Marked so far')}</span>
          <span className="gs-value">{fmtPct(summary.scoredWeight)}%<span className="gs-sub"> {t('of the course')}</span></span>
        </div>
      </div>

      {summary.over && (
        <div className="grade-warn">
          {t("The weights you've typed already add up to")} {fmtPct(summary.explicitTotal)}
          {summary.autoCount > 0
            ? t('% — more than the whole course, so the blank rows are left with nothing.')
            : t('% — more than the whole course.')}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="empty-hint">
          {fill(t('Add a row for each assessed component — midterm, lab reports, final — and this tab keeps your running grade for {class}.'),
            { class: cls.name })}
        </div>
      ) : (
        <div className="grade-table">
          <div className="grade-row grade-head">
            <span>{t('Component')}</span>
            <span>{t('Weight')} <InfoIcon text={t(AUTO_INFO)} /></span>
            <span>{t('Score')}</span>
            <span>{t('Assignments')}</span>
            <span>{t('Documents')} <InfoIcon text={t(DOCS_INFO)} /></span>
            <span />
          </div>

          {summary.rows.map(({ row, weight, auto }) => {
            const bound = row.taskIds.flatMap((id) => state.tasks.find((t) => t.id === id) ?? [])
            const docs = docsFor(row)
            return (
              <div key={row.id} className="grade-row">
                <input className="grade-name" value={row.name} placeholder={t('Component name')}
                  onChange={(e) => patch(row, { name: e.target.value })} />

                <span className="grade-cell">
                  <NumCell value={row.weightPct} placeholder={t('auto')} title={t('Weight as a % of the course')}
                    onCommit={(n) => patch(row, { weightPct: n })} />
                  {auto && <span className="grade-auto">{fmtPct(weight)}%</span>}
                </span>

                <span className="grade-cell">
                  <NumCell value={row.scorePct} placeholder="—" title={t('What you scored, as a %')}
                    onCommit={(n) => patch(row, { scorePct: n })} />
                </span>

                <span className="grade-cell grade-binds">
                  {bound.map((t) => (
                    <span key={t.id} className="grade-chip" title={t.title}>
                      <TaskState task={t} />
                      <span className={`grade-chip-text ${t.done ? 'done-strike' : ''}`}>{t.title}</span>
                      <button type="button" className="attach-x" title={unbindLabel}
                        onClick={() => toggleTask(row, t.id)}>×</button>
                    </span>
                  ))}
                  <PickerPopover label={t('+ Bind')} placeholder={t('Search assignments…')} minWidth={300}>
                    {(needle) => {
                      const shown = candidates.filter((t) => t.title.toLowerCase().includes(needle))
                      if (!shown.length) {
                        return (
                          <div className="st-empty">
                            {candidates.length
                              ? t('No assignments match.')
                              : t('No tasks in an assignments-flagged section of this class yet.')}
                          </div>
                        )
                      }
                      return shown.map((t) => {
                        const when = taskWhen(t)
                        return (
                          <button key={t.id} type="button"
                            className={`qt-opt pk-opt ${row.taskIds.includes(t.id) ? 'sel' : ''}`}
                            onClick={() => toggleTask(row, t.id)}>
                            <span className="qt-tick">{row.taskIds.includes(t.id) ? '✓' : ''}</span>
                            <span className="pk-opt-title">{t.title}</span>
                            <TaskState task={t} />
                            <span className="pk-opt-when">{when ? fmtFriendly(when) : undatedLabel}</span>
                          </button>
                        )
                      })
                    }}
                  </PickerPopover>
                </span>

                <span className="grade-cell grade-docs">
                  {docs.length === 0 && <span className="grade-none">—</span>}
                  {docs.map((u) => (
                    <button key={u.id} type="button" className="grade-doc" title={uploadChipTitle(u)}
                      onClick={() => onOpenUpload(u)}>
                      <span className="attach-glyph">{uploadGlyph(u.files)}</span>
                      <span className="grade-doc-name">{u.title}</span>
                    </button>
                  ))}
                </span>

                <button type="button" className="grade-del" title={t('Delete this row')}
                  onClick={() => remove(row)}>×</button>
              </div>
            )
          })}
        </div>
      )}

      <button className="add-inline" onClick={() => dispatch({ type: 'addGradeRow', classId: cls.id })}>
        {t('+ Add row')}
      </button>
    </div>
  )
}
