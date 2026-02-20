import { test as setup, expect } from '@playwright/test';

const adminFile = 'playwright/.auth/admin.json';
const occupantFile = 'playwright/.auth/occupant.json';

setup('authenticate as admin', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@dormy.local');
  await page.getByLabel('Password').fill('DormyPass123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Wait for navigation to dashboard or home
  await page.waitForURL(/\/home|\/admin/);
  await page.context().storageState({ path: adminFile });
});

setup('authenticate as occupant', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('occupant@dormy.local');
  await page.getByLabel('Password').fill('DormyPass123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/home/);
  await page.context().storageState({ path: occupantFile });
});
