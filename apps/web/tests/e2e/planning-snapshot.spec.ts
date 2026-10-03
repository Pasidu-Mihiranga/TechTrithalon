import { expect, test } from '@playwright/test'

const apiBase = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? '8080'}`

test('dispatcher freezes a planning snapshot from confirmed orders', async ({ page }) => {
  const password = process.env.SEED_DISPATCHER_PASSWORD
  if (!password) throw new Error('Configure SEED_DISPATCHER_PASSWORD before running browser tests')

  await page.goto('/login')
  await page.getByLabel('USER ID', { exact: true }).fill(process.env.SEED_DISPATCHER_USERNAME ?? 'DSP-001')
  await page.getByLabel('PASSWORD', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page).toHaveURL(/\/dispatcher/)

  await page.goto('/dispatcher/planning')
  await expect(page.getByRole('heading', { name: 'Planning', level: 1 })).toBeVisible()
  await expect(page.getByLabel('Depot', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Snapshot all confirmed' }).click()
  await expect(page.getByText(/Snapshot #\d+ frozen/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Frozen inputs are unchanged.')).toBeVisible()
  // The snapshot shown on screen is the one persisted on the server.
  const shown = Number((await page.getByText(/Snapshot #\d+ frozen/).first().textContent())?.match(/#(\d+)/)?.[1])
  const { demoOperatingDate } = await (await page.request.get(`${apiBase}/api/v1/reference/summary`)).json()
  const depot = await page.getByLabel('Depot', { exact: true }).first().inputValue()
  const latest = await page.request.get(`${apiBase}/api/v1/dispatcher/planning/snapshots?date=${demoOperatingDate}&depot=${depot}`)
  expect(latest.status()).toBe(200)
  expect((await latest.json()).id).toBe(shown)
})
