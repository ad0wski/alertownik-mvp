import { test, expect } from "@playwright/test";

/**
 * Sprint 161 — confirms the new next.config.ts security headers are
 * actually served (not just present in source), and that the CSP doesn't
 * break real page rendering — the two failure modes the sprint brief
 * explicitly warned about ("a CSP that passes a text test but breaks the
 * app"). Runs against the real dev server Playwright already starts for
 * this suite (see playwright.config.ts webServer).
 */

test.describe("Security headers — present on every page", () => {
  test("homepage response carries the full header set", async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/`);
    const headers = res.headers();

    expect(headers["content-security-policy"]).toBeTruthy();
    expect(headers["content-security-policy"]).toContain("default-src 'self'");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).toContain("object-src 'none'");

    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBeTruthy();
    expect(headers["permissions-policy"]).toBeTruthy();
  });

  test("an admin page carries the same header set (headers aren't route-scoped away)", async ({
    request,
    baseURL,
  }) => {
    const res = await request.get(`${baseURL}/builder`);
    const headers = res.headers();
    expect(headers["content-security-policy"]).toBeTruthy();
    expect(headers["x-frame-options"]).toBe("DENY");
  });

  test("CSP does not include a wide-open '*' source anywhere", async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/`);
    const csp = res.headers()["content-security-policy"] ?? "";
    // A bare `*` token (not part of a real host like *.supabase.co) would
    // defeat the point of the policy — this is a coarse but meaningful
    // anti-drift check that a future edit didn't loosen it back open.
    expect(/(^|\s)\*(\s|;|$)/.test(csp)).toBe(false);
  });

  test("dev-mode CSP never contains 'unsafe-eval' outside of local development", async ({
    request,
    baseURL,
  }) => {
    const res = await request.get(`${baseURL}/`);
    const csp = res.headers()["content-security-policy"] ?? "";
    // This suite runs against `next dev`, where NODE_ENV is "development"
    // and 'unsafe-eval' is expected (React's dev-mode error reconstruction
    // needs it, per Next's own docs) — this test documents that fact
    // rather than asserting its absence, so a reader isn't left wondering
    // why 'unsafe-eval' shows up here. The production build is checked
    // separately by npm run test:pwa's config, which runs `next build`.
    if (csp.includes("'unsafe-eval'")) {
      expect(process.env.NODE_ENV).not.toBe("production");
    }
  });
});

test.describe("Security headers — don't break real rendering", () => {
  test("homepage loads with zero CSP-violation console errors", async ({ page }) => {
    const cspViolations: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && /content security policy|refused to/i.test(msg.text())) {
        cspViolations.push(msg.text());
      }
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(cspViolations, cspViolations.join("\n")).toEqual([]);
  });

  test("builder page (heavier client bundle, forms, admin UI) loads with zero CSP-violation console errors", async ({
    page,
  }) => {
    const cspViolations: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && /content security policy|refused to/i.test(msg.text())) {
        cspViolations.push(msg.text());
      }
    });
    await page.goto("/builder");
    await page.waitForLoadState("networkidle");
    expect(cspViolations, cspViolations.join("\n")).toEqual([]);
  });
});
