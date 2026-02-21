import { test, expect } from '@playwright/test';

// Use adviser to verify access since "has_access = adviser, admin, assistant_adviser"
test.describe('Maintenance Page - Adviser Access', () => {
  test('should allow adviser to access maintenance, view fund, and bulk charge', async ({ page }) => {
    // Navigate to login
    await page.goto('/login');

    // Fill login form for adviser
    await page.fill('input[name="email"]', 'adviser@dormy.local');
    // Using demo password
    await page.fill('input[name="password"]', 'DormyPass123!');

    // Click submit and wait for navigation to home
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/adviser\/home/);

    // Click on Maintenance in sidebar
    await page.click('a[href="/admin/finance/maintenance"]');
    await expect(page).toHaveURL(/\/admin\/finance\/maintenance/);

    // Verify main page elements
    await expect(page.getByRole('heading', { name: 'Maintenance ledger' })).toBeVisible();
    await expect(page.getByText('Net Maintenance Fund')).toBeVisible();
    await expect(page.getByText('Maintenance Expenses')).toBeVisible();

    // Verify visibility of Bulk Charge button/dialog
    const bulkChargeBtn = page.getByRole('button', { name: /Bulk Charge Maintenance/i });
    await expect(bulkChargeBtn).toBeVisible();

    // Open Bulk Charge Dialog
    await bulkChargeBtn.click();
    await expect(page.getByRole('heading', { name: 'Bulk Charge Maintenance', exact: true })).toBeVisible();

    // Verify inputs inside dialog
    await expect(page.getByLabel(/Amount per Occupant/i)).toBeVisible();
    await expect(page.getByLabel(/Description \/ Reason/i)).toBeVisible();

    // Click cancel to close
    await page.getByRole('button', { name: 'Cancel' }).click();
  });
});
