import { useState } from 'react'
import { useStore } from '../../store'
import { runIcsSync } from '../../utils/liveSync'
import Modal from './Modal'

/** Light sanity check — a full http(s) URL with something after the host. */
function looksLikeFeedUrl(url: string): boolean {
  return /^https?:\/\/\S+$/i.test(url.trim())
}

/**
 * Bind (or unbind) the live calendar feed. Binding stores the URL and syncs
 * straight away; every later app open re-syncs it automatically.
 */
export default function LiveIcsModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [url, setUrl] = useState(state.icsUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const bind = async () => {
    const next = url.trim()
    if (!looksLikeFeedUrl(next)) {
      setError('That doesn’t look like a feed URL — it should start with http:// or https://')
      return
    }
    setError('')
    setBusy(true)
    dispatch({ type: 'setIcsUrl', url: next })
    const err = await runIcsSync(next, dispatch)
    setBusy(false)
    if (err) setError(err)
    else onClose()
  }

  const unbind = () => {
    dispatch({ type: 'setIcsUrl', url: '' })
    setUrl('')
    setError('')
  }

  return (
    <Modal title="Import live ICS" onClose={onClose}>
      <p className="modal-blurb">
        Paste your school's live calendar feed URL (.ics). Events sync automatically every time you
        open the app; classes are created for you from module codes.
      </p>

      {state.icsUrl && (
        <div className="ics-bound">
          <div>
            <div className="ics-bound-label">Currently bound</div>
            <div className="ics-bound-url">{state.icsUrl}</div>
          </div>
          <button className="btn small" onClick={unbind} disabled={busy}>Unbind</button>
        </div>
      )}

      <div className="field">
        <label>Feed URL</label>
        <input
          type="text" autoFocus value={url} placeholder="https://…/timetable.ics"
          onChange={(e) => { setUrl(e.target.value); setError('') }}
          onKeyDown={(e) => e.key === 'Enter' && void bind()}
        />
      </div>

      {error && <div className="ics-error">{error}</div>}

      <div className="modal-actions">
        <div className="spacer" />
        <button className="btn" onClick={onClose}>Close</button>
        <button className="btn primary" onClick={() => void bind()} disabled={busy}>
          {busy ? 'Syncing…' : 'Bind & sync'}
        </button>
      </div>
    </Modal>
  )
}
