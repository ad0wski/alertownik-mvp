import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { PwaController } from "@/components/PwaController";
import { NetworkStatusBanner } from "@/components/NetworkStatusBanner";
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
};

export const metadata: Metadata = {
  title: "Alertownik",
  description:
    "Lokalne alerty w jednym miejscu — transport, woda, prąd, odpady i komunikaty gminne dla Komorowa, Pruszkowa i okolic.",
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
        <ThemeProvider>
          <NetworkStatusBanner />
          <AppHeader />
          <div className="flex-1 flex flex-col">{children}</div>
          <AppFooter />
          <PwaController />
        </ThemeProvider>
      </body>
    </html>
  );
}
