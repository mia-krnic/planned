import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { homePicks } from '../data/homePicks'
import { wallpaperUrl } from '../data/wallpapers'
import { todayISO } from '../utils/date'

/**
 * The Home page's wallpaper, echoed into the dead space of the working pages —
 * heavily faded, slightly desaturated, and masked so it only ever lives where
 * no text does. Two shapes:
 *
 *  - 'sides'  — visible at the left and right edges, fading to nothing well
 *               before the content column (Tasks, Journal).
 *  - 'full'   — one uniform whisper across the whole page, sitting UNDER the
 *               page's own solid surfaces (Timer's card, Binder's cards), so
 *               it only shows through the gaps between them.
 *
 * Same picture as Home (overrides included), faded in only once decoded, and
 * absolutely positioned behind everything: nothing shifts, nothing overlaps.
 */
export default function AmbientWallpaper({ variant }: { variant: 'sides' | 'full' }) {
  const { state } = useStore()
  const file = homePicks(state, todayISO()).wallpaper.file
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const u = wallpaperUrl(file)
    const img = new Image()
    img.onload = () => setUrl(u)
    img.src = u
    return () => { img.onload = null }
  }, [file])

  if (!url) return null
  return (
    <div className={`ambient-wp ambient-${variant}`} aria-hidden="true"
      style={{ backgroundImage: `url("${url}")` }} />
  )
}
