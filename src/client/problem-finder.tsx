import { useEffect, useRef, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import { PRACTICE_LIMITS, type PracticeMode, type PracticeRequest, type PracticeResult } from '../practice'
import { tutorRequest, type TutorBoot } from './tutor-request'
import { ProblemText } from './problem-text'

declare global {
  interface Window { __SOCRATIC_PRACTICE__?: TutorBoot }
}

const instructionsKey = 'dsh-socratic-tutor:problem-instructions:v1'

export function ProblemFinder({ model, onUse }: {
  model?: { provider: string; id: string }; onUse(problem: string): void
}) {
  const [topic, setTopic] = useState('')
  const [instructions, setInstructions] = useState(() => {
    try { return window.localStorage.getItem(instructionsKey)?.slice(0, PRACTICE_LIMITS.instructions) ?? '' }
    catch { return '' }
  })
  const [pending, setPending] = useState<PracticeMode | null>(null)
  const [result, setResult] = useState<PracticeResult | null>(null)
  const [error, setError] = useState('')
  const active = useRef<AbortController | null>(null)
  useEffect(() => () => active.current?.abort(), [])

  async function find(mode: PracticeMode) {
    if (!topic.trim() || active.current) return
    const boot = window.__SOCRATIC_PRACTICE__
    if (!boot) { setError('请在 Harness 内使用 AI 出题和网页搜索。'); return }
    const input: PracticeRequest = mode === 'search' ? { mode, topic } : {
      mode, topic, instructions, selection: model ? { provider: model.provider, model: model.id } : undefined,
    }
    const controller = new AbortController()
    active.current = controller
    setResult(null)
    setError('')
    setPending(mode)
    try {
      const response = await tutorRequest<PracticeResult>(boot, 'find', controller.signal, '选题', input)
      if (!controller.signal.aborted) setResult(response)
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '选题失败，请重试。')
    } finally {
      if (active.current === controller && !controller.signal.aborted) { active.current = null; setPending(null) }
    }
  }

  return <section className="st-problem-finder" aria-label="找题">
    <form className="st-finder-actions" onSubmit={event => { event.preventDefault(); void find('generate') }}>
      <TextInput label="练习需求" isLabelHidden placeholder="题型、知识点或难度"
        containerClassName="st-finder-input" width="100%" size="sm" value={topic} isDisabled={Boolean(pending)}
        onChange={value => { setTopic(value.slice(0, PRACTICE_LIMITS.topic)); setResult(null); setError('') }} />
      <div className="st-finder-buttons">
        <Button label="AI 出题" type="submit" variant="primary" size="sm" isDisabled={!topic.trim() || pending === 'search'} isLoading={pending === 'generate'} />
        <Button label="搜索题目" size="sm" onClick={() => void find('search')} isDisabled={!topic.trim() || pending === 'generate'} isLoading={pending === 'search'} />
      </div>
    </form>
    <details className="st-finder-settings">
      <summary>自定义出题提示词</summary>
      <textarea aria-label="自定义出题提示词" value={instructions} maxLength={PRACTICE_LIMITS.instructions} disabled={Boolean(pending)} rows={2}
        placeholder="例如：分两小问，逐层加难，限定用高中方法。" onChange={event => {
          const value = event.target.value
          setInstructions(value)
          if (result?.mode === 'generate') setResult(null)
          try { window.localStorage.setItem(instructionsKey, value) } catch { /* Available in memory for this session. */ }
        }} />
    </details>
    {pending && <div className="st-finder-progress">
      <span role="status"><span className="st-progress-dot" aria-hidden="true" />{pending === 'generate' ? '正在出题…' : '正在搜索网页…'}</span>
      <Button label="取消" size="sm" variant="ghost" onClick={() => { active.current?.abort(); active.current = null; setPending(null) }} />
    </div>}
    {error && <p role="alert">{error}</p>}
    {result?.mode === 'generate' && <div className="st-finder-result">
      <ProblemText text={result.problem} />
      <div className="st-finder-result-actions"><Button label="填入题目" size="sm" variant="primary" onClick={() => onUse(result.problem)} /></div>
    </div>}
    {result?.mode === 'search' && <div className="st-finder-result">
      {result.sources.length ? <>
        <ul>{result.sources.map(source => <li key={source.url}>
          <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <span aria-hidden="true">↗</span></a>
          {source.snippet && <p>{source.snippet}</p>}
        </li>)}</ul>
      </> : <p>未找到可用来源。</p>}
    </div>}
  </section>
}
