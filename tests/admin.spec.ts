import { test, expect } from "@playwright/test";

test.use({ storageState: "playwright/.auth/admin.json" });

test.describe("Admin Dashboard", () => {
  test("should load admin home with admin-only controls", async ({ page }) => {
    await page.goto("/admin/home");
    await expect(page.getByRole("heading", { name: "Admin Home" })).toBeVisible();
    await expect(page.getByText("Administrative Control")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open clearance" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Semester management" })).toBeVisible();
  });

  test("should load clearance view", async ({ page }) => {
    await page.goto("/admin/clearance");
    await expect(page.getByRole("heading", { name: "Clearance" })).toBeVisible();
    await expect(page.getByText("Occupant Clearance List")).toBeVisible();
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
    await expect(page).toHaveURL(/\/admin\/home/);
    await expect(page.getByRole("heading", { name: "Admin Home" })).toBeVisible();
  });
});

test.describe("Admin Reporting Restriction", () => {
  test("should keep reporting out of admin routes", async ({ page }) => {
    await page.goto("/admin/reporting");
    await expect(page).toHaveURL(/\/admin\/home/);
    await expect(page.getByText("Administrative Control")).toBeVisible();
  });
});
