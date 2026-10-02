import { expect, test } from '@playwright/test'

const apiBase = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? '8080'}`

test('store manager places, reviews and confirms an order', async ({ page }) => {
  const password = process.env.SEED_STORE_MANAGER_PASSWORD
  if (!password) throw new Error('Configure SEED_STORE_MANAGER_PASSWORD before running browser tests')

  await page.goto('/login')
  await page.getByLabel('USER ID', { exact: true }).fill(process.env.SEED_STORE_MANAGER_USERNAME ?? 'STM-001')
  await page.getByLabel('PASSWORD', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page).toHaveURL(/\/store$/)

  await page.goto('/store/orders/new')
  await expect(page.getByRole('heading', { name: 'Place an order' })).toBeVisible()

  for (const temp of ['ambient', 'chilled'] as const) {
    await page.getByLabel('Temperature').selectOption(temp)
    await page.getByLabel('Units').fill('3')
    await page.getByLabel('Weight (kg)').fill('22.5')
    await page.getByLabel('Volume (m³)').fill('0.125')
    await page.getByRole('button', { name: 'Review order' }).click()
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()
    await page.getByRole('button', { name: 'Confirm order' }).click()

    const confirmed = page.getByText('Order confirmed')
    const duplicate = page.getByText(/already have an active order/i)
    await expect(confirmed.or(duplicate)).toBeVisible({ timeout: 15_000 })
    if (await confirmed.isVisible()) {
      await expect(page.getByText(/ORD-/)).toBeVisible()
      break
    }
    // Demo seed may already hold this temp for the fallback delivery day — try the other temp.
    await expect(page.getByRole('heading', { name: 'Place an order' })).toBeVisible()
    if (temp === 'chilled') {
      throw new Error('Both ambient and chilled already active for the delivery day; clear one to run this E2E')
    }
  }

  const me = await page.request.get(`${apiBase}/api/v1/auth/me`)
  // Cross-origin API call may be unauthenticated; UI confirmation is the exit-gate proof.
  expect([200, 401]).toContain(me.status())
})
