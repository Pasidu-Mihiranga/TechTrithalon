import type { ChangeEvent } from 'react'
import { Select } from './Select'
import { Button } from './Button'
import type { SelectOption } from './Select'

interface RemoteSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  loading: boolean
  error: Error | null
  retry: () => void
  emptyMessage: string
  disabled?: boolean
}

/** Shared states for selectors populated by the API. */
export function RemoteSelect({ label, value, onChange, options, loading, error, retry, emptyMessage, disabled }: RemoteSelectProps) {
  const message = loading ? `Loading ${label.toLowerCase()}…` : error?.message ?? (options.length === 0 ? emptyMessage : undefined)
  return (
    <div aria-busy={loading}>
      <Select label={label} value={value} options={options} placeholder={`Select ${label.toLowerCase()}`}
        disabled={disabled || loading || !!error || options.length === 0}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)} error={error?.message} />
      {!error && message ? <p role="status">{message}</p> : null}
      {error ? <Button variant="secondary" onClick={retry}>Retry</Button> : null}
    </div>
  )
}
