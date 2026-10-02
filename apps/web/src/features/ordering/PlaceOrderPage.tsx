import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, PageHeader, Select, TypeBadge } from '../../components'
import { useAuth } from '../auth/auth'
import { formatVolume, formatWeight, tempKind, tempLabel } from './orderDisplay'
import { useStoreCutoff } from './orderQueries'
import { api } from '../../lib/apiClient'

type Step = 'form' | 'review' | 'done'

export function PlaceOrderPage() {
  const client = useQueryClient()
  const auth = useAuth()
  const navigate = useNavigate()
  const cutoff = useStoreCutoff()
  const [step, setStep] = useState<Step>('form')
  const [temp, setTemp] = useState('ambient')
  const [units, setUnits] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [volumeM3, setVolumeM3] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [createdId, setCreatedId] = useState<number | null>(null)
  const [createdDate, setCreatedDate] = useState<string | null>(null)
  const [createdRef, setCreatedRef] = useState<string | null>(null)

  function validate(): { units: number; weightKg: number; volumeM3: number } | null {
    const u = Number(units)
    const w = Number(weightKg)
    const v = Number(volumeM3)
    if (!Number.isInteger(u) || u < 1) {
      setFormError('Enter a whole number of units of at least 1.')
      return null
    }
    if (!(w > 0) || !(v > 0)) {
      setFormError('Weight and volume must be greater than zero.')
      return null
    }
    setFormError(null)
    return { units: u, weightKg: w, volumeM3: v }
  }

  function onReview(e: FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setStep('review')
  }

  async function onConfirm() {
    const values = validate()
    if (!values) {
      setStep('form')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const { data, error } = await api.POST('/api/v1/store/orders', {
        body: {
          expectedDeliveryDate: cutoff.data?.nextDeliveryDate,
          tempRequirement: temp,
          units: values.units,
          weightKg: values.weightKg,
          volumeM3: values.volumeM3,
        },
      })
      if (!data) {
        const code = error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: string }).code)
          : undefined
        if (code === 'DELIVERY_DATE_CHANGED') await cutoff.refetch()
        setSubmitError(code === 'DELIVERY_DATE_CHANGED' ? 'The delivery date changed. Review the updated date and confirm again.'
          : code === 'DUPLICATE_TEMP_ORDER'
          ? 'You already have an active order of this temperature for that delivery day.'
          : code === 'CHILLED_FRESH_ONLY'
            ? 'Only Fresh outlets may place chilled orders.'
            : code === 'NO_OPERATING_DAY'
              ? 'The delivery calendar needs to be extended before an order can be placed.'
              : 'The order could not be confirmed. Check the values and try again.')
        setStep('form')
        return
      }
      void client.invalidateQueries({ queryKey: ['store', 'orders'] })
      setCreatedDate(data.orderDate ?? null)
      setCreatedId(data.id ?? null)
      setCreatedRef(data.ref ?? null)
      setStep('done')
    } catch {
      setSubmitError('The order could not be confirmed. Check your connection and try again.')
      setStep('form')
    } finally { setSubmitting(false) }
  }

  if (cutoff.isPending) return <LoadingState rows={2} label="Loading cutoff" />
  if (cutoff.isError) return <ErrorState error={cutoff.error} message="Cutoff could not be loaded." onRetry={() => void cutoff.refetch()} />

  return (
    <>
      <PageHeader
        title="Place an order"
        subtitle={cutoff.data
          ? `Delivery ${cutoff.data.nextDeliveryDate} · cutoff 16:00 Asia/Colombo (${cutoff.data.open ? 'open' : 'closed'})`
          : 'Prepare an order for the next delivery day.'}
        actions={<Link className="btn btn-secondary btn-md" to="/store/orders">My orders</Link>}
      />

      {step === 'form' && (
        <Card>
          <form className="form-stack" onSubmit={onReview}>
            <Select
              label="Temperature"
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
              options={[
                { value: 'ambient', label: 'Ambient' },
                { value: 'chilled', label: 'Chilled (Fresh only)' },
              ]}
            />
            <Input label="Units" type="number" min={1} step={1} value={units} onChange={(e) => setUnits(e.target.value)} required />
            <Input label="Weight (kg)" type="number" min={0.01} step={0.01} value={weightKg} onChange={(e) => setWeightKg(e.target.value)} required />
            <Input label="Volume (m³)" type="number" min={0.001} step={0.001} value={volumeM3} onChange={(e) => setVolumeM3(e.target.value)} required />
            {formError ? <p className="field-error" role="alert">{formError}</p> : null}
            {submitError ? <p className="field-error" role="alert">{submitError}</p> : null}
            <Button type="submit">Review order</Button>
          </form>
        </Card>
      )}

      {step === 'review' && (
        <Card>
          <h2 className="text-heading-s">Review</h2>
          <dl className="detail-grid">
            <div><dt>Delivery date</dt><dd>{cutoff.data?.nextDeliveryDate}</dd></div>
            <div><dt>Type</dt><dd><TypeBadge kind={tempKind(temp)}>{tempLabel(temp)}</TypeBadge></dd></div>
            <div><dt>Units</dt><dd>{units}</dd></div>
            <div><dt>Weight</dt><dd>{formatWeight(Number(weightKg))}</dd></div>
            <div><dt>Volume</dt><dd>{formatVolume(Number(volumeM3))}</dd></div>
            <div><dt>Outlet</dt><dd>{auth.user?.outletId ?? '—'}</dd></div>
          </dl>
          {submitError ? <p className="field-error" role="alert">{submitError}</p> : null}
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setStep('form')} disabled={submitting}>Back</Button>
            <Button onClick={() => void onConfirm()} loading={submitting}>Confirm order</Button>
          </div>
        </Card>
      )}

      {step === 'done' && (
        <EmptyState
          title="Order confirmed"
          description={createdRef
            ? `${createdRef} is confirmed for ${createdDate}.`
            : 'Your order is confirmed.'}
          action={
            <div className="toolbar-row">
              {createdId != null ? (
                <Button onClick={() => navigate(`/store/orders/${createdId}`)}>View order</Button>
              ) : null}
              <Button variant="secondary" onClick={() => navigate('/store/orders')}>My orders</Button>
            </div>
          }
        />
      )}
    </>
  )
}
