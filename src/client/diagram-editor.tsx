import { useEffect, useState } from 'react'
import { diagramFamily, initialConicKind, isConicDiagram, PLANE_KINDS, type Diagram, type DiagramFamily } from '../geometry'
import { ConicBoard, ConicPlot } from './conic-board'
import { PlaneBoard, PlanePlot } from './plane-board'
import { NotebookSelector } from './notebook-selector'

const families = ['conic', ...PLANE_KINDS] as const
const labels: Record<DiagramFamily, string> = { conic: '圆锥曲线与直线', triangle: '三角形', quadrilateral: '四边形', circle: '圆与弦' }
const familyOptions = families.map(value => ({ value, label: labels[value] }))

export function DiagramPreview({ diagram }: { diagram: Diagram }) {
  return isConicDiagram(diagram) ? <ConicPlot diagram={diagram} /> : <PlanePlot diagram={diagram} />
}

export function DiagramEditor({ diagram, inherited, suggested, onApply, onRemove }: {
  diagram?: Diagram; inherited?: Diagram; suggested?: Diagram['kind']; onApply(value: Diagram): void; onRemove(): void
}) {
  const defaultFamily = diagramFamily(diagram?.kind ?? inherited?.kind ?? suggested)
  const [family, setFamily] = useState(defaultFamily)
  useEffect(() => setFamily(defaultFamily), [defaultFamily])

  return <>
    <div className="st-diagram-family"><NotebookSelector label="作图类型" value={family} options={familyOptions} onChange={value => {
      const selected = families.find(item => item === value)
      if (selected) setFamily(selected)
    }} /></div>
    {family === 'conic'
      ? <ConicBoard diagram={isConicDiagram(diagram) ? diagram : undefined} inherited={isConicDiagram(inherited) ? inherited : undefined}
        initialKind={initialConicKind(suggested)} onApply={onApply} onRemove={onRemove} />
      : <PlaneBoard key={family} kind={family} diagram={isConicDiagram(diagram) ? undefined : diagram} inherited={isConicDiagram(inherited) ? undefined : inherited}
        onApply={onApply} onRemove={onRemove} />}
  </>
}
