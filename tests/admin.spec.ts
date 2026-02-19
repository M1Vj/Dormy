import { test, expect } from '@playwright/test';

test.use({ storageState: 'playwright/.auth/admin.json' });

test.describe('Admin Finance & Reporting', () => {
  test('should load reporting dashboard with key stats', async ({ page }) => {
    await page.goto('/admin/reporting');
    await expect(page.getByText('Reporting Dashboard')).toBeVisible();
    await expect(page.getByText('Cash on Hand')).toBeVisible();
    await expect(page.getByText('Total Collected')).toBeVisible();
    await expect(page.getByText('Use the profile menu to switch')).not.toBeVisible(); // Ensure not stuck in occupant view
  });

  test('should display ledger breakdown', async ({ page }) => {
    await page.goto('/admin/reporting');
    await expect(page.getByText('Ledger Breakdown')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Maintenance', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Fines', exact: true })).toBeVisible();
  });
});

test.describe('Admin Fines Management', () => {
  test('should load fines ledger', async ({ page }) => {
    await page.goto('/admin/fines');
    await expect(page.getByRole('heading', { name: 'Fines' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Ledger' })).toBeVisible();
  });

  test('should filter fines', async ({ page }) => {
    await page.goto('/admin/fines');
    const searchInput = page.getByPlaceholder('Search occupant, rule, or note');
    await searchInput.fill('Test Search');
    await page.getByRole('button', { name: 'Filter' }).click();
    await expect(page.url()).toContain('search=Test');
  });
});

test.describe('Admin Events', () => {
  test('should load events finance page', async ({ page }) => {
    await page.goto('/admin/finance/events');
    await expect(page.getByText('Events ledger')).toBeVisible();
  });
});

test.describe('Committees', () => {
  test('should load committees page', async ({ page }) => {
    await page.goto('/committees');
    await expect(page.getByRole('heading', { name: 'Committees', exact: true })).toBeVisible();
  });
});
