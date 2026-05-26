"use client";
import { useMemo } from "react";
import { HeroStrip, type HeroCard } from "@/components/dashboard/shared/HeroStrip";
import { useSupply } from "@/lib/hooks";
import { formatCompact, qitsToFloat, weiToFloat } from "@/lib/format";
import { cumulativeUnlockedPostSingularity } from "@/lib/quai/genesis-schedule";
import {
  GENESIS_PREMINE_QUAI,
  SINGULARITY_SKIP_QUAI,
} from "@/lib/quai/protocol-constants";

const POST_SINGULARITY_GENESIS_QUAI =
  GENESIS_PREMINE_QUAI - SINGULARITY_SKIP_QUAI;
const SOAP_BURN_ADDRESS = "0x0050AF0000000000000000000000000000000000";
const SOAP_BURN_ADDRESS_URL = `https://quaiscan.io/address/${SOAP_BURN_ADDRESS}`;

// HomeHero — five KPI cards leading the dashboard home page.
//
//   [DOMINANT] Circulating QUAI             (live, from /api/supply, +30d sparkline)
//   • Total SOAP burn                       (live)
//   • Net issuance · 7d                     (derived from 30d window)
//   • Mined + genesis · 30d                 (component view of issuance)
//   • Genesis allocation after Singularity  (static constant)
//   • Singularity Burn                      (static constant)
//
// The two static constants moved here from the now-removed /tokenomics
// page so the dashboard surfaces them in one place. They never change but
// they're load-bearing context for any reader trying to reconcile
// quaiSupplyTotal with eventual maximum supply.

