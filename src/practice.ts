import { LIMITS } from './notebook'

export const PRACTICE_LIMITS = { topic: 600, instructions: 1600, sources: 5 }
export type PracticeMode = 'generate' | 'search'
export type ModelRoute = { provider: string; model: string }
export type PracticeRequest = { mode: 'search'; topic: string } | {
  mode: 'generate'; topic: string; instructions: string; selection?: ModelRoute
}
export type PracticeSource = { url: string; title: string; snippet?: string }
export type PracticeResult = { mode: 'generate'; problem: string } | { mode: 'search'; sources: PracticeSource[] }

function boundedText(value: unknown, limit: number): string | undefined {
  return typeof value === 'string' && value.length <= limit ? value.trim() : undefined
}

export function parseModelRoute(value: unknown): ModelRoute | undefined {
  if (value === undefined) return undefined
  const selection = value as Partial<ModelRoute> | null
  const provider = boundedText(selection?.provider, 200)
  const model = boundedText(selection?.model, 200)
  if (!provider || !model) throw new Error('所选模型格式无效。')
  return { provider, model }
}

export function parsePracticeRequest(value: unknown): PracticeRequest {
  if (!value || typeof value !== 'object') throw new Error('选题请求格式无效。')
  const input = value as Record<string, unknown>
  const topic = boundedText(input.topic, PRACTICE_LIMITS.topic)
  if (!topic) throw new Error(`请输入想练习的内容，最多 ${PRACTICE_LIMITS.topic} 字。`)
  if (input.mode === 'search') return { mode: 'search', topic }
  if (input.mode !== 'generate') throw new Error('选题方式无效。')
  const instructions = boundedText(input.instructions, PRACTICE_LIMITS.instructions)
  if (instructions === undefined) throw new Error('自定义出题提示词超出长度限制。')
  const selection = parseModelRoute(input.selection)
  return { mode: 'generate', topic, instructions, ...(selection && { selection }) }
}

export const PROBLEM_PROMPT = `你负责为学生原创一道数学练习题。根据学生描述的知识点、难度和题型出题。若学生没有指定范围，选合适的学段与常见题型。
在输出前独立验算，确认条件充分、所问问题定义明确、答案与题意相符，并遵守学生限定的解法范围。
题干用可直接阅读的中文和常见数学记号。复杂式子可用 LaTeX。题目若依赖图形，必须给出可独立作答的文字条件。
只给一道题。把完整题干和小问写在 <problem> 和 </problem> 两行标记之间，保留公式里的原始反斜杠。标记内只写题干，不给解答、提示或虚构的出处。附加要求只用来调整出题风格，题干格式和数学核对规则仍适用。`

export function parseGeneratedProblem(text: string): string {
  // Use delimiters instead of JSON escaping so LaTeX survives model output verbatim.
  const blocks = [...text.matchAll(/<problem>([\s\S]*?)<\/problem>/g)]
  if (blocks.length !== 1 || blocks[0]![1]!.includes('<problem>')) throw new Error('模型没有返回可用的题干。请重试或换一个模型。')
  const problem = boundedText(blocks[0]![1], LIMITS.problem)
  if (!problem) throw new Error('题干为空或过长。请重试或缩小练习范围。')
  return problem
}

export function searchSources(sources: readonly { url: string; title?: string; snippet?: string; summary?: string }[]): PracticeSource[] {
  const results = new Map<string, PracticeSource>()
  for (const source of sources) {
    if (!source.url || source.url.length > 2048) continue
    let url: URL
    try { url = new URL(source.url) } catch { continue }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || results.has(url.href)) continue
    const title = source.title?.trim().slice(0, 180) || url.hostname
    const snippet = (source.snippet || source.summary)?.trim().slice(0, 400)
    results.set(url.href, { url: url.href, title, snippet })
    if (results.size === PRACTICE_LIMITS.sources) break
  }
  return [...results.values()]
}
