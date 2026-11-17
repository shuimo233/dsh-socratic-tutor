import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/types'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useLayoutEffect, useRef } from 'react'
import { mountNotebook } from './notebook-runtime'
import { notebookStyles } from './notebook-styles'

export const name = 'socratic-tutor-client'
export const inject = ['slots', 'layout']

const PANEL_ID = 'socratic-tutor'

type PageProps = PropsRuntime<'main'> & InjectFace<{ onBack(): void }>
function TutorPage({ useSessions, onBack }: PageProps) {
  const sessionId = useSessions(state => Object.values(state.byId).find(session => (session.retainedBy.mainView ?? 0) > 0)?.id)
  const model = useSessions(state => sessionId ? state.projectionsBySession[sessionId]?.values.modelSelection?.next : undefined)
  const container = useRef<HTMLDivElement>(null)
  const notebook = useRef<ReturnType<typeof mountNotebook> | null>(null)

  useLayoutEffect(() => {
    if (!container.current) return
    const mounted = mountNotebook(container.current)
    notebook.current = mounted
    return () => {
      notebook.current = null
      mounted.unmount()
    }
  }, [])

  useLayoutEffect(() => {
    notebook.current?.render({
      legacyId: sessionId ?? 'socratic-workbench',
      preferredModel: model ? { provider: model.provider, id: model.model } : undefined,
      onBack,
    })
  }, [sessionId, model, onBack])

  return <div ref={container} className="st-page-mount" />
}

function TutorIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 4.5h13v15H6a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z" /><path d="M8 4.5v15M11 9h5m-5 4h4" />
  </svg>
}

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-socratic-tutor'
    style.textContent = notebookStyles
    document.head.appendChild(style)
    return () => style.remove()
  })
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: PANEL_ID, inject: () => ({ onBack: () => ctx.layout.selectPanel(null) }),
  }, TutorPage))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, order: 15, label: () => '循思',
  }, TutorIcon))
}