export function HomeHero({ from, to }: { from: string; to: string }) {
  const { data } = useSupply({
    period: "day",
    from,
    to,
    include: ["qi", "burn", "mined"],
  });

  const {
    latest,
    sevenDayDelta,
    thirtyDayGenesisUnlocked,
    thirtyDayMined,
    sparkData,
  } = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        latest: null,
        sevenDayDelta: null,
        thirtyDayGenesisUnlocked: null,
        thirtyDayMined: null,
        sparkData: [] as number[],
      };
    }
    const latest = data[data.length - 1];
    const thirtyDayBaseline = data[0];
    const sevenBackIdx = Math.max(0, data.length - 1 - 7);
    const sevenDayBaseline = data[sevenBackIdx];
    const sevenDayDelta =
      latest.realizedCirculatingQuai -
      sevenDayBaseline.realizedCirculatingQuai;
    const thirtyDayGenesisUnlocked =
      cumulativeUnlockedPostSingularity(latest.periodStart) -
      cumulativeUnlockedPostSingularity(thirtyDayBaseline.periodStart);
    const thirtyDayMined =
      latest.cumulativeMinedQuai != null &&
      thirtyDayBaseline.cumulativeMinedQuai != null
        ? latest.cumulativeMinedQuai -
          thirtyDayBaseline.cumulativeMinedQuai
        : null;
    // 30-day sparkline: the same window the hook fetched. Convert wei→float
    // once; MiniSparkline auto-scales y to data range.
    const sparkData = data.map((r) => weiToFloat(r.realizedCirculatingQuai, 0));
    return {
      latest,
      sevenDayDelta,
      thirtyDayGenesisUnlocked,
      thirtyDayMined,
      sparkData,
    };
  }, [data]);

  const loading = !latest;

  const realizedFloat = latest
    ? weiToFloat(latest.realizedCirculatingQuai, 0)
    : undefined;
  const qiFloat =
    latest?.qiTotalEnd != null ? qitsToFloat(latest.qiTotalEnd, 0) : undefined;
  const burnFloat = latest
    ? weiToFloat(latest.burnClose ?? 0n, 0)
    : undefined;
  const netFloat =
    sevenDayDelta == null ? undefined : weiToFloat(sevenDayDelta, 0);

  const dominant: HeroCard = {
    id: "realized",
    label: "Circulating QUAI",
    value: latest ? (
      <>
        {formatCompact(weiToFloat(latest.realizedCirculatingQuai, 0))}
        <span className="ml-1 text-base font-normal text-slate-900/55 dark:text-white/55">
          QUAI
        </span>
      </>
    ) : (
      "—"
    ),
    numericValue: realizedFloat,
    sub: "On-chain quaiSupplyTotal for cyprus1, already net of SOAP burn.",
    loading,
    accent: "blue",
    sparkline: sparkData.length >= 2 ? { data: sparkData } : undefined,
  };

  const qi: HeroCard = {
    id: "qi-realized",
    label: "Circulating Qi",
    value: latest?.qiTotalEnd != null ? (
      <>
        {formatCompact(qitsToFloat(latest.qiTotalEnd, 0))}
        <span className="ml-1 text-sm font-normal text-slate-900/55 dark:text-white/55">
          QI
        </span>
      </>
    ) : (
      "—"
    ),
    numericValue: qiFloat,
    sub: "Cumulative Qi minted on cyprus1.",
    loading,
    accent: "emerald",
  };

  const burn: HeroCard = {
    id: "burn",
    label: "Total SOAP burn",
    value: latest ? (
      <>
        {formatCompact(weiToFloat(latest.burnClose ?? 0n, 0))}
        <span className="ml-1 text-sm font-normal text-slate-900/55 dark:text-white/55">
          QUAI
        </span>
      </>
    ) : (
      "—"
    ),
    numericValue: burnFloat,
    sub: (
      <a
        href={SOAP_BURN_ADDRESS_URL}
        target="_blank"
        rel="noreferrer"
        className="break-all underline decoration-amber-300/40 underline-offset-2 hover:text-amber-700 dark:hover:text-amber-300"
      >
        {SOAP_BURN_ADDRESS}
      </a>
    ),
    loading,
    accent: "orange",
  };

  const netSign =
    sevenDayDelta == null
      ? null
      : sevenDayDelta > 0n
        ? "up"
        : sevenDayDelta < 0n
          ? "down"
          : "flat";

  const net: HeroCard = {
    id: "net7d",
    label: "Net issuance · 7d",
    value:
      sevenDayDelta == null ? (
        "—"
      ) : (
        <>
          {sevenDayDelta >= 0n ? "+" : "−"}
          {formatCompact(Math.abs(weiToFloat(sevenDayDelta, 0)))}
          <span className="ml-1 text-sm font-normal text-slate-900/55 dark:text-white/55">
            QUAI
          </span>
        </>
      ),
    // Count-up uses absolute magnitude so the sign character in `value`
    // remains a static prefix; magnitude tweens naturally.
    numericValue: netFloat == null ? undefined : Math.abs(netFloat),
    sub: "Change in realized circulating over the last 7 days.",
    delta:
      netSign == null
        ? undefined
        : { sign: netSign as "up" | "down" | "flat", text: "7d" },
    loading,
    accent: "emerald",
  };

  const issuanceSources: HeroCard = {
    id: "issuance-sources-30d",
    label: "Mined + genesis · 30d",
    value: (
      <span className="grid w-full grid-cols-2 gap-3">
        <span>
          <span className="block text-[0.65rem] font-normal uppercase tracking-wider text-slate-900/50 dark:text-white/45">
            Mined
          </span>
          <span className="block">
            {thirtyDayMined == null
              ? "—"
              : formatCompact(weiToFloat(thirtyDayMined, 0))}
            <span className="ml-1 text-sm font-normal text-slate-900/55 dark:text-white/55">
              QUAI
            </span>
          </span>
        </span>
        <span>
          <span className="block text-[0.65rem] font-normal uppercase tracking-wider text-slate-900/50 dark:text-white/45">
            Genesis
          </span>
          <span className="block">
            {thirtyDayGenesisUnlocked == null
              ? "—"
              : formatCompact(weiToFloat(thirtyDayGenesisUnlocked, 0))}
            <span className="ml-1 text-sm font-normal text-slate-900/55 dark:text-white/55">
              QUAI
            </span>
          </span>
        </span>
      </span>
    ),
    loading,
    accent: "purple",
  };

  const premine: HeroCard = {
    id: "premine",
    label: "Genesis allocation",
    value: (
      <>
        {formatCompact(weiToFloat(POST_SINGULARITY_GENESIS_QUAI, 0))}
        <span className="ml-1 text-sm font-normal text-slate-900/55 dark:text-white/55">
          QUAI
        </span>
      </>
    ),
    numericValue: weiToFloat(POST_SINGULARITY_GENESIS_QUAI, 0),
    sub: "Post-Singularity genesis allocation; originally 3B QUAI.",
    accent: "slate",
  };

  const skip: HeroCard = {
    id: "skip",
    label: "Singularity Burn",
    value: (
      <>
        −{formatCompact(weiToFloat(SINGULARITY_SKIP_QUAI, 0))}
        <span className="ml-1 text-sm font-normal text-slate-900/55 dark:text-white/55">
          QUAI
        </span>
      </>
    ),
    numericValue: weiToFloat(SINGULARITY_SKIP_QUAI, 0),
    sub: `${formatCompact(weiToFloat(GENESIS_PREMINE_QUAI, 0))} genesis schedule reduced to ${formatCompact(weiToFloat(POST_SINGULARITY_GENESIS_QUAI, 0))}.`,
    accent: "amber",
  };

  return (
    <HeroStrip
      dominant={dominant}
      cards={[qi, burn, net, premine, skip, issuanceSources]}
    />
  );
}
