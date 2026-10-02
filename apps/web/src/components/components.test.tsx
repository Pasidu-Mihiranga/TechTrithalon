import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Badge, Button, DataTable, Dialog, EmptyState, ErrorState, ForbiddenState, Input, LoadingState, MetricCard, Select } from '.'
import type { SortState } from '.'

describe('Button', () => {
  it('blocks clicks and reports busy while loading', async () => {
    const onClick = vi.fn()
    render(<Button loading onClick={onClick}>Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('does not submit forms by default', () => {
    render(<Button>Go</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })
})

describe('Input', () => {
  it('links the label and announces the error', () => {
    render(<Input label="Quantity" error="Must be positive" />)
    const input = screen.getByLabelText('Quantity')
    expect(input).toBeInvalid()
    expect(screen.getByRole('alert')).toHaveTextContent('Must be positive')
    expect(input).toHaveAccessibleDescription('Must be positive')
  })
})

describe('Select', () => {
  it('renders only the options it is given', () => {
    render(<Select label="Depot" placeholder="Choose" options={[{ value: 'a', label: 'Alpha' }]} />)
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose', 'Alpha'])
  })
})

describe('Badge and MetricCard', () => {
  it('shows text, not only colour', () => {
    render(<><Badge tone="danger">Late</Badge><MetricCard label="Vehicles" value={7} caption="available" /></>)
    expect(screen.getByText('Late')).toBeVisible()
    expect(screen.getByText('Vehicles')).toBeVisible()
    expect(screen.getByText('7')).toBeVisible()
  })
})

describe('DataTable', () => {
  interface Row { id: string; name: string }
  const rows: Row[] = [{ id: '1', name: 'Alpha' }, { id: '2', name: 'Beta' }]

  function Harness() {
    const [sort, setSort] = useState<SortState | undefined>()
    return (
      <>
        <DataTable<Row> caption="Test rows" rows={rows} rowKey={(r) => r.id} sort={sort} onSortChange={setSort}
          columns={[{ key: 'name', header: 'Name', sortable: true, cell: (r) => r.name }]} />
        <output data-testid="sort">{sort ? `${sort.key}:${sort.direction}` : 'none'}</output>
      </>
    )
  }

  it('renders rows and exposes sort state to assistive tech', async () => {
    render(<Harness />)
    expect(screen.getByRole('table', { name: 'Test rows' })).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeVisible()
    const header = screen.getByRole('columnheader', { name: 'Name' })
    expect(header).toHaveAttribute('aria-sort', 'none')
    await userEvent.click(screen.getByRole('button', { name: 'Name' }))
    expect(screen.getByTestId('sort')).toHaveTextContent('name:asc')
    expect(header).toHaveAttribute('aria-sort', 'ascending')
    await userEvent.click(screen.getByRole('button', { name: 'Name' }))
    expect(screen.getByTestId('sort')).toHaveTextContent('name:desc')
  })
})

describe('Dialog', () => {
  it('moves focus in, closes on Escape and returns focus', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <Dialog open={open} title="Confirm" onClose={() => setOpen(false)}>
            <button>Inside</button>
          </Dialog>
        </>
      )
    }
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await userEvent.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Confirm' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('keeps Tab focus inside the dialog', async () => {
    render(<Dialog open title="Trap" onClose={() => {}}><button>One</button></Dialog>)
    const close = screen.getByRole('button', { name: 'Close' })
    const one = screen.getByRole('button', { name: 'One' })
    expect(close).toHaveFocus()
    await userEvent.tab()
    expect(one).toHaveFocus()
    await userEvent.tab()
    expect(close).toHaveFocus()
  })
})

describe('state components', () => {
  it('EmptyState says what is missing', () => {
    render(<EmptyState title="Nothing here" description="Arrives in Phase 8" />)
    expect(screen.getByRole('status')).toHaveTextContent('Arrives in Phase 8')
  })

  it('ErrorState offers retry and shows the trace id', async () => {
    const retry = vi.fn()
    render(<ErrorState traceId="abc-123" onRetry={retry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('abc-123')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('ForbiddenState is announced', () => {
    render(<ForbiddenState />)
    expect(screen.getByRole('alert')).toHaveTextContent('Access denied')
  })

  it('LoadingState reports a busy region', () => {
    render(<LoadingState label="Loading orders" />)
    expect(screen.getByRole('status', { name: 'Loading orders' })).toHaveAttribute('aria-busy', 'true')
  })
})
