"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PUBLIC_NAV_ITEMS, isBottomNavRoute, activePublicNavKey, type PublicNavKey } from "@/lib/publicNav";
import { TodayIcon, AlertsIcon, WasteIcon, MoreIcon } from "@/components/icons/NavIcons";

const ICONS: Record<PublicNavKey, (props: { className?: string }) => React.ReactElement> = {
  today: TodayIcon,
  alerts: AlertsIcon,
  waste: WasteIcon,
  more: MoreIcon,
};

// Sprint 163 — fixed mobile app-shell bottom navigation. Public surfaces
// only (see isBottomNavRoute — /admin, /builder, /ai-helper, /login are
// excluded regardless of session), hidden entirely on sm and up so desktop
// keeps its existing header-driven layout untouched.
//
// Renders a flow-space spacer (`<div className="h-16 sm:hidden" />`) right
// before the fixed nav itself, in the same component, so wherever this
// sits in the tree (end of <body>, after AppFooter) the page gains exactly
// enough extra scroll room for the fixed bar to never cover the last real
// content — no separate coordination needed elsewhere in the layout.
export function BottomNav() {
  const pathname = usePathname();

  if (!isBottomNavRoute(pathname)) return null;

  const activeKey = activePublicNavKey(pathname);

  return (
    <>
      <div aria-hidden="true" className="h-16 sm:hidden" />
      <nav
        aria-label="Nawigacja główna"
        className="fixed bottom-0 inset-x-0 z-40 sm:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex items-stretch justify-around">
          {PUBLIC_NAV_ITEMS.map((item) => {
            const Icon = ICONS[item.key];
            const isActive = activeKey === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                aria-label={item.label}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] py-1.5 text-[11px] font-medium transition-colors ${
                  isActive
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <Icon className="w-6 h-6" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
