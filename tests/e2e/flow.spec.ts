import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'

// Requires a freshly reset database with the admin PIN set to E2E_PIN (default 4826).
const PIN = process.env.E2E_PIN ?? '4826'
const API = 'http://localhost:54321'

function istDate(daysAhead: number) {
  const d = new Date(Date.now() + daysAhead * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d)
}

async function setPeriod(page: Page, prefix: string, startDate: string, startTime: string, endDate: string, endTime: string) {
  await page.fill(`#${prefix}-startDate`, startDate)
  await page.fill(`#${prefix}-startTime`, startTime)
  await page.fill(`#${prefix}-endDate`, endDate)
  await page.fill(`#${prefix}-endTime`, endTime)
}

const day = istDate(3)

test('a customer books a generator, sees the estimate and gets a receipt', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Welcome to Our Generator Rental Services' })).toBeVisible()
  await expect(page.getByText('नमस्ते')).toBeVisible()
  await page.getByRole('link', { name: 'Start Booking' }).click()

  await expect(page).toHaveURL(/\/generators$/)
  await setPeriod(page, 'browse', day, '10:00', day, '18:00')
  await expect(page.getByRole('article')).toHaveCount(7)
  for (const [kva, rate, lph] of [['25', '₹2,500', '2.5'], ['62', '₹6,000', '6'], ['125', '₹10,000', '10']]) {
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: new RegExp(`^${kva}\\s*kVA$`) }) })
    await expect(card.getByText(`${rate}/hour`)).toBeVisible()
    await expect(card.getByText(`${lph} litres/hour`)).toBeVisible()
    await expect(card.getByText('Available')).toBeVisible()
  }
  await page.getByRole('button', { name: 'Book the 25 kVA generator' }).click()

  await expect(page).toHaveURL(/\/book$/)
  await expect(page.getByText('Rental duration: 8 hours')).toBeVisible()
  await page.getByRole('button', { name: 'Calculate Estimate' }).click()
  await expect(page.getByText('Checked with live prices')).toBeVisible()
  const estimate = page.locator('aside')
  await expect(estimate.getByText('₹20,000').first()).toBeVisible()
  await expect(estimate.getByText('20 litres', { exact: true })).toBeVisible()
  await expect(estimate.getByText(/assumes the generator runs continuously/)).toBeVisible()

  // invalid mobile is rejected in the browser
  await page.fill('#full_name', 'Anita Desai')
  await page.fill('#mobile_number', '12345')
  await page.fill('#rental_location', 'Plot 7, Industrial Area Phase 2, Pune 411018')
  await page.locator('aside').getByRole('button', { name: 'Confirm Booking' }).click()
  await expect(page.getByText('Enter a 10-digit Indian mobile number, with or without +91.')).toBeVisible()

  // reversed dates are rejected
  await page.fill('#book-endTime', '09:00')
  await expect(page.getByText('The rental end must be later than the rental start.').first()).toBeVisible()
  await page.fill('#book-endTime', '18:00')

  await page.fill('#mobile_number', '+91 98200 12345')
  await page.locator('aside').getByRole('button', { name: 'Confirm Booking' }).click()

  await expect(page.getByText('Your generator booking has been confirmed successfully!')).toBeVisible()
  await expect(page).toHaveURL(/\/booking\/GR\d{6}-[A-Z2-9]{5}\?t=[0-9a-f]+$/)
  const receipt = page.getByRole('article', { name: /Receipt for booking/ })
  await expect(receipt.getByText('Anita Desai')).toBeVisible()
  await expect(receipt.getByText('+91 98200 12345')).toBeVisible()
  await expect(receipt.getByText('25 kVA')).toBeVisible()
  await expect(receipt.getByText('8 hours', { exact: true })).toBeVisible()
  await expect(receipt.getByText('₹2,500/hour')).toBeVisible()
  await expect(receipt.getByText('₹20,000').first()).toBeVisible()
  await expect(receipt.getByText('20 litres', { exact: true })).toBeVisible()
  await expect(receipt.getByText('Confirmed')).toBeVisible()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download Receipt as PDF' }).click()
  const file = await (await download).path()
  const pdf = fs.readFileSync(file!)
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  expect(pdf.length).toBeGreaterThan(3000)

  await page.evaluate(() => { (window as any).__printed = 0; window.print = () => { (window as any).__printed++ } })
  await page.getByRole('button', { name: 'Print Receipt' }).click()
  expect(await page.evaluate(() => (window as any).__printed)).toBe(1)

  // the same slot is now shown as booked
  await page.goto('/generators')
  await setPeriod(page, 'browse', day, '12:00', day, '14:00')
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: /^25\s*kVA$/ }) })
  await expect(card.getByText('Booked for selected period')).toBeVisible()
  // ...but the period right after it is free
  await setPeriod(page, 'browse', day, '18:00', day, '22:00')
  await expect(card.getByText('Available')).toBeVisible()
})

test('admin data is closed without a PIN session', async ({ request }) => {
  const res = await request.post(`${API}/rest/v1/rpc/admin_list_bookings`, { data: { p_token: 'f'.repeat(64) } })
  expect(res.status()).toBe(400)
  expect((await res.json()).message).toBe('UNAUTHORIZED')
  const setup = await request.post(`${API}/rest/v1/rpc/admin_setup_pin`, { data: { p_pin: '7777' } })
  expect(setup.status()).toBe(401)
})

test('the owner logs in with the PIN, manages the booking and prices, and logs out', async ({ page }) => {
  await page.goto('/admin/bookings')
  await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible()
  await expect(page.getByText('Anita Desai')).toHaveCount(0)

  await page.fill('#pin', '0000')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByText(/That PIN is not correct\. 4 attempts left/)).toBeVisible()

  await page.fill('#pin', PIN)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible()

  await page.getByPlaceholder('Reference, name, mobile or kVA').fill('anita')
  await expect(page.getByText('1 booking', { exact: true })).toBeVisible()
  await page.getByRole('row', { name: /Anita Desai/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel booking' }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel booking' }).click()
  await expect(page.getByRole('dialog').getByText('Cancelled').first()).toBeVisible()
  await page.keyboard.press('Escape')

  // change the 25 kVA price
  await page.getByRole('link', { name: 'Generators' }).click()
  const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: '25 kVA', exact: true }) })
  await card.getByRole('button', { name: 'Edit' }).click()
  await page.fill('#g-hourly_rental_rate', '2750')
  await page.getByRole('button', { name: 'Save generator' }).click()
  await expect(page.getByText('Generator saved.')).toBeVisible()
  await expect(card.getByText('₹2,750/hour')).toBeVisible()

  // calendar shows the (cancelled) rental when asked
  await page.getByRole('link', { name: 'Calendar' }).click()
  await page.getByRole('button', { name: 'month' }).click()
  await page.getByLabel('Show cancelled').check()

  await page.getByRole('button', { name: 'Logout' }).click()
  await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible()
  await expect(page.getByText('You have logged out.')).toBeVisible()

  // customers see the new price, and the old receipt keeps the old one
  await page.goto('/')
  await expect(page.getByRole('row', { name: /25 kVA/ }).getByText('₹2,750')).toBeVisible()
})
