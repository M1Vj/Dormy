import { test as setup } from '@playwright/test';

const adminFile = 'playwright/.auth/admin.json';
const occupantFile = 'playwright/.auth/occupant.json';

setup('authenticate as admin', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@dormy.local');
  await page.getByLabel('Password').fill('DormyPass123!');
  // Wait for React to finish rendering and overlay to potentially disappear
  await page.waitForTimeout(1000);

  // Try to force click if overlay is present
  // Avoid overlay issues by targeting the form and requesting submit
  const form = page.locator('form').first();
  await form.evaluate((f: HTMLFormElement) => f.requestSubmit());
  try {
    // Wait for navigation and verify the actual URL we landed on
    await page.waitForTimeout(5000); // 5s to allow redirect
    const url = page.url();
    console.log(`[Admin Login] Landed on URL: ${url}`);

    // Attempt standard wait and save
    await page.waitForURL(/\/home|\/admin/);
    await page.context().storageState({ path: adminFile });
  } catch (err) {
    console.error(`[Admin Login] Failed to navigate to /home or /admin. Current URL: ${page.url()}`);
    throw err;
  }
});

setup('authenticate as occupant', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('occupant@dormy.local');
  await page.getByLabel('Password').fill('DormyPass123!');
  await page.waitForTimeout(1000);
  const occupantForm = page.locator('form').first();
  await occupantForm.evaluate((f: HTMLFormElement) => f.requestSubmit());
  try {
    await page.waitForTimeout(5000); // Wait for redirect
    const url = page.url();
    console.log(`[Occupant Login] Landed on URL: ${url}`);

    await page.waitForURL(/\/home/);
    await page.context().storageState({ path: occupantFile });
  } catch (err) {
    console.error(`[Occupant Login] Failed to navigate to /home. Current URL: ${page.url()}`);
    throw err;
  }
});
