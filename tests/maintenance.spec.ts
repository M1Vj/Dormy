import { test, expect } from "@playwright/test";

// Adviser-specific test: handles its own login since the setup only authenticates admin/occupant.
test.describe("Maintenance Page - Adviser Access", () => {
  // Do NOT use global storageState; we log in manually.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("should allow adviser to access maintenance, view fund, and bulk charge dialog", async ({ page }) => {
    // 1. Login as adviser
    await page.goto("/login");
    await page.getByLabel("Email").fill("adviser@dormy.local");
    await page.getByLabel("Password").fill("DormyPass123!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/adviser\/home|\/home/);

    // 2. Navigate to Maintenance
    await page.goto("/adviser/finance/maintenance");
    await page.waitForLoadState("networkidle");

    // 3. Verify main section heading
    await expect(page.getByRole("heading", { name: "Maintenance Ledger" })).toBeVisible();

    // 4. Verify summary cards
    await expect(page.getByText("Net Maintenance Fund")).toBeVisible();
    await expect(page.getByText("Total Collectible")).toBeVisible();

    // 5. Verify Maintenance Expenses section
    await expect(page.getByRole("heading", { name: "Maintenance Expenses" })).toBeVisible();

    // 6. Verify Bulk Charge button exists and is clickable
    const bulkChargeBtn = page.getByRole("button", { name: /Bulk Charge Maintenance/i });
    await expect(bulkChargeBtn).toBeVisible();

    // 7. Open Bulk Charge Dialog
    await bulkChargeBtn.click();
    const dialogHeading = page.getByRole("heading", { name: "Bulk Charge Maintenance" });
    await expect(dialogHeading).toBeVisible();

    // 8. Verify inputs inside dialog
    await expect(page.getByLabel(/Amount per Occupant/i)).toBeVisible();
    await expect(page.getByLabel(/Description/i)).toBeVisible();

    // 9. Close dialog
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(dialogHeading).not.toBeVisible();
  });
});
