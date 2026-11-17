import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { decodeInk, INK_LIMITS, inkBounds, preferredVisionModel, type HandwritingService, type InkPoint, type InkStroke, type Recognition, type VisionModel } from '../handwriting'
import { FormulaField } from './math-field'
import { NotebookSelector } from './notebook-selector'

function redraw(canvas: HTMLCanvasElement, strokes: InkStroke[], active: InkStroke = []) {
  const rect = canvas.getBoundingClientRect()
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const width = Math.max(1, Math.round(rect.width * ratio)), height = Math.max(1, Math.round(rect.height * ratio))
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  const context = canvas.getContext('2d')!
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, rect.width, rect.height)
  drawStrokes(context, [...strokes, active], rect.width, rect.height)
}

function drawStrokes(context: CanvasRenderingContext2D, strokes: InkStroke[], width: number, height: number) {
  context.strokeStyle = '#222c25'; context.fillStyle = '#222c25'; context.lineWidth = 3.2; context.lineCap = 'round'; context.lineJoin = 'round'
  for (const stroke of strokes) {
    const first = stroke[0]
    if (!first) continue
    context.beginPath()
    if (stroke.length === 1) { context.arc(first.x * width, first.y * height, 1.6, 0, 2 * Math.PI); context.fill(); continue }
    context.moveTo(first.x * width, first.y * height)
    for (const p of stroke.slice(1)) context.lineTo(p.x * width, p.y * height)
    context.stroke()
  }
}

function exportImage(canvas: HTMLCanvasElement, strokes: InkStroke[]): string {
  redraw(canvas, strokes)
  const box = inkBounds(strokes, canvas.width, canvas.height)
  const image = document.createElement('canvas')
  image.width = Math.max(48, box.width); image.height = Math.max(48, box.height)
  const context = image.getContext('2d')!
  context.fillStyle = '#fff'; context.fillRect(0, 0, image.width, image.height)
  context.drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height)
  const data = image.toDataURL('image/png')
  if (data.length > INK_LIMITS.image) throw new Error('手写图片过大，请分成几个步骤识别。')
  return data
}

const inkKey = (storageId: string) => `dsh-socratic-tutor:ink:v1:${storageId}`

function readInk(key: string): InkStroke[] {
  const raw = localStorage.getItem(key)
  return raw ? decodeInk(raw) : []
}

export function hasSavedInk(storageId: string): boolean {
  try { return readInk(inkKey(storageId)).length > 0 } catch { return false }
}

export function discussionInk(storageIds: string[]): string | undefined {
  const panels = storageIds.flatMap((id, index) => {
    let strokes: InkStroke[]
    try { strokes = readInk(inkKey(id)) } catch { return [] }
    return strokes.length ? [{ number: index + 1, strokes }] : []
  })
  if (!panels.length) return
  const columns = Math.min(panels.length, 2)
  const width = 460, height = 230, gutter = 12, title = 26
  const panelWidth = width + 2 * gutter, panelHeight = height + title + gutter
  const canvas = document.createElement('canvas')
  canvas.width = columns * panelWidth
  canvas.height = Math.ceil(panels.length / columns) * panelHeight
  const context = canvas.getContext('2d')!
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.font = '16px sans-serif'
  panels.forEach(({ number, strokes }, index) => {
    context.save()
    context.translate(index % columns * panelWidth + gutter, Math.floor(index / columns) * panelHeight)
    context.fillStyle = '#222c25'
    context.fillText(`第 ${number} 段`, 0, 20)
    context.strokeStyle = '#c3cbd3'
    context.strokeRect(-3, title - 3, width + 6, height + 6)
    context.translate(0, title)
    drawStrokes(context, strokes, width, height)
    context.restore()
  })
  const image = canvas.toDataURL('image/png')
  if (image.length > INK_LIMITS.image) throw new Error('手绘草稿图片过大，请精简后再发送。')
  return image
}

export function InkPreview({ storageId, onOpen }: { storageId: string; onOpen(): void }) {
  const [strokes] = useState(() => {
    try { return readInk(inkKey(storageId)) } catch { return [] }
  })
  if (!strokes.length) return null
  return <button type="button" className="st-ink-preview" onClick={onOpen} aria-label="继续编辑手绘草稿">
    <svg viewBox="0 0 500 250" aria-hidden="true">
      {strokes.map((stroke, i) => stroke.length === 1
        ? <circle key={i} cx={stroke[0]!.x * 500} cy={stroke[0]!.y * 250} r="1.6" />
        : <path key={i} d={`M ${stroke.map(p => `${p.x * 500} ${p.y * 250}`).join(' L ')}`} />)}
    </svg>
    <span>继续手绘</span>
  </button>
}

