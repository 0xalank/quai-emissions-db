"use client";
import { useEffect } from "react";
import { HomeHero } from "@/components/dashboard/home/HomeHero";
import { SupplyStoryChart } from "@/components/dashboard/home/SupplyStoryChart";
import { SupplyDecompositionChart } from "@/components/dashboard/home/SupplyDecompositionChart";
import { SoapMiningChart } from "@/components/dashboard/home/SoapMiningChart";
import { EmissionsComparisonChart } from "@/components/dashboard/home/EmissionsComparisonChart";
import { QiCumulativeChart } from "@/components/dashboard/home/QiCumulativeChart";
import { SingularityCallout } from "@/components/dashboard/home/SingularityCallout";
import { SoapCallout } from "@/components/dashboard/home/SoapCallout";
import { UpcomingUnlocks } from "@/components/dashboard/home/UpcomingUnlocks";
import { todayIso } from "@/components/dashboard/shared/TimeframeToggle";

// Mainnet date — earliest from-date so every protocol-event annotation
// (Qi launch, SOAP, 1Y Cliff, Singularity) is visible.
const MAINNET_DATE = "2025-01-29";

// Hero strip pulls a small fixed window so the 7-day delta is always
// computable, regardless of the flagship-chart range.
const HERO_FROM = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 14);
  return d.toISOString().slice(0, 10);
})();

export default function DashboardHomePage() {
  const flagshipFrom = MAINNET_DATE;
  const flagshipTo = todayIso();

  useEffect(() => {
    document.title = "Quai Supply Tracker";
  }, []);

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-10">
      <div className="mb-5">
        <HomeHero from={HERO_FROM} to={todayIso()} />
      </div>

      <details className="group mb-6 overflow-hidden rounded-lg border border-amber-400/50 border-l-4 border-l-amber-400 bg-amber-50/50 dark:border-amber-500/40 dark:border-l-amber-500 dark:bg-amber-500/[0.04]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <div className="flex items-baseline gap-3">
            <span className="text-sm font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Recent Catalysts
            </span>
            <span className="text-xs text-slate-900/60 dark:text-white/60">
              Two protocol changes reshaping QUAI's emissions and eventual
              supply.
            </span>
          </div>
          <svg
            className="h-4 w-4 shrink-0 text-amber-600 transition-transform group-open:rotate-90 dark:text-amber-400"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M7.21 5.21a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 11-1.06-1.06L10.94 10 7.21 6.27a.75.75 0 010-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </summary>
        <div className="grid grid-cols-1 gap-4 px-4 pb-4 lg:grid-cols-2">
          <SoapCallout />
          <SingularityCallout />
        </div>
      </details>

      <div className="fade-in-stagger space-y-6">
        <SupplyStoryChart from={flagshipFrom} to={flagshipTo} />
        <SupplyDecompositionChart from={flagshipFrom} to={flagshipTo} />
        <QiCumulativeChart from={flagshipFrom} to={flagshipTo} />
        <SoapMiningChart to={flagshipTo} />
        <EmissionsComparisonChart />
        <UpcomingUnlocks />
      </div>
    </main>
  );
}
