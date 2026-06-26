/**
 * Walmart Seller Center — automatic payment statement downloader
 *
 * Flow:
 *  1. Login to seller.walmart.com
 *  2. Navigate to /payments/statements/period
 *  3. Open "Descargar declaraciones anteriores" modal
 *  4. Collect all available statement dates from the dropdown
 *  5. For each date: download CSV, POST to the import API
 *
 * Required env vars:
 *   WALMART_SELLER_EMAIL      — seller account email
 *   WALMART_SELLER_PASSWORD   — seller account password
 *   IMPORT_API_URL            — https://your-app.vercel.app/api/cron/import-payments
 *   IMPORT_CRON_SECRET        — shared secret (same value as CRON_SECRET on Vercel)
 */

import { chromium } from 'playwright'
import { createWriteStream } from 'fs'
import { readFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

const EMAIL    = process.env.WALMART_SELLER_EMAIL
const PASSWORD = process.env.WALMART_SELLER_PASSWORD
const API_URL  = process.env.IMPORT_API_URL
const SECRET   = process.env.IMPORT_CRON_SECRET

const PORTAL_BASE = 'https://seller.walmart.com'
const PAYMENTS_URL = `${PORTAL_BASE}/payments/statements/period`

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  validateEnv()

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({
    acceptDownloads: true,
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)

  try {
    await login(page)
    await page.goto(PAYMENTS_URL, { waitUntil: 'networkidle' })

    const dates = await getAvailableDates(page)
    if (!dates.length) {
      console.log('No statement dates found in modal. Check selectors.')
      await page.screenshot({ path: 'debug-no-dates.png' })
      return
    }

    console.log(`Found ${dates.length} statement dates:`, dates.map(d => d.label).join(', '))

    let ok = 0, fail = 0
    for (const date of dates) {
      try {
        console.log(`\nDownloading ${date.label}...`)
        const { csvText, filename } = await downloadStatement(page, date)
        await importToAPI(csvText, filename)
        console.log(`  ✓ Imported ${filename}`)
        ok++
      } catch (err) {
        console.error(`  ✗ ${date.label}: ${err.message}`)
        await page.screenshot({ path: `debug-error-${date.value ?? date.label}.png` })
        fail++
      }
    }

    console.log(`\nDone: ${ok} imported, ${fail} failed.`)
  } catch (err) {
    console.error('Fatal:', err.message)
    await page.screenshot({ path: 'debug-fatal.png' })
    process.exit(1)
  } finally {
    await browser.close()
  }
}

// ─── Login ───────────────────────────────────────────────────────────────────

async function login(page) {
  console.log('Navigating to Seller Center...')
  await page.goto(PORTAL_BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)

  // If already authenticated (unlikely in headless fresh context, but handle it)
  if (await isAuthenticated(page)) {
    console.log('Already authenticated.')
    return
  }

  // Click Sign In if present on landing page
  const signInBtn = page.locator('a:has-text("Sign In"), button:has-text("Sign In"), a:has-text("Iniciar sesión")')
  if (await signInBtn.count() > 0) {
    await signInBtn.first().click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
  }

  // Wait for email input
  await page.waitForSelector(
    'input[type="email"], input[name="email"], input[id*="email" i], input[autocomplete="email"]',
    { timeout: 20_000 }
  )
  console.log('Filling credentials...')

  await page.fill(
    'input[type="email"], input[name="email"], input[id*="email" i], input[autocomplete="email"]',
    EMAIL
  )

  // Some flows split email / password into two screens
  const continueBtn = page.locator(
    'button:has-text("Continue"), button:has-text("Continuar"), button:has-text("Next")'
  )
  if (await continueBtn.count() > 0) {
    await continueBtn.first().click()
    await page.waitForTimeout(1500)
  }

  await page.waitForSelector('input[type="password"]', { timeout: 15_000 })
  await page.fill('input[type="password"]', PASSWORD)

  await page.click(
    'button[type="submit"], button:has-text("Sign In"), button:has-text("Log In"), button:has-text("Iniciar sesión")'
  )
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  if (!await isAuthenticated(page)) {
    await page.screenshot({ path: 'debug-login-failed.png' })
    throw new Error(`Login failed. URL after submit: ${page.url()}`)
  }
  console.log('Login OK')
}

async function isAuthenticated(page) {
  const url = page.url()
  return (
    url.includes('/dashboard') ||
    url.includes('/home') ||
    url.includes('/payments') ||
    url.includes('/catalog') ||
    (!url.includes('login') && !url.includes('signin') && !url.includes('account.walmart'))
  )
}

// ─── Get available dates ──────────────────────────────────────────────────────

async function getAvailableDates(page) {
  await page.goto(PAYMENTS_URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  // Open the download dropdown
  await page.click(
    '[aria-label*="Descargar" i], button:has-text("Descargar"), a:has-text("Descargar")',
    { timeout: 10_000 }
  )
  await page.waitForTimeout(600)

  // Click "Descargar declaraciones anteriores"
  await page.click('text=Descargar declaraciones anteriores', { timeout: 8_000 })
  await page.waitForTimeout(800)

  // Wait for the modal
  await page.waitForSelector('[role="dialog"], [class*="Modal"], [class*="modal"]', { timeout: 10_000 })

  // Extract options from the date picker (native <select> or custom dropdown)
  const dates = await extractDropdownOptions(page)

  // Close modal
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  return dates
}

async function extractDropdownOptions(page) {
  // Try native <select> first
  const nativeSelect = page.locator('select').last()
  if (await nativeSelect.count() > 0) {
    return await nativeSelect.evaluate(el =>
      Array.from(el.options).map(o => ({ value: o.value, label: o.text.trim() }))
    )
  }

  // Try custom dropdown (Ant Design, MUI, etc.) — open it first
  const combobox = page.locator('[role="combobox"], [class*="select" i]').first()
  if (await combobox.count() > 0) {
    await combobox.click()
    await page.waitForTimeout(500)

    const options = await page.locator('[role="option"], [class*="option" i]').all()
    const result = []
    for (const opt of options) {
      const text = (await opt.textContent())?.trim()
      if (text) result.push({ value: text, label: text })
    }
    return result
  }

  return []
}

// ─── Download a single statement ─────────────────────────────────────────────

async function downloadStatement(page, date) {
  await page.goto(PAYMENTS_URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  // Open download dropdown
  await page.click(
    '[aria-label*="Descargar" i], button:has-text("Descargar"), a:has-text("Descargar")',
    { timeout: 10_000 }
  )
  await page.waitForTimeout(600)

  // Open modal
  await page.click('text=Descargar declaraciones anteriores', { timeout: 8_000 })
  await page.waitForTimeout(800)
  await page.waitForSelector('[role="dialog"], [class*="Modal"], [class*="modal"]', { timeout: 10_000 })

  // Select the date
  await selectDate(page, date)
  await page.waitForTimeout(500)

  // Click Descargar inside modal and capture download
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.locator('[role="dialog"] button:has-text("Descargar"), [class*="Modal"] button:has-text("Descargar")').click(),
  ])

  const suggestedFilename = download.suggestedFilename() || `statement_${date.label}.csv`
  const tmpPath = join(tmpdir(), suggestedFilename)
  await download.saveAs(tmpPath)

  const csvText = await readFile(tmpPath, 'utf-8')
  await unlink(tmpPath).catch(() => {})

  return { csvText, filename: suggestedFilename }
}

async function selectDate(page, date) {
  // Native <select>
  const nativeSelect = page.locator('select').last()
  if (await nativeSelect.count() > 0) {
    await nativeSelect.selectOption({ label: date.label })
    return
  }

  // Custom dropdown: click combobox then click the matching option
  const combobox = page.locator('[role="combobox"], [class*="select" i]').first()
  if (await combobox.count() > 0) {
    await combobox.click()
    await page.waitForTimeout(400)
    await page.locator(`[role="option"]:has-text("${date.label}")`).click()
  }
}

// ─── Import to Next.js API ────────────────────────────────────────────────────

async function importToAPI(csvText, filename) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SECRET}`,
    },
    body: JSON.stringify({ csvContent: csvText, filename }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API ${res.status}: ${body.slice(0, 200)}`)
  }

  const data = await res.json()
  if (data.error) throw new Error(data.error)
  console.log(`  API response: ${data.synced} lines imported`)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function validateEnv() {
  const missing = ['WALMART_SELLER_EMAIL', 'WALMART_SELLER_PASSWORD', 'IMPORT_API_URL', 'IMPORT_CRON_SECRET']
    .filter(k => !process.env[k])
  if (missing.length) {
    console.error('Missing env vars:', missing.join(', '))
    process.exit(1)
  }
}

main()
