import { expect, test, type Page } from '@playwright/test'

// Runs the whole order lifecycle across four roles, so it needs an isolated stack with the synthetic fixtures.
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

test('plan, load, deliver and receipt across the four roles, including a disputed delivery the dispatcher resolves', async ({ page, browser }, testInfo) => {
  // Dispatcher plans and publishes the store's Fresh order.
  await signIn(page, process.env.SEED_DISPATCHER_USERNAME ?? 'DSP-001', process.env.SEED_DISPATCHER_PASSWORD)
  const { demoOperatingDate: date } = await api<{ demoOperatingDate: string }>(page, 'get', '/api/v1/reference/summary')
  const snapshot = await api<{ id: number }>(page, 'post', '/api/v1/dispatcher/planning/snapshots', { planDate: date, depot: 'Peliyagoda' }, 201)
  const created = await api<{ plan: { id: number }; unassignedOrders: { order: { id: number; orderRef: string; brand: string } }[] }>(
    page, 'post', '/api/v1/dispatcher/plans', { snapshotId: snapshot.id, reason: 'Lifecycle journey' }, 201)
  const plan = created.plan.id
  const fresh = created.unassignedOrders.find(item => item.order.brand === 'Fresh')!.order
  const others = created.unassignedOrders.filter(item => item.order.id !== fresh.id).map(item => item.order)
  let version = 0
  await api(page, 'post', `/api/v1/dispatcher/plans/${plan}/trips`, { expectedVersion: version++, reason: 'Assign',
    trip: { vehicleId: 'VEH901', tripIndex: 1, brand: 'Fresh', district: 'Alpha', orderIds: [fresh.id] } })
  for (const order of others) await api(page, 'post', `/api/v1/dispatcher/plans/${plan}/orders/${order.id}/defer`,
    { expectedVersion: version++, reason: 'Not in this journey', reasonCode: 'OTHER' })
  await api(page, 'post', `/api/v1/dispatcher/plans/${plan}/publish`, { expectedVersion: version, reason: 'Publish' })

  // Store manager (laptop): the order is pending.
  const shop = await (await browser.newContext({ viewport: { width: 1280, height: 832 } })).newPage()
  await signIn(shop, process.env.SEED_STORE_MANAGER_USERNAME ?? 'STM-001', process.env.SEED_STORE_MANAGER_PASSWORD)
  await shop.getByRole('link', { name: 'Deliveries' }).click()
  await expect(shop.getByRole('article', { name: fresh.orderRef })).toContainText('Pending')

  // Loader (tablet) counts and hands over.
  const dock = await (await browser.newContext({ viewport: { width: 834, height: 1194 }, hasTouch: true })).newPage()
  await signIn(dock, process.env.SEED_LOADER_USERNAME ?? 'LDR-001', process.env.SEED_LOADER_PASSWORD)
  await dock.getByRole('link', { name: /Start loading/ }).click()
  await dock.getByRole('link', { name: 'Load Stop 1' }).click()
  await dock.getByRole('button', { name: /Confirm \d+ units loaded/ }).click()
  await dock.getByRole('button', { name: 'Mark trip as loaded' }).click()
  await expect(dock.getByRole('heading', { name: 'Trip 1 loaded' })).toBeVisible()

  // Driver (phone) delivers.
  const phone = await (await browser.newContext({ viewport: { width: 402, height: 874 }, hasTouch: true, isMobile: true })).newPage()
  await signIn(phone, process.env.SEED_DRIVER_USERNAME ?? 'DRV-001', process.env.SEED_DRIVER_PASSWORD)
  await phone.getByRole('button', { name: 'Start Trip' }).click()
  await expect(phone).toHaveURL(/\/driver\/trips\/1$/)
  await shop.reload()
  await expect(shop.getByRole('article', { name: fresh.orderRef })).toContainText('In delivery')
  await phone.getByRole('button', { name: 'Go to Stop' }).click()
  await phone.getByRole('link', { name: 'View Stop Details' }).click()
  await phone.getByRole('button', { name: "I've Arrived" }).click()
  await phone.getByRole('button', { name: 'Start Delivery' }).click()
  await phone.getByRole('button', { name: 'Delivered' }).click()
  await phone.getByLabel('Recipient name').fill('Shop Counter')
  await phone.getByRole('button', { name: 'Confirm Delivery' }).click()
  await expect(phone.getByRole('heading', { name: 'Stop completed' })).toBeVisible()
  await phone.getByRole('button', { name: 'Finish Stops' }).click()
  await phone.getByRole('button', { name: 'Finish Trip' }).click()
  await expect(phone.getByRole('heading', { name: 'Trip submitted' })).toBeVisible()

  // Store manager checks the delivery against the driver's record and reports a shortfall.
  await shop.reload()
  await expect(shop.getByRole('article', { name: fresh.orderRef })).toContainText('Confirm receipt')
  await shop.getByRole('link', { name: 'Confirm receipt →' }).click()
  await expect(shop.getByRole('heading', { name: 'Confirm receipt' })).toBeVisible()
  await expect(shop.getByText('Shop Counter')).toBeVisible()
  await shop.screenshot({ path: testInfo.outputPath('store-confirm-receipt.png') })
  await shop.getByRole('link', { name: 'Report an issue' }).click()
  await shop.getByRole('radio', { name: 'Short' }).click()
  await shop.getByLabel(/Units affected/).fill('2')
  await shop.getByLabel(/Details/).fill('Two crates missing')
  await shop.getByRole('button', { name: 'Submit issue' }).click()
  await expect(shop.getByRole('heading', { name: 'Issues' })).toBeVisible()
  await expect(shop.getByRole('complementary', { name: 'Issue detail' })).toContainText('Short: 2 of 12 units')
  await shop.screenshot({ path: testInfo.outputPath('store-issues-open.png') })
  expect((await api<{ status: string }>(shop, 'get', `/api/v1/store/deliveries/${fresh.id}`)).status).toBe('delivered')

  // Dispatcher sees the discrepancy and decides.
  await page.goto('/dispatcher/exceptions')
  const card = page.getByRole('article', { name: `Receipt discrepancy ${fresh.orderRef}` })
  await expect(card).toContainText('Short: 2 of 12 units')
  await card.getByRole('radio', { name: 'Credit the store' }).click()
  await card.getByLabel(`Decision note for ${fresh.orderRef}`).fill('Credit 2 units on the next invoice')
  await card.getByRole('button', { name: 'Resolve' }).click()
  await expect(page.getByText('Resolved (1)')).toBeVisible()

  // The store sees the decision, and the order is complete.
  await shop.reload()
  await expect(shop.getByRole('tab', { name: 'Resolved (1)' })).toBeVisible()
  await shop.getByRole('tab', { name: 'Resolved (1)' }).click()
  await expect(shop.getByRole('complementary', { name: 'Issue detail' })).toContainText('Credit 2 units on the next invoice')
  const order = await api<{ status: string }>(shop, 'get', `/api/v1/store/orders/${fresh.id}`)
  expect(order.status).toBe('receipt_confirmed')
})
