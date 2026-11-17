import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import {
  decodeNotebook, HELP_ANSWER_LIMIT, isBlankDocument, LIMITS, loadNotebook, newStep,
  recordHelp, saveNotebook, selectedStep, updateDocument,
  type Annotation, type Document, type Notebook, type Step,
} from '../notebook'
import type { HelpInput } from '../help'
import { findMethod, METHOD_GROUPS } from '../methods'
import { FormulaField } from './math-field'
import { DiagramEditor, DiagramPreview } from './diagram-editor'
import { inferDiagram } from '../geometry'
import { discussionInk, HandwritingPanel, hasSavedInk, InkPreview } from './handwriting-panel'
import { handwritingService } from './handwriting-service'
import { ProblemFinder } from './problem-finder'
import { ProblemText } from './problem-text'
import type { TutorBoot } from './tutor-request'
import { requestHelp } from './help-service'
import type { VisionModel } from '../handwriting'
import { browserStorage, listSavedNotebooks } from './notebook-storage'
import { NotebookSelector } from './notebook-selector'

declare global {
  interface Window { __SOCRATIC_HELP__?: TutorBoot }
}

const methodOptions = [
  { value: 'auto', label: '由 AI 判断' },
  ...METHOD_GROUPS.map(group => ({ type: 'section' as const, title: group.label,
    options: group.methods.map(method => ({ value: method.id, label: method.label, description: method.when })) })),
]

