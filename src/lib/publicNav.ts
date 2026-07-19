// Sprint 163 — shared source of truth for the mobile bottom navigation and
// the "Więcej" surface, so the tab list and active-route logic can't drift
// between BottomNav, AppHeader, and tests.

export type PublicNavKey = "today" | "alerts" | "waste" | "more";

export interface PublicNavItem {
  key: PublicNavKey;
  href: string;
  label: string;
}

export const PUBLIC_NAV_ITEMS: PublicNavItem[] = [
  { key: "today", href: "/", label: "Dzisiaj" },
  { key: "alerts", href: "/alerty", label: "Alerty" },
  { key: "waste", href: "/odpady", label: "Odpady" },
  { key: "more", href: "/wiecej", label: "Więcej" },
];

// Routes that are the admin/auth surface — the bottom nav (a public-only
// app-shell affordance) must never appear here, regardless of whether the
// visitor happens to be a logged-in admin browsing these pages.
const HIDDEN_PREFIXES = ["/admin", "/builder", "/ai-helper", "/login"];

export function isBottomNavRoute(pathname: string): boolean {
  return !HIDDEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

// Which of the 4 tabs should read as "active" for a given pathname. Alert
// detail pages (/alerts/[slug]) belong under "Alerty", not "Dzisiaj" — a
// reader who tapped into a card from either place expects to still be in
// the "Alerty" section. "Więcej" owns every settings/info page that isn't
// one of the other three sections' own route.
const MORE_ROUTES = ["/wiecej", "/ustawienia", "/instalacja", "/about", "/zasady", "/prywatnosc", "/partnerzy"];

export function activePublicNavKey(pathname: string): PublicNavKey | null {
  if (pathname === "/") return "today";
  if (pathname === "/alerty" || pathname.startsWith("/alerts/")) return "alerts";
  if (pathname === "/odpady") return "waste";
  if (MORE_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) return "more";
  return null;
}