export function HandwritingPanel({ storageId, service, onInsert, onClose, hasFormula, preferredModel }: {
  storageId: string; service: HandwritingService; hasFormula: boolean
  preferredModel?: Pick<VisionModel, 'provider' | 'id'>
  onInsert(latex: string, mode: 'new' | 'replace'): boolean; onClose(): void
}) {
  const key = inkKey(storageId)
  const [initial] = useState(() => {
    try { return { strokes: readInk(key) } }
    catch { return { strokes: [], message: '无法读取上次的手写草稿，请重新书写。' } }
  })
  const [strokes, setStrokes] = useState<InkStroke[]>(initial.strokes)
  const ink = useRef(strokes)
  const redo = useRef<InkStroke[]>([])
  const canvas = useRef<HTMLCanvasElement>(null)
  const pointer = useRef<number | null>(null)
  const drawing = useRef<InkStroke>([])
  const [message, setMessage] = useState(initial.message ?? '')
  const [recognitionOpen, setRecognitionOpen] = useState(false)
  const [models, setModels] = useState<VisionModel[]>([])
  const [modelKey, setModelKey] = useState('')
  const [loadingModels, setLoadingModels] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Recognition | null>(null)
  const [formulaValid, setFormulaValid] = useState(false)
  const request = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const modelRequest = useRef<AbortController | null>(null)
  const [reload, setReload] = useState(0)

  function invalidate() { generation.current++; request.current?.abort(); request.current = null; setBusy(false); setResult(null) }
  function commit(next: InkStroke[]) {
    invalidate(); ink.current = next; setStrokes(next)
    try { localStorage.setItem(key, JSON.stringify(next)) }
    catch { setMessage('手写草稿无法自动保存，请先下载图片备份。') }
    if (canvas.current) redraw(canvas.current, next)
  }
  useEffect(() => {
    const element = canvas.current!
    const observer = new ResizeObserver(() => redraw(element, ink.current, drawing.current))
    observer.observe(element)
    redraw(element, ink.current)
    return () => { observer.disconnect(); generation.current++; request.current?.abort(); modelRequest.current?.abort() }
  }, [])
  useEffect(() => {
    if (!recognitionOpen) return
    const controller = new AbortController()
    modelRequest.current = controller
    setLoadingModels(true)
    service.models(controller.signal).then(catalog => {
      if (controller.signal.aborted) return
      setModels(catalog.models)
      let saved = ''
      try { saved = localStorage.getItem('dsh-socratic-tutor:vision-model') ?? '' } catch { /* Optional preference. */ }
      const next = preferredVisionModel(catalog.models, preferredModel, saved)
      setModelKey(next ? JSON.stringify([next.provider, next.id]) : '')
      setMessage(catalog.message ?? '')
    }).catch(error => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : '读取模型失败。') })
      .finally(() => { if (!controller.signal.aborted) setLoadingModels(false) })
    return () => controller.abort()
  }, [recognitionOpen, service, reload, preferredModel?.provider, preferredModel?.id])

  function point(event: { clientX: number; clientY: number }): InkPoint {
    const rect = canvas.current!.getBoundingClientRect()
    return { x: Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * 10000) / 10000,
      y: Math.round(Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) * 10000) / 10000 }
  }
  function down(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (pointer.current !== null || (event.pointerType === 'mouse' && event.button !== 0)) return
    if (ink.current.length >= INK_LIMITS.strokes || ink.current.reduce((n, s) => n + s.length, 0) >= INK_LIMITS.points) { setMessage('这块手绘区域已写满，可以继续写一段。'); return }
    event.preventDefault(); invalidate(); pointer.current = event.pointerId; drawing.current = [point(event)]
    event.currentTarget.setPointerCapture(event.pointerId)
    redraw(event.currentTarget, ink.current, drawing.current)
  }
  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (pointer.current !== event.pointerId) return
    event.preventDefault()
    const native = event.nativeEvent
    const events = native.getCoalescedEvents?.() ?? []
    const remaining = INK_LIMITS.points - ink.current.reduce((n, s) => n + s.length, 0) - drawing.current.length
    const next = (events.length ? events : [native]).slice(0, Math.max(0, remaining)).map(point)
    drawing.current.push(...next)
    redraw(event.currentTarget, ink.current, drawing.current)
  }
  function up(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (pointer.current !== event.pointerId) return
    pointer.current = null
    const stroke = drawing.current; drawing.current = []
    redo.current = []
    if (stroke.length) commit([...ink.current, stroke])
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  async function recognize() {
    if (!canvas.current || !modelKey || busy) return
    const model = models.find(m => JSON.stringify([m.provider, m.id]) === modelKey)
    if (!model) return
    let image: string
    try { image = exportImage(canvas.current, ink.current) }
    catch (error) { setMessage(error instanceof Error ? error.message : '无法生成手写图片。'); return }
    const controller = new AbortController()
    request.current?.abort(); request.current = controller
    const version = ++generation.current
    setBusy(true); setResult(null); setMessage('正在转录手写公式……')
    try {
      const answer = await service.recognize({ provider: model.provider, model: model.id, image }, controller.signal)
      if (generation.current !== version || controller.signal.aborted) return
      setResult(answer)
      setMessage(answer.latex ? (answer.uncertain ? '有符号不确定，请对照笔迹检查识别结果。' : '请检查识别结果，确认后再插入草稿。') : answer.message || '未识别出公式，请重写得清楚一些。')
    } catch (error) {
      if (generation.current === version && !controller.signal.aborted) setMessage(error instanceof Error ? error.message : '识别失败，请重试。')
    } finally { if (generation.current === version) setBusy(false) }
  }
  function download() {
    try {
      const link = document.createElement('a'); link.href = exportImage(canvas.current!, ink.current); link.download = '手绘草稿.png'; link.click()
    } catch (error) { setMessage(error instanceof Error ? error.message : '无法下载图片。') }
  }
  return <section className="st-ink" aria-label="手绘草稿面板">
    <div className="st-ink-heading"><strong>手绘草稿</strong><button onClick={onClose}>完成手绘</button></div>
    <div className="st-ink-canvas-wrap"><canvas ref={canvas} aria-label="手绘草稿画布" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      {!strokes.length && <span className="st-ink-placeholder">手写或画图</span>}
    </div>
    <div className="st-ink-tools"><div>
      <button disabled={!strokes.length} onClick={() => { const last = ink.current.at(-1); if (last) { redo.current.push(last); commit(ink.current.slice(0, -1)) } }}>撤销笔画</button>
      <button disabled={!redo.current.length} onClick={() => { const stroke = redo.current.pop(); if (stroke) commit([...ink.current, stroke]) }}>恢复笔画</button>
      <button disabled={!strokes.length} onClick={() => { redo.current = [...ink.current].reverse(); commit([]) }}>清空</button>
      <button disabled={!strokes.length} onClick={download}>下载手写</button>
    </div><span>{strokes.length} 笔</span></div>
    <details className="st-ink-ocr" onToggle={event => {
      const open = event.currentTarget.open
      setRecognitionOpen(open)
      if (!open) invalidate()
    }}>
      <summary>转成可编辑公式</summary>
    {recognitionOpen && <><div className="st-ink-model">
      <NotebookSelector label="手写识别模型" isDisabled={busy || loadingModels || !models.length} isLoading={loadingModels}
        value={modelKey || undefined} placeholder={models.length || loadingModels ? '选择视觉模型' : '暂无可用视觉模型'}
        options={models.map(model => ({ value: JSON.stringify([model.provider, model.id]), label: model.name, description: model.provider }))}
        onChange={value => {
          invalidate(); setModelKey(value)
          try { localStorage.setItem('dsh-socratic-tutor:vision-model', value) } catch { /* Optional preference. */ }
        }} />
      <button disabled={loadingModels || busy} onClick={() => setReload(n => n + 1)}>刷新模型</button>
      {busy ? <button onClick={() => { invalidate(); setMessage('已取消识别，手写内容已保留。') }}>取消识别</button>
        : <button className="st-primary" disabled={!strokes.length || !modelKey || loadingModels} onClick={() => { void recognize() }}>识别公式</button>}
    </div>
    <p className="st-ink-privacy">识别时发送手绘图片。</p>
    {result?.latex && <div className="st-ink-result">
      <div className="st-eyebrow">{result.uncertain ? '待核对的识别结果' : '识别结果 · 可直接修改'}</div>
      {result.message && <p>{result.message}</p>}
      <FormulaField label="手写识别结果" value={result.latex} onSelect={() => {}} onValidity={setFormulaValid} onChange={latex => setResult({ ...result, latex })} />
      {!formulaValid && <p>公式格式有问题，请在上方修正后再插入。</p>}
      <div className="st-ink-insert"><button className="st-primary" disabled={!result.latex.trim() || !formulaValid} onClick={() => { if (onInsert(result.latex, 'new')) onClose() }}>插入为新步骤</button>
        <button disabled={!result.latex.trim() || !formulaValid} onClick={() => { if (onInsert(result.latex, 'replace')) onClose() }}>{hasFormula ? '替换当前公式' : '填入当前步骤'}</button></div>
    </div>}</>}
    </details>
    {message && <p className="st-ink-message" role="status">{message}</p>}
  </section>
}
