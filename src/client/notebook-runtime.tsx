import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { NotebookView } from './notebook-view'
import { initialNotebookId, rememberNotebook } from './notebook-storage'

type WorkbenchProps = Omit<Parameters<typeof NotebookView>[0], 'notebookId' | 'onOpenNotebook'> & { legacyId: string }

export function NotebookWorkbench({ legacyId, ...props }: WorkbenchProps) {
  const [notebookId, setNotebookId] = useState(() => initialNotebookId(legacyId))
  useEffect(() => {
    try { rememberNotebook(notebookId) } catch { /* The notebook reports storage failures when saving. */ }
  }, [notebookId])

  function openNotebook(id: string) {
    rememberNotebook(id)
    setNotebookId(id)
  }

  return <NotebookView key={notebookId} notebookId={notebookId} onOpenNotebook={openNotebook} {...props} />
}

export function mountNotebook(container: HTMLElement) {
  const root = createRoot(container)
  return {
    render(props: WorkbenchProps) {
      root.render(<NotebookWorkbench {...props} />)
    },
    unmount() {
      root.unmount()
    },
  }
}
