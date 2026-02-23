import { test, expect } from "@playwright/test";

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

test.describe("Multi-role RBAC Access", () => {
  // Login fresh each test to ensure the cookie state is correct
  test.use({ storageState: "playwright/.auth/admin.json" });

  test("should redirect admin finance maintenance page to home", async ({ page }) => {
    await page.goto("/admin/finance/maintenance");
    await expect(page).toHaveURL(/\/admin\/home/);
    await expect(page.getByRole("heading", { name: "Admin Home" })).toBeVisible();
  });

  test("should access admin fines page without errors", async ({ page }) => {
    await page.goto("/admin/fines");
    await expect(page.getByRole("heading", { name: "Fines" })).toBeVisible();
  });

  test("should redirect admin finance events page to home", async ({ page }) => {
    await page.goto("/admin/finance/events");
    await expect(page).toHaveURL(/\/admin\/home/);
    await expect(page.getByText("Administrative Control")).toBeVisible();
  });

  test("should access admin occupants page without errors", async ({ page }) => {
    await page.goto("/admin/occupants");
    await expect(page.getByRole("heading", { name: "Occupants" })).toBeVisible();
  });

  test("should redirect admin finance expenses page to home", async ({ page }) => {
    await page.goto("/admin/finance/expenses");
    await expect(page).toHaveURL(/\/admin\/home/);
    await expect(page.getByRole("heading", { name: "Admin Home" })).toBeVisible();
  });

  test("should access admin rooms page without errors", async ({ page }) => {
    await page.goto("/admin/rooms");
    await expect(page.getByRole("heading", { name: "Rooms" })).toBeVisible();
  });

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
