import { defineConfig } from "@playwright/test";
const views = [
  { name: "desktop", viewport: { width: 1440, height: 1000 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
  { name: "small-mobile", viewport: { width: 320, height: 740 } },
];
export default defineConfig({
  testDir: "./tests/browser",
  use: { headless: true, channel: "chromium", timezoneId: "Asia/Kolkata",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } },
  webServer: [
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
      env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "" },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4174",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_SUPABASE_URL: "https://portal-test.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser_test_only",
      },
    },
  ],
  projects: views.flatMap(({ name, viewport }) => [
    {
      name,
      testMatch: "portal.spec.ts",
      use: { viewport, baseURL: "http://127.0.0.1:4173" },
    },
    {
      name: `${name}-authenticated`,
      testMatch: ["authenticated.spec.ts", "learning.spec.ts"],
      use: { viewport, baseURL: "http://127.0.0.1:4174" },
    },
  ]),
});
