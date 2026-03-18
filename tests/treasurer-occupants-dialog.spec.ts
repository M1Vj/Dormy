import { expect, test, type Page } from "@playwright/test";

async function loginAsTreasurer(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("treasurer@dormy.local");
  await page.getByLabel("Password").fill("DormyPass123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/treasurer\/home|\/home/);
}

test.describe("Treasurer occupant contribution dialog", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("opens unpaid contributions for an occupant and exposes payment actions", async ({ page }) => {
    await loginAsTreasurer(page);

    await page.goto("/treasurer/occupants");
    await page.waitForLoadState("networkidle");

    const trigger = page.getByTestId("treasurer-occupant-unpaid-trigger").first();
    await expect(trigger).toBeVisible();

    const occupantName = (await trigger.textContent())?.trim() ?? "";
    await trigger.click();

    await expect(page.getByRole("dialog", { name: /unpaid contributions/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Record Payment" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Change Payable/i }).first()).toBeVisible();

    await page.getByRole("button", { name: "Record Payment" }).click();

    await expect(page.getByRole("dialog", { name: "Record Contribution Payment" })).toBeVisible();
    await expect(page.getByText(occupantName, { exact: false }).first()).toBeVisible();
  });
});
