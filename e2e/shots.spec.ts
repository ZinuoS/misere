import { test, expect, type Page } from "@playwright/test";
import { uniqueHandle } from "./handle";

// Milestone screenshots: screenshots/mNN-<state>-<desktop|mobile>.png
const shot = (name: string, project: string) => `screenshots/${name}-${project}.png`;

const skipOnboard = (page: Page) =>
  page.addInitScript(() => localStorage.setItem("md:onboard", "1"));

// The exchange only trades 13:30-20:00 UTC. Pin the clock mid-session so the
// daily is reachable regardless of when the suite runs.
const OPEN_TIME = new Date("2026-08-05T15:00:00Z");
const openMarket = (page: Page) => page.clock.setFixedTime(OPEN_TIME);

// Fresh context per test: the gate always shows first. Claim through the real UI.
async function claim(page: Page, handle = uniqueHandle("sh")) {
  await page.getByTestId("gate-input").fill(handle);
  await page.getByTestId("gate-password").fill("desk-password-1");
  await page.getByTestId("gate-claim").click();
  await page.getByTestId("daily-card").waitFor({ timeout: 20000 });
}

async function start(page: Page, seed: number, mode: string) {
  await skipOnboard(page);
  await page.goto(`/?seed=${seed}`);
  await claim(page);
  await page.getByTestId(mode).click();
  await page.getByTestId(mode === "mode-duel" ? "lock" : "tick").waitFor({ timeout: 5000 });
}

async function playToEnd(page: Page, ticks = 40) {
  for (let i = 0; i < ticks; i++) await page.getByTestId("tick").click();
  await expect(page.getByTestId("verdict")).toBeVisible();
}

test("m00-shell and m03-gate-empty", async ({ page }, ti) => {
  await skipOnboard(page);
  await page.goto("/");
  await page.getByTestId("gate-input").waitFor();
  await page.screenshot({ path: shot("m03-gate-empty", ti.project.name), fullPage: true });
});

test("m03-gate-taken and success", async ({ page }, ti) => {
  await skipOnboard(page);
  await page.goto("/?seed=1");
  const taken = uniqueHandle("tk");
  await claim(page, taken);
  // wipe only the identity: the local registry still holds the handle
  await page.evaluate(() => localStorage.removeItem("md:id"));
  await page.reload();
  await page.getByTestId("gate-input").fill(taken);
  await page.getByTestId("gate-password").fill("a-different-password");
  await page.getByTestId("gate-claim").click();
  await expect(page.getByTestId("gate-error")).toBeVisible();
  await page.screenshot({ path: shot("m03-gate-taken", ti.project.name), fullPage: true });
  await page.getByTestId("gate-input").fill(uniqueHandle("tk2"));
  await page.getByTestId("gate-password").fill("desk-password-1");
  await page.getByTestId("gate-claim").click();
  await page.getByTestId("daily-card").waitFor();
  await page.screenshot({ path: shot("m03-gate-success", ti.project.name), fullPage: true });
});

test("m05b-how-to-play", async ({ page }, ti) => {
  await page.goto("/?seed=1");
  await claim(page);
  await expect(page.getByTestId("onboard")).toBeVisible();
  await page.screenshot({ path: shot("m05b-how-to-play", ti.project.name) });
  await page.getByTestId("onboard-dismiss").click();
  await expect(page.getByTestId("onboard")).not.toBeVisible();
  // reachable again from the "?" control
  await page.getByTestId("help").click();
  await expect(page.getByTestId("onboard")).toBeVisible();
});

test("m05b-daily-results-and-stats", async ({ page }, ti) => {
  await skipOnboard(page);
  await openMarket(page);
  await page.goto("/");
  await claim(page);
  await page.getByTestId("mode-daily").click();
  await page.getByTestId("tick").waitFor();
  await playToEnd(page);
  await expect(page.getByTestId("daily-share")).toBeVisible();
  await expect(page.getByTestId("countdown")).toContainText("closing bell");
  await page.screenshot({ path: shot("m05b-daily-results", ti.project.name), fullPage: true });
  await page.getByTestId("open-stats").click();
  await expect(page.getByTestId("stats")).toBeVisible();
  await page.screenshot({ path: shot("m05b-stats-modal", ti.project.name) });
});

