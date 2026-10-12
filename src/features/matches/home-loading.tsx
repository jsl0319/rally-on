"use client";

import { BrandLaunch } from "@/components/feedback/brand-launch";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { useIsInitialEntry } from "@/components/feedback/initial-entry";
import { BottomNavigation } from "@/components/navigation/bottom-navigation";
import { MatchDiscoveryHeader } from "./match-discovery-filters";

export function HomeLoading() {
  const isInitialEntry = useIsInitialEntry();
  if (isInitialEntry) return <BrandLaunch />;

  return <main className="min-h-app bg-[var(--tm-bg-page)] pb-[calc(160px+env(safe-area-inset-bottom))] text-[var(--tm-text-primary)]">
    <MatchDiscoveryHeader />
    <div className="mx-auto max-w-[560px] px-5"><CourtRallyLoader label="매칭을 불러오고 있어요." /></div>
    <BottomNavigation />
  </main>;
}
