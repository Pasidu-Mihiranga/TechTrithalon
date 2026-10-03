import { expect, test, type Page } from '@playwright/test'

// Changes plan assignments on the demo day, so it must never run against a database you care about.
test.skip(process.env.ISOLATED_STACK !== '1', 'Requires a fresh isolated stack (edits candidate plans).')
test.describe.configure({ mode: 'serial' })

const apiBase = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? '8080'}`
const headers = { 'X-Requested-With': 'Waypoint', 'Content-Type': 'application/json' }

type Fleet = { vehicleId: string; type: string; temp: string; availabilityStatus: string | null }
type View = {
  plan: { id: number; lockVersion: number }
  trips: { id: number; vehicleId: string }[]
  fleet: Fleet[]
  unassignedOrders: { order: { id: number; temp: string; brand: string; district: string; parkingConstraint: string } }[]
}

async function api<T>(page: Page, method: 'get' | 'post', path: string, data?: unknown, expected = 200): Promise<T> {
  const response = await page.request[method](`${apiBase}${path}`, { headers, data })
  expect(response.status(), `${method} ${path}`).toBe(expected)
  return response.json() as Promise<T>
}

/** A candidate with one trip that carries a chilled order, on a reefer truck, plus the spare vehicles it could swap to. */
async function chilledTrip(page: Page) {
  const { demoOperatingDate: date } = await api<{ demoOperatingDate: string }>(page, 'get', '/api/v1/reference/summary')
  const orders = await api<{ items: { depot: string }[] }>(page, 'get', `/api/v1/dispatcher/orders?date=${date}&size=1`)
  const depot = orders.items[0].depot
  const snapshot = await api<{ id: number }>(page, 'post', '/api/v1/dispatcher/planning/snapshots', { planDate: date, depot }, 201)
  const created = await api<View>(page, 'post', '/api/v1/dispatcher/plans', { snapshotId: snapshot.id, reason: 'Change vehicle journey' }, 201)
  const order = created.unassignedOrders.map(item => item.order)
    .find(o => o.temp === 'chilled' && o.brand === 'Fresh' && o.district === 'Colombo' && o.parkingConstraint !== 'van_only')!
  const reefers = created.fleet.filter(v => v.type === 'truck' && v.temp === 'reefer' && v.availabilityStatus === 'available')
  const ambient = created.fleet.find(v => v.type === 'truck' && v.temp === 'ambient' && v.availabilityStatus === 'available')!
  const withTrip = await api<View>(page, 'post', `/api/v1/dispatcher/plans/${created.plan.id}/trips`, {
    expectedVersion: created.plan.lockVersion, reason: 'Chilled trip',
    trip: { vehicleId: reefers[0].vehicleId, tripIndex: 1, brand: 'Fresh', district: 'Colombo', orderIds: [order.id] },
  })
  return { planId: withTrip.plan.id, tripId: withTrip.trips[0].id, from: reefers[0].vehicleId, otherReefer: reefers[1].vehicleId, ambient: ambient.vehicleId }
}

async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('USER ID', { exact: true }).fill(process.env.SEED_DISPATCHER_USERNAME ?? 'DSP-001')
  await page.getByLabel('PASSWORD', { exact: true }).fill(process.env.SEED_DISPATCHER_PASSWORD ?? '')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

async function openAllocation(page: Page, planId: number) {
  await page.goto('/dispatcher/planning')
  await expect(page.getByLabel('Switch candidate plan')).toBeVisible({ timeout: 15_000 })
  const option = await page.getByLabel('Switch candidate plan').locator('option', { hasText: `Plan #${planId} ` }).first().getAttribute('value')
  await page.getByLabel('Switch candidate plan').selectOption(option!)
  await page.getByRole('button', { name: /Review Allocation/ }).first().click()
  await expect(page.getByRole('tablist', { name: 'Vehicle type filters' })).toBeVisible({ timeout: 15_000 })
}

