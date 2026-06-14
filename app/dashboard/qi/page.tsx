"use client";
import { useEffect, useState } from "react";
import { QiConversionInfo } from "@/components/dashboard/qi/QiConversionInfo";
import { QiHero } from "@/components/dashboard/qi/QiHero";
import { QiImpliedPriceChart } from "@/components/dashboard/qi/QiImpliedPriceChart";
import { QiRateChart } from "@/components/dashboard/qi/QiRateChart";
import {
  TimeframeToggle,
  type Timeframe,
  timeframeToFromIso,
  todayIso,
} from "@/components/dashboard/shared/TimeframeToggle";

const MAINNET_DATE = "2025-01-29";

export default function QiPage() {
  const [tf, setTf] = useState<Timeframe>("30d");
  const from = timeframeToFromIso(tf) ?? MAINNET_DATE;
  const to = todayIso();

  useEffect(() => {
    document.title = "Quai · Qi";
  }, []);

  return (
    <main className="mx-auto max-w-[1400px] px-3 py-4 sm:px-4 sm:py-6 md:px-8 md:py-10">
      <div className="mb-4 sm:mb-5">
        <QiHero from={from} to={to} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-start gap-2 sm:justify-end">
        <span className="text-[0.7rem] uppercase tracking-wider text-slate-900/55 dark:text-white/55">
          Range
        </span>
        <TimeframeToggle value={tf} onChange={setTf} />
      </div>

      <div className="fade-in-stagger space-y-4 sm:space-y-6">
        <QiRateChart from={from} to={to} />
        <QiImpliedPriceChart from={from} to={to} />
        <QiConversionInfo from={from} to={to} />
      </div>
    </main>
  );
}
