import { test, expect, type Page } from "@playwright/test";

// Milestone screenshots: screenshots/mNN-<state>-<desktop|mobile>.png
const shot = (name: string, project: string) => `screenshots/${name}-${project}.png`;

test("m00-shell", async ({ page }, ti) => {
  await page.goto("/");
  await page.screenshot({ path: shot("m00-shell", ti.project.name), fullPage: true });
});

async function startMisere(page: Page, seed: number, mode = "mode-misere") {
  await page.goto(`/?seed=${seed}`);
  await page.getByTestId(mode).click();
  await page.getByTestId("tick").waitFor({ timeout: 5000 }); // loading interstitial
}

async function playToEnd(page: Page) {
  for (let i = 0; i < 40; i++) await page.getByTestId("tick").click();
  await expect(page.getByTestId("verdict")).toBeVisible();
}

test("m02-home", async ({ page }, ti) => {
  await page.goto("/?seed=1");
  await page.screenshot({ path: shot("m02-home", ti.project.name), fullPage: true });
});

test("m02-midgame", async ({ page }, ti) => {
  await startMisere(page, 1);
  for (let i = 0; i < 15; i++) await page.getByTestId("tick").click();
  await page.screenshot({ path: shot("m02-midgame", ti.project.name), fullPage: true });
});

test("m02-verdict-misere-loss and recap decomposition", async ({ page }, ti) => {
  await startMisere(page, 1);
  await playToEnd(page);
  await page.screenshot({ path: shot("m02-verdict-misere-loss", ti.project.name), fullPage: true });
  await page.getByTestId("decomp").screenshot({ path: shot("m02-recap-decomposition", ti.project.name) });
});

test("m02-verdict-accidental-profit", async ({ page }, ti) => {
  await startMisere(page, 35);
  await playToEnd(page);
  await page.screenshot({ path: shot("m02-verdict-accidental-profit", ti.project.name), fullPage: true });
});
