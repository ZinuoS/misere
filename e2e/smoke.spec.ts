import { test, expect, type Page } from "@playwright/test";
import { uniqueHandle } from "./handle";

// The dummy plays every mode through the real UI and the leaderboard updates.
// Runs against the local fallback registry; with VITE_SUPABASE_* set it runs
// against the real project unchanged.

async function claim(page: Page, handle: string) {
  await page.getByTestId("gate-input").fill(handle);
  await page.getByTestId("gate-password").fill("desk-password-1");
  await page.getByTestId("gate-claim").click();
  await page.getByTestId("daily-card").waitFor({ timeout: 20000 });
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
  const handle = uniqueHandle("sm");
  await claim(page, handle);

  // solo misère (seed 1, hold quotes → known -102.00)
  await page.getByTestId("mode-misere").click();
  await page.getByTestId("tick").waitFor();
  await ticks(page, 40);
  await backToModes(page);
  // The board renders real server rows. Asserting THIS handle ranks top-10 is not
  // safe: every e2e run plays the same seed, so scores tie exactly and ordering
  // among equals is arbitrary. That this handle's write landed server-side is
  // asserted below via the research panel, which reads my_telemetry for it alone.
  await expect(page.getByTestId("leaderboard")).toContainText("$");

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
  // my_telemetry is scoped to this handle's secret, so these counts prove THIS
  // run's writes reached Postgres: 2 misere games (practice + daily), 1 normal.
  await expect(page.getByTestId("research")).toContainText("misere");
  await expect(page.getByTestId("research")).toContainText("n=2");
  await expect(page.getByTestId("research")).toContainText("normal");
});
