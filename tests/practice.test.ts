import test from 'node:test'
import assert from 'node:assert/strict'
import { parseGeneratedProblem, parsePracticeRequest, searchSources } from '../src/practice'

test('search forwards only the topic and generation can use the host default model', () => {
  assert.deepEqual(parsePracticeRequest({ mode: 'search', topic: ' 导数 ', instructions: 'only for generation' }), { mode: 'search', topic: '导数' })
  assert.deepEqual(parsePracticeRequest({ mode: 'generate', topic: '导数', instructions: '' }), { mode: 'generate', topic: '导数', instructions: '' })
  assert.throws(() => parsePracticeRequest({ mode: 'generate', topic: '导数', instructions: '', selection: { provider: 'deepseek' } }), /模型格式无效/)
  assert.throws(() => parsePracticeRequest({ mode: 'search', topic: '  ' }), /想练习的内容/)
})

test('generated output accepts only usable problem text from structured output', () => {
  const problem = String.raw`设 $f(x)=\frac{\ln x}{x}$，求其导数。`
  assert.equal(parseGeneratedProblem(`<problem>\n${problem}\n</problem>`), problem)
  assert.throws(() => parseGeneratedProblem('<problem></problem>'), /题干为空/)
  assert.throws(() => parseGeneratedProblem('<problem>题目一</problem><problem>题目二</problem>'), /可用的题干/)
  assert.throws(() => parseGeneratedProblem('题目还没写完'), /可用的题干/)
})

test('only unique HTTP sources without user info can be opened', () => {
  assert.deepEqual(searchSources([
    { url: 'javascript:alert(1)' }, { url: 'https://a:b@example.com/' },
    { url: 'https://example.com', summary: '网页摘要' }, { url: 'https://example.com/' },
  ]), [{ url: 'https://example.com/', title: 'example.com', snippet: '网页摘要' }])
})
