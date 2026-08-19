/**
 * Binder file blobs live in IndexedDB (localStorage is far too small for
 * PDFs/videos). Metadata (names, types, which upload they belong to) stays in
 * app state; blobs are keyed by BinderFile.id.
 * TODO(backend): swap for real file storage alongside src/api/storage.ts.
 */

const DB_NAME = 'planned-binder-files'
const STORE = 'files'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = run(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export function putFile(id: string, blob: Blob): Promise<unknown> {
  return tx('readwrite', (s) => s.put(blob, id))
}

export function getFile(id: string): Promise<Blob | undefined> {
  return tx('readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>)
}

export function deleteFiles(ids: string[]): Promise<unknown> {
  if (!ids.length) return Promise.resolve()
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, 'readwrite')
        const s = t.objectStore(STORE)
        ids.forEach((id) => s.delete(id))
        t.oncomplete = resolve
        t.onerror = () => reject(t.error)
      }),
  )
}

/** Remove every stored blob (used by "Delete all data"). */
export function clearFiles(): Promise<unknown> {
  return tx('readwrite', (s) => s.clear())
}

/** All stored blobs, for the backup export. */
export async function allFiles(): Promise<{ id: string; blob: Blob }[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const out: { id: string; blob: Blob }[] = []
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor()
    req.onsuccess = () => {
      const cur = req.result
      if (!cur) return resolve(out)
      out.push({ id: String(cur.key), blob: cur.value as Blob })
      cur.continue()
    }
    req.onerror = () => reject(req.error)
  })
}

/** Object-URL cache so image previews/download links stay stable per session. */
const urlCache = new Map<string, string>()

export async function fileUrl(id: string): Promise<string | null> {
  const hit = urlCache.get(id)
  if (hit) return hit
  const blob = await getFile(id)
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  urlCache.set(id, url)
  return url
}
