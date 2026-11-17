import { INK_LIMITS } from './handwriting'
import { isHelpAction, isHintLevel, LIMITS, validateDocument, type Discussion, type Document, type HelpAction, type HelpRecord, type HintLevel } from './notebook'
import { parseModelRoute, type ModelRoute } from './practice'

export type HelpInput = { document: Document; action: HelpAction; level: HintLevel; revision: number; annotationId?: string; previousHint?: string; selection?: ModelRoute; discussion?: Discussion; inkImage?: string }
export type HelpResult = { record: HelpRecord & { answer: string } }
export type HelpEvent = { type: 'working' } | { type: 'text'; text: string } | { type: 'done'; result: HelpResult } | { type: 'error'; error: string }

export function parseHelpInput(value: unknown): HelpInput {
  if (!value || typeof value !== 'object') throw new Error('辅导请求格式无效。')
  const { document, action, level, revision, selection, annotationId, previousHint, discussion, inkImage } = value as Record<string, unknown>
  if (!validateDocument(document) || !isHelpAction(action) || !isHintLevel(level) ||
      typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
    throw new Error('辅导请求格式无效。')
  }
  if (!document.problem.trim()) throw new Error('请先填写题目。')
  if (annotationId !== undefined) {
    const annotation = document.annotations?.find(item => item.id === annotationId)
    if (typeof annotationId !== 'string' || !annotation || (action !== 'discuss' && (action !== 'hint' || !annotation.question.trim())) ||
        (annotation.stepId !== undefined && annotation.stepId !== document.selectedId)) throw new Error('请填写有效的卡点标注。')
  }
  if (previousHint !== undefined && (action !== 'hint' || annotationId === undefined || typeof previousHint !== 'string' || previousHint.length > LIMITS.question)) {
    throw new Error('上一次提示格式无效。')
  }
  const conversation = action === 'discuss' ? parseDiscussion(discussion) : undefined
  if (inkImage !== undefined && (!conversation || typeof inkImage !== 'string' || inkImage.length > INK_LIMITS.image ||
      !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(inkImage))) throw new Error('手绘草稿图片格式无效。')
  return { document, action, level, revision, annotationId, previousHint, discussion: conversation, inkImage, selection: parseModelRoute(selection) }
}

function parseDiscussion(value: unknown): Discussion {
  const { message, previous } = (value ?? {}) as Record<string, unknown>
  if (typeof message !== 'string' || !message.trim() || message.length > LIMITS.question) throw new Error('请先写下你的想法或卡点。')
  if (previous === undefined) return { message: message.trim() }
  const last = previous as Partial<NonNullable<Discussion['previous']>> | null
  if (typeof last?.message !== 'string' || !last.message.trim() || last.message.length > LIMITS.question ||
      typeof last.answer !== 'string' || !last.answer.trim() || last.answer.length > LIMITS.question) throw new Error('上一轮讨论格式无效。')
  return { message: message.trim(), previous: { message: last.message, answer: last.answer } }
}