test('the backend accepts a swap to another reefer and the card follows', async ({ page }, testInfo) => {
  await signIn(page)
  const { planId, tripId, from, otherReefer } = await chilledTrip(page)
  await openAllocation(page, planId)
  const card = page.locator('.veh-card-body').filter({ hasText: from }).first()
  await card.getByRole('button', { name: 'Change' }).click()
  const dialog = page.getByRole('dialog', { name: 'Change Vehicle for Route' })
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('change-vehicle-dialog.png') })
  await expect(dialog.getByRole('button', { name: 'Confirm Vehicle Switch' })).toBeDisabled()
  await dialog.getByRole('radio', { name: new RegExp(otherReefer) }).check()
  await dialog.getByRole('button', { name: 'Confirm Vehicle Switch' }).click()
  await expect(dialog).toBeHidden({ timeout: 15_000 })
  const view = await api<View>(page, 'get', `/api/v1/dispatcher/plans/${planId}`)
  expect(view.trips.find(t => t.id === tripId)?.vehicleId).toBe(otherReefer)
  await expect(page.getByText(otherReefer).first()).toBeVisible()
})

test('a swap the backend rejects names the broken rule inside the dialog and changes nothing', async ({ page }, testInfo) => {
  await signIn(page)
  const { planId, tripId, from, ambient } = await chilledTrip(page)
  await openAllocation(page, planId)
  const before = await api<View>(page, 'get', `/api/v1/dispatcher/plans/${planId}`)
  const card = page.locator('.veh-card-body').filter({ hasText: from }).first()
  await card.getByRole('button', { name: 'Change' }).click()
  const dialog = page.getByRole('dialog', { name: 'Change Vehicle for Route' })
  await dialog.getByRole('radio', { name: new RegExp(ambient) }).check()
  await dialog.getByRole('button', { name: 'Confirm Vehicle Switch' }).click()
  await expect(dialog.getByText(/TEMPERATURE_COMPATIBILITY/)).toBeVisible({ timeout: 15_000 })
  await page.screenshot({ path: testInfo.outputPath('change-vehicle-rejected.png') })
  await expect(dialog).toBeVisible()
  const after = await api<View>(page, 'get', `/api/v1/dispatcher/plans/${planId}`)
  expect(after.trips.find(t => t.id === tripId)?.vehicleId).toBe(from)
  expect(after.plan.lockVersion).toBe(before.plan.lockVersion)
})

test('Add trip on a standby vehicle creates the trip in the backend', async ({ page }, testInfo) => {
  await signIn(page)
  const { planId } = await chilledTrip(page)
  await openAllocation(page, planId)
  const before = await api<View>(page, 'get', `/api/v1/dispatcher/plans/${planId}`)
  const used = new Set(before.trips.map(t => t.vehicleId))
  const spare = before.fleet.find(v => v.availabilityStatus === 'available' && !used.has(v.vehicleId))!
  const card = page.getByRole('article', { name: `Vehicle ${spare.vehicleId}` })
  await card.scrollIntoViewIfNeeded()
  await card.getByRole('button', { name: 'Add trip' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add Vehicle Trip' })
  await expect(dialog.getByLabel('Vehicle')).toHaveValue(spare.vehicleId)
  await dialog.getByRole('button', { name: 'Create Trip' }).click()
  await expect(dialog).toBeHidden({ timeout: 15_000 })
  const after = await api<View>(page, 'get', `/api/v1/dispatcher/plans/${planId}`)
  expect(after.trips.map(t => t.vehicleId)).toContain(spare.vehicleId)
  await page.getByRole('article', { name: `Vehicle ${before.trips[0].vehicleId}` }).click()
  await expect(page.getByRole('region', { name: /Route detail for/ })).toContainText('Back to')
  await page.screenshot({ path: testInfo.outputPath('step3-allocation.png'), fullPage: false })
})
