import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { VehicleSelect } from './VehicleSelect'
function setup() {
  const onChange = vi.fn()
  render(<QueryClientProvider client={new QueryClient()}><VehicleSelect value="" onChange={onChange} /></QueryClientProvider>)
  return onChange
}
describe('vehicle selector', () => {
  it('uses reference vehicles returned by the server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ vehicleId: 'SYN901', type: 'van', temp: 'reefer', depot: 'Synthetic depot' }]), { headers: { 'Content-Type': 'application/json' } })))
    const onChange = setup()
    await screen.findByRole('option', { name: 'SYN901 · van · reefer · Synthetic depot' })
    await userEvent.selectOptions(screen.getByLabelText('Vehicle'), 'SYN901')
    expect(onChange).toHaveBeenCalledWith('SYN901')
  })
  it('shows transport errors without fabricated options', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Synthetic network failure') }))
    setup()
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic network failure')
    expect(screen.getByLabelText('Vehicle')).toBeDisabled()
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })
})
