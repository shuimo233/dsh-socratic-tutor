import { createRoot } from 'react-dom/client'
import { NotebookWorkbench } from './client/notebook-runtime'
import { notebookStyles } from './client/notebook-styles'

const style = document.createElement('style')
style.textContent = notebookStyles
document.head.appendChild(style)

function Preview() {
  return <main className="preview-shell">
    <NotebookWorkbench legacyId="standalone-preview" />
  </main>
}

createRoot(document.getElementById('root')!).render(<Preview />)
