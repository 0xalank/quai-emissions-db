"use client";
import { useEffect, useState } from "react";
import { MiningHero } from "@/components/dashboard/mining/MiningHero";
import { AlgoCompositionChart } from "@/components/dashboard/mining/AlgoCompositionChart";
import { QuaiPerAlgoChart } from "@/components/dashboard/mining/QuaiPerAlgoChart";
import { HashrateChart } from "@/components/dashboard/mining/HashrateChart";
import { BlockRewardChart } from "@/components/dashboard/mining/BlockRewardChart";
import { TopCoinbasesTable } from "@/components/dashboard/mining/TopCoinbasesTable";
import {
  TimeframeToggle,
  type Timeframe,
  timeframeToFromIso,
  todayIso,
} from "@/components/dashboard/shared/TimeframeToggle";
import { SOAP_ACTIVATION_DATE } from "@/lib/quai/protocol-constants";

// Default timeframe is 90d, which on 2026-04-25 fully covers the post-SOAP
// era (SOAP activated 2025-12-17). User can extend back via the toggle to
// see pre-SOAP context, where most per-algo columns will be empty.

export default function MiningPage() {
  const [tf, setTf] = useState<Timeframe>("90d");
  const flagshipFrom = timeframeToFromIso(tf) ?? SOAP_ACTIVATION_DATE;
  const flagshipTo = todayIso();

  useEffect(() => {
    document.title = "Quai · Mining";
  }, []);

  return (
    <main className="mx-auto max-w-[1400px] px-3 py-4 sm:px-4 sm:py-6 md:px-8 md:py-10">
      <div className="mb-4 sm:mb-5">
        <MiningHero from={flagshipFrom} to={flagshipTo} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-start gap-2 sm:justify-end">
        <span className="text-[0.7rem] uppercase tracking-wider text-slate-900/55 dark:text-white/55">
          Range
        </span>
        <TimeframeToggle value={tf} onChange={setTf} />
      </div>

      <div className="fade-in-stagger space-y-4 sm:space-y-6">
        <AlgoCompositionChart from={flagshipFrom} to={flagshipTo} />
        <QuaiPerAlgoChart from={flagshipFrom} to={flagshipTo} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <HashrateChart from={flagshipFrom} to={flagshipTo} />
          <BlockRewardChart from={flagshipFrom} to={flagshipTo} />
        </div>

        <TopCoinbasesTable days={7} limit={10} />
      </div>
    </main>
  );
}
