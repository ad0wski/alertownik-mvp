import { defineConfig } from "@playwright/test";

// LR-8A.1 — config for the push SQL integration test only. No web server,
// no browser: the spec drives the real route handlers and supabase-js
// against the throwaway database started by run-push-sql-integration.sh.
export default defineConfig({
  testDir: ".",
  testMatch: /pushSqlIntegration\.spec\.ts$/,
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  timeout: 60_000,
});
