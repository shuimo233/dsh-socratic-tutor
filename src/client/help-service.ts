import type { HelpEvent, HelpInput, HelpResult } from '../help'
import { HELP_ANSWER_LIMIT } from '../notebook'
import { tutorResponse, type TutorBoot } from './tutor-request'

export async function requestHelp(boot: TutorBoot, input: HelpInput, signal: AbortSignal, onText: (text: string) => void): Promise<HelpResult> {
  const response = await tutorResponse(boot, 'ask', signal, '辅导服务', input, 'application/x-ndjson')
  if (!response.headers.get('content-type')?.includes('application/x-ndjson')) return response.json()
  if (!response.body) throw new Error('辅导回复为空，请重试。')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = '', answer = '', received = 0
  try {
    while (true) {
      const chunk = await reader.read()
      signal.throwIfAborted()
      if (chunk.done) break
      received += chunk.value.byteLength
      if (received > 500000) throw new Error('辅导回复过长，请缩小问题后重试。')
      buffer += decoder.decode(chunk.value, { stream: true })
      let end = buffer.indexOf('\n')
      while (end >= 0) {
        const line = buffer.slice(0, end).trim()
        buffer = buffer.slice(end + 1)
        if (line) {
          let event: HelpEvent
          try { event = JSON.parse(line) as HelpEvent }
          catch { throw new Error('辅导回复格式无效，请重试。') }
          if (!event || typeof event !== 'object') throw new Error('辅导回复格式无效，请重试。')
          if (event.type === 'error') throw new Error(typeof event.error === 'string' ? event.error : '辅导暂时不可用。')
          if (event.type === 'done') return event.result
          if (event.type === 'text') {
            if (typeof event.text !== 'string' || answer.length + event.text.length > HELP_ANSWER_LIMIT) throw new Error('辅导回复格式无效。')
            answer += event.text
            onText(answer)
          } else if (event.type !== 'working') throw new Error('辅导回复格式无效，请重试。')
        }
        end = buffer.indexOf('\n')
      }
    }
    throw new Error('辅导回复中断，请重试。')
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
