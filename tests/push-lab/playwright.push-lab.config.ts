import { defineConfig, devices } from "@playwright/test";

// LR-8B.3 — real-browser service worker lifecycle + push display regression.
//
// Why a separate config:
//  * the service worker is registered only in production builds
//    (PwaController), so this needs `next build && next start`, like
//    playwright.pwa.config.ts;
//  * Chromium's old headless shell always reports Notification.permission
//    "denied", so showNotification can only be observed in the full
//    Chromium build ("chromium" channel, new headless mode).
//
// Nothing here reaches Production or a push service: the build shows the
// opt-in UI with a test-only PUBLIC VAPID key, /api/push/* is fulfilled by
// the test, and push messages are injected with the DevTools protocol.
//
//   npx playwright test --config tests/push-lab/playwright.push-lab.config.ts
export default defineConfig({
  testDir: ".",
  testMatch: /\.lab\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 90_000,
  use: {
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-full",
      use: { ...devices["Desktop Chrome"], channel: "chromium" },
    },
  ],
  webServer: {
    command: "npm run build && npm run start -- -p 3200",
    url: "http://localhost:3200",
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      NEXT_PUBLIC_PUSH_NOTIFICATIONS_ENABLED: "true",
      // Same test-only public key as playwright.config.ts (private half discarded).
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "BKeBnR7_lmMxgaGAJgDTJt4eXn9kuz6Cuco39GoOK0IpwSkDAmfzyjwx8ZHWgPGxn7KbTwZcVKfAguGXsycJqk0",
    },
  },
});
