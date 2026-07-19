import { TodayView } from "@/components/TodayView";

// Sprint 163 — "/" is now the compact "Dzisiaj" app-shell view. The
// previous full scrollable alert list (hero + AlertList) moved to /alerty
// verbatim — see src/app/alerty/page.tsx — so no existing public link or
// behavior of that list was lost, just relocated.
export default function Home() {
  return <TodayView />;
}
