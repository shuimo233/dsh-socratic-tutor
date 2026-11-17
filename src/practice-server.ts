import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-llm'
import { PRACTICE_LIMITS, PROBLEM_PROMPT, parseGeneratedProblem, parsePracticeRequest, searchSources, type ModelRoute, type PracticeRequest } from './practice'
import { readJson, reply, tutorCapability } from './web-route'

const PATH = '/socratic-tutor/practice'
// Only the stable search part of ctx.web is needed. Older Harness profiles may not mount it.
type SearchRuntime = {
  search(request: { query: string; maxResults: number }, signal: AbortSignal): Promise<{ sources: Parameters<typeof searchSources>[0] }>
}
class GenerationError extends Error {}

async function generateProblem(ctx: Context, route: ModelRoute, input: Extract<PracticeRequest, { mode: 'generate' }>, signal: AbortSignal) {
  let text = ''
  for await (const chunk of ctx.llm.stream({
    provider: route.provider, model: route.model, system: PROBLEM_PROMPT, signal, maxTokens: 8000,
    messages: [{ role: 'user', content: [{ type: 'text', text: JSON.stringify({ topic: input.topic, instructions: input.instructions }) }] }],
  })) {
    if (chunk.type === 'text-delta') text += chunk.text
    if (text.length > 12000) throw new Error('output-limit')
    if (chunk.type !== 'finish') continue
    signal.throwIfAborted()
    if (chunk.reason.kind === 'stop') return text
    if (chunk.reason.kind === 'max-tokens') throw new GenerationError('题干生成达到输出上限。请缩小练习范围后重试。')
    if (chunk.reason.kind === 'error') {
      const { code } = chunk.reason.failure
      const label = /^[A-Z][A-Z0-9_]{1,60}$/.test(code) ? `（${code}）` : ''
      throw new GenerationError(`模型调用失败${label}。请检查 Harness 的模型配置或换一个模型。`)
    }
    break
  }
  throw new GenerationError('模型未返回完整题干，请重试。')
}

export function registerPractice(ctx: Context): void {
  const authorized = tutorCapability(ctx, '__SOCRATIC_PRACTICE__', PATH, '选题连接已失效，请刷新 Harness 页面。')
  const active = new Set<AbortController>()
  let web: SearchRuntime | undefined
  let defaultModel: { currentSelection(): ModelRoute } | undefined
  ctx.inject(['web'], scope => {
    web = (scope as Context & { web: SearchRuntime }).web
    scope.effect(() => () => { web = undefined })
  })
  ctx.inject(['agentDefaultModel'], scope => {
    defaultModel = (scope as Context & { agentDefaultModel: NonNullable<typeof defaultModel> }).agentDefaultModel
    scope.effect(() => () => { defaultModel = undefined })
  })
  ctx.effect(() => () => { for (const controller of active) controller.abort(); active.clear() })
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: `${PATH}/find`, handler: async (req, res) => {
    if (!authorized(req, res)) return
    if (req.method !== 'POST') { reply(res, 405, { error: 'Method not allowed' }); return }
    if (active.size >= 2) { reply(res, 429, { error: '选题请求正在进行，请稍后重试。' }); return }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 75000)
    const onClose = () => { if (!res.writableEnded) controller.abort() }
    res.on('close', onClose)
    active.add(controller)
    let mode: PracticeRequest['mode'] | undefined
    try {
      const input = parsePracticeRequest(await readJson(req, 20000, '选题请求格式无效。', '选题请求过长。'))
      mode = input.mode
      controller.signal.throwIfAborted()
      if (input.mode === 'search') {
        if (!web) { reply(res, 503, { error: '此 Harness 未启用网页搜索服务，可以先使用 AI 出题。' }); return }
        const result = await web.search({ query: `${input.topic} 数学 题目`, maxResults: PRACTICE_LIMITS.sources }, controller.signal)
        controller.signal.throwIfAborted()
        reply(res, 200, { mode, sources: searchSources(result.sources) })
      } else {
        const route = input.selection ?? defaultModel?.currentSelection()
        if (!route?.provider || !route.model) { reply(res, 409, { error: '请先在当前 Harness 对话中选择可用模型。' }); return }
        const text = await generateProblem(ctx, route, input, controller.signal)
        let problem: string
        try { problem = parseGeneratedProblem(text) } catch (error) {
          reply(res, 422, { error: error instanceof Error ? error.message : '题干格式无效。' }); return
        }
        reply(res, 200, { mode, problem })
      }
    } catch (error) {
      if (controller.signal.aborted) reply(res, 408, { error: '选题已取消或超时，可以重试。' })
      else if (mode === undefined) reply(res, 400, { error: error instanceof Error ? error.message : '选题请求格式无效。' })
      else if (mode === 'search' && error && typeof error === 'object' && 'code' in error && error.code === 'WEB_PROVIDER_CREDENTIAL_MISSING') {
        reply(res, 503, { error: '请在 Harness 的「网页搜索和抓取」中配置可供插件使用的搜索凭据。也可以先使用 AI 出题。' })
      }
      else if (mode === 'search') reply(res, 502, { error: '网页搜索未完成。请检查 Harness 的「网页搜索和抓取」设置及搜索凭据。' })
      else if (error instanceof GenerationError) reply(res, 502, { error: error.message })
      else reply(res, 502, { error: '模型未能完成出题。请检查 Harness 的模型配置或换一个模型。' })
    } finally { clearTimeout(timer); active.delete(controller); res.off('close', onClose) }
  } }))
}
