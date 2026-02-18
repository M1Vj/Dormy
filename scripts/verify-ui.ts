import { chromium } from 'playwright'

async function verify() {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  console.log('Navigating to login...')
  await page.goto('http://localhost:3000/login')

  // Login as admin
  console.log('Logging in as admin...')
  await page.fill('input[type="email"]', 'sa@dormy.local')
  await page.fill('input[type="password"]', 'DormyPassword123!')
  await page.click('button[type="submit"]')

  console.log('Navigating to reporting page...')
  await page.goto('http://localhost:3000/admin/reporting')
  await page.waitForSelector('text="Cash on Hand"', { timeout: 10000 }).catch(() => console.log('Cash on Hand card not found by text'))
  await page.waitForTimeout(3000) // Extra wait for numbers to populate

  console.log('Taking screenshot of reporting page...')
  await page.screenshot({ path: '/Users/vjmabansag/.gemini/antigravity/brain/27692ec5-2e98-46b8-a4f7-91a7a42732f4/reporting_screenshot_v2.png', fullPage: true })

  console.log('Navigating to join page...')
  await page.goto('http://localhost:3000/join')
  await page.waitForSelector('text="School ID"', { timeout: 10000 }).catch(() => console.log('School ID field not found by text'))
  await page.waitForTimeout(3000)

  console.log('Taking screenshot of join form...')
  await page.screenshot({ path: '/Users/vjmabansag/.gemini/antigravity/brain/27692ec5-2e98-46b8-a4f7-91a7a42732f4/join_form_screenshot_v2.png', fullPage: true })

  await browser.close()
  console.log('Verification finished.')
}

verify().catch(console.error)
