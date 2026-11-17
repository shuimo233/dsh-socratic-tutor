import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-llm'
import { parseHelpInput, type HelpEvent, type HelpResult } from './help'
import { INK_LIMITS } from './handwriting'
import { HELP_ANSWER_LIMIT, prepareHelp } from './notebook'
import type { ModelRoute } from './practice'
import { readJson, reply, tutorCapability } from './web-route'

const PATH = '/socratic-tutor/help'

export function registerHelp(ctx: Context): void {
  const authorized = tutorCapability(ctx, '__SOCRATIC_HELP__', PATH, '辅导连接已失效，请刷新 Harness 页面。')
  const active = new Set<AbortController>()
  let defaultModel: { currentSelection(): ModelRoute } | undefined
  ctx.inject(['agentDefaultModel'], scope => {
    defaultModel = (scope as Context & { agentDefaultModel: NonNullable<typeof defaultModel> }).agentDefaultModel
    scope.effect(() => () => { defaultModel = undefined })
  })
  ctx.effect(() => () => { for (const controller of active) controller.abort() })
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: `${PATH}/ask`, handler: async (req, res) => {
    if (!authorized(req, res)) return
    if (req.method !== 'POST') { reply(res, 405, { error: 'Method not allowed' }); return }
    if (active.size >= 2) { reply(res, 429, { error: '辅导请求较多，请稍后重试。' }); return }
    const controller = new AbortController()
    const signal = controller.signal
    const timeout = setTimeout(() => controller.abort(), 90000)
    const close = () => { if (!res.writableEnded) controller.abort() }
    res.on('close', close)
    active.add(controller)
    const streaming = req.headers.accept?.includes('application/x-ndjson')
    const emit = (event: HelpEvent) => {
      if (!streaming || res.destroyed || res.writableEnded) return
      if (!res.headersSent) res.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      })
      res.write(JSON.stringify(event) + '\n')
    }
    const fail = (status: number, error: string) => {
      if (streaming && res.headersSent) { emit({ type: 'error', error }); res.end() }
      else reply(res, status, { error })
    }
    try {
      let input
      try { input = parseHelpInput(await readJson(req, 180000 + INK_LIMITS.image, '辅导请求格式无效。', '辅导请求过长。')) }
      catch (error) { fail(400, error instanceof Error ? error.message : '辅导请求格式无效。'); return }
      signal.throwIfAborted()
      const route = input.selection ?? defaultModel?.currentSelection()
      if (!route?.provider || !route.model) { fail(409, '请先在 Harness 中选择可用模型。'); return }
      const { system, studentWork, record } = prepareHelp({
        document: input.document, revision: input.revision, levels: { [input.annotationId ?? input.document.selectedId]: input.level },
      }, input.action, input.annotationId, input.previousHint, input.discussion)
      let answer = ''
      emit({ type: 'working' })
      const modelInfo = input.inkImage || input.action === 'discuss' || (input.annotationId && record.level === 1)
        ? await ctx.llm.resolveModelInfo(route.provider, route.model, signal) : undefined
      const reasoningEffort = modelInfo?.reasoning?.efforts.find(effort => effort.id === 'low')?.id
      const attachment = input.inkImage && modelInfo?.inputModalities?.includes('image')
        ? await ctx.attachments.saveImage({ data: Buffer.from(input.inkImage.split(',')[1]!, 'base64'), mediaType: 'image/png', name: 'scratchpad.png' })
        : undefined
      const text = attachment ? `${studentWork}\n附图是学生手绘草稿，按第几段标记。辨认不清时请学生补充，勿猜测。`
        : input.inkImage ? `${studentWork}\n本次只能读取文字、公式和结构化图形。若需要看手绘才能回答，请学生补充相关式子。` : studentWork
      for await (const chunk of ctx.llm.stream({
        provider: route.provider, model: route.model, system, signal, maxTokens: 10000,
        ...(reasoningEffort && { reasoningEffort }),
        messages: [{ role: 'user', content: attachment ? [{ type: 'text', text }, { type: 'image', attachment }] : [{ type: 'text', text }] }],
      })) {
        if (chunk.type === 'text-delta') {
          answer += chunk.text
          if (answer.length > HELP_ANSWER_LIMIT) { fail(422, '辅导回复超出显示上限，请缩小当前问题后重试。'); return }
          emit({ type: 'text', text: chunk.text })
        }
        if (chunk.type !== 'finish') continue
        signal.throwIfAborted()
        if (chunk.reason.kind === 'stop' && answer.trim()) {
          const result = { record: { ...record, answer: answer.trim(), ...(input.inkImage && !attachment && { inkOmitted: true }) } } satisfies HelpResult
          if (streaming) { emit({ type: 'done', result }); res.end() }
          else reply(res, 200, result)
          return
        }
        if (chunk.reason.kind === 'max-tokens') { fail(422, '模型未能在输出上限内完成回复，请缩小当前问题后重试。'); return }
        break
      }
      fail(502, '模型未返回可用的辅导回复。请重试或检查 Harness 的模型连接。')
    } catch {
      if (signal.aborted) fail(408, '辅导已取消或超时，可以重试。')
      else fail(502, '辅导模型调用失败。请检查 Harness 的模型连接后重试。')
    } finally { clearTimeout(timeout); active.delete(controller); res.off('close', close) }
  } }))
}
