import { test, expect } from "@playwright/test";
import { isBottomNavRoute, activePublicNavKey, PUBLIC_NAV_ITEMS } from "@/lib/publicNav";

// Sprint 163 — pure-function unit tests for the bottom nav's route logic
// (no browser needed; same pattern as tests/e2e/themeLogic.spec.ts).

test.describe("PUBLIC_NAV_ITEMS", () => {
  test("has exactly the four required tabs, in order", () => {
    expect(PUBLIC_NAV_ITEMS.map((i) => i.label)).toEqual(["Dzisiaj", "Alerty", "Odpady", "Więcej"]);
    expect(PUBLIC_NAV_ITEMS.map((i) => i.href)).toEqual(["/", "/alerty", "/odpady", "/wiecej"]);
  });
});

test.describe("isBottomNavRoute", () => {
  test("true for public routes", () => {
    for (const path of ["/", "/alerty", "/odpady", "/wiecej", "/ustawienia", "/about", "/alerts/some-slug"]) {
      expect(isBottomNavRoute(path)).toBe(true);
    }
  });

  test("false for /login", () => {
    expect(isBottomNavRoute("/login")).toBe(false);
  });

  test("false for every admin surface", () => {
    for (const path of [
      "/admin",
      "/admin/sources",
      "/admin/queue",
      "/admin/new-alert",
      "/admin/waste",
      "/builder",
      "/ai-helper",
    ]) {
      expect(isBottomNavRoute(path)).toBe(false);
    }
  });

  test("does not false-positive-hide a route that merely starts with an admin prefix's letters", () => {
    // A route like "/adminstyle" would wrongly match a naive startsWith("/admin")
    // without the trailing-slash/exact-match guard — this pins that guard.
    expect(isBottomNavRoute("/adminstyle")).toBe(true);
  });
});

test.describe("activePublicNavKey", () => {
  test("maps each of the four routes to itself", () => {
    expect(activePublicNavKey("/")).toBe("today");
    expect(activePublicNavKey("/alerty")).toBe("alerts");
    expect(activePublicNavKey("/odpady")).toBe("waste");
    expect(activePublicNavKey("/wiecej")).toBe("more");
  });

  test("alert detail pages count as 'alerts', not 'today'", () => {
    expect(activePublicNavKey("/alerts/some-slug")).toBe("alerts");
  });

  test("settings/info pages count as 'more'", () => {
    for (const path of ["/ustawienia", "/instalacja", "/about", "/zasady", "/prywatnosc", "/partnerzy"]) {
      expect(activePublicNavKey(path)).toBe("more");
    }
  });

  test("an unrecognized route has no active tab", () => {
    expect(activePublicNavKey("/login")).toBeNull();
    expect(activePublicNavKey("/admin")).toBeNull();
  });
});
