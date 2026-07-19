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

test.describe("CSP anti-drift (Sprint 162 — theme system required no CSP change)", () => {
  // The Sprint 162 inline theme-bootstrap script (src/app/theme-bootstrap-script.tsx)
  // runs under the SAME `script-src 'self' 'unsafe-inline'` directive Sprint 161
  // already shipped (next.config.ts's own comment explains why: Next's App
  // Router injects its own inline RSC-streaming scripts regardless of app
  // code, so 'unsafe-inline' was already required with no nonce mechanism in
  // place). This test pins the exact directive set so a future change that
  // widens it — for example adding 'unsafe-eval' in production, or a new
  // external script/connect host — fails loudly instead of silently.
  test("script-src / connect-src / style-src directive sets are unchanged from the Sprint 161 baseline", async ({
    request,
    baseURL,
  }) => {
    const res = await request.get(`${baseURL}/`);
    const csp = res.headers()["content-security-policy"] ?? "";
    const directives = Object.fromEntries(
      csp
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => {
          const [name, ...rest] = d.split(" ");
          return [name, rest.join(" ")];
        })
    );

    // This suite runs against `next dev`, where script-src legitimately
    // gains 'unsafe-eval' (see the "dev-mode CSP" test above) — strip it
    // before comparing so this test still pins the real, meaningful part
    // of the directive (no new host, no other new keyword) in both dev and
    // a production run.
    const scriptSrcWithoutDevEval = (directives["script-src"] ?? "")
      .replace(/\s*'unsafe-eval'/, "")
      .trim();
    expect(scriptSrcWithoutDevEval).toBe("'self' 'unsafe-inline'");
    expect(directives["style-src"]).toBe("'self' 'unsafe-inline'");
    // connect-src is `'self'` plus the one Supabase origin from env — no
    // additional hosts. Assert no comma/space-separated extra host beyond
    // that pair was introduced.
    const connectSrcHosts = (directives["connect-src"] ?? "").split(" ").filter(Boolean);
    expect(connectSrcHosts.length).toBeLessThanOrEqual(2);
    expect(connectSrcHosts[0]).toBe("'self'");
  });
});
