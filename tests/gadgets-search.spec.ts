import { expect, test, type Page } from "@playwright/test";

async function loginAsStudentAssistant(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("sa@dormy.local");
  await page.getByLabel("Password").fill("DormyPass123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/student_assistant\/home|\/home/);
}

test.describe("Student Assistant gadgets and occupant search", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: { cookies: [], origins: [] } });

  test("shows a real gadgets workspace instead of a placeholder", async ({ page }) => {
    await loginAsStudentAssistant(page);

    await page.goto("/student_assistant/finance/gadgets");
    await page.waitForLoadState("networkidle");

    const addGadgetButton = page.getByRole("button", { name: /Add gadget/i }).first();

    await expect(page.getByRole("heading", { name: /Gadget/i })).toBeVisible();
    await expect(page.getByPlaceholder(/Search occupant/i)).toBeVisible();
    await expect(addGadgetButton).toBeVisible();
    await expect(page.getByText(/Global gadget fee/i)).toBeVisible();
    await expect(page.getByText(/implementation pending/i)).not.toBeVisible();
  });

  test("uses a dorm-wide gadget fee instead of a per-gadget override field", async ({ page }) => {
    await loginAsStudentAssistant(page);

    await page.goto("/student_assistant/finance/gadgets");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /Add gadget/i }).first().click();

    await expect(page.getByText(/Dorm-wide semester fee/i)).toBeVisible();
    await expect(page.getByLabel(/Override Semester Fee/i)).toHaveCount(0);
  });

  test("shows a shared back button on nested pages", async ({ page }) => {
    await loginAsStudentAssistant(page);

    await page.goto("/student_assistant/finance/gadgets");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("button", { name: /^Back$/i }).first()).toBeVisible();
  });

  test("clicking the parent finance menu from a finance subpage returns to finance root", async ({ page }) => {
    await loginAsStudentAssistant(page);

    await page.goto("/student_assistant/finance/gadgets");
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: /^Finance$/i }).first().click();

    await page.waitForURL("**/student_assistant/finance");
    await expect(page).toHaveURL(/\/student_assistant\/finance$/);
  });

  test("updates occupant search from the input without a filter submit", async ({ page }) => {
    await loginAsStudentAssistant(page);

    await page.goto("/student_assistant/occupants");
    await page.waitForLoadState("networkidle");

    const searchInput = page.getByPlaceholder("Search name or ID");
    await expect(searchInput).toBeVisible();

    await searchInput.fill("Test");
    await expect(page).toHaveURL(/search=Test/);
    await expect(page.getByRole("button", { name: "Filter" })).toHaveCount(0);
  });
});
