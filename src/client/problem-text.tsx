import { createElement, useMemo, type ReactNode } from 'react'
import { convertLatexToMathMl } from 'mathlive'
import { LIMITS } from '../notebook'

const mathDelimiters = /\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$|(?<!\\)\$([^$\n]+?)\$/g
const mathElements = new Set([
  'mrow', 'mi', 'mn', 'mo', 'mtext', 'ms', 'mspace', 'mfrac', 'msqrt', 'mroot',
  'msub', 'msup', 'msubsup', 'munder', 'mover', 'munderover', 'mmultiscripts', 'mprescripts', 'none',
  'mtable', 'mtr', 'mtd', 'mstyle', 'mpadded', 'mphantom', 'menclose', 'mfenced',
])
const mathAttributes = ['mathvariant', 'displaystyle', 'stretchy', 'fence', 'separator', 'accent', 'accentunder',
  'movablelimits', 'linethickness', 'columnalign', 'rowalign', 'width', 'height', 'depth', 'notation']

function mathNode(node: Node, key: number): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent
  if (!(node instanceof Element) || !mathElements.has(node.localName)) return null
  const props: Record<string, string | number> = { key }
  for (const attribute of mathAttributes) {
    const value = node.getAttribute(attribute)
    if (value !== null) props[attribute] = value
  }
  return createElement(node.localName, props, Array.from(node.childNodes, mathNode))
}

function renderFormula(latex: string, display: boolean, source: string, key: number, highlighted: boolean): ReactNode {
  if (latex.length > LIMITS.latex) return source
  try {
    const converted = convertLatexToMathMl(latex)
    // Parse as inert XML, then rebuild only MathML elements and presentation attributes.
    const parsed = new DOMParser().parseFromString(`<math>${converted}</math>`, 'application/xml')
    const root = parsed.documentElement
    if (root.localName !== 'math' || !root.firstElementChild) return source
    return createElement('math', { key, display: display ? 'block' : 'inline', 'data-latex-source': source, className: highlighted ? 'st-marked-text' : undefined }, Array.from(root.childNodes, mathNode))
  } catch { return source }
}

export function ProblemText({ text, highlight }: { text: string; highlight?: string }) {
  const content = useMemo(() => {
    const parts: ReactNode[] = []
    let end = 0
    const uniqueHighlight = highlight && text.indexOf(highlight) === text.lastIndexOf(highlight) ? highlight : undefined
    function appendText(chunk: string) {
      const start = uniqueHighlight ? chunk.indexOf(uniqueHighlight) : -1
      if (start < 0 || !uniqueHighlight) { parts.push(chunk); return }
      parts.push(chunk.slice(0, start), <mark key="annotation" className="st-marked-text">{uniqueHighlight}</mark>, chunk.slice(start + uniqueHighlight.length))
    }
    for (const match of text.matchAll(mathDelimiters)) {
      const [source, inline, block, dollars, dollar] = match
      appendText(text.slice(end, match.index))
      parts.push(renderFormula(inline ?? block ?? dollars ?? dollar!, Boolean(block ?? dollars), source, match.index, source === uniqueHighlight))
      end = match.index + source.length
    }
    appendText(text.slice(end))
    return parts
  }, [text, highlight])
  return <div className="st-problem-text">{content}</div>
}
