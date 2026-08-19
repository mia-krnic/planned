import type React from 'react'

/** Drag payload shared by the calendar sidebar and binder (classes + folders). */
export interface DragPayload {
  kind: 'class' | 'folder'
  id: string
}

const MIME = 'application/x-planned'

/**
 * A second, per-kind MIME carrying the same id. `getData` is blocked until the
 * drop, but the *type list* is readable during dragover — so this is what lets
 * a drop target tell a class drag from a folder drag while it is still hovering
 * (folder rows reorder, class rows refolder).
 */
const kindMime = (kind: DragPayload['kind']) => `${MIME}-${kind}`

export function setDragPayload(e: React.DragEvent, p: DragPayload): void {
  e.dataTransfer.setData(MIME, JSON.stringify(p))
  e.dataTransfer.setData(kindMime(p.kind), p.id)
  e.dataTransfer.effectAllowed = 'move'
}

/** True while a drag of exactly this kind is over us (safe during dragover). */
export function isDragKind(e: React.DragEvent, kind: DragPayload['kind']): boolean {
  return e.dataTransfer.types.includes(kindMime(kind))
}

export function getDragPayload(e: React.DragEvent): DragPayload | null {
  try {
    return JSON.parse(e.dataTransfer.getData(MIME)) as DragPayload
  } catch {
    return null
  }
}

export function allowDrop(e: React.DragEvent): void {
  e.preventDefault()
}

/* ---------- Task drags (project tree) ---------- */

const TASK_MIME = 'text/x-task'

export function setTaskDrag(e: React.DragEvent, id: string): void {
  e.dataTransfer.setData(TASK_MIME, id)
  e.dataTransfer.effectAllowed = 'move'
}

/** True while a task drag is over us — `getData` is blocked until the drop. */
export function isTaskDrag(e: React.DragEvent): boolean {
  return e.dataTransfer.types.includes(TASK_MIME)
}

export function taskDragId(e: React.DragEvent): string | null {
  return e.dataTransfer.getData(TASK_MIME) || null
}

/* ---------- Task-section drags (project tree) ---------- */

const SECTION_MIME = 'text/x-section'

export function setSectionDrag(e: React.DragEvent, id: string): void {
  e.dataTransfer.setData(SECTION_MIME, id)
  e.dataTransfer.effectAllowed = 'move'
}

/** True while a section drag is over us — `getData` is blocked until the drop. */
export function isSectionDrag(e: React.DragEvent): boolean {
  return e.dataTransfer.types.includes(SECTION_MIME)
}

export function sectionDragId(e: React.DragEvent): string | null {
  return e.dataTransfer.getData(SECTION_MIME) || null
}
