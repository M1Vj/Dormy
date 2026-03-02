import { test, expect, type Page } from "@playwright/test";

test.use({ storageState: "playwright/.auth/admin.json" });

async function expectAdminHome(page: Page) {
  await expect(page).toHaveURL(/\/admin\/home/);
  await expect(page.getByRole("heading", { level: 1, name: "System Overview" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Semester management" }).first()).toBeVisible();
}

test.describe("Admin Dashboard", () => {
  test("should load admin home with global controls", async ({ page }) => {
    await page.goto("/admin/home");
    await expect(page.getByRole("heading", { level: 1, name: "System Overview" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Semester management" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Manage dormitories" }).first()).toBeVisible();
  });

  test("should load dorm management view", async ({ page }) => {
    await page.goto("/admin/dorms");
    await expect(page.getByRole("heading", { level: 1, name: "Dorms" }).first()).toBeVisible();
    await expect(page.getByText("All dorms", { exact: true }).first()).toBeVisible();
  });
});

test.describe("Admin Fines Management", () => {
  test("should load fines ledger", async ({ page }) => {
    await page.goto("/admin/fines");
    await expect(page.getByRole("heading", { name: "Fines" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Ledger" })).toBeVisible();
  });

  test("should filter fines", async ({ page }) => {
    await page.goto("/admin/fines");
    const searchInput = page.getByPlaceholder("Search occupant, rule, or note");
    await searchInput.fill("Test Search");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page.url()).toContain("search=Test");
  });
});

test.describe("Admin Finance Restriction", () => {
  test("should redirect finance route to admin home", async ({ page }) => {
    await page.goto("/admin/finance");
    await expectAdminHome(page);
  });
});

test.describe("Admin Reporting Restriction", () => {
  test("should keep reporting out of admin routes", async ({ page }) => {
    await page.goto("/admin/reporting");
    await expectAdminHome(page);
  });
});
