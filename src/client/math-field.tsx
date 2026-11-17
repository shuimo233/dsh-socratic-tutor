import { useEffect, useRef } from 'react'
import { MathfieldElement } from 'mathlive'
import { LIMITS } from '../notebook'

MathfieldElement.fontsDirectory = null
MathfieldElement.soundsDirectory = null

export function FormulaField({ value, onChange, onSelect, label, placeholder, onValidity, autoFocus }: {
  value: string; onChange(value: string): void; onSelect(): void; label: string
  placeholder?: string
  autoFocus?: boolean
  onValidity?(valid: boolean): void
}) {
  const container = useRef<HTMLDivElement>(null)
  const field = useRef<MathfieldElement | null>(null)
  const callbacks = useRef({ onChange, onSelect, value, onValidity })
  callbacks.current = { onChange, onSelect, value, onValidity }
  useEffect(() => {
    const mf = new MathfieldElement()
    mf.mathVirtualKeyboardPolicy = 'manual'
    mf.setAttribute('aria-label', label)
    mf.value = value
    const input = () => {
      if (mf.value.length > LIMITS.latex) mf.setValue(callbacks.current.value, { silenceNotifications: true })
      else callbacks.current.onChange(mf.value)
    }
    const focus = () => callbacks.current.onSelect()
    mf.addEventListener('input', input)
    mf.addEventListener('focusin', focus)
    container.current!.appendChild(mf)
    field.current = mf
    if (autoFocus) mf.focus()
    return () => { mf.removeEventListener('input', input); mf.removeEventListener('focusin', focus); mf.remove(); field.current = null }
  }, [])
  useEffect(() => {
    if (field.current && field.current.value !== value) field.current.setValue(value, { silenceNotifications: true })
    field.current?.setAttribute('aria-label', label)
    if (field.current) callbacks.current.onValidity?.(field.current.errors.length === 0)
  })
  return <div className="st-formula" onPointerDownCapture={onSelect}>
    <div ref={container} />
    {placeholder && !value && <span className="st-formula-placeholder" aria-hidden="true">{placeholder}</span>}
  </div>
}
