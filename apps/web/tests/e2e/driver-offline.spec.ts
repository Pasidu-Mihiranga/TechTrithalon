import { expect, test, type Page } from '@playwright/test'

// Publishes and delivers a trip, so it runs only on an isolated stack with the synthetic fixtures.
test.skip(process.env.MANUAL_PLANNING_FIXTURE !== 'synthetic', 'Requires a fresh isolated synthetic stack; never use the competition dataset.')
test.describe.configure({ mode: 'serial' })
test.setTimeout(120_000)

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

test('the driver delivers a whole trip offline and it reaches the server exactly once when the signal returns', async ({ page, browser }, testInfo) => {
  // Dispatcher publishes the Fresh trip; the loader API hands it over.
  await signIn(page, process.env.SEED_DISPATCHER_USERNAME ?? 'DSP-001', process.env.SEED_DISPATCHER_PASSWORD)
  const { demoOperatingDate: date } = await api<{ demoOperatingDate: string }>(page, 'get', '/api/v1/reference/summary')
  const snapshot = await api<{ id: number }>(page, 'post', '/api/v1/dispatcher/planning/snapshots', { planDate: date, depot: 'Peliyagoda' }, 201)
  const created = await api<{ plan: { id: number }; unassignedOrders: { order: { id: number; orderRef: string; brand: string } }[] }>(
    page, 'post', '/api/v1/dispatcher/plans', { snapshotId: snapshot.id, reason: 'Offline journey' }, 201)
  const plan = created.plan.id
  const fresh = created.unassignedOrders.find(item => item.order.brand === 'Fresh')!.order
  const others = created.unassignedOrders.filter(item => item.order.id !== fresh.id).map(item => item.order)
  let version = 0
  await api(page, 'post', `/api/v1/dispatcher/plans/${plan}/trips`, { expectedVersion: version++, reason: 'Assign',
    trip: { vehicleId: 'VEH901', tripIndex: 1, brand: 'Fresh', district: 'Alpha', orderIds: [fresh.id] } })
  for (const order of others) await api(page, 'post', `/api/v1/dispatcher/plans/${plan}/orders/${order.id}/defer`,
    { expectedVersion: version++, reason: 'Not in this journey', reasonCode: 'OTHER' })
  await api(page, 'post', `/api/v1/dispatcher/plans/${plan}/publish`, { expectedVersion: version, reason: 'Publish' })
  const dock = await (await browser.newContext()).newPage()
  await signIn(dock, process.env.SEED_LOADER_USERNAME ?? 'LDR-001', process.env.SEED_LOADER_PASSWORD)
  const board = await api<{ trips: { loadTaskId: number }[] }>(dock, 'get', '/api/v1/loader/board')
  const task = await api<{ task: { version: number; lines: { id: number }[] } }>(dock, 'get', `/api/v1/loader/load-tasks/${board.trips[0].loadTaskId}`)
  await api(dock, 'post', `/api/v1/loader/load-tasks/${board.trips[0].loadTaskId}/lines/${task.task.lines[0].id}/loaded`, { expectedVersion: task.task.version })
  await api(dock, 'post', `/api/v1/loader/load-tasks/${board.trips[0].loadTaskId}/loaded`, { expectedVersion: task.task.version + 1 })

  // Driver opens the day online (the phone keeps a copy), then loses the signal.
  const context = await browser.newContext({ viewport: { width: 402, height: 874 }, hasTouch: true, isMobile: true })
  const phone = await context.newPage()
  await signIn(phone, process.env.SEED_DRIVER_USERNAME ?? 'DRV-001', process.env.SEED_DRIVER_PASSWORD)
  await expect(phone.getByRole('button', { name: 'Start Trip' })).toBeVisible({ timeout: 15_000 })
  await context.setOffline(true)

  await phone.getByRole('button', { name: 'Start Trip' }).click()
  await expect(phone).toHaveURL(/\/driver\/trips\/1$/)
  await expect(phone.getByRole('link', { name: /Sync status: Offline · 1/ })).toBeVisible()
  await phone.getByRole('button', { name: 'Go to Stop' }).click()
  await phone.getByRole('link', { name: 'View Stop Details' }).click()
  await phone.getByRole('button', { name: "I've Arrived" }).click()
  await expect(phone.getByText('Offline — saved on this phone, will sync automatically')).toBeVisible()
  await phone.getByRole('button', { name: 'Start Delivery' }).click()
  await phone.getByRole('button', { name: 'Delivered' }).click()
  await phone.getByLabel('Recipient name').fill('Offline Recipient')
  await phone.getByRole('button', { name: 'Confirm Delivery' }).click()
  await expect(phone.getByRole('heading', { name: 'Stop completed' })).toBeVisible()
  await phone.getByRole('button', { name: 'Finish Stops' }).click()
  await phone.getByRole('button', { name: 'Finish Trip' }).click()
  await expect(phone.getByRole('heading', { name: 'Trip submitted' })).toBeVisible()
  await phone.getByRole('link', { name: 'Back to Home' }).click()
  await phone.getByRole('link', { name: /Sync status: Offline · 5/ }).first().click()
  await expect(phone.getByRole('heading', { name: 'No connection' })).toBeVisible()
  await expect(phone.getByText('5 actions saved')).toBeVisible()
  await phone.screenshot({ path: testInfo.outputPath('offline-sync.png') })

  // Nothing reached the server yet.
  const before = await api<{ status: string }>(page, 'get', `/api/v1/dispatcher/orders/${fresh.id}`)
  expect(before.status).toBe('planned')

  // Signal returns: the outbox drains on its own.
  await context.setOffline(false)
  await expect(phone.getByRole('heading', { name: 'All synced' })).toBeVisible({ timeout: 20_000 })
  await phone.screenshot({ path: testInfo.outputPath('back-online.png') })
  const after = await api<{ status: string }>(phone, 'get', `/api/v1/driver/orders/${fresh.id}`)
  expect(after.status).toBe('delivered')
  const trip = await api<{ card: { state: string; ordersDone: number } }>(phone, 'get', '/api/v1/driver/trips/1')
  expect(trip.card).toMatchObject({ state: 'COMPLETED', ordersDone: 1 })
})
