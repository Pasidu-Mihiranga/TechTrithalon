import { expect, test } from '@playwright/test'

// Destructive planning mutations run only against the invented reference/demo fixtures.
test.skip(process.env.MANUAL_PLANNING_FIXTURE !== 'synthetic', 'Requires a fresh isolated synthetic stack; never use the competition dataset.')
const apiBase = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? '8080'}`

test('dispatcher builds a manual plan, sees a rejected assignment and publishes without Python', async ({ page }) => {
  test.setTimeout(180_000)
  const password = process.env.SEED_DISPATCHER_PASSWORD
  if (!password) throw new Error('Configure SEED_DISPATCHER_PASSWORD for the isolated test stack')
  await page.goto('/login')
  await page.getByLabel('USER ID', { exact: true }).fill(process.env.SEED_DISPATCHER_USERNAME ?? 'DSP-001')
  await page.getByLabel('PASSWORD', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page).toHaveURL(/\/dispatcher$/)
  const health = await page.request.get(`${apiBase}/api/v1/system/health`)
  expect((await health.json()).intelligence).toBe('unavailable')
  await page.getByRole('link', { name: 'Manual planning', exact: true }).click()
  // The workspace already scopes this page; its depot control is intentionally locked.
  await expect(page.getByLabel('Planning depot', { exact: true })).toHaveValue('Peliyagoda')
  await page.getByLabel('Change reason', { exact: true }).fill('Synthetic browser verification')
  await page.getByRole('button', { name: 'Freeze orders and create candidate' }).click()
  await expect(page.getByRole('heading', { name: /^Plan \d+ · candidate$/ })).toBeVisible()
  const planId = new URL(page.url()).searchParams.get('planId')!
  const read = async () => (await page.request.get(`${apiBase}/api/v1/dispatcher/plans/${planId}`)).json()
  let view = await read()
  const style = view.unassignedOrders.find((item: { order: { orderRef: string } }) => item.order.orderRef === 'SYN002').order.id
  const fresh = view.unassignedOrders.find((item: { order: { orderRef: string } }) => item.order.orderRef === 'SYN001').order.id
  await page.getByLabel('Trip vehicle', { exact: true }).selectOption('VEH901')
  await page.getByLabel('Trip slot', { exact: true }).fill('1')
  await page.getByLabel('Trip brand', { exact: true }).selectOption('Style')
  await page.getByLabel('Trip district', { exact: true }).selectOption('Alpha')
  await page.getByRole('button', { name: 'Add trip', exact: true }).click()
  await expect(page.getByRole('heading', { name: /^Trip \d+ · VEH901/ })).toBeVisible()
  view = await read()
  const tripId = view.trips[0].id
  await page.getByLabel('Order to assign or move').selectOption(String(style))
  await page.getByLabel('Target trip').selectOption(String(tripId))
  await page.getByRole('button', { name: 'Save assignment', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove SYN002', exact: true })).toBeVisible()
  const before = await read()
  await page.getByLabel('Order to assign or move').selectOption(String(fresh))
  await page.getByRole('button', { name: 'Save assignment', exact: true }).click()
  await expect(page.getByText('SAME_BRAND_DISTRICT', { exact: true })).toBeVisible()
  expect(await read()).toEqual(before)
  await page.getByLabel('Next delivery for SYN001', { exact: true }).fill('2026-06-27')
  await page.getByRole('button', { name: 'Defer SYN001', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'SYN001 · DEFERRED', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Publish manual plan', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Plan published', exact: true })).toBeVisible()
  view = await read()
  expect(view.plan.status).toBe('published')
  expect(view.validation.metrics.ordersAssigned).toBe(1)
  expect(view.validation.metrics.totalFuelLitres).toBe(4)
  const order = await page.request.get(`${apiBase}/api/v1/dispatcher/orders/${style}`)
  expect((await order.json()).status).toBe('planned')
  const fuel = await page.request.get(`${apiBase}/api/v1/dispatcher/vehicles/VEH901/fuel?date=2026-06-26`)
  expect((await fuel.json()).committedLitres).toBe(4)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Plan published', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Publish manual plan', exact: true })).toBeDisabled()
})
