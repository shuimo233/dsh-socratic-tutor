import { decodeNotebook, isBlankDocument, NOTEBOOK_STORAGE_PREFIX, type StoragePort } from '../notebook'
import { hasSavedInk } from './handwriting-panel'

const activeKey = 'dsh-socratic-tutor:active-notebook'

export const browserStorage: StoragePort = {
  getItem(key) { return window.localStorage.getItem(key) },
  setItem(key, value) { window.localStorage.setItem(key, value) },
}

export function listSavedNotebooks() {
  const storage = window.localStorage
  const entries: { id: string; title: string; savedAt: number }[] = []
  for (const key of Object.keys(storage)) {
    if (!key.startsWith(NOTEBOOK_STORAGE_PREFIX)) continue
    const raw = storage.getItem(key)
    if (raw === null) continue
    try {
      const encodedId = key.slice(NOTEBOOK_STORAGE_PREFIX.length)
      const id = decodeURIComponent(encodedId)
      const book = decodeNotebook(raw)
      if (isBlankDocument(book.document) && !book.document.steps.some(step => hasSavedInk(`${encodedId}:${step.id}`))) continue
      const heading = book.document.problem.trim().replace(/\s+/g, ' ')
      const title = heading.length > 90 ? `${heading.slice(0, 90)}…` : heading || '未命名草稿'
      const savedAt = typeof book.savedAt === 'number' && Number.isFinite(book.savedAt)
        ? book.savedAt : Date.parse(book.requests.at(-1)?.time ?? '') || 0
      entries.push({ id, title, savedAt })
    } catch { /* Keep unreadable legacy records intact. */ }
  }
  return entries.sort((a, b) => b.savedAt - a.savedAt)
}

export function initialNotebookId(legacyId: string): string {
  try {
    const remembered = browserStorage.getItem(activeKey)
    if (remembered) return remembered
    const entries = listSavedNotebooks()
    return entries.find(entry => entry.id === legacyId)?.id ?? entries[0]?.id ?? legacyId
  } catch { return legacyId }
}

export function rememberNotebook(id: string) {
  browserStorage.setItem(activeKey, id)
}
