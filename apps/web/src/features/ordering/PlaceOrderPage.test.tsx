import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { PlaceOrderPage } from './PlaceOrderPage'

vi.mock('../auth/auth', () => ({ useAuth: () => ({ user: { outletId: 'OUT901' } }) }))
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const cutoff = { nextDeliveryDate: '2026-06-26', open: true }
function setup() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><PlaceOrderPage /></MemoryRouter></QueryClientProvider>)
}
async function review() {
  await screen.findByRole('heading', { name: 'Place an order' })
  await userEvent.type(screen.getByLabelText('Units'), '2')
  await userEvent.type(screen.getByLabelText('Weight (kg)'), '10')
  await userEvent.type(screen.getByLabelText('Volume (m³)'), '0.1')
  await userEvent.click(screen.getByRole('button', { name: 'Review order' }))
  await userEvent.click(screen.getByRole('button', { name: 'Confirm order' }))
}
describe('order confirmation', () => {
  it('sends the reviewed date and displays the server-persisted date', async () => {
    let submitted: unknown
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      if (request.method !== 'POST') return json(cutoff)
      submitted = await request.clone().json()
      return json({ id: 901, ref: 'SYN-901', orderDate: '2026-06-27' }, 201)
    }))
    setup(); await review()
    await screen.findByText('SYN-901 is confirmed for 2026-06-27.')
    expect(submitted).toMatchObject({ expectedDeliveryDate: '2026-06-26', units: 2 })
  })
  it('requires a new review when cutoff changes the delivery date', async () => {
    let reads = 0
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => request.method === 'POST'
      ? json({ code: 'DELIVERY_DATE_CHANGED' }, 409)
      : json({ ...cutoff, nextDeliveryDate: ++reads === 1 ? '2026-06-26' : '2026-06-27' })))
    setup(); await review()
    await screen.findByText('The delivery date changed. Review the updated date and confirm again.')
    expect(screen.getByText(/Delivery 2026-06-27/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Confirm order' })).not.toBeInTheDocument()
  })
  it('recovers the form after a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      if (request.method === 'POST') throw new TypeError('Synthetic network failure')
      return json(cutoff)
    }))
    setup(); await review()
    await screen.findByText('The order could not be confirmed. Check your connection and try again.')
    expect(screen.getByRole('button', { name: 'Review order' })).toBeEnabled()
  })
})