export function NotebookView({ notebookId, onOpenNotebook, onBack, preferredModel }: {
  notebookId: string; onOpenNotebook(id: string): void; onBack?(): void
  preferredModel?: Pick<VisionModel, 'provider' | 'id'>
}) {
  const [initial] = useState(() => loadNotebook(browserStorage, notebookId))
  const [book, setBook] = useState(initial.notebook)
  const [editingProblem, setEditingProblem] = useState(!initial.notebook.document.problem.trim())
  const current = useRef(book)
  const saved = useRef<Notebook | null>(book)
  const [notice, setNotice] = useState(initial.warning ?? '')
  const [savingBlocked, setSavingBlocked] = useState(Boolean(initial.warning))
  const [findingProblem, setFindingProblem] = useState(false)
  const [annotationId, setAnnotationId] = useState<string | null>(null)
  const [selectedQuote, setSelectedQuote] = useState<{ stepId?: string; text: string } | null>(null)
  const [discussionOpen, setDiscussionOpen] = useState(false)
  const [discussionDrafts, setDiscussionDrafts] = useState<Record<string, string>>({})
  const [helpOptions, setHelpOptions] = useState(false)
  const [fileActions, setFileActions] = useState(false)
  const [history, setHistory] = useState<ReturnType<typeof listSavedNotebooks> | null>(null)
  const [manualDiagram, setManualDiagram] = useState(false)
  const [diagramStep, setDiagramStep] = useState<string | null>(null)
  const [formulaStep, setFormulaStep] = useState<string | null>(null)
  const [inkTarget, setInkTarget] = useState<{ id: string; latex: string } | null>(null)
  const [asking, setAsking] = useState(false)
  const [helpError, setHelpError] = useState<{ targetId: string; message: string } | null>(null)
  const [helpProgress, setHelpProgress] = useState<{ targetId: string; message: string; text: string } | null>(null)
  const activeHelp = useRef<AbortController | null>(null)
  const past = useRef<Document[]>([])
  const future = useRef<Document[]>([])
  const grouping = useRef({ key: '', at: 0 })
  const fileInput = useRef<HTMLInputElement>(null)
  const importing = useRef<File | null>(null)
  const problemInput = useRef<HTMLTextAreaElement>(null)
  const problemReading = useRef<HTMLDivElement>(null)
  const helpHeading = useRef<HTMLHeadingElement>(null)
  const discussionInput = useRef<HTMLTextAreaElement>(null)
  const discussionThread = useRef<HTMLDivElement>(null)
  const diagramEditor = useRef<HTMLDivElement>(null)
  const activeNote = useRef<HTMLTextAreaElement>(null)
  const selected = selectedStep(book)
  const selectedNumber = book.document.steps.findIndex(step => step.id === selected.id) + 1
  const diagramNumber = book.document.steps.slice(0, selectedNumber).map(step => Boolean(step.diagram)).lastIndexOf(true) + 1
  const inheritedDiagram = diagramNumber < selectedNumber ? book.document.steps[diagramNumber - 1]?.diagram : undefined
  const suggestedDiagram = inferDiagram(book.document.problem)
  const hasProblem = Boolean(book.document.problem.trim())
  const showDiagram = Boolean(suggestedDiagram || diagramNumber || (hasProblem && manualDiagram))
  const readingProblem = hasProblem && !editingProblem
  const annotations = book.document.annotations ?? []
  const activeAnnotation = annotations.find(item => item.id === annotationId)
  const method = findMethod(selected.methodId)
  const turns = book.requests.filter(record => record.answer && (activeAnnotation
    ? record.annotationId === activeAnnotation.id
    : !record.annotationId && record.action === 'discuss'))
  const feedback = turns.at(-1)
  const helpBoot = window.__SOCRATIC_HELP__
  const canAsk = Boolean(helpBoot && hasProblem && !asking)
  const canFind = !hasProblem && !savingBlocked
  const showingFinder = canFind && findingProblem
  const targetId = activeAnnotation?.id ?? ''
  const composerOpen = discussionOpen || Boolean(activeAnnotation)
  const previousMessage = feedback?.message ?? (feedback?.answer ? activeAnnotation?.question : undefined)
  const draft = Object.hasOwn(discussionDrafts, targetId) ? discussionDrafts[targetId]! : previousMessage ? '' : activeAnnotation?.question ?? ''
  const progress = helpProgress?.targetId === targetId ? helpProgress : undefined
  const composerEnabled = composerOpen && (hasProblem || Boolean(activeAnnotation))
  useLayoutEffect(() => {
    const thread = discussionThread.current
    if (thread) thread.scrollTop = thread.scrollHeight
  }, [composerEnabled, targetId, feedback, progress?.message])
  useLayoutEffect(() => () => { activeHelp.current?.abort(); activeHelp.current = null }, [])
  useEffect(() => {
    let frame = 0
    const changed = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const container = problemReading.current
        if (!container) return
        const quote = problemSelection(container)
        if (quote) captureQuote(quote)
      })
    }
    document.addEventListener('selectionchange', changed)
    return () => { document.removeEventListener('selectionchange', changed); cancelAnimationFrame(frame) }
  }, [])

  function cancelHelp() {
    activeHelp.current?.abort()
    activeHelp.current = null
    setAsking(false)
    setHelpProgress(null)
  }

  function commit(next: Notebook) {
    if (next.revision !== current.current.revision) setHelpError(null)
    current.current = next
    setBook(next)
    if (!savingBlocked) persist(next)
  }
  function persist(next: Notebook) {
    const warning = saveNotebook(browserStorage, notebookId, next)
    if (warning) { saved.current = null; setNotice(warning); return false }
    saved.current = next
    return true
  }
  function edit(fn: (document: Document) => Document, group = '') {
    try {
      const previous = current.current
      const document = fn(previous.document)
      const next = updateDocument(previous, document)
      const now = Date.now()
      if (!group || grouping.current.key !== group || now - grouping.current.at > 1200) {
        past.current = [...past.current, previous.document].slice(-50)
      }
      grouping.current = { key: group, at: now }
      future.current = []
      if (previous.document.selectedId !== document.selectedId) setInkTarget(null)
      commit(next)
      return true
    } catch (e) { setNotice(e instanceof Error ? e.message : '无法修改草稿。'); return false }
  }
  function select(stepId: string) {
    if (stepId === current.current.document.selectedId) return
    setInkTarget(null)
    commit({ ...current.current, document: { ...current.current.document, selectedId: stepId } })
  }
  function patchStep(stepId: string, patch: Partial<Omit<Step, 'id'>>) {
    return edit(d => ({ ...d, steps: d.steps.map(s => s.id === stepId ? { ...s, ...patch } : s) }), `${stepId}:${Object.keys(patch)[0]}`)
  }
  function captureQuote(text: string, stepId?: string) {
    const quote = text.trim().slice(0, LIMITS.quote)
    setSelectedQuote(quote ? { stepId, text: quote } : null)
  }
  function problemSelection(container: HTMLElement): string {
    const selection = window.getSelection()
    if (!selection?.rangeCount || selection.isCollapsed || !container.contains(selection.anchorNode) || !container.contains(selection.focusNode)) {
      return ''
    }
    const range = selection.getRangeAt(0)
    const ancestor = range.commonAncestorContainer
    const formula = (ancestor instanceof Element ? ancestor : ancestor.parentElement)?.closest('math[data-latex-source]')
    if (formula) return formula.getAttribute('data-latex-source') ?? ''
    const fragment = range.cloneContents()
    for (const math of fragment.querySelectorAll('math[data-latex-source]')) math.replaceWith(math.getAttribute('data-latex-source') ?? '')
    return fragment.textContent ?? ''
  }
  function captureInputSelection(input: HTMLTextAreaElement, stepId?: string) {
    // React can dispatch the old textarea's select event after a MathML selection.
    if (document.activeElement !== input || (problemReading.current && problemSelection(problemReading.current))) return
    captureQuote(input.value.slice(input.selectionStart, input.selectionEnd), stepId)
  }
  function openAnnotation(item: Annotation, editing = false) {
    if (item.stepId) select(item.stepId)
    setAnnotationId(item.id)
    setSelectedQuote(null)
    requestAnimationFrame(() => {
      const target = editing ? discussionInput.current : helpHeading.current
      target?.focus({ preventScroll: true })
      target?.scrollIntoView({ block: 'nearest' })
    })
  }

  function openDiscussion() {
    setDiscussionOpen(true)
    requestAnimationFrame(() => discussionInput.current?.focus())
  }

  function continueWriting() {
    setAnnotationId(null)
    setDiscussionOpen(false)
    activeNote.current?.focus()
  }
  function annotate(stepId?: string) {
    if (annotations.length >= LIMITS.annotations) { setNotice('卡点标注已满，请先移除一条。'); return }
    const liveQuote = stepId === undefined && problemReading.current ? problemSelection(problemReading.current) : ''
    const quote = (liveQuote || (selectedQuote?.stepId === stepId ? selectedQuote?.text ?? '' : '')).trim().slice(0, LIMITS.quote)
    const item: Annotation = { id: crypto.randomUUID(), stepId, quote, question: '' }
    if (edit(document => ({ ...document, annotations: [...(document.annotations ?? []), item] }))) openAnnotation(item, true)
  }
  function annotationMarkers(stepId?: string) {
    return annotations.map((item, index) => item.stepId === stepId && <button key={item.id} className="st-annotation-marker" type="button"
      aria-pressed={activeAnnotation?.id === item.id} onClick={() => openAnnotation(item)}>标注 {index + 1}</button>)
  }
  function undo(redo = false) {
    const source = redo ? future : past
    const target = redo ? past : future
    const document = source.current.at(-1)
    if (!document) return
    source.current = source.current.slice(0, -1)
    target.current = [...target.current, current.current.document].slice(-50)
    grouping.current = { key: '', at: 0 }
    setInkTarget(null)
    // Disclosure history is kept even when written work is undone.
    commit(updateDocument(current.current, document))
  }
  async function sendDiscussion() {
    const { document, revision } = current.current
    const message = draft.trim()
    if (!helpBoot || activeHelp.current || !document.problem.trim() || !message) return
    const stepId = activeAnnotation?.stepId ?? document.selectedId
    const input: HelpInput = {
      document: { ...document, selectedId: stepId, annotations: activeAnnotation ? [activeAnnotation] : undefined },
      action: 'discuss', revision, level: 0, annotationId: activeAnnotation?.id,
      discussion: { message, previous: previousMessage?.trim() && feedback?.answer
        ? { message: previousMessage, answer: feedback.answer.slice(0, LIMITS.question) } : undefined },
      selection: preferredModel && { provider: preferredModel.provider, model: preferredModel.id },
    }
    const controller = new AbortController()
    activeHelp.current = controller
    setAsking(true)
    setHelpProgress({ targetId, message, text: '' })
    setHelpError(null)
    try {
      input.inkImage = discussionInk(document.steps.map(step => `${encodeURIComponent(notebookId)}:${step.id}`))
      const { record } = await requestHelp(helpBoot, input, controller.signal, text => {
        if (activeHelp.current === controller) setHelpProgress({ targetId, message, text })
      })
      if (activeHelp.current !== controller) return
      if (record?.stepId !== stepId || record.annotationId !== activeAnnotation?.id || record.revision !== revision || record.action !== 'discuss' ||
          record.message !== message || record.level !== 1 || (record.inkOmitted !== undefined && typeof record.inkOmitted !== 'boolean') ||
          typeof record.time !== 'string' || record.time.length > 40 ||
          typeof record.answer !== 'string' || !record.answer.trim() || record.answer.length > HELP_ANSWER_LIMIT) {
        throw new Error('未收到可用的辅导回复，请重试。')
      }
      if (!savingBlocked) setNotice('')
      commit(recordHelp(current.current, record))
      setDiscussionDrafts(drafts => ({ ...drafts, [targetId]: '' }))
    } catch (e) {
      if (activeHelp.current === controller) setHelpError({ targetId, message: e instanceof Error ? e.message : '辅导暂时不可用，请重试。' })
    } finally {
      if (activeHelp.current === controller) {
        activeHelp.current = null
        setAsking(false)
        setHelpProgress(null)
      }
    }
  }
  function exportFile() {
    const blob = new Blob([JSON.stringify(current.current, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `循思草稿-${new Date().toISOString().slice(0, 10)}.json`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function importFile(file: File | undefined) {
    if (!file) return
    importing.current = file
    try {
      if (file.size > 256000) throw new Error('文件超过 256 KB，无法导入。')
      const text = await file.text()
      if (importing.current === file && fileInput.current) openNotebook(crypto.randomUUID(), decodeNotebook(text))
    } catch (e) {
      if (importing.current === file && fileInput.current) setNotice(e instanceof Error ? e.message : '导入失败。')
    } finally {
      if (importing.current === file) importing.current = null
    }
  }
  function openNotebook(id: string, imported?: Notebook) {
    if (id === notebookId) { setHistory(null); return }
    if (saved.current !== current.current) {
      if (savingBlocked) { setNotice('当前草稿有未保存的修改，请先导出或保存，再切换题目。'); return }
      if (!persist(current.current)) return
    }
    if (imported) {
      const warning = saveNotebook(browserStorage, id, imported)
      if (warning) { setNotice('无法保存导入的题目，请检查浏览器存储空间。'); return }
    }
    try { onOpenNotebook(id) }
    catch { setNotice('浏览器未能记录当前题目，请检查浏览器存储后重试。') }
  }

  function toggleHistory() {
    if (history) { setHistory(null); return }
    try { setHistory(listSavedNotebooks()); setFileActions(false) }
    catch { setNotice('无法读取题目历史，请检查浏览器存储设置。') }
  }

  function useGeneratedProblem(problem: string) {
    if (current.current.document.problem.trim()) return
    if (edit(document => ({ ...document, problem }))) {
      setEditingProblem(false)
      setFindingProblem(false)
      setNotice('')
      if (!inkTarget) requestAnimationFrame(() => activeNote.current?.focus())
    }
  }

  return <section className={`st-host${onBack ? ' st-native' : ''}`}
    data-astryx-theme="neutral" data-theme="light" aria-label="循思数学草稿本">
    <header className="st-header">
      <div className="st-brand"><h1>循思</h1></div>
      <div className="st-toolbar">
        <Button label="题目历史" size="sm" variant="ghost" aria-expanded={history !== null} onClick={toggleHistory} />
        <div className="st-file-tools">
          <Button label="草稿文件" size="sm" variant="ghost" aria-expanded={fileActions} onClick={() => setFileActions(!fileActions)} />
          {fileActions && <div className="st-file-actions">
            <Button label="导入" size="sm" variant="ghost" onClick={() => { setFileActions(false); fileInput.current?.click() }} />
            <Button label="导出" size="sm" variant="ghost" onClick={() => { setFileActions(false); exportFile() }} />
          </div>}
        </div>
        <Button label="新题目" size="sm" variant="secondary" onClick={() => {
          if (!isBlankDocument(book.document) || book.document.steps.some(step => hasSavedInk(`${encodeURIComponent(notebookId)}:${step.id}`))) openNotebook(crypto.randomUUID())
          else { setFindingProblem(false); setHistory(null); requestAnimationFrame(() => problemInput.current?.focus()) }
        }} />
        {onBack && <Button label="返回对话" size="sm" variant="ghost" onClick={onBack} />}
        <input type="file" accept=".json,application/json" hidden ref={fileInput} onChange={e => { void importFile(e.target.files?.[0]); e.target.value = '' }} />
      </div>
    </header>
    <div className="st-body">
      {history && <section className="st-history" aria-label="题目历史">
        {history.length ? <ul>{history.map(entry => <li key={entry.id}>
          <button type="button" onClick={() => openNotebook(entry.id)} aria-current={entry.id === notebookId ? 'true' : undefined}>
            <span>{entry.title}</span>{entry.id === notebookId && <small>当前题目</small>}
          </button>
        </li>)}</ul> : <p>还没有保存的题目。</p>}
      </section>}
      <div className="st-workspace"><div className="st-writing">
        <section className="st-problem">
          <div className="st-section-label"><h2>题目</h2>
            {canFind && <Button label={showingFinder ? '输入题目' : '找题'} size="sm" variant="ghost" onClick={() => setFindingProblem(!findingProblem)} />}
            {hasProblem && <div className="st-toolbar">
              <Button label={selectedQuote && !selectedQuote.stepId ? '标注选中文字' : '标注题目'} size="sm" variant="ghost" onClick={() => annotate()} />
              <Button label={readingProblem ? '编辑题干' : '完成编辑'} size="sm" variant="ghost" onClick={() => {
                setSelectedQuote(null)
                setEditingProblem(readingProblem)
                if (readingProblem) requestAnimationFrame(() => problemInput.current?.focus())
              }} />
            </div>}
          </div>
          {showingFinder ? <ProblemFinder model={preferredModel} onUse={useGeneratedProblem} /> : readingProblem ? <div className="st-problem-reading" ref={problemReading}
            onPointerUp={event => captureQuote(problemSelection(event.currentTarget))} onKeyUp={event => captureQuote(problemSelection(event.currentTarget))}>
            <ProblemText text={book.document.problem} highlight={activeAnnotation?.stepId === undefined ? activeAnnotation?.quote : undefined} />
          </div> : <textarea
            aria-label="题目 / 已知条件" ref={problemInput} value={book.document.problem} maxLength={LIMITS.problem}
            autoFocus={!hasProblem}
            rows={Math.min(6, Math.max(3, book.document.problem.split('\n').length))}
            placeholder="输入或粘贴题目"
            onSelect={event => captureInputSelection(event.currentTarget)}
            onChange={e => { setSelectedQuote(null); setEditingProblem(true); edit(d => ({ ...d, problem: e.target.value }), 'problem') }} />}
          {annotations.some(item => !item.stepId) && <div className="st-annotation-markers">{annotationMarkers()}</div>}
        </section>
        <section className="st-derivation">
        <div className="st-section-label">
          <h2>草稿</h2>
          <div className="st-toolbar" role="group" aria-label="草稿操作">
            {hasProblem && !composerEnabled && <Button label={feedback ? '查看讨论' : '聊聊卡点'} className="st-mobile-discuss" size="sm" variant="secondary" onClick={openDiscussion} />}
            <Button label="撤销" size="sm" variant="ghost" onClick={() => undo()} isDisabled={!past.current.length} />
            <Button label="重做" size="sm" variant="ghost" onClick={() => undo(true)} isDisabled={!future.current.length} />
          </div>
        </div>
        <ol className="st-steps">
          {book.document.steps.map((step, index) => {
            const active = selected.id === step.id
            const inkOpen = inkTarget?.id === step.id
            const inkStorage = `${encodeURIComponent(notebookId)}:${step.id}`
            const formulaOpen = formulaStep === step.id
            const drawingOpen = active && showDiagram && diagramStep === step.id
            const toggleInk = () => {
              if (!inkOpen && !savingBlocked && isBlankDocument(current.current.document)) persist(current.current)
              setInkTarget(inkOpen ? null : { id: step.id, latex: step.latex })
            }
            return <li key={step.id} className={`st-step ${active ? 'st-selected' : ''}`}>
            <div className="st-step-heading">
              <button className="st-step-number" onClick={() => select(step.id)} aria-label={`选择第 ${index + 1} 步`} aria-pressed={active}>第 {index + 1} 段</button>
              {active && <div className="st-step-input-tools">
                <Button label="手绘" size="sm" variant="ghost" onClick={toggleInk} aria-expanded={inkOpen} />
                {!step.latex && <Button label={formulaOpen ? '收起公式' : '公式'} size="sm" variant="ghost" aria-expanded={formulaOpen}
                  onClick={() => setFormulaStep(formulaOpen ? null : step.id)} />}
                {showDiagram && <Button label={drawingOpen ? '完成作图' : step.diagram ? '编辑图形' : '作图'} size="sm" variant="ghost" aria-expanded={drawingOpen}
                  onClick={() => setDiagramStep(drawingOpen ? null : step.id)} />}
                <Button label={selectedQuote?.stepId === step.id ? '标注选中文字' : '标注'} size="sm" variant="ghost" onClick={() => annotate(step.id)} />
              </div>}
              <div className="st-step-actions">
                <button title="上移一步" aria-label={`上移第 ${index + 1} 步`} disabled={index === 0} onClick={() => edit(d => {
                  const steps = [...d.steps]
                  steps.splice(index - 1, 2, steps[index]!, steps[index - 1]!)
                  return { ...d, steps }
                })}>↑</button>
                <button title="删除这一步" aria-label={`删除第 ${index + 1} 步`} disabled={book.document.steps.length === 1} onClick={() => edit(d => {
                  const steps = d.steps.filter(s => s.id !== step.id)
                  return { ...d, steps, annotations: d.annotations?.filter(item => item.stepId !== step.id), selectedId: d.selectedId === step.id ? steps[Math.max(0, index - 1)]!.id : d.selectedId }
                })}>×</button>
              </div>
            </div>
            <div className="st-step-content" onFocusCapture={() => {
              select(step.id)
              if (hasProblem && editingProblem) setEditingProblem(false)
            }}>
              <textarea className="st-note" ref={active ? activeNote : undefined} aria-label={`第 ${index + 1} 步说明`} value={step.note} maxLength={LIMITS.note}
                rows={active ? 3 : 2} placeholder="随手写…"
                onSelect={event => captureInputSelection(event.currentTarget, step.id)}
                onChange={e => { setSelectedQuote(null); patchStep(step.id, { note: e.target.value }) }} />
              {(step.latex || (active && formulaOpen)) && <FormulaField value={step.latex} onSelect={() => { setSelectedQuote(null); select(step.id) }} label={`第 ${index + 1} 步公式`} placeholder="在这里写公式"
                autoFocus={active && formulaOpen && !step.latex} onChange={latex => patchStep(step.id, { latex })} />}
            </div>
            {annotations.some(item => item.stepId === step.id) && <div className="st-annotation-markers">{annotationMarkers(step.id)}</div>}
            {!inkOpen && <InkPreview storageId={inkStorage} onOpen={() => { select(step.id); toggleInk() }} />}
            {inkTarget && inkOpen && <HandwritingPanel storageId={inkStorage} service={handwritingService}
              hasFormula={Boolean(step.latex)} preferredModel={preferredModel} onClose={() => setInkTarget(null)} onInsert={(latex, mode) => {
                const document = current.current.document
                const target = selectedStep(current.current)
                if (document.selectedId !== inkTarget.id) { setNotice('当前步骤已变化，请重新打开手写面板。'); return false }
                if (mode === 'replace' && target.latex !== inkTarget.latex) { setNotice('当前公式在识别期间已修改。请插入为新步骤，避免覆盖你的编辑。'); return false }
                const accepted = edit(d => {
                  if (mode === 'replace') return { ...d, steps: d.steps.map(s => s.id === target.id ? { ...s, latex } : s) }
                  const next = { ...newStep(), latex }, position = d.steps.findIndex(s => s.id === target.id) + 1
                  return { ...d, steps: [...d.steps.slice(0, position), next, ...d.steps.slice(position)], selectedId: next.id }
                })
                if (accepted) setNotice('已插入公式。')
                return accepted
              }} />}
            {step.diagram && !drawingOpen && <div className="st-paper-figure"><DiagramPreview diagram={step.diagram} /></div>}
            {drawingOpen && <div className="st-diagram-board" ref={diagramEditor}>
              <DiagramEditor diagram={step.diagram} inherited={inheritedDiagram} suggested={suggestedDiagram}
                onApply={diagram => { if (patchStep(step.id, { diagram })) setDiagramStep(null) }}
                onRemove={() => { if (patchStep(step.id, { diagram: undefined })) setDiagramStep(null) }} />
            </div>}
          </li>})}
        </ol>
        <div className="st-writing-actions"><Button label="＋ 新增一段" className="st-add" size="sm" variant="ghost" isDisabled={book.document.steps.length >= LIMITS.steps} onClick={() => {
          const step = newStep()
          if (edit(d => ({ ...d, steps: [...d.steps, step], selectedId: step.id }))) requestAnimationFrame(() => activeNote.current?.focus())
        }} />
        {hasProblem && <Button label={method?.label ?? '辅导选项'} size="sm" variant="ghost" onClick={() => setHelpOptions(!helpOptions)} aria-expanded={helpOptions} />}
        </div>
        {hasProblem && helpOptions && <div className="st-assist-options">
          {inheritedDiagram && <p className="st-feedback-note">沿用第 {diagramNumber} 段的图形</p>}
          {hasProblem && !suggestedDiagram && diagramNumber === 0 && <Button label={manualDiagram ? '隐藏作图工具' : '手动打开作图'} size="sm" variant="ghost" onClick={() => {
            setManualDiagram(!manualDiagram)
            setDiagramStep(manualDiagram ? null : selected.id)
            if (!manualDiagram) requestAnimationFrame(() => {
              diagramEditor.current?.scrollIntoView({ block: 'nearest' })
            })
          }} />}
          <label className="st-goal-label">小目标
            <input className="st-goal" aria-label="当前小目标" value={selected.goal} maxLength={LIMITS.goal}
              onChange={e => patchStep(selected.id, { goal: e.target.value })} />
          </label>
        <div className="st-method">
          <NotebookSelector label="解题方法" value={selected.methodId ?? 'auto'} options={methodOptions}
            hasSearch searchPlaceholder="搜索解题方法" emptySearchText="没有匹配的方法"
            onChange={value => patchStep(selected.id, { methodId: findMethod(value)?.id })} />
        </div>
        </div>}
        </section>
      </div>
      {(hasProblem || activeAnnotation) && <aside className={`st-help${composerEnabled ? ' st-help-open' : ''}`} aria-label="DeepSeek 讨论"><Card className="st-assist-card" padding={3}>
        <div className="st-help-heading">
          <h2 tabIndex={-1} ref={helpHeading}>{activeAnnotation ? '卡点标注' : 'DeepSeek'}</h2>
          {composerEnabled ? <Button label="继续写草稿" size="sm" variant="ghost" onClick={continueWriting} />
            : <Button label={feedback ? '查看讨论' : '聊聊卡点'} size="sm" variant="secondary" onClick={openDiscussion} />}
        </div>
        {composerEnabled && <>
          {activeAnnotation?.quote && <blockquote className="st-discussion-quote"><ProblemText text={activeAnnotation.quote} /></blockquote>}
          {(turns.length > 0 || progress) && <div className="st-discussion-thread" ref={discussionThread} tabIndex={0} role="region" aria-label="讨论记录">
            {turns.map((turn, index) => {
              const latest = index === turns.length - 1 && !progress
              const message = turn.message ?? (latest ? previousMessage : undefined)
              return <div className="st-discussion-turn" key={index}>
                {message && <div className="st-discussion-message" aria-label="我的消息"><ProblemText text={message} /></div>}
                <section className="st-feedback" aria-label={latest ? 'DeepSeek 回复' : undefined}>
                  {latest && turn.revision !== book.revision && <p className="st-feedback-note">基于修改前的草稿</p>}
                  {turn.inkOmitted && <p className="st-feedback-note">手绘需要支持图片输入的模型。</p>}
                  <ProblemText text={turn.answer!} />
                </section>
              </div>
            })}
            {progress && <div className="st-discussion-turn">
              <div className="st-discussion-message" aria-label="我的消息"><ProblemText text={progress.message} /></div>
              {progress.text && <section className="st-feedback" aria-label="DeepSeek 回复"><ProblemText text={progress.text} /></section>}
            </div>}
          </div>}
          {progress && <div className="st-feedback-pending">
            <span role="status">DeepSeek 正在回复…</span><Button label="取消发送" size="sm" variant="ghost" onClick={cancelHelp} />
          </div>}
          {helpError?.targetId === targetId && <p className="st-feedback-error" role="alert">{helpError.message}</p>}
          <form className="st-discussion-editor" onSubmit={event => { event.preventDefault(); void sendDiscussion() }}>
            <textarea ref={discussionInput} aria-label="想法和卡点" aria-describedby="st-discussion-context" rows={3} maxLength={LIMITS.question}
              placeholder={feedback ? '试过之后，你发现了什么？' : '我试了……，现在卡在……'} value={draft} disabled={asking}
              onChange={event => { const message = event.target.value; setDiscussionDrafts(drafts => ({ ...drafts, [targetId]: message })) }} />
            <div className="st-discussion-actions">
              <p id="st-discussion-context" className="st-discussion-context">{!helpBoot ? '辅导服务未连接。' : !hasProblem ? '请先填入题目。' : '随消息发送题目和草稿'}</p>
              <Button label="发送给 DeepSeek" type="submit" size="sm" variant="primary" isDisabled={!canAsk || !draft.trim()} />
            </div>
            {activeAnnotation && <Button label="移除标注" type="button" size="sm" variant="ghost" onClick={() => {
              if (edit(document => ({ ...document, annotations: document.annotations?.filter(item => item.id !== activeAnnotation.id) }))) continueWriting()
            }} />}
          </form>
        </>}
      </Card></aside>}</div>
      {(notice || savingBlocked) && <footer className="st-status" role="status">
        <span>{notice}</span>
        {savingBlocked && <button onClick={() => { if (persist(current.current)) { setSavingBlocked(false); setNotice('已使用当前草稿重新保存。') } }}>使用当前草稿重新保存</button>}
      </footer>}
    </div>
  </section>
}
