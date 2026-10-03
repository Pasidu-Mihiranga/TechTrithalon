import { expect, test, type Page } from '@playwright/test'

// Publishes, loads and delivers a trip, so it runs only on an isolated stack with the synthetic fixtures.
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

test('the driver starts a handed-over trip on a phone, records the delivery and finishes the trip', async ({ page, browser }, testInfo) => {
  // Dispatcher publishes the Fresh trip and defers the rest.
  await signIn(page, process.env.SEED_DISPATCHER_USERNAME ?? 'DSP-001', process.env.SEED_DISPATCHER_PASSWORD)
  const { demoOperatingDate: date } = await api<{ demoOperatingDate: string }>(page, 'get', '/api/v1/reference/summary')
  const snapshot = await api<{ id: number }>(page, 'post', '/api/v1/dispatcher/planning/snapshots', { planDate: date, depot: 'Peliyagoda' }, 201)
  const created = await api<{ plan: { id: number }; unassignedOrders: { order: { id: number; orderRef: string; brand: string } }[] }>(
    page, 'post', '/api/v1/dispatcher/plans', { snapshotId: snapshot.id, reason: 'Driver journey' }, 201)
  const plan = created.plan.id
  const fresh = created.unassignedOrders.find(item => item.order.brand === 'Fresh')!.order
  const others = created.unassignedOrders.filter(item => item.order.id !== fresh.id).map(item => item.order)
  let version = 0
  await api(page, 'post', `/api/v1/dispatcher/plans/${plan}/trips`, { expectedVersion: version++, reason: 'Assign',
    trip: { vehicleId: 'VEH901', tripIndex: 1, brand: 'Fresh', district: 'Alpha', orderIds: [fresh.id] } })
  for (const order of others) await api(page, 'post', `/api/v1/dispatcher/plans/${plan}/orders/${order.id}/defer`,
    { expectedVersion: version++, reason: 'Not in this journey', reasonCode: 'OTHER' })
  await api(page, 'post', `/api/v1/dispatcher/plans/${plan}/publish`, { expectedVersion: version, reason: 'Publish for delivery' })

  // Driver on a phone: the trip waits for the loader.
  const phone = await (await browser.newContext({ viewport: { width: 402, height: 874 }, hasTouch: true, isMobile: true })).newPage()
  await signIn(phone, process.env.SEED_DRIVER_USERNAME ?? 'DRV-001', process.env.SEED_DRIVER_PASSWORD)
  await expect(phone.locator('html')).toHaveAttribute('data-device', 'phone')
  await expect(phone.getByRole('navigation', { name: 'Driver navigation' })).toBeVisible()
  await expect(phone.getByText('Loading at depot')).toBeVisible({ timeout: 15_000 })

  // Loader on a tablet counts and hands the trip over.
  const dock = await (await browser.newContext({ viewport: { width: 834, height: 1194 }, hasTouch: true })).newPage()
  await signIn(dock, process.env.SEED_LOADER_USERNAME ?? 'LDR-001', process.env.SEED_LOADER_PASSWORD)
  await expect(dock.locator('html')).toHaveAttribute('data-device', 'tablet')
  await dock.getByRole('link', { name: /Start loading/ }).click()
  await dock.getByRole('link', { name: 'Load Stop 1' }).click()
  await dock.getByRole('button', { name: /Confirm \d+ units loaded/ }).click()
  await dock.getByRole('button', { name: 'Mark trip as loaded' }).click()
  await expect(dock.getByRole('heading', { name: 'Trip 1 loaded' })).toBeVisible()

  // Driver runs the trip.
  await phone.reload()
  await phone.getByRole('button', { name: 'Start Trip' }).click()
  await expect(phone).toHaveURL(/\/driver\/trips\/1$/)
  await phone.getByRole('button', { name: 'Go to Stop' }).click()
  await phone.getByRole('link', { name: 'View Stop Details' }).click()
  await phone.getByRole('button', { name: "I've Arrived" }).click()
  await phone.getByRole('button', { name: 'Start Delivery' }).click()
  await expect(phone.getByRole('heading', { name: fresh.orderRef })).toBeVisible()
  await phone.getByRole('button', { name: 'Delivered' }).click()
  await phone.getByLabel('Recipient name').fill('Synthetic Recipient')
  await phone.screenshot({ path: testInfo.outputPath('driver-confirm.png') })
  await phone.getByRole('button', { name: 'Confirm Delivery' }).click()
  await expect(phone.getByRole('heading', { name: 'Stop completed' })).toBeVisible()
  await phone.getByRole('button', { name: 'Finish Stops' }).click()
  await expect(phone.getByRole('heading', { name: 'Trip completed' })).toBeVisible()
  await phone.getByRole('button', { name: 'Finish Trip' }).click()
  await expect(phone.getByRole('heading', { name: 'Trip submitted' })).toBeVisible()
  await phone.screenshot({ path: testInfo.outputPath('driver-submitted.png') })

  // The record is on the server, and the phone screens never scroll sideways.
  const record = await api<{ status: string; outcome: { recipientName: string } }>(phone, 'get', `/api/v1/driver/orders/${fresh.id}`)
  expect(record.status).toBe('delivered')
  expect(record.outcome.recipientName).toBe('Synthetic Recipient')
  for (const path of ['/driver', '/driver/trips/1', '/driver/deliveries', '/driver/profile', `/driver/deliveries/${fresh.id}`]) {
    await phone.goto(path)
    await expect(phone.getByRole('main')).toBeVisible()
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `overflow on ${path}`).toBe(true)
  }
})
