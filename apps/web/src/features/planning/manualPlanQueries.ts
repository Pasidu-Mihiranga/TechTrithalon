import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/apiClient'
import type { components } from '../../generated/api'

type Schema = components['schemas']
export type ManualPlanView = Schema['ManualPlanView']

/** Keep named rule evidence and conflict codes available to the existing board UI. */
export class ManualPlanRequestError extends Error {
  readonly status: number
  readonly code?: string
  readonly traceId?: string
  readonly violations: Schema['ConstraintViolation'][]
  constructor(response: Response, payload: unknown) {
    const body = (payload && typeof payload === 'object' ? payload : {}) as {
      detail?: string; code?: string; traceId?: string; violations?: Schema['ConstraintViolation'][]
    }
    super(body.detail || 'The manual plan request failed.')
    this.status = response.status
    this.code = body.code
    this.traceId = body.traceId
    this.violations = body.violations ?? []
  }
}

export function useManualPlan(id?: number) {
  return useQuery({
    queryKey: ['dispatcher', 'manual-plan', id],
    enabled: id !== undefined && id > 0,
    retry: false,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/dispatcher/plans/{id}', { params: { path: { id: id! } } })
      if (!data) throw new ManualPlanRequestError(response, error)
      return data
    },
  })
}

export function useManualPlans(date: string, depot?: string) {
  return useQuery({
    queryKey: ['dispatcher', 'manual-plans', date, depot],
    enabled: Boolean(date), retry: false,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/dispatcher/plans', { params: { query: { date, depot } } })
      if (!data) throw new ManualPlanRequestError(response, error)
      return data
    },
  })
}

export type Edit =
  | { operation: 'replace'; body: Schema['ManualPlanReplaceRequest'] }
  | { operation: 'addTrip'; body: Schema['ManualPlanAddTripRequest'] }
  | { operation: 'move'; body: Schema['ManualPlanMoveRequest'] }
  | { operation: 'vehicle'; tripId: number; body: Schema['ManualPlanVehicleRequest'] }
  | { operation: 'sequence'; tripId: number; body: Schema['ManualPlanSequenceRequest'] }
  | { operation: 'removeTrip'; tripId: number; body: Schema['ManualPlanCommandRequest'] }
  | { operation: 'defer' | 'restore'; orderId: number; body: Schema['ManualPlanDeferRequest'] }
  | { operation: 'publish'; body: Schema['ManualPlanCommandRequest'] }

export type DispositionChange = {
  orderId: number
  reason?: string
  nextDeliveryDate?: string
  reasonCode?: Schema['ManualPlanDispositionRequest']['reasonCode']
  protectNextRun?: boolean
  notifyStore?: boolean
}

/** Preserve the full snapshot and other work while recording exclusions as reasoned deferrals. */
export function dispositionReplacement(view: ManualPlanView, changes: DispositionChange[]): Schema['ManualPlanReplaceRequest'] {
  const changedIds = new Set(changes.map(change => change.orderId))
  const deferredIds = new Set(changes.filter(change => change.reason).map(change => change.orderId))
  return {
    expectedVersion: view.plan.lockVersion!,
    reason: 'Update reasoned queue deferrals',
    trips: (view.trips ?? []).map(trip => ({
      id: trip.id, vehicleId: trip.vehicleId!, tripIndex: trip.tripIndex,
      brand: trip.brand!, district: trip.district!,
      orderIds: (trip.stops ?? []).map(stop => stop.orderId!).filter(id => !deferredIds.has(id)),
    })),
    dispositions: [
      ...(view.unassignedOrders ?? []).filter(item => item.order?.id != null && item.reason && !changedIds.has(item.order.id))
        .map(item => ({
          orderId: item.order!.id, code: item.disposition!, reason: item.reason!, nextDeliveryDate: item.nextDeliveryDate,
          reasonCode: item.reasonCode ?? undefined, protectNextRun: item.protectNextRun, notifyStore: item.notifyStore,
        })),
      ...changes.filter(change => change.reason).map(change => ({
        orderId: change.orderId, code: 'DEFERRED', reason: change.reason!, nextDeliveryDate: change.nextDeliveryDate,
        reasonCode: change.reasonCode ?? 'OTHER', protectNextRun: change.protectNextRun ?? true, notifyStore: change.notifyStore ?? true,
      })),
    ],
  }
}

function useSavedPlan() {
  const cache = useQueryClient()
  return (view: ManualPlanView) => {
    cache.setQueryData(['dispatcher', 'manual-plan', view.plan.id], view)
    void cache.invalidateQueries({ queryKey: ['dispatcher', 'manual-plans'] })
    if (view.plan.status === 'published') {
      void cache.invalidateQueries({ queryKey: ['dispatcher', 'orders'] })
      void cache.invalidateQueries({ queryKey: ['dispatcher', 'dashboard'] })
      void cache.invalidateQueries({ queryKey: ['store', 'orders'] })
      void cache.invalidateQueries({ queryKey: ['dispatcher', 'fleet'] })
      void cache.invalidateQueries({ queryKey: ['dispatcher', 'deferrals'] })
      void cache.invalidateQueries({ queryKey: ['store', 'deferrals'] })
    }
  }
}

export function useCreateManualPlan() {
  const saved = useSavedPlan()
  return useMutation({
    retry: false,
    mutationFn: async (body: Schema['ManualPlanCreateRequest']) => {
      const { data, error, response } = await api.POST('/api/v1/dispatcher/plans', { body })
      if (!data) throw new ManualPlanRequestError(response, error)
      return data
    },
    onSuccess: saved,
  })
}

/** Supply the displayed plan.lockVersion for every edit; never retry a 409 automatically. */
export function useEditManualPlan(id: number) {
  const saved = useSavedPlan()
  return useMutation({
    retry: false,
    mutationFn: async (edit: Edit) => {
      const params = { path: { id } }
      let result
      switch (edit.operation) {
        case 'replace': result = await api.PUT('/api/v1/dispatcher/plans/{id}', { params, body: edit.body }); break
        case 'addTrip': result = await api.POST('/api/v1/dispatcher/plans/{id}/trips', { params, body: edit.body }); break
        case 'move': result = await api.POST('/api/v1/dispatcher/plans/{id}/moves', { params, body: edit.body }); break
        case 'vehicle': result = await api.POST('/api/v1/dispatcher/plans/{id}/trips/{tripId}/vehicle', { params: { path: { id, tripId: edit.tripId } }, body: edit.body }); break
        case 'sequence': result = await api.POST('/api/v1/dispatcher/plans/{id}/trips/{tripId}/sequence', { params: { path: { id, tripId: edit.tripId } }, body: edit.body }); break
        case 'removeTrip': result = await api.DELETE('/api/v1/dispatcher/plans/{id}/trips/{tripId}', { params: { path: { id, tripId: edit.tripId } }, body: edit.body }); break
        case 'defer': result = await api.POST('/api/v1/dispatcher/plans/{id}/orders/{orderId}/defer', { params: { path: { id, orderId: edit.orderId } }, body: edit.body }); break
        case 'restore': result = await api.POST('/api/v1/dispatcher/plans/{id}/orders/{orderId}/restore', { params: { path: { id, orderId: edit.orderId } }, body: edit.body }); break
        case 'publish': result = await api.POST('/api/v1/dispatcher/plans/{id}/publish', { params, body: edit.body }); break
      }
      if (!result.data) throw new ManualPlanRequestError(result.response, result.error)
      return result.data
    },
    onSuccess: saved,
  })
}
