import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'brand'

/** Status pill. Colour is never the only signal: always pass readable text. */
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export type VehicleKind = 'normal' | 'fridge' | 'van'

/** Delivery-type chip (Figma "Type Badge"): ambient, refrigerated, or van-only. */
export function TypeBadge({ kind, children }: { kind: VehicleKind; children: ReactNode }) {
  return <span className={`badge badge-type-${kind}`}>{children}</span>
}
