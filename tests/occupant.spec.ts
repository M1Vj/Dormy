import { test, expect } from '@playwright/test';

test.use({ storageState: 'playwright/.auth/occupant.json' });

test.describe('Occupant View', () => {
  test('should access home page', async ({ page }) => {
    await page.goto('/home');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('should view own fines', async ({ page }) => {
    await page.goto('/fines');
    // Expect header or "My Fines"
    await expect(page.getByText('My Fines')).toBeVisible();
    await expect(page.getByText('Report a violation')).toBeVisible();
  });

  test('should access fine reports', async ({ page }) => {
    await page.goto('/fines/reports');
    await page.waitForURL(/\/fines\/reports/);
    await expect(page.getByRole('heading', { name: 'Fine reports' })).toBeVisible();
    await expect(page.getByText('Submit peer-reported violations')).toBeVisible();
  });

  test('should view cleaning schedule', async ({ page }) => {
    await page.goto('/cleaning');
    await expect(page.getByText('Weekly Cleaning Plan')).toBeVisible();
  });

  test('should view events', async ({ page }) => {
    await page.goto('/events');
    await expect(page.getByRole('heading', { name: 'Events', exact: true })).toBeVisible();
  });
});
