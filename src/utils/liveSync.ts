import type { Dispatch } from 'react'
import type { AnyAction } from '../store'
import { fetchIcs } from './ics'

/**
 * Fetch the bound live feed and apply it to the store. Shared by the sync-on-open
 * / "Sync now" controls in the notification centre and by "Bind & sync" in the
 * live-ICS modal, so both take exactly the same path (including the automatic
 * class creation that lives in the applySync reducer).
 *
 * Returns '' on success (or when nothing is bound) and a human-readable message
 * on failure — callers show it as status text rather than raising a notification,
 * so a school server that blocks browsers doesn't spam the panel.
 */
export async function runIcsSync(url: string, dispatch: Dispatch<AnyAction>): Promise<string> {
  if (!url) return ''
  try {
    dispatch({ type: 'applySync', parsed: await fetchIcs(url) })
    return ''
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
