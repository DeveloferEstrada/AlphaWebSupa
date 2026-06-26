/**
 * Walmart Seller Center — automatic payment statement downloader
 *
 * UI Flow (confirmed from portal screenshots):
 *  1. Navigate to /payments/statements/period  →  triggers login redirect if needed
 *  2. Fill credentials on login page
 *  3. Back on statements page: click "Descargar" link (top-right)
 *  4. In dropdown: click "Declaración anterior"
 *  5. Modal opens: native <select> with dates like "Jun 25, 2026"
 *  6. Select each date, click "Descargar" button → download CSV
 *  7. POST CSV to import API
 */

import { chromium } from 'playwright'
import { readFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

const EMAIL    = process.env.WALMART_SELLER_EMAIL
const PASSWORD = process.env.WALMART_SELLER_PASSWORD
const API_URL  = process.env.IMPORT_API_URL
const SECRET   = process.env.IMPORT_CRON_SECRET

const PAYMENTS_URL = 'https://seller.walmart.com/payments/statements/period'

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
  page.setDefaultTimeout(60_000)

  try {
    // Navigate and login — returns with page on PAYMENTS_URL
    await navigateAndLogin(page)

    // Get all available statement dates from the modal select
    const dates = await getAvailableDates(page)
    if (!dates.length) {
      console.log('No dates found in modal. Saving screenshot for debug.')
      await page.screenshot({ path: 'debug-no-dates.png' })
      return
    }
    console.log(`Found ${dates.length} dates:`, dates.map(d => d.label).join(', '))

    // Download and import each date
    let ok = 0, fail = 0
    for (const date of dates) {
      try {
        console.log(`\nProcessing ${date.label}...`)
        const { csvText, filename } = await downloadStatement(page, date)
        console.log(`  Downloaded ${filename} (${csvText.length} bytes)`)
        await importToAPI(csvText, filename)
        ok++
      } catch (err) {
        console.error(`  ✗ ${date.label}: ${err.message}`)
        await page.screenshot({ path: `debug-error-${date.value.replace(/[^a-z0-9]/gi, '_')}.png` })
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

// ─── Navigate & Login ─────────────────────────────────────────────────────────

async function navigateAndLogin(page) {
  console.log('Navigating to payments page...')
  await page.goto(PAYMENTS_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(3000)

  const url = page.url()
  console.log('Current URL:', url)
  await page.screenshot({ path: 'debug-initial.png' })

  // If already on statements page, we're done
  if (url.includes('/payments/statements')) {
    console.log('Already on statements page.')
    await waitForStatementsPage(page)
    return
  }

  // Fill login form
  console.log('Login page detected, filling credentials...')

  // Email field (may be on its own screen)
  await page.waitForSelector(
    'input[type="email"], input[name="email"], input[id*="email" i], input[autocomplete="username"]',
    { timeout: 30_000 }
  )
  await page.fill(
    'input[type="email"], input[name="email"], input[id*="email" i], input[autocomplete="username"]',
    EMAIL
  )
  await page.screenshot({ path: 'debug-email-filled.png' })

  // "Continue" or "Next" button (two-step login)
  const continueBtn = page.locator(
    'button:has-text("Continue"), button:has-text("Continuar"), button:has-text("Next"), button:has-text("Siguiente")'
  )
  if (await continueBtn.count() > 0) {
    await continueBtn.first().click()
    await page.waitForTimeout(2000)
  }

  // Password field
  await page.waitForSelector('input[type="password"]', { timeout: 20_000 })
  await page.fill('input[type="password"]', PASSWORD)
  await page.screenshot({ path: 'debug-password-filled.png' })

  // Submit
  await page.click(
    'button[type="submit"], button:has-text("Sign In"), button:has-text("Log In"), button:has-text("Iniciar sesión"), button:has-text("Ingresar")'
  )

  // Wait until we land somewhere other than the login page
  await page.waitForFunction(
    () => !window.location.href.includes('login') && !window.location.href.includes('signin'),
    { timeout: 30_000 }
  )
  await page.waitForTimeout(3000)
  console.log('Post-login URL:', page.url())
  await page.screenshot({ path: 'debug-after-login.png' })

  // If not on statements yet, navigate there
  if (!page.url().includes('/payments/statements')) {
    await page.goto(PAYMENTS_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(2000)
  }

  await waitForStatementsPage(page)
  console.log('Login OK')
}

async function waitForStatementsPage(page) {
  // Wait for the "Estado de cuenta" heading or the Descargar link
  await page.waitForSelector(
    'h1, a:has-text("Descargar"), button:has-text("Descargar"), [href*="statement"]',
    { timeout: 30_000 }
  )
  await page.waitForTimeout(1000)
}

// ─── Get available dates ──────────────────────────────────────────────────────

async function getAvailableDates(page) {
  await openDeclaracionAnteriorModal(page)

  // Read dates from native <select>
  const select = page.locator('select').last()
  await select.waitFor({ timeout: 10_000 })

  const dates = await select.evaluate(el =>
    Array.from(el.options).map(o => ({ value: o.value, label: o.text.trim() }))
  )

  // Close modal with Escape
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  return dates.filter(d => d.label && d.label !== 'Seleccionar una fecha de declaración')
}

// ─── Download a single statement ─────────────────────────────────────────────

async function downloadStatement(page, date) {
  await openDeclaracionAnteriorModal(page)

  // Select the date in the native <select>
  const select = page.locator('select').last()
  await select.waitFor({ timeout: 10_000 })
  await select.selectOption({ label: date.label })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `debug-selected-${date.value.replace(/[^a-z0-9]/gi, '_')}.png` })

  // Click Descargar button inside the modal
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.locator('button:has-text("Descargar")').last().click(),
  ])

  const filename = download.suggestedFilename() || `statement_${date.label.replace(/[^a-z0-9]/gi, '_')}.csv`
  const tmpPath = join(tmpdir(), filename)
  await download.saveAs(tmpPath)

  const csvText = await readFile(tmpPath, 'utf-8')
  await unlink(tmpPath).catch(() => {})

  return { csvText, filename }
}

// ─── Open the "Declaración anterior" modal ───────────────────────────────────

async function openDeclaracionAnteriorModal(page) {
  // Ensure we're on the statements page
  if (!page.url().includes('/payments/statements')) {
    await page.goto(PAYMENTS_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await waitForStatementsPage(page)
  }

  // Click the "Descargar" link/button (top right of the page)
  await page.locator('a:has-text("Descargar"), button:has-text("Descargar")').first().click()
  await page.waitForTimeout(600)

  // Click "Declaración anterior" from the dropdown menu
  await page.locator('text=Declaración anterior').click({ timeout: 8_000 })
  await page.waitForTimeout(800)

  // Wait for modal / date select to appear
  await page.waitForSelector('select', { timeout: 10_000 })
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
  console.log(`  ✓ API: ${data.synced} lines imported`)
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
