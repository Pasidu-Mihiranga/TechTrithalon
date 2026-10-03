import type { ReactNode } from 'react'

export type ConstraintKind = 'van_only' | 'chilled' | 'mall_window' | 'overflow' | 'custom'

export interface ConstraintChipProps {
  kind: ConstraintKind
  label?: ReactNode
  title?: string
  className?: string
}

/**
 * Small constraint badge representing logistics restrictions
 * such as van-only access, refrigerated requirement, or mall delivery windows.
 */
export function ConstraintChip({ kind, label, title, className }: ConstraintChipProps) {
  let badgeClass = 'badge-neutral'
  let defaultLabel: string = kind

  switch (kind) {
    case 'van_only':
      badgeClass = 'badge-type-van'
      defaultLabel = 'Van Only'
      break
    case 'chilled':
      badgeClass = 'badge-type-fridge'
      defaultLabel = 'Chilled'
      break
    case 'mall_window':
      badgeClass = 'badge-warning'
      defaultLabel = 'Mall Window'
      break
    case 'overflow':
      badgeClass = 'badge-danger'
      defaultLabel = 'Capacity Overflow'
      break
    case 'custom':
      badgeClass = 'badge-neutral'
      defaultLabel = 'Constraint'
      break
  }

  return (
    <span
      className={['badge', badgeClass, 'constraint-chip', className].filter(Boolean).join(' ')}
      title={title}
    >
      {label ?? defaultLabel}
    </span>
  )
}
