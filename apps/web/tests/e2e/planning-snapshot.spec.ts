import { expect, test } from '@playwright/test'

test('dispatcher freezes a planning snapshot from confirmed orders', async ({ page }) => {
  const password = process.env.SEED_DISPATCHER_PASSWORD
  if (!password) throw new Error('Configure SEED_DISPATCHER_PASSWORD before running browser tests')

  await page.goto('/login')
  await page.getByLabel('USER ID', { exact: true }).fill(process.env.SEED_DISPATCHER_USERNAME ?? 'DSP-001')
  await page.getByLabel('PASSWORD', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page).toHaveURL(/\/dispatcher/)

  await page.goto('/dispatcher/planning')
  await expect(page.getByRole('heading', { name: 'Confirmed orders' })).toBeVisible()
  await expect(page.getByLabel('Depot')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Snapshot all confirmed' }).click()
  await expect(page.getByText(/Snapshot #\d+ frozen/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Frozen inputs are unchanged.')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Load latest snapshot' }).click()
  await expect(page.getByText(/Snapshot #\d+ frozen/)).toBeVisible()
})
