import type { BadgeTone, VehicleKind } from '../../components'
import type { components } from '../../generated/api'

export function planningOrdersCsv(orders: components['schemas']['CustomerOrder'][]) {
  const cell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
  return [
    'Order ID,Outlet,District,Volume,Type',
    ...orders.map(order => [order.ref, order.outletId, order.district, order.volumeM3, order.tempRequirement].map(cell).join(',')),
  ].join('\r\n')
}

/** Formats order fields for display. Does not compute business metrics. */
export function formatVolume(m3: number | string) {
  const n = typeof m3 === 'string' ? Number(m3) : m3
  return `${n.toFixed(3)} m³`
}

export function formatWeight(kg: number | string) {
  const n = typeof kg === 'string' ? Number(kg) : kg
  return `${n.toFixed(1)} kg`
}

export function tempKind(temp: string): VehicleKind {
  return temp === 'chilled' ? 'fridge' : 'normal'
}

export function tempLabel(temp: string) {
  return temp === 'chilled' ? 'Refrigerated' : 'Ambient'
}

export function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'confirmed': return 'neutral'
    case 'planned':
    case 'loaded':
    case 'delivered':
    case 'receipt_confirmed': return 'success'
    case 'deferred':
    case 'failed':
    case 'cancelled': return 'danger'
    case 'in_transit':
    case 'partial': return 'warning'
    default: return 'neutral'
  }
}

export function planningLabel(status: string) {
  if (status === 'deferred') return 'Deferred'
  if (status === 'confirmed' || status === 'draft') return 'Unplanned'
  return 'Planned'
}

export function planningTone(status: string): BadgeTone {
  if (status === 'deferred') return 'danger'
  if (status === 'confirmed' || status === 'draft') return 'neutral'
  return 'success'
}

export function formatCutoffCountdown(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
