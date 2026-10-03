import { expect, test, type Page } from '@playwright/test'

// Creates a candidate plan on the demo day, so it must never run against a database you care about.
test.skip(process.env.ISOLATED_STACK !== '1', 'Requires a fresh isolated stack (edits candidate plans).')
test.describe.configure({ mode: 'serial' })

const apiBase = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? '8080'}`
const headers = { 'X-Requested-With': 'Waypoint', 'Content-Type': 'application/json' }

async function signIn(page: Page, user: string, password: string | undefined) {
  await page.goto('/login')
  await page.getByLabel('USER ID', { exact: true }).fill(user)
  await page.getByLabel('PASSWORD', { exact: true }).fill(password ?? '')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

async function api<T>(page: Page, method: 'get' | 'post', path: string, data?: unknown, expected = 200): Promise<T> {
  const response = await page.request[method](`${apiBase}${path}`, { headers, data })
  expect(response.status(), `${method} ${path}`).toBe(expected)
  return response.json() as Promise<T>
}

test('the queue map shows server demand per district and filters the list', async ({ page }, testInfo) => {
  await signIn(page, process.env.SEED_DISPATCHER_USERNAME ?? 'DSP-001', process.env.SEED_DISPATCHER_PASSWORD)
  const { demoOperatingDate: date } = await api<{ demoOperatingDate: string }>(page, 'get', '/api/v1/reference/summary')
  const first = await api<{ items: { depot: string }[] }>(page, 'get', `/api/v1/dispatcher/orders?date=${date}&size=1`)
  const depot = first.items[0].depot
  const demand = await api<{ district: string; orders: number; chilledOrders: number }[]>(page, 'get', `/api/v1/dispatcher/orders/districts?date=${date}&depot=${depot}`)
  const busiest = [...demand].sort((a, b) => b.orders - a.orders)[0]

  await page.goto('/dispatcher/planning')
  await page.getByRole('button', { name: /Map/ }).first().click()
  const map = page.getByRole('region', { name: 'Order demand by district' })
  await expect(map).toBeVisible({ timeout: 15_000 })
  // One label per district that has demand, each carrying the server's order count.
  await expect(map.locator('.district-label')).toHaveCount(demand.length)
  await expect(map.locator('.district-label').filter({ hasText: busiest.district })).toContainText(String(busiest.orders))
  await expect(map.locator('.depot-pin')).toHaveCount(1)
  await expect(map).toContainText('Outlet locations are not in the data')
  await page.screenshot({ path: testInfo.outputPath('queue-map.png') })

  // Choosing a district (map selection or its chip) filters the list through the server-side search.
  const filtered = page.waitForResponse(r => r.url().includes('/api/v1/dispatcher/orders?') && r.url().includes(`q=${encodeURIComponent(busiest.district)}`))
  await page.getByRole('group', { name: 'Filter by district' }).getByRole('button', { name: new RegExp(busiest.district) }).click()
  expect((await filtered).status()).toBe(200)
  await expect(page.getByRole('status').filter({ hasText: `Showing orders in ${busiest.district}` })).toBeVisible()
  await expect(map.locator('.district-label.selected')).toContainText(busiest.district)
  const rows = page.locator('.map-split-row')
  await expect(rows.first()).toBeVisible()
  for (const row of await rows.all()) await expect(row).toContainText(busiest.district)
  await expect(page.getByLabel(`${busiest.district} demand`)).toContainText(`${busiest.orders}`)
  await page.screenshot({ path: testInfo.outputPath('queue-map-filtered.png') })
  await page.getByRole('button', { name: 'Clear' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Showing orders in' })).toHaveCount(0)
})

test('the allocation map highlights the selected trip and counts unassigned orders from the server', async ({ page }, testInfo) => {
  await signIn(page, process.env.SEED_DISPATCHER_USERNAME ?? 'DSP-001', process.env.SEED_DISPATCHER_PASSWORD)
  const { demoOperatingDate: date } = await api<{ demoOperatingDate: string }>(page, 'get', '/api/v1/reference/summary')
  const first = await api<{ items: { depot: string }[] }>(page, 'get', `/api/v1/dispatcher/orders?date=${date}&size=1`)
  const snapshot = await api<{ id: number }>(page, 'post', '/api/v1/dispatcher/planning/snapshots', { planDate: date, depot: first.items[0].depot }, 201)
  const created = await api<{ plan: { id: number; lockVersion: number }; fleet: { vehicleId: string; type: string; temp: string; availabilityStatus: string | null }[]
    unassignedOrders: { order: { id: number; district: string; temp: string; parkingConstraint: string; brand: string } }[]; unassignedByDistrict: Record<string, number> }>(
    page, 'post', '/api/v1/dispatcher/plans', { snapshotId: snapshot.id, reason: 'District map journey' }, 201)
  const order = created.unassignedOrders.map(u => u.order).find(o => o.brand === 'Fresh' && o.temp === 'ambient' && o.parkingConstraint !== 'van_only')!
  const truck = created.fleet.find(v => v.type === 'truck' && v.availabilityStatus === 'available')!
  const after = await api<{ plan: { id: number }; unassignedByDistrict: Record<string, number> }>(page, 'post', `/api/v1/dispatcher/plans/${created.plan.id}/trips`, {
    expectedVersion: created.plan.lockVersion, reason: 'Map trip',
    trip: { vehicleId: truck.vehicleId, tripIndex: 1, brand: 'Fresh', district: order.district, orderIds: [order.id] },
  })
  expect(after.unassignedByDistrict[order.district]).toBe(created.unassignedByDistrict[order.district] - 1)

  await page.goto('/dispatcher/planning')
  const option = await page.getByLabel('Switch candidate plan').locator('option', { hasText: `Plan #${created.plan.id} ` }).first().getAttribute('value')
  await page.getByLabel('Switch candidate plan').selectOption(option!)
  await page.getByRole('button', { name: /Review Allocation/ }).first().click()
  const map = page.getByRole('region', { name: 'Trips and unassigned orders by district' })
  await expect(map).toBeVisible({ timeout: 15_000 })
  await expect(map.locator('.district-label.selected')).toContainText(order.district)
  await expect(map.locator('.district-label').filter({ hasText: order.district })).toContainText(`${after.unassignedByDistrict[order.district]} left`)
  await expect(page.getByRole('region', { name: new RegExp(`Route detail for ${truck.vehicleId}`) })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('allocation-map.png') })
})
