import type { AppState } from '../types'

/**
 * Persistence adapter.
 *
 * v0.1 stores everything in localStorage so the app is fully self-contained.
 * To move to a real self-hosted backend, replace these two functions with
 * fetch() calls (and add optimistic updates in store.tsx) — the rest of the
 * app only talks to this module.
 *
 * TODO(backend): REST server (e.g. Express + SQLite) with routes:
 *   GET/PUT  /api/state          — coarse sync (drop-in for these functions)
 *   ...or granular /api/events, /api/tasks, /api/projects endpoints
 * TODO(backend): multi-device sync + conflict resolution
 * TODO(backend): auth for exposing the instance beyond localhost
 * TODO(reminders): notification scheduling (6h/1h/5m before) needs a server
 *   process or service worker; see NotificationSettings placeholder in types.
 */

const KEY = 'semester-calendar-state-v1'

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as AppState) : null
  } catch {
    return null
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function resetState(): void {
  localStorage.removeItem(KEY)
}
