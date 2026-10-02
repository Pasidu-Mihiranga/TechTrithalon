import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const accounts = [
  { key: 'DISPATCHER', username: 'DSP-001', path: '/dispatcher', label: 'Dispatcher' },
  { key: 'STORE_MANAGER', username: 'STM-001', path: '/store', label: 'Store manager' },
  { key: 'LOADER', username: 'LDR-001', path: '/loader', label: 'Loader' },
  { key: 'DRIVER', username: 'DRV-001', path: '/driver', label: 'Driver' },
]
const apiBase = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? '8080'}`
async function login(page: Page, account: typeof accounts[number], remember = false) {
  const password = process.env[`SEED_${account.key}_PASSWORD`]
  if (!password) throw new Error(`Configure SEED_${account.key}_PASSWORD before running browser tests`)
  await page.goto('/login')
  await page.getByLabel('USER ID', { exact: true }).fill(process.env[`SEED_${account.key}_USERNAME`] ?? account.username)
  await page.getByLabel('PASSWORD', { exact: true }).fill(password)
  if (remember) await page.getByLabel('Remember me').check()
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${account.path}$`))
  await expect(page.getByRole('complementary', { name: `${account.label} navigation` })).toBeVisible()
}

for (const account of accounts) {
  test(`${account.label}: login, restore, cross-role rejection and logout`, async ({ page, context }) => {
    await login(page, account, true)
    const cookies = await context.cookies(apiBase)
    const session = cookies.find(cookie => cookie.name === 'WP_SESSION')!
    expect(session.httpOnly).toBe(true)
    expect(session.sameSite).toBe('Lax')
    expect(session.expires).toBeGreaterThan(Date.now() / 1000)
    await page.reload()
    await expect(page.getByRole('complementary', { name: `${account.label} navigation` })).toBeVisible()
    for (const other of accounts.filter(other => other.key !== account.key)) {
      await page.goto(other.path)
      await expect(page.getByText('Access denied', { exact: true })).toBeVisible()
      await expect(page.getByRole('complementary')).toHaveCount(0)
      await page.getByRole('button', { name: 'Go to my workspace' }).click()
      await expect(page).toHaveURL(new RegExp(`${account.path}$`))
    }
    const reference = await page.request.get(`${apiBase}/api/v1/reference/summary`)
    expect(reference.status()).toBe(['DISPATCHER', 'STORE_MANAGER'].includes(account.key) ? 200 : 403)
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    const revoked = await page.request.get(`${apiBase}/api/v1/auth/me`, { headers: { Cookie: `WP_SESSION=${session.value}` } })
    expect(revoked.status()).toBe(401)
    const problem = await revoked.json()
    expect(problem.code).toBe('UNAUTHENTICATED')
    expect(problem.traceId).toBe(revoked.headers()['x-request-id'])
    await page.goto(account.path)
    await expect(page).toHaveURL(/\/login$/)
  })
}

test('login is accessible by keyboard and matches the desktop and phone layouts', async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 832 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Waypoint Login' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await expect.poll(async () => page.locator('.auth-page img').evaluateAll(images => images.every(image => {
      const img = image as HTMLImageElement
      return img.complete && img.naturalWidth > 0
    }))).toBe(true)
    const images = await page.locator('.auth-page img').evaluateAll(images => images.map(image => {
      const img = image as HTMLImageElement
      return { loaded: img.complete && img.naturalWidth > 0, width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height }
    }))
    expect(images.every(image => image.loaded)).toBe(true)
    // SVG root dimensions are preserved in their original design slots.
    const userIcon = await page.locator('.auth-field-icon img').first().boundingBox()
    expect(userIcon?.width).toBe(20)
    expect(userIcon?.height).toBe(20)
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('USER ID', { exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('PASSWORD', { exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Show password' })).toBeFocused()
    await page.screenshot({ path: `/tmp/waypoint-phase2-login-${viewport.width}.png`, fullPage: true })
  }
  await page.getByRole('button', { name: 'Forgot password?' }).click()
  await expect(page.getByRole('dialog', { name: 'Sign-in help' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await login(page, accounts[1])
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()
})

test('invalid credentials stay on login and clear the password', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('USER ID', { exact: true }).fill('nonexistent-browser-test-user')
  await page.getByLabel('PASSWORD', { exact: true }).fill('synthetic-wrong-password')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Incorrect user ID or password.')
  await expect(page.getByLabel('PASSWORD', { exact: true })).toHaveValue('')
  await expect(page).toHaveURL(/\/login$/)
})
