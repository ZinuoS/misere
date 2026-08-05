import { test } from "@playwright/test";

// Milestone screenshots: screenshots/mNN-<state>-<desktop|mobile>.png
test("m00-shell", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `screenshots/m00-shell-${testInfo.project.name}.png`, fullPage: true });
});
