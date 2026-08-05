// Offline-shell check against the PRODUCTION build (SW only registers in prod).
// Usage: npm run build && npx vite preview --port 5199 & node e2e/pwa-check.mjs [url]
import { chromium } from "@playwright/test";

const url = process.argv[2] || "http://localhost:5199/";
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

await page.goto(url);
const manifest = await page.evaluate(async () => {
  const href = document.querySelector('link[rel="manifest"]')?.href;
  if (!href) return null;
  const m = await (await fetch(href)).json();
  return { name: m.name, display: m.display, icons: m.icons?.length };
});
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload(); // second load is SW-controlled
await page.waitForTimeout(300);
await ctx.setOffline(true);
await page.reload();
const offlineOk = await page.getByTestId("gate-input").isVisible().catch(() => false);
await browser.close();

console.log("manifest:", JSON.stringify(manifest));
console.log("offline shell reload:", offlineOk ? "OK" : "FAIL");
if (!manifest || manifest.icons < 2 || manifest.display !== "standalone" || !offlineOk) process.exit(1);
