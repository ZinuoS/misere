import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:5199" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["iPhone 12"], browserName: "chromium", viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: "npm run dev -- --port 5199 --strictPort",
    url: "http://localhost:5199",
    reuseExistingServer: true,
  },
});
