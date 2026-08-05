import { test, expect, type Page } from "@playwright/test";

// The dummy plays every mode through the real UI and the leaderboard updates.
// Runs against the local fallback registry; with VITE_SUPABASE_* set it runs
// against the real project unchanged.

async function claim(page: Page, handle: string) {
  await page.getByTestId("gate-input").fill(handle);
  await page.getByTestId("gate-claim").click();
  await page.getByTestId("daily-card").waitFor({ timeout: 5000 });
}

async function ticks(page: Page, n: number) {
  for (let i = 0; i < n; i++) await page.getByTestId("tick").click();
  await expect(page.getByTestId("verdict")).toBeVisible();
}

async function backToModes(page: Page) {
  await page.getByRole("button", { name: /modes/i }).click();
  await page.getByTestId("daily-card").waitFor();
}

test("dummy plays every mode; leaderboard row updates", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem("md:onboard", "1"));
  await page.clock.setFixedTime(new Date("2026-08-05T15:00:00Z")); // exchange open
  await page.goto("/?seed=1");
  await claim(page, "dummy_smoke");

  // solo misère (seed 1, hold quotes → known -102.00)
  await page.getByTestId("mode-misere").click();
  await page.getByTestId("tick").waitFor();
  await ticks(page, 40);
  await backToModes(page);
  await expect(page.getByTestId("leaderboard")).toContainText("dummy_smoke");
  await expect(page.getByTestId("leaderboard")).toContainText("$102.00");

  // solo normal
  await page.getByTestId("mode-normal").click();
  await page.getByTestId("tick").waitFor();
  await ticks(page, 40);
  await backToModes(page);

  // the daily: share card + countdown on the results screen, result + stats on the home card
  await page.getByTestId("mode-daily").click();
  await page.getByTestId("tick").waitFor();
  await ticks(page, 40);
  await expect(page.getByTestId("daily-share")).toBeVisible();
  await expect(page.getByTestId("share-copy")).toBeVisible();
  await expect(page.getByTestId("countdown")).toContainText("closing bell");
  await backToModes(page);
  await expect(page.getByTestId("daily-done")).toBeVisible(); // one scored attempt: replay is gone
  await expect(page.getByTestId("mode-daily")).toHaveCount(0);

  // vs ERIS
  await page.getByTestId("mode-eris").click();
  await page.getByTestId("tick").waitFor();
  await ticks(page, 25);
  await backToModes(page);

  // duel: lock, lock, resolve per tick
  await page.getByTestId("mode-duel").click();
  await page.getByTestId("lock").waitFor();
  for (let i = 0; i < 25; i++) {
    await page.getByTestId("lock").click();
    await page.getByTestId("lock").click();
    await page.getByTestId("tick").click();
  }
  await expect(page.getByTestId("verdict")).toBeVisible();
  await backToModes(page);

  // research panel aggregates both solo modes
  await expect(page.getByTestId("research")).toContainText("misere");
  await expect(page.getByTestId("research")).toContainText("normal");
});
