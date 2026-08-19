import { useEffect, useState } from 'react'
import { fileUrl } from '../../api/files'
import type { BinderFile } from '../../types'

function iconFor(type: string): string {
  if (type.startsWith('image/')) return '🖼'
  if (type.startsWith('video/')) return '🎬'
  if (type.startsWith('audio/')) return '🎧'
  if (type === 'application/pdf') return '📕'
  if (type.includes('word') || type.includes('document')) return '📘'
  if (type.includes('sheet') || type.includes('excel')) return '📗'
  if (type.startsWith('text/')) return '📝'
  return '📎'
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** One file in an upload: image files render a thumbnail, others a chip. Click opens. */
export default function FileChip({ file }: { file: BinderFile }) {
  const isImage = file.type.startsWith('image/')
  const [thumb, setThumb] = useState<string | null>(null)

  useEffect(() => {
    if (isImage) void fileUrl(file.id).then(setThumb)
  }, [file.id, isImage])

  const open = async () => {
    const url = await fileUrl(file.id)
    if (url) window.open(url, '_blank')
  }

  const download = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const url = await fileUrl(file.id)
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
  }

  if (isImage && thumb) {
    return (
      <button className="file-thumb" onClick={open} title={`${file.name} · ${fmtSize(file.size)}`}>
        <img src={thumb} alt={file.name} />
        <span className="file-thumb-name">{file.name}</span>
      </button>
    )
  }

  return (
    <button className="file-chip" onClick={open} title={`Open ${file.name}`}>
      <span className="file-icon">{iconFor(file.type)}</span>
      <span className="file-name">{file.name}</span>
      <span className="file-size">{fmtSize(file.size)}</span>
      <span className="file-dl" title="Download" onClick={download}>⬇</span>
    </button>
  )
}
