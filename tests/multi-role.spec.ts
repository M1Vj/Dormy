import { test, expect, type Page } from "@playwright/test";

/**
 * Multi-role RBAC tests.
 *
 * These tests log in with the demo `admin` account which has the admin role,
 * and verify that all protected pages load correctly (no "No active dorm selected"
 * or "You do not have access to this page" messages appear).
 *
 * The regression being tested: multi-role users (those with multiple rows in
 * dorm_memberships) were being redirected or shown access errors because
 * .maybeSingle() was used on queries that return multiple rows.
 */

async function expectAdminHome(page: Page) {
  await expect(page).toHaveURL(/\/admin\/home/);
  await expect(page.getByRole("heading", { name: "System Overview" })).toBeVisible();
}

test.describe("Multi-role RBAC Access", () => {
  test.use({ storageState: "playwright/.auth/admin.json" });

  test("should redirect admin finance maintenance page to home", async ({ page }) => {
    await page.goto("/admin/finance/maintenance");
    await expectAdminHome(page);
  });

  test("should access admin fines page without errors", async ({ page }) => {
    await page.goto("/admin/fines");
    await expect(page.getByRole("heading", { name: "Fines" })).toBeVisible();
  });

  test("should redirect admin reporting page to home", async ({ page }) => {
    await page.goto("/admin/reporting");
    await expectAdminHome(page);
  });

  test("should access admin dorm list page without errors", async ({ page }) => {
    await page.goto("/admin/dorms");
    await expect(page.getByRole("heading", { name: "Dorms" })).toBeVisible();
  });

  test("should redirect admin finance expenses page to home", async ({ page }) => {
    await page.goto("/admin/finance/expenses");
    await expectAdminHome(page);
  });

  test("should access admin rooms page without errors", async ({ page }) => {
    await page.goto("/admin/rooms");
    await expect(page.getByRole("heading", { name: "Rooms" })).toBeVisible();
  });

});

test.describe("Occupant Route Access", () => {
  test.use({ storageState: "playwright/.auth/occupant.json" });

  test("should access occupant committees page without errors", async ({ page }) => {
    await page.goto("/occupant/committees");
    await expect(page.getByRole("heading", { name: "My Committee", exact: true })).toBeVisible();
  });
});

/**
 * Adviser role RBAC tests — verifies adviser-specific access.
 */
test.describe("Adviser Role Access", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("should allow adviser to access maintenance page", async ({ page }) => {
    // Login as adviser
    await page.goto("/login");
    await page.getByLabel("Email").fill("adviser@dormy.local");
    await page.getByLabel("Password").fill("DormyPass123!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/home/);

    await page.goto("/adviser/finance/maintenance");
    await expect(page.getByRole("heading", { name: "Maintenance Ledger" })).toBeVisible();
  });
});
