import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

/**
 * fix(time) — static/structural checks for Builder's new optional
 * time-of-day inputs. Builder is an authenticated (AuthGate-wrapped)
 * client page — a full interactive login flow is out of scope for this
 * fast, no-browser-session style of test (matching
 * builderLocalToolsAntiDrift.spec.ts's own established convention: read
 * the real source once, assert on it directly).
 */

const builderSrc = readFileSync(
  path.join(process.cwd(), "src/app/builder/page.tsx"),
  "utf8"
);

test.describe("Builder — optional time-of-day fields (fix(time))", () => {
  test("two new <input type=\"time\"> fields exist, wired to the same generic handleChange as every other field", () => {
    expect(builderSrc).toMatch(/type="time"\s*\n\s*name="startsAtTime"/);
    expect(builderSrc).toMatch(/type="time"\s*\n\s*name="endsAtTime"/);
    // Same onChange wiring as the pre-existing date inputs — no separate,
    // parallel change-handling path was introduced.
    const startsAtTimeBlock = builderSrc.slice(
      builderSrc.indexOf('name="startsAtTime"'),
      builderSrc.indexOf('name="startsAtTime"') + 200
    );
    expect(startsAtTimeBlock).toContain("onChange={handleChange}");
  });

  test("initialForm declares both new fields blank by default — never inherited from a previous alert", () => {
    const initialFormBlock = builderSrc.slice(
      builderSrc.indexOf("const initialForm = {"),
      builderSrc.indexOf("};", builderSrc.indexOf("const initialForm = {"))
    );
    expect(initialFormBlock).toContain('startsAtTime: ""');
    expect(initialFormBlock).toContain('endsAtTime: ""');
  });

  test("the real Supabase write/update paths use the combined (Warsaw→UTC) value, never the raw form.startsAt/endsAt directly", () => {
    // Every real write call site must read the derived *Iso value — if
    // any of the three ever regresses back to `startsAt: form.startsAt`
    // directly, the whole point of this fix (actually combining the time
    // in) silently stops working for that one write path.
    const occurrences = builderSrc.match(/startsAt: startsAtIso \?\? form\.startsAt/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(3);
  });

  test("combineDateAndOptionalTime / isValidTimeString / parseAlertTimestamp are imported from the single shared helper module, never reimplemented locally", () => {
    expect(builderSrc).toContain('from "@/lib/formatAlertDate"');
    expect(builderSrc).toContain("combineDateAndOptionalTime");
    expect(builderSrc).toContain("isValidTimeString");
    expect(builderSrc).toContain("parseAlertTimestamp");
    // No local reimplementation of the Warsaw-conversion math anywhere in
    // this file.
    expect(builderSrc).not.toContain("Intl.DateTimeFormat");
  });

  test("loading an existing alert for editing extracts its real Warsaw-local time-of-day instead of silently discarding it", () => {
    expect(builderSrc).toContain("startsAtTime: parseAlertTimestamp(a.startsAt).hhmm");
  });
});
