import { expect, test, type Page } from '@playwright/test'

// The dispatcher's Live Operations board and Exceptions queue follow what the dock and the driver do (polling).
// Needs an isolated stack with the synthetic fixtures; never run it against the competition dataset.
test.skip(process.env.MANUAL_PLANNING_FIXTURE !== 'synthetic', 'Requires a fresh isolated synthetic stack; never use the competition dataset.')
test.describe.configure({ mode: 'serial' })
test.setTimeout(150_000)

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

test('the board and the queue follow the dock and the driver without a reload', async ({ page, browser }, testInfo) => {
  await signIn(page, process.env.SEED_DISPATCHER_USERNAME ?? 'DSP-001', process.env.SEED_DISPATCHER_PASSWORD)
  const { demoOperatingDate: date } = await api<{ demoOperatingDate: string }>(page, 'get', '/api/v1/reference/summary')
  const snapshot = await api<{ id: number }>(page, 'post', '/api/v1/dispatcher/planning/snapshots', { planDate: date, depot: 'Peliyagoda' }, 201)
  const created = await api<{ plan: { id: number }; unassignedOrders: { order: { id: number; brand: string } }[] }>(
    page, 'post', '/api/v1/dispatcher/plans', { snapshotId: snapshot.id, reason: 'Live operations journey' }, 201)
  const plan = created.plan.id
  const fresh = created.unassignedOrders.find(item => item.order.brand === 'Fresh')!.order
  const others = created.unassignedOrders.filter(item => item.order.id !== fresh.id).map(item => item.order)
  let version = 0
  await api(page, 'post', `/api/v1/dispatcher/plans/${plan}/trips`, { expectedVersion: version++, reason: 'Assign',
    trip: { vehicleId: 'VEH901', tripIndex: 1, brand: 'Fresh', district: 'Alpha', orderIds: [fresh.id] } })
  for (const order of others) await api(page, 'post', `/api/v1/dispatcher/plans/${plan}/orders/${order.id}/defer`,
    { expectedVersion: version++, reason: 'Not in this journey', reasonCode: 'OTHER' })
  await api(page, 'post', `/api/v1/dispatcher/plans/${plan}/publish`, { expectedVersion: version, reason: 'Publish' })

  // The dispatcher opens the board on a laptop: the trip is still at the dock.
  await page.setViewportSize({ width: 1280, height: 832 })
  await page.goto('/dispatcher/live-operations')
  const trip = page.getByRole('article', { name: 'VEH901 trip 1' })
  await expect(trip).toContainText('Loading')
  await expect(trip).toContainText('0 / 1 orders')
  await expect(page.getByRole('region', { name: 'Route progress' })).toContainText('Schematic only')

  // The loader hands the trip over; the board catches up on its own poll.
  const dock = await (await browser.newContext({ viewport: { width: 834, height: 1194 }, hasTouch: true })).newPage()
  await signIn(dock, process.env.SEED_LOADER_USERNAME ?? 'LDR-001', process.env.SEED_LOADER_PASSWORD)
  await dock.getByRole('link', { name: /Start loading/ }).click()
  await dock.getByRole('link', { name: 'Load Stop 1' }).click()
  await dock.getByRole('button', { name: /Confirm \d+ units loaded/ }).click()
  await dock.getByRole('button', { name: 'Mark trip as loaded' }).click()
  await expect(dock.getByRole('heading', { name: 'Trip 1 loaded' })).toBeVisible()
  await expect(trip).toContainText('Ready to leave', { timeout: 40_000 })

  // The driver starts the trip and delivers.
  const phone = await (await browser.newContext({ viewport: { width: 402, height: 874 }, hasTouch: true, isMobile: true })).newPage()
  await signIn(phone, process.env.SEED_DRIVER_USERNAME ?? 'DRV-001', process.env.SEED_DRIVER_PASSWORD)
  await phone.getByRole('button', { name: 'Start Trip' }).click()
  await expect(phone).toHaveURL(/\/driver\/trips\/1$/)
  await expect(trip).toContainText(/In Transit|Delayed/, { timeout: 40_000 })
  await expect(trip).toContainText('(1 of 1)')
  await page.screenshot({ path: testInfo.outputPath('live-operations.png') })
  await phone.getByRole('button', { name: 'Go to Stop' }).click()
  await phone.getByRole('link', { name: 'View Stop Details' }).click()
  await phone.getByRole('button', { name: "I've Arrived" }).click()
  await phone.getByRole('button', { name: 'Start Delivery' }).click()
  await phone.getByRole('button', { name: 'Delivered' }).click()
  await phone.getByLabel('Recipient name').fill('Shop Counter')
  await phone.getByRole('button', { name: 'Confirm Delivery' }).click()
  await expect(phone.getByRole('heading', { name: 'Stop completed' })).toBeVisible()
  await expect(trip).toContainText('1 / 1 orders', { timeout: 40_000 })

  // An action from the phone the server cannot apply becomes an exception, with a badge on the menu.
  const sync = await api<{ results: { result: string }[] }>(phone, 'post', '/api/v1/driver/sync', { actions: [{
    clientActionId: crypto.randomUUID(), actionType: 'STOP_ARRIVE', planDate: date, tripIndex: 1, occurredAt: new Date().toISOString(), outletId: 'OUT903' }] })
  expect(['REJECTED', 'CONFLICT']).toContain(sync.results[0].result)
  await expect(page.getByRole('link', { name: 'Exceptions' })).toContainText('1', { timeout: 40_000 })
  await page.getByRole('link', { name: 'Exceptions' }).click()
  await page.getByRole('button', { name: /Phone action (rejected|conflicted)/ }).click()
  await expect(page.getByLabel('Exception facts')).toContainText('VEH901')
  await page.screenshot({ path: testInfo.outputPath('exceptions.png') })
  await page.getByRole('button', { name: 'Take it' }).click()
  await expect(page.getByRole('button', { name: 'In Progress (1)' })).toBeVisible()
  await page.getByLabel('Note').fill('Stop was not on the route')
  await page.getByRole('button', { name: 'Acknowledge' }).click()
  await expect(page.getByRole('button', { name: 'Resolved (1)' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Exceptions' })).not.toContainText('1')
})
