import { useId } from 'react'
import type { SelectHTMLAttributes } from 'react'

export interface SelectOption { value: string; label: string }

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label: string
  options: SelectOption[]
  placeholder?: string
  error?: string
}

/** Options always come from the caller (the API); this component holds no option lists of its own. */
export function Select({ label, options, placeholder, error, id, className, ...rest }: SelectProps) {
  const generated = useId()
  const selectId = id ?? generated
  return (
    <div className="field">
      <label htmlFor={selectId} className="field-label">{label}</label>
      <select {...rest} id={selectId} className={['input', 'select', className].filter(Boolean).join(' ')} aria-invalid={error ? true : undefined} aria-describedby={error ? `${selectId}-error` : undefined}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error ? <p id={`${selectId}-error`} role="alert" className="field-error">{error}</p> : null}
    </div>
  )
}
