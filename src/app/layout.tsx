import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { PwaController } from "@/components/PwaController";
import { NetworkStatusBanner } from "@/components/NetworkStatusBanner";
import { BottomNav } from "@/components/BottomNav";
import { ThemeScript } from "./theme-bootstrap-script";
import { ThemeProvider } from "@/components/ThemeProvider";
import { THEME_COLOR_DARK, THEME_COLOR_LIGHT } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  // Sprint 162 — dual light/dark theme-color. This static pair covers the
  // OS-level prefers-color-scheme case (and the pre-hydration instant);
  // ThemeProvider takes over afterwards to also reflect a manual override.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR_LIGHT },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR_DARK },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  // Sprint 181B — PWA installability audit: without this, iOS Safari never
  // applies viewport-fit=cover, so env(safe-area-inset-bottom) resolves to
  // 0 everywhere. BottomNav.tsx already has pb-[env(safe-area-inset-bottom)]
  // (Sprint 163) but it was silently a no-op on iPhone until this fix — the
  // fixed bottom nav could sit flush against (or under) the home indicator
  // on notched/Dynamic-Island devices in standalone/installed mode.
  viewportFit: "cover",
};

// FINAL-2 — absolute URLs for Open Graph/canonical. Always the public
// production domain (also when the page is served from the admin alias).
const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Alertownik",
  description:
    "Lokalne alerty w jednym miejscu — woda, drogi, odpady i komunikaty gminne w rejonie gminy Michałowice, na podstawie oficjalnych komunikatów.",
  openGraph: {
    type: "website",
    siteName: "Alertownik",
    locale: "pl_PL",
    title: "Alertownik",
    description: "Lokalne alerty w jednym miejscu — woda, drogi, odpady i komunikaty gminne w rejonie gminy Michałowice.",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Alertownik" }],
  },
  applicationName: "Alertownik",
  appleWebApp: {
    capable: true,
    title: "Alertownik",
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pl"
      // suppressHydrationWarning: ThemeScript sets the `.dark` class and
      // `style.colorScheme` on this element before React hydrates (see
      // ThemeScript's doc comment) — that's a deliberate, expected mismatch
      // between the server-rendered markup and the first client paint, not
      // a bug. This only suppresses the warning for this one element's
      // attributes, not for its subtree.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Must be the first thing in <body> — it's a literal blocking
            <script> tag (see theme-bootstrap-script.tsx) that sets the
            `.dark` class before anything below it paints. */}
        <ThemeScript />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          Przejdź do treści
        </a>
        <ThemeProvider>
          <NetworkStatusBanner />
          <AppHeader />
          <div id="main-content" tabIndex={-1} className="flex-1 flex flex-col">{children}</div>
          <AppFooter />
          <PwaController />
          <BottomNav />
        </ThemeProvider>
      </body>
    </html>
  );
}
