// Integration-test fixture only. This adapter does not recognize handwriting and is never published.
import { LlmAdapter } from '@deepseek-ai/dsh-llm'

export const name = 'tutor-vision-test-fixture'
export const inject = ['llm', 'attachments']
export function apply(ctx) {
  class TestVision extends LlmAdapter {
    providerInfo() { return { id: 'tutor-vision-test', name: '测试专用 · 不识别真实笔迹' } }
    async listModels() {
      return [
        { provider: 'tutor-vision-test', id: 'ink-fixture', name: '测试专用转录返回值', inputModalities: ['text', 'image'] },
        { provider: 'tutor-vision-test', id: 'text-fixture', name: '测试专用文字回复', inputModalities: ['text'] },
      ]
    }
    async resolveModel(_provider, model) { return (await this.listModels()).find(info => info.id === model) }
    async *stream(options) {
      const prompt = options.messages[0]?.content.find(part => part.type === 'text')?.text ?? ''
      const image = options.messages[0]?.content.find(part => part.type === 'image')
      const discussion = prompt.includes('"discussion":')
      if (options.model === 'ink-fixture') {
        if (!image) throw new Error('Fixture expected a real image attachment')
        const stored = await ctx.attachments.readImage(image.attachment)
        if (stored.data.length < 100 || image.attachment.width < 30) throw new Error('Fixture expected a nonempty handwritten image')
      } else if (image || !discussion) throw new Error('Fixture expected a text-only discussion')
      const text = discussion ? (image ? '已读到手绘。试着标出直角所在的顶点。' : '从你写下的两条边开始，试着找出它们的夹角。')
        : JSON.stringify({ latex: 'x^2+1', uncertain: false, message: '' })
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  ctx.llm.registerAdapter(['tutor-vision-test'], new TestVision())
}
