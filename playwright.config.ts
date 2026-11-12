import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Run tests sequentially — easier to read output, avoids port conflicts with one dev server
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",

  use: {
    baseURL: "http://localhost:3000",
    // Save a trace on the first retry (useful when debugging a flaky test)
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Start the dev server automatically if one isn't already running
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    // LR-8A — shows the push opt-in UI in tests. Test-only PUBLIC key (its
    // private half was discarded at generation); the server-side kill
    // switch PUSH_NOTIFICATIONS_ENABLED stays unset, and tests intercept
    // /api/push/* so nothing is ever stored or sent.
    env: {
      NEXT_PUBLIC_PUSH_NOTIFICATIONS_ENABLED: "true",
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "BKeBnR7_lmMxgaGAJgDTJt4eXn9kuz6Cuco39GoOK0IpwSkDAmfzyjwx8ZHWgPGxn7KbTwZcVKfAguGXsycJqk0",
    },
  },
});
