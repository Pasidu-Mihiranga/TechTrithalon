import { expect, test, type Page } from '@playwright/test'

// Publishes a plan and records loading, so it runs only on an isolated stack with the synthetic fixtures.
test.skip(process.env.MANUAL_PLANNING_FIXTURE !== 'synthetic', 'Requires a fresh isolated synthetic stack; never use the competition dataset.')
test.describe.configure({ mode: 'serial' })

const apiBase = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? '8080'}`
const headers = { 'X-Requested-With': 'Waypoint', 'Content-Type': 'application/json' }

async function signIn(page: Page, user: string, password: string | undefined) {
  if (!password) throw new Error('Configure the seeded account passwords before running browser tests')
  await page.goto('/login')
  await page.getByLabel('USER ID', { exact: true }).fill(user)
  await page.getByLabel('PASSWORD', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

async function api<T>(page: Page, method: 'get' | 'post', path: string, data?: unknown, expected = 200): Promise<T> {
  const response = await page.request[method](`${apiBase}${path}`, { headers, data })
  expect(response.status(), `${method} ${path}`).toBe(expected)
  return response.json() as Promise<T>
}

test('the loader counts a published trip, reports a held shortfall, and hands over after the dispatcher decides', async ({ page, browser }, testInfo) => {
  // Dispatcher publishes one Style trip and leaves the Fresh order for another journey.
  await signIn(page, process.env.SEED_DISPATCHER_USERNAME ?? 'DSP-001', process.env.SEED_DISPATCHER_PASSWORD)
  const { demoOperatingDate: date } = await api<{ demoOperatingDate: string }>(page, 'get', '/api/v1/reference/summary')
  const snapshot = await api<{ id: number }>(page, 'post', '/api/v1/dispatcher/planning/snapshots', { planDate: date, depot: 'Peliyagoda' }, 201)
  const created = await api<{ plan: { id: number }; unassignedOrders: { order: { id: number; orderRef: string; brand: string } }[] }>(
    page, 'post', '/api/v1/dispatcher/plans', { snapshotId: snapshot.id, reason: 'Loader journey' }, 201)
  const plan = created.plan.id
  const style = created.unassignedOrders.find(item => item.order.brand === 'Style')!.order
  const others = created.unassignedOrders.filter(item => item.order.id !== style.id).map(item => item.order)
  let version = 0
  await api(page, 'post', `/api/v1/dispatcher/plans/${plan}/trips`, { expectedVersion: version++, reason: 'Assign',
    trip: { vehicleId: 'VEH901', tripIndex: 2, brand: 'Style', district: 'Alpha', orderIds: [style.id] } })
  for (const order of others) await api(page, 'post', `/api/v1/dispatcher/plans/${plan}/orders/${order.id}/defer`,
    { expectedVersion: version++, reason: 'Not in this journey', reasonCode: 'OTHER' })
  await api(page, 'post', `/api/v1/dispatcher/plans/${plan}/publish`, { expectedVersion: version, reason: 'Publish for loading' })

  // Loader: Home shows the trip; count it with a shortfall that holds the vehicle.
  const dock = await (await browser.newContext({ viewport: { width: 834, height: 1194 } })).newPage()
  await signIn(dock, process.env.SEED_LOADER_USERNAME ?? 'LDR-001', process.env.SEED_LOADER_PASSWORD)
  await expect(dock.getByRole('heading', { name: 'Trip 2 · VEH901' })).toBeVisible({ timeout: 15_000 })
  await expect(dock.getByLabel('Today')).toContainText('Orders to load')
  await dock.getByRole('link', { name: /Start loading/ }).click()
  await expect(dock.getByText('1st')).toBeVisible()
  await dock.getByRole('link', { name: 'Load Stop 1' }).click()
  await expect(dock.getByRole('heading', { name: `Load order ${style.orderRef}` })).toBeVisible()
  await dock.getByRole('link', { name: 'Report shortfall' }).click()
  await dock.getByRole('button', { name: 'Damaged' }).click()
  await dock.getByRole('button', { name: '2 units' }).click()
  await dock.getByRole('button', { name: 'Yes — hold vehicle' }).click()
  await dock.screenshot({ path: testInfo.outputPath('loader-shortfall.png') })
  await dock.getByRole('button', { name: 'Send to dispatcher' }).click()
  await expect(dock.getByLabel('Shortfall recorded')).toContainText('2 of')
  await dock.getByRole('link', { name: 'Back to the trip' }).last().click()
  await expect(dock.getByText('Not ready for handover')).toBeVisible()
  await expect(dock.getByRole('button', { name: 'Mark trip as loaded' })).toBeDisabled()

  // Dispatcher sees the shortfall on the published plan and sends the order short.
  await page.goto(`/dispatcher/planning?planId=${plan}&step=4`)
  const panel = page.getByRole('region', { name: 'Loading issues' })
  await expect(panel).toContainText(style.orderRef, { timeout: 15_000 })
  await panel.getByLabel(new RegExp(`Decision note for ${style.orderRef}`)).fill('Send the rest; store informed on receipt')
  await panel.getByRole('button', { name: /Send \d+ units/ }).click()
  await expect(panel).toContainText('Send short')

  // Loader hands the trip over.
  await dock.reload()
  await dock.getByRole('button', { name: 'Mark trip as loaded' }).click()
  await expect(dock.getByRole('heading', { name: 'Trip 2 loaded' })).toBeVisible()
  await dock.screenshot({ path: testInfo.outputPath('loader-handover.png') })

  // Phone width: no horizontal overflow on the loader screens.
  await dock.setViewportSize({ width: 402, height: 874 })
  for (const path of ['/loader', '/loader/issues']) {
    await dock.goto(path)
    await expect(dock.getByRole('main')).toBeVisible()
    expect(await dock.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `overflow on ${path}`).toBe(true)
  }
})
