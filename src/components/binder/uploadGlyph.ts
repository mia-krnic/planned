import { t } from '../../i18n'
import type { BinderFile, BinderUpload } from '../../types'

/**
 * Monochrome text glyphs for file types, used wherever an upload is shown as a
 * compact chip (task attachments, the grade tracker's document column). The
 * binder's own FileChip uses colour emoji for full-size file rows; chips this
 * small read better as plain shapes in the text colour.
 */
export function fileGlyph(type: string): string {
  if (type.startsWith('image/')) return '▨'
  if (type === 'application/pdf') return '▧'
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) return '▦'
  return '▤'
}

/** One glyph for a whole upload: its single file's type, or ⧉ for a bundle. */
export function uploadGlyph(files: BinderFile[]): string {
  if (files.length > 1) return '⧉'
  return files.length ? fileGlyph(files[0].type) : '▤'
}

/** Hover text for an upload chip: title plus what is actually inside it. */
export function uploadChipTitle(u: BinderUpload): string {
  if (!u.files.length) return `${u.title} — ${t('no files')}`
  if (u.files.length === 1) return `${u.title} — ${u.files[0].name}`
  return `${u.title} — ${u.files.length} ${t('files')}: ${u.files.map((f) => f.name).join(', ')}`
}
