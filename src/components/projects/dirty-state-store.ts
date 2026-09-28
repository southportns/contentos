/**
 * P0.5.3 Hardening — Shared Dirty State Store
 *
 * A lightweight per-topic dirty state tracker that allows DraftEditor
 * (client component) and ProjectDetailQualityWorkbench (client component)
 * to share dirty state without prop drilling through the Server Component (page.tsx).
 *
 * DraftEditor writes `true` when user makes unsaved changes.
 * Workbench reads the value to suppress silent router.refresh() on remote active draft change.
 */

const dirtyStateMap = new Map<string, boolean>()

let listener: (() => void) | null = null

export function setEditorDirty(topicId: string, isDirty: boolean): void {
  dirtyStateMap.set(topicId, isDirty)
  // Notify listener (Workbench) to trigger re-render
  if (listener) listener()
}

export function isEditorDirty(topicId: string): boolean {
  return dirtyStateMap.get(topicId) ?? false
}

export function subscribeDirtyState(fn: () => void): () => void {
  listener = fn
  return () => {
    listener = null
  }
}
