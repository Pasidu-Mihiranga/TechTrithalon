import { expect, test, type BrowserContext, type Page } from '@playwright/test'

// Publishes a plan that defers every order, so it must never run against a database you care about.
test.skip(process.env.ISOLATED_STACK !== '1', 'Requires a fresh isolated stack (publishes deferrals).')
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

/** The depot that actually holds the demo orders (the depot list is alphabetical, so Kandy comes first). */
async function demoScope(page: Page) {
  const { demoOperatingDate } = await api<{ demoOperatingDate: string }>(page, 'get', '/api/v1/reference/summary')
  const orders = await api<{ items: { depot: string }[] }>(page, 'get', `/api/v1/dispatcher/orders?date=${demoOperatingDate}&size=1`)
  return { date: demoOperatingDate, depot: orders.items[0].depot }
}

async function api<T>(page: Page, method: 'get' | 'post' | 'put', path: string, data?: unknown, expected = 200): Promise<T> {
  const response = await page.request[method](`${apiBase}${path}`, { headers, data })
  expect(response.status(), `${method} ${path}`).toBe(expected)
  return response.json() as Promise<T>
}

test('dispatcher records a queue deferral through the dialog with a required reason', async ({ page }, testInfo) => {
  await signIn(page, process.env.SEED_DISPATCHER_USERNAME ?? 'DSP-001', process.env.SEED_DISPATCHER_PASSWORD)
  await page.goto('/dispatcher/planning')
  await expect(page.getByLabel('Depot', { exact: true })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('checkbox').nth(1).check()
  await page.getByRole('button', { name: 'Move to Deferred' }).click()

  const dialog = page.getByRole('dialog', { name: 'Record queue deferral' })
  await expect(dialog).toBeVisible()
  const save = dialog.getByRole('button', { name: 'Save deferral' })
  await expect(save).toBeDisabled()
  await dialog.getByLabel('Reason for deferral').selectOption('VAN_ACCESS')
  await expect(save).toBeDisabled()
  await dialog.getByLabel('Explanation').fill('No van left for this van-only outlet')
  await expect(dialog.getByText('What this means')).toBeVisible()
  await expect(dialog.getByLabel(/Protect on the next run/)).toBeChecked()
  await expect(dialog.getByLabel(/Notify the store manager/)).toBeChecked()
  await expect(save).toBeEnabled()
  await page.screenshot({ path: testInfo.outputPath('defer-dialog.png') })
  await save.click()
  await expect(dialog).toBeHidden({ timeout: 15_000 })
  // Saving builds the candidate and moves on to the next step; the decision must be persisted with its reason code.
  await expect(page.getByRole('heading', { name: /Frozen \(Revision/ })).toBeVisible({ timeout: 15_000 })
  const scope = await demoScope(page)
  const plans = await api<{ unassignedOrders: { disposition: string; reasonCode?: string; reason?: string; protectNextRun: boolean; notifyStore: boolean; decidedByName?: string }[] }[]>(
    page, 'get', `/api/v1/dispatcher/plans?date=${scope.date}&depot=${scope.depot}`)
  // The plan list is newest first; reruns on the same stack leave older candidates behind.
  const deferred = plans[0].unassignedOrders.filter(item => item.disposition === 'DEFERRED')
  expect(deferred).toHaveLength(1)
  expect(deferred[0]).toMatchObject({ reasonCode: 'VAN_ACCESS', reason: 'No van left for this van-only outlet', protectNextRun: true, notifyStore: true })
  expect(deferred[0].decidedByName).toBeTruthy()
})

test('published deferrals reach the deferred orders page and the store manager, who acknowledges once', async ({ page, browser }, testInfo) => {
  await signIn(page, process.env.SEED_DISPATCHER_USERNAME ?? 'DSP-001', process.env.SEED_DISPATCHER_PASSWORD)
  const { date, depot } = await demoScope(page)

  // A fresh candidate that defers every order; the first order (OUT001) notifies its store.
  const snapshot = await api<{ id: number }>(page, 'post', '/api/v1/dispatcher/planning/snapshots', { planDate: date, depot }, 201)
  const created = await api<{ plan: { id: number; lockVersion: number }; unassignedOrders: { order: { id: number; outletId: string } }[] }>(
    page, 'post', '/api/v1/dispatcher/plans', { snapshotId: snapshot.id, reason: 'Browser deferral journey' }, 201)
  const storeOutlet = 'OUT001'
  await api(page, 'put', `/api/v1/dispatcher/plans/${created.plan.id}`, {
    expectedVersion: created.plan.lockVersion, reason: 'Defer the whole run', trips: [],
    dispositions: created.unassignedOrders.map(item => ({
      orderId: item.order.id, code: 'DEFERRED', reason: 'Peak-day capacity shortfall', reasonCode: 'CAPACITY',
      protectNextRun: item.order.outletId === storeOutlet, notifyStore: item.order.outletId === storeOutlet,
    })),
  })
  await api(page, 'post', `/api/v1/dispatcher/plans/${created.plan.id}/publish`, { expectedVersion: created.plan.lockVersion + 1, reason: 'Publish deferrals' })

  await page.goto('/dispatcher/deferred-orders')
  await expect(page.getByRole('heading', { name: 'Deferred Orders' })).toBeVisible()
  await expect(page.getByText('Store acknowledgements')).toBeVisible()
  await expect(page.getByRole('table', { name: 'Deferred orders' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Protected', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Awaiting acknowledgement').first()).toBeVisible()
  await page.getByRole('button', { name: 'S1-000' }).click()
  const record = page.getByRole('list', { name: 'Deferral record' }).or(page.locator('dl[aria-label="Deferral record"]'))
  await expect(record).toContainText('Capacity constraint on current run')
  await expect(record).toContainText('Dispatcher')
  await expect(record).toContainText('protected: first priority')
  await page.getByRole('button', { name: /Repeat skips \(\d+\)/ }).click()
  await expect(page.getByRole('table', { name: 'Deferred orders' }).getByRole('row')).not.toHaveCount(0)
  await page.getByRole('button', { name: /^All \(/ }).click()
  await expect(page.getByRole('navigation', { name: 'Deferred orders pages' })).toContainText('Page 1 of 5')
  await page.screenshot({ path: testInfo.outputPath('deferred-orders.png'), fullPage: true })

  const storeContext: BrowserContext = await browser.newContext({ viewport: { width: 1280, height: 832 } })
  const store = await storeContext.newPage()
  await signIn(store, process.env.SEED_STORE_MANAGER_USERNAME ?? 'STM-001', process.env.SEED_STORE_MANAGER_PASSWORD)
  await store.goto('/store')
  await expect(store.getByRole('heading', { name: /Deferral notice/ })).toBeVisible({ timeout: 15_000 })
  await expect(store.getByText(/moves to the .* planning run/).first()).toBeVisible()
  await expect(store.getByText(/confirmed only after that run is planned/).first()).toBeVisible()
  await store.screenshot({ path: testInfo.outputPath('store-notice.png') })
  // The outlet can have more than one deferred order (e.g. dry and chilled), each with its own notice.
  const notices = await store.getByRole('button', { name: 'Acknowledge' }).count()
  expect(notices).toBeGreaterThan(0)
  for (let remaining = notices; remaining > 0; remaining--) {
    await store.getByRole('button', { name: 'Acknowledge' }).first().click()
    await expect(store.getByRole('button', { name: 'Acknowledge' })).toHaveCount(remaining - 1)
  }
  await expect(store.getByText('Acknowledged.')).toHaveCount(notices)
  await store.reload()
  await expect(store.getByText('Acknowledged.')).toHaveCount(notices)
  await expect(store.getByRole('button', { name: 'Acknowledge' })).toHaveCount(0)

  // Phone width: no horizontal overflow on the store notice.
  await store.setViewportSize({ width: 375, height: 800 })
  await store.goto('/store')
  await expect(store.getByRole('heading', { name: /Deferral notice/ })).toBeVisible()
  expect(await store.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await store.screenshot({ path: testInfo.outputPath('store-notice-phone.png') })
  await storeContext.close()

  await page.reload()
  await expect(page.getByText(/Acknowledged/).first()).toBeVisible({ timeout: 15_000 })
})
