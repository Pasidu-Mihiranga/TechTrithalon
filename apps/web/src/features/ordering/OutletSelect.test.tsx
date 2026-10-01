import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { OutletSelect } from './OutletSelect'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
function setup(onChange = vi.fn()) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <OutletSelect value="" onChange={onChange} />
  </QueryClientProvider>)
  return onChange
}
describe('outlet selector', () => {
  it('waits for API options and submits their actual ID', async () => {
    let resolve!: (value: Response) => void
    const fetchSpy = vi.fn(() => new Promise<Response>((done) => { resolve = done }))
    vi.stubGlobal('fetch', fetchSpy)
    const onChange = setup()
    expect(screen.getByLabelText('Outlet')).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Loading outlet')
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    resolve(json([{ outletId: 'SYN901', brand: 'Synthetic brand', district: 'Synthetic district' }]))
    expect(await screen.findByRole('option', { name: 'SYN901 · Synthetic brand · Synthetic district' })).toBeVisible()
    await userEvent.selectOptions(screen.getByLabelText('Outlet'), 'SYN901')
    expect(onChange).toHaveBeenCalledWith('SYN901')
    expect(fetchSpy.mock.calls[0]).toBeDefined()
  })
  it('shows honest empty data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json([])))
    setup()
    expect(await screen.findByText('No outlets are available for your account.')).toBeVisible()
    expect(screen.getByLabelText('Outlet')).toBeDisabled()
  })
  it('explains forbidden access and permits retry', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(json({}, 403)).mockResolvedValueOnce(json([]))
    vi.stubGlobal('fetch', fetchSpy)
    setup()
    expect(await screen.findByRole('alert')).toHaveTextContent('Your role cannot access')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No outlets are available for your account.')).toBeVisible()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})