test("m02-verdict-stamp", async ({ page }, ti) => {
  // seed 1 is inventory-dominated: the LUCK, NOT CRAFT stamp should fire
  await start(page, 1, "mode-misere");
  await playToEnd(page);
  const stamp = page.getByTestId("stamp");
  if (await stamp.count()) {
    await page.getByTestId("verdict").screenshot({ path: shot("m02-verdict-stamp", ti.project.name) });
  }
});

test("m02-home", async ({ page }, ti) => {
  await skipOnboard(page);
  await page.goto("/?seed=1");
  await claim(page);
  await page.screenshot({ path: shot("m02-home", ti.project.name), fullPage: true });
});

test("m02-midgame", async ({ page }, ti) => {
  await start(page, 1, "mode-misere");
  for (let i = 0; i < 15; i++) await page.getByTestId("tick").click();
  await page.screenshot({ path: shot("m02-midgame", ti.project.name), fullPage: true });
});

test("m02-verdict-misere-loss and recap decomposition", async ({ page }, ti) => {
  await start(page, 1, "mode-misere");
  await playToEnd(page);
  await page.screenshot({ path: shot("m02-verdict-misere-loss", ti.project.name), fullPage: true });
  await page.getByTestId("decomp").screenshot({ path: shot("m02-recap-decomposition", ti.project.name) });
});

test("m02-verdict-accidental-profit", async ({ page }, ti) => {
  await start(page, 35, "mode-misere");
  await playToEnd(page);
  await page.screenshot({ path: shot("m02-verdict-accidental-profit", ti.project.name), fullPage: true });
});

test("m03b-exchange-open", async ({ page }, ti) => {
  await skipOnboard(page);
  await openMarket(page);
  await page.goto("/");
  await claim(page);
  await expect(page.getByTestId("session-status")).toContainText("Session open");
  await expect(page.getByTestId("mode-daily")).toBeVisible();
  await page.screenshot({ path: shot("m03b-exchange-open", ti.project.name), fullPage: true });
});

test("m03b-exchange-closed", async ({ page }, ti) => {
  await skipOnboard(page);
  await page.clock.setFixedTime(new Date("2026-08-05T22:00:00Z"));
  await page.goto("/");
  await claim(page);
  await expect(page.getByTestId("market-closed")).toBeVisible();
  await expect(page.getByTestId("mode-daily")).toHaveCount(0);
  await expect(page.getByTestId("mode-misere")).toBeVisible(); // practice stays open
  await page.screenshot({ path: shot("m03b-exchange-closed", ti.project.name), fullPage: true });
});

test("m04-eris-midgame and comp verdict", async ({ page }, ti) => {
  await start(page, 7, "mode-eris");
  for (let i = 0; i < 12; i++) await page.getByTestId("tick").click();
  await page.screenshot({ path: shot("m04-eris-midgame", ti.project.name), fullPage: true });
  for (let i = 0; i < 13; i++) await page.getByTestId("tick").click();
  await expect(page.getByTestId("verdict")).toBeVisible();
  await page.screenshot({ path: shot("m04-comp-verdict", ti.project.name), fullPage: true });
});

test("m04-duel-handoff", async ({ page }, ti) => {
  await start(page, 7, "mode-duel");
  await page.getByTestId("lock").click(); // player 1 locked, phone passes
  await page.screenshot({ path: shot("m04-duel-handoff", ti.project.name), fullPage: true });
});

test("m05-leaderboard and research", async ({ page }, ti) => {
  await start(page, 1, "mode-misere");
  await playToEnd(page);
  await page.getByRole("button", { name: /modes/i }).click();
  await expect(page.getByTestId("leaderboard")).toContainText("$");
  await page.getByTestId("leaderboard").screenshot({ path: shot("m05-leaderboard", ti.project.name) });
  await page.getByTestId("mode-normal").click();
  await page.getByTestId("tick").waitFor();
  await playToEnd(page);
  await page.getByRole("button", { name: /modes/i }).click();
  await expect(page.getByTestId("research")).toContainText("misere");
  await page.getByTestId("research").screenshot({ path: shot("m05-research", ti.project.name) });
});
