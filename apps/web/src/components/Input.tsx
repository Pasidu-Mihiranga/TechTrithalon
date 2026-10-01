import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  /** A validation message. Marks the field invalid and is announced to screen readers. */
  error?: string
}

export function Input({ label, hint, error, id, className, ...rest }: InputProps) {
  const generated = useId()
  const inputId = id ?? generated
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
  return (
    <div className="field">
      <label htmlFor={inputId} className="field-label">{label}</label>
      <input {...rest} id={inputId} className={['input', className].filter(Boolean).join(' ')} aria-invalid={error ? true : undefined} aria-describedby={describedBy} />
      {error ? <p id={`${inputId}-error`} role="alert" className="field-error">{error}</p> : hint ? <p id={`${inputId}-hint`} className="field-hint">{hint}</p> : null}
    </div>
  )
}
