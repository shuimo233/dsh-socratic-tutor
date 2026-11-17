import test from 'node:test'
import assert from 'node:assert/strict'
import { requestHelp } from '../src/client/help-service'
import { createNotebook } from '../src/notebook'
import type { HelpEvent, HelpInput } from '../src/help'

test('help streaming decodes split UTF-8 and only completes with a final record', async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { baseURI: 'http://localhost/' } })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'document', original)
    else Reflect.deleteProperty(globalThis, 'document')
  })
  const notebook = createNotebook()
  notebook.document.problem = '测试题'
  const input: HelpInput = { document: notebook.document, action: 'hint', level: 0, revision: 0 }
  const result = { record: { stepId: notebook.document.selectedId, action: 'hint' as const, level: 1 as const, revision: 0, time: new Date().toISOString(), answer: '观察分母。' } }
  function response(events: HelpEvent[]) {
    const bytes = new TextEncoder().encode(events.map(event => JSON.stringify(event)).join('\n') + '\n')
    return new Response(new ReadableStream({ start(controller) {
      for (let offset = 0; offset < bytes.length; offset += 7) controller.enqueue(bytes.slice(offset, offset + 7))
      controller.close()
    } }), { headers: { 'Content-Type': 'application/x-ndjson' } })
  }
  let currentResponse = response([{ type: 'text', text: '观察' }, { type: 'text', text: '分母。' }, { type: 'done', result }])
  t.mock.method(globalThis, 'fetch', async () => currentResponse)
  const seen: string[] = []
  const boot = { path: 'help', token: 'fixture' }
  const signal = new AbortController().signal
  assert.deepEqual(await requestHelp(boot, input, signal, text => seen.push(text)), result)
  assert.deepEqual(seen, ['观察', '观察分母。'])
  currentResponse = response([{ type: 'text', text: '部分提示' }])
  await assert.rejects(requestHelp(boot, input, signal, () => {}), /辅导回复中断/)
  currentResponse = response([{ type: 'error', error: '模型超时' }])
  await assert.rejects(requestHelp(boot, input, signal, () => {}), /模型超时/)
})
