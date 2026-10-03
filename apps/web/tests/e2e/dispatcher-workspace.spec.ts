import { expect, test } from '@playwright/test'

const apiBase = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? '8080'}`

test('dispatcher depot switcher scopes dashboard, orders, fleet and planning', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('USER ID', { exact: true }).fill(process.env.SEED_DISPATCHER_USERNAME ?? 'DSP-001')
  await page.getByLabel('PASSWORD', { exact: true }).fill(process.env.SEED_DISPATCHER_PASSWORD ?? '')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page).toHaveURL(/\/dispatcher$/)
  const depots = await page.request.get(`${apiBase}/api/v1/reference/depots`)
  expect(depots.status()).toBe(200)
  const names: string[] = await depots.json()
  expect(names.length).toBeGreaterThan(0)
  const depot = names[0]
  const dashboard = page.waitForResponse(r => r.url().includes('/api/v1/dispatcher/dashboard?') && new URL(r.url()).searchParams.get('depot') === depot)
  await page.getByLabel('Depot', { exact: true }).first().selectOption(depot)
  expect((await dashboard).status()).toBe(200)
  for (const [route, endpoint] of [['/dispatcher/orders', '/orders'], ['/dispatcher/fleet', '/fleet']]) {
    const response = page.waitForResponse(r => r.url().includes(`/api/v1/dispatcher${endpoint}?`) && new URL(r.url()).searchParams.get('depot') === depot)
    await page.getByRole('link', { name: route === '/dispatcher' ? 'Home' : route.endsWith('orders') ? 'Orders' : 'Fleet', exact: true }).click()
    expect((await response).status()).toBe(200)
  }
  await page.getByRole('link', { name: 'Planning', exact: true }).click()
  await expect(page.getByLabel('Depot', { exact: true })).toHaveValue(depot)
})

test('dispatcher screens render at desktop and phone widths without document overflow', async ({ page }, testInfo) => {
  const failures: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  await page.goto('/login')
  await page.getByLabel('USER ID', { exact: true }).fill(process.env.SEED_DISPATCHER_USERNAME ?? 'DSP-001')
  await page.getByLabel('PASSWORD', { exact: true }).fill(process.env.SEED_DISPATCHER_PASSWORD ?? '')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page).toHaveURL(/\/dispatcher$/)
  const orders = await page.request.get(`${apiBase}/api/v1/dispatcher/orders`)
  const fleet = await page.request.get(`${apiBase}/api/v1/dispatcher/fleet`)
  expect(orders.status()).toBe(200)
  expect(fleet.status()).toBe(200)
  const orderId = (await orders.json()).items[0]?.id
  const vehicleId = (await fleet.json())[0]?.vehicleId
  expect(orderId).toBeDefined()
  expect(vehicleId).toBeDefined()
  const routes = ['', '/orders', `/orders/${orderId}`, '/fleet', `/fleet/${vehicleId}`, '/planning', '/deferred-orders', '/exceptions', '/live-operations', '/forecast', '/capacity-decision', '/settings']
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 832 })
    for (const route of routes) {
      await page.goto('/dispatcher' + route)
      await expect(page.locator('main h1')).toBeVisible()
      await expect(page.getByRole('status', { name: /^Loading/ })).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `document overflow at ${width}px on /dispatcher${route}`).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`${width}-${route.replaceAll('/', '-') || 'dashboard'}.png`), fullPage: true })
    }
  }
  expect(failures).toEqual([])
})
