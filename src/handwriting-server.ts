import type { IncomingMessage } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-attachment'
import { INK_LIMITS, parseRecognition, TRANSCRIPTION_PROMPT, type VisionModel } from './handwriting'
import { readJson, reply, tutorCapability } from './web-route'

const PATH = '/socratic-tutor/handwriting'

export async function readInkRequest(req: IncomingMessage): Promise<{ provider: string; model: string; image: string }> {
  const value = await readJson(req, INK_LIMITS.image + 4096, '识别请求格式无效。', '手写图片过大，请缩小书写范围后重试。')
  if (!value || typeof value !== 'object') throw new Error('识别请求格式无效。')
  const v = value as Record<string, unknown>
  if (typeof v.provider !== 'string' || !v.provider || v.provider.length > 200 ||
      typeof v.model !== 'string' || !v.model || v.model.length > 200 ||
      typeof v.image !== 'string' || v.image.length > INK_LIMITS.image ||
      !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(v.image)) throw new Error('请选择视觉模型，并提交有效的 PNG 手写图片。')
  return { provider: v.provider, model: v.model, image: v.image }
}

export function registerHandwriting(ctx: Context): void {
  const authorized = tutorCapability(ctx, '__SOCRATIC_HANDWRITING__', PATH, '识别连接已失效，请刷新 Harness 页面。')
  const active = new Set<AbortController>()
  ctx.effect(() => () => { for (const controller of active) controller.abort(); active.clear() })
  async function models(): Promise<VisionModel[]> {
    const providers = ctx.llm.listProviders().slice(0, 30)
    const lists = await Promise.allSettled(providers.map(async provider => {
      const timeout = AbortSignal.timeout(10000)
      const abort = new Promise<never>((_, reject) => timeout.addEventListener('abort', () => reject(new Error('timeout')), { once: true }))
      return Promise.race([ctx.llm.listModels(provider.id), abort])
    }))
    return lists.flatMap(list => list.status === 'fulfilled' ? list.value.filter(m => m.inputModalities?.includes('image')).slice(0, 100)
      .map(m => ({ provider: m.provider, id: m.id, name: m.name })) : [])
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: `${PATH}/models`, handler: async (req, res) => {
    if (!authorized(req, res)) return
    if (req.method !== 'GET') { reply(res, 405, { error: 'Method not allowed' }); return }
    try {
      const available = await models()
      reply(res, 200, { models: available, message: available.length ? undefined : '请先在 Harness 中配置支持图片输入的模型，再点击刷新模型。' })
    } catch { reply(res, 503, { error: '暂时无法读取视觉模型，请稍后刷新。' }) }
  } }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: `${PATH}/recognize`, handler: async (req, res) => {
    if (!authorized(req, res)) return
    if (req.method !== 'POST') { reply(res, 405, { error: 'Method not allowed' }); return }
    if (active.size >= 2) { reply(res, 429, { error: '识别正在进行，请稍后重试。' }); return }
    const controller = new AbortController()
    active.add(controller)
    const timer = setTimeout(() => controller.abort(), 60000)
    const onClose = () => { if (!res.writableEnded) controller.abort() }
    res.on('close', onClose)
    let stage: 'input' | 'model' = 'input'
    try {
      const input = await readInkRequest(req)
      if (controller.signal.aborted) throw new Error('cancelled')
      const available = await models()
      if (!available.some(m => m.provider === input.provider && m.id === input.model)) throw new Error('所选视觉模型不可用，请刷新模型列表。')
      stage = 'model'
      const attachment = await ctx.attachments.saveImage({ data: Buffer.from(input.image.split(',')[1]!, 'base64'), mediaType: 'image/png', name: 'handwritten-formula.png' })
      let text = '', finished = false
      for await (const chunk of ctx.llm.stream({
        provider: input.provider, model: input.model, system: TRANSCRIPTION_PROMPT, maxTokens: 1500, signal: controller.signal,
        messages: [{ role: 'user', content: [{ type: 'text', text: '请忠实转录这张手写公式图片。' }, { type: 'image', attachment }] }],
      })) {
        if (chunk.type === 'text-delta') text += chunk.text
        if (text.length > 10000) throw new Error('output-limit')
        if (chunk.type === 'finish') {
          if (chunk.reason.kind !== 'stop') throw new Error(chunk.reason.kind)
          finished = true
        }
      }
      if (!finished || controller.signal.aborted) throw new Error('incomplete')
      let result
      try { result = parseRecognition(text) } catch (error) { reply(res, 422, { error: error instanceof Error ? error.message : '识别结果无效。' }); return }
      reply(res, 200, result)
    } catch (error) {
      if (controller.signal.aborted) reply(res, 408, { error: '识别已取消或超时，手写内容已保留，可以重试。' })
      else if (stage === 'input') reply(res, 400, { error: error instanceof Error ? error.message : '识别请求格式无效。' })
      // Provider diagnostics can contain sensitive connection facts. Keep them on the native model settings surface.
      else reply(res, 502, { error: '视觉模型未能完成识别。请检查 Harness 的模型配置，或换一个视觉模型重试。' })
    } finally { clearTimeout(timer); active.delete(controller); res.off('close', onClose) }
  } }))
}
