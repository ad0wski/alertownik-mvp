import { defineConfig, devices } from "@playwright/test";

// Sprint 158B — service worker registration is gated to production builds
// (NODE_ENV === "production"), so PWA lifecycle tests (registration, cache
// contents, offline fallback) need a real `next build && next start`
// server instead of the Turbopack dev server the main suite uses. Runs on
// its own port so it never collides with the dev-server suite.
export default defineConfig({
  testDir: "./tests/pwa",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",

  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run build && npm run start -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
