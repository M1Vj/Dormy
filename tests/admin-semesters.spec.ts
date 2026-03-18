import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

test.use({ storageState: "playwright/.auth/admin.json" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase env for admin semester tests.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function getSemester(semester: string) {
  const { data, error } = await supabase
    .from("dorm_semesters")
    .select("id, school_year, semester, label, starts_on, ends_on, status")
    .is("dorm_id", null)
    .eq("school_year", "2025-2026")
    .eq("semester", semester)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? `Missing semester fixture: ${semester}`);
  }

  return data;
}

test.describe.serial("Admin semesters", () => {
  test("shows archived semesters with the archived badge", async ({ page }) => {
    await page.goto("/admin/terms");

    const archivedRow = page.getByRole("row", { name: /2025-2026 1st/ });
    await expect(archivedRow).toContainText("Archived");
    await expect(archivedRow).not.toContainText("Future");
  });

  test("saves edits even when archived legacy semesters overlap", async ({ page }) => {
    const semester = await getSemester("2nd");
    const updatedEndsOn = semester.ends_on === "2026-05-31" ? "2026-05-30" : "2026-05-31";

    try {
      await page.goto("/admin/terms");

      const activeRow = page.getByRole("row", { name: /2025-2026 2nd/ });
      await activeRow.getByRole("button").first().click();

      await page.getByLabel("Ends on").fill(updatedEndsOn);
      await page.getByRole("button", { name: "Save Changes" }).click();

      await expect(page.getByText("Semester updated successfully.")).toBeVisible();
      await expect(page.getByRole("dialog", { name: "Edit Semester" })).not.toBeVisible();
      await expect
        .poll(async () => {
          const refreshed = await getSemester("2nd");
          return refreshed.ends_on;
        })
        .toBe(updatedEndsOn);
    } finally {
      const { error } = await supabase
        .from("dorm_semesters")
        .update({
          ends_on: semester.ends_on,
          updated_at: new Date().toISOString(),
        })
        .eq("id", semester.id);

      if (error) {
        throw new Error(`Failed to restore semester fixture: ${error.message}`);
      }
    }
  });
});
