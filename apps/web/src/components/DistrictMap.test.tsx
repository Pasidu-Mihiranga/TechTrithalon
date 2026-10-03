import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { DistrictMap } from './DistrictMap'
import type { Geography } from '../lib/referenceQueries'

const square = (x: number, y: number) => ({ type: 'Polygon', coordinates: [[[x, y], [x + 0.3, y], [x + 0.3, y + 0.3], [x, y + 0.3], [x, y]]] })
const geography: Geography = {
  attribution: 'Synthetic boundaries for tests',
  depots: [{ name: 'Synthetic depot', lat: 7, lng: 80, basis: 'Synthetic point, approximate' }],
  districts: [
    { district: 'Alpha', served: true, depot: 'Synthetic depot', labelPoint: [80.15, 7.15], geometry: square(80, 7) },
    { district: 'Beta', served: true, depot: 'Synthetic depot', labelPoint: [80.65, 7.15], geometry: square(80.5, 7) },
    { district: 'Gamma', served: false, depot: null, labelPoint: [81.15, 7.15], geometry: square(81, 7) },
  ],
  links: [{ district: 'Alpha', depot: 'Synthetic depot', depotToDistrictKm: 10, depotToDistrictMinutes: 20, interStopKm: 3, interStopMinutes: 7, roadClass: 'urban' }],
}

describe('DistrictMap', () => {
  beforeEach(() => window.localStorage.clear())

  it('labels served districts and depots, never outlets, and says so', () => {
    render(<DistrictMap geography={geography} values={{ Alpha: 4, Beta: 1 }} badges={{ Alpha: '4', Beta: '1' }} legend="Orders in the queue" />)
    const map = screen.getByRole('region', { name: 'District map' })
    expect(map.querySelectorAll('.district-label')).toHaveLength(2)
    expect(map).toHaveTextContent('Alpha')
    expect(map).toHaveTextContent('Beta')
    expect(map).not.toHaveTextContent('Gamma') // outside the competition data: shaped, not labelled
    expect(map.querySelector('.depot-pin')).toHaveTextContent('Synthetic depot')
    expect(map.querySelectorAll('.district-label-badge')).toHaveLength(2)
    expect(screen.getByText('Orders in the queue')).toBeVisible()
    expect(screen.getByText(/Outlet locations are not in the data, so none are drawn/)).toBeVisible()
    expect(screen.getByText('Synthetic boundaries for tests')).toBeVisible()
  })

  it('focuses on one depot and fades the others into context', () => {
    const two: Geography = { ...geography,
      depots: [...geography.depots, { name: 'Other depot', lat: 7.4, lng: 80.7, basis: 'Synthetic point' }],
      districts: geography.districts.map(d => (d.district === 'Beta' ? { ...d, depot: 'Other depot' } : d)) }
    render(<DistrictMap geography={two} depot="Synthetic depot" />)
    const map = screen.getByRole('region', { name: 'District map' })
    expect(map.querySelectorAll('.district-label')).toHaveLength(1)
    expect(map).toHaveTextContent('Alpha')
    expect(map).not.toHaveTextContent('Beta')
    expect(map.querySelectorAll('.depot-pin')).toHaveLength(1)
    expect(map).not.toHaveTextContent('Other depot')
  })

  it('marks the selected district and only shades by the values it is given', () => {
    render(<DistrictMap geography={geography} selected="Beta" label="Selected map" />)
    expect(screen.getByRole('region', { name: 'Selected map' }).querySelector('.district-label.selected')).toHaveTextContent('Beta')
    expect(screen.queryByLabelText('Map legend')).not.toBeInTheDocument()
  })

  it('remembers the base-map choice for this viewer and still works without storage', async () => {
    render(<DistrictMap geography={geography} />)
    const toggle = screen.getByRole('checkbox', { name: 'Base map' })
    expect(toggle).toBeChecked()
    await userEvent.click(toggle)
    expect(toggle).not.toBeChecked()
    expect(window.localStorage.getItem('waypoint.map.baseLayer')).toBe('off')
  })

  it('offers a reset view control', async () => {
    render(<DistrictMap geography={geography} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reset view' }))
    expect(screen.getByRole('region', { name: 'District map' })).toBeVisible()
  })
})
