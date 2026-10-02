import { useState } from 'react'
import { Button, Card, EmptyState, Input, PageHeader, Select } from '../../components'

/**
 * Place-order layout only. Submission is wired in Phase 4; this screen must not invent a fake
 * success path or hard-coded quantities that look like they were saved.
 */
export function PlaceOrderLayoutPage() {
  const [temp, setTemp] = useState('ambient')
  const [units, setUnits] = useState('')

  return (
    <>
      <PageHeader title="Place an order" subtitle="Prepare an order for the next delivery day." />
      <Card>
        <form className="form-stack" onSubmit={(e) => e.preventDefault()}>
          <Select
            label="Temperature"
            value={temp}
            onChange={(e) => setTemp(e.target.value)}
            options={[
              { value: 'ambient', label: 'Ambient' },
              { value: 'chilled', label: 'Chilled (Fresh only)' },
            ]}
          />
          <Input
            label="Units"
            type="number"
            min={1}
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            placeholder="Enter quantity"
          />
          <Button type="submit" disabled>
            Confirm order
          </Button>
        </form>
      </Card>
      <EmptyState
        title="Submission not available yet"
        description="Order confirmation, cutoff enforcement and persistence are delivered in Phase 4. This page only shows the form layout."
      />
    </>
  )
}
