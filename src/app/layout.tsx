import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppHeader } from "@/components/AppHeader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Alertownik",
  description: "Lokalne alerty w jednym miejscu",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pl"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppHeader />
        <div className="flex-1 flex flex-col">{children}</div>
        <footer className="border-t border-slate-200 mt-auto">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
            <p className="text-xs text-slate-400 text-center">
              Alertownik MVP · wersja demonstracyjna
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
