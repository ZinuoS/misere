import { test, expect } from "@playwright/test";

// M0 placeholder: the real smoke run (dummy plays every mode through the UI) lands with the modes.
test("shell renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /misère desk/i })).toBeVisible();
});
