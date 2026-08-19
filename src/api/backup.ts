import type { AppState } from '../types'
import { allFiles, putFile } from './files'

/**
 * Full-data backup: app state plus every binder file blob, embedded base64 in
 * one JSON file the user can re-import.
 * TODO(backend): stream a zip instead once files can get large.
 */
interface BackupPayload {
  app: 'planned'
  version: number
  exportedAt: string
  state: AppState
  files: { id: string; type: string; dataB64: string }[]
}

function blobToB64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',', 2)[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

function b64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}

export async function exportBackup(state: AppState): Promise<void> {
  const files = await allFiles()
  const payload: BackupPayload = {
    app: 'planned',
    version: 1,
    exportedAt: new Date().toISOString(),
    state,
    files: await Promise.all(
      files.map(async (f) => ({ id: f.id, type: f.blob.type, dataB64: await blobToB64(f.blob) })),
    ),
  }
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `planned-backup-${payload.exportedAt.slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

/** Parse + restore a backup file; returns the state to load (caller migrates + dispatches). */
export async function importBackup(file: File): Promise<AppState> {
  const payload = JSON.parse(await file.text()) as BackupPayload
  if (payload?.app !== 'planned' || !Array.isArray(payload.state?.classes)) {
    throw new Error('Not a planned backup file')
  }
  for (const f of payload.files ?? []) {
    await putFile(f.id, b64ToBlob(f.dataB64, f.type))
  }
  return payload.state
}
