"use client";

import { useMemo, useState } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { InfoPopover } from "@/components/ui/InfoPopover";
import type { HeroCard, HeroAccent } from "@/components/dashboard/shared/HeroStrip";
import { ChartSkeleton } from "@/components/ui/ChartSkeleton";
import { ChartTooltip } from "@/components/ui/ChartTooltip";
import {
  TimeframeToggle,
  type Timeframe,
  timeframeToFromIso,
  todayIso,
} from "@/components/dashboard/shared/TimeframeToggle";
import { SoapMiningChart } from "@/components/dashboard/home/SoapMiningChart";
import {
  useCompactViewport,
  usePowMarketHistory,
  usePowMarkets,
  useQiMarket,
  useRollups,
  useSupply,
} from "@/lib/hooks";
import { formatCompact, formatPeriodDate, weiToFloat } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SOAP_ACTIVATION_DATE } from "@/lib/quai/protocol-constants";
import type { QiMarketRow, Rollup, SupplyRow } from "@/lib/quai/types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  POW_BENCHMARK_NETWORKS,
  QUAI_CAPACITY_TPS,
  SECURITY_ELECTRICITY_USD_PER_KWH,
  capacityTransactionsPerDay,
  costPerCapacityTransaction,
  dailySubsidyTokens,
  energyCostEquivalentKwhPerTx,
  type PowMarketHistory,
  type PowMarketQuote,
  type PowNetworkMetric,
} from "@/lib/comparisons/pow-dominance";

const WINDOW_OPTIONS: Timeframe[] = ["7d", "30d", "90d", "1y"];
type SecurityScaleMode = "log" | "sqrt" | "linear";

const SECURITY_SCALE_OPTIONS: {
  value: SecurityScaleMode;
  label: string;
}[] = [
  { value: "log", label: "Log" },
  { value: "sqrt", label: "Sqrt" },
  { value: "linear", label: "Linear" },
];

type LatestQuaiPrice = {
  price: number;
  source: string;
  asOf: string;
} | null;

type Derived = {
  metrics: PowNetworkMetric[];
  externalMetrics: PowNetworkMetric[];
  quaiMetric: PowNetworkMetric;
  btcMetric: PowNetworkMetric | null;
  price: LatestQuaiPrice;
  latestSupply: SupplyRow | null;
  exactRows: Rollup[];
  totalMinedWei: bigint;
  burnInWindowWei: bigint | null;
  securityTotal: number | null;
  marketCapTotal: number | null;
  securityCostRatio: number | null;
  btcCostAdvantage: number | null;
  savingsVsBtc: number | null;
  quaiBudgetShare: number | null;
  quaiMarketCapShare: number | null;
  quaiCostPerCapacityTx: number | null;
  btcCostPerCapacityTx: number | null;
  capacityEfficiencyRatio: number | null;
  soapOffset: number | null;
};

const KPI_ACCENT_BORDER: Record<HeroAccent, string> = {
  blue: "border-l-quai-500/80 dark:border-l-quai-500/80",
  orange: "border-l-amber-300/80 dark:border-l-amber-300/80",
  emerald: "border-l-emerald-500/80 dark:border-l-emerald-400/70",
  amber: "border-l-amber-500/80 dark:border-l-amber-400/70",
  purple: "border-l-purple-500/80 dark:border-l-purple-400/70",
  slate: "border-l-slate-400/60 dark:border-l-white/25",
};

const KPI_ACCENT_LABEL: Record<HeroAccent, string> = {
  blue: "text-quai-600 dark:text-quai-400",
  orange: "text-amber-600 dark:text-amber-300",
  emerald: "text-emerald-700 dark:text-emerald-300",
  amber: "text-amber-700 dark:text-amber-300",
  purple: "text-purple-700 dark:text-purple-300",
  slate: "text-slate-900/60 dark:text-white/60",
};

function clampSoapFrom(from: string | null): string {
  if (!from) return SOAP_ACTIVATION_DATE;
  return from > SOAP_ACTIVATION_DATE ? from : SOAP_ACTIVATION_DATE;
}

function dateRangeIso(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function latestQuaiPrice(rows: QiMarketRow[] | undefined): LatestQuaiPrice {
  if (!rows) return null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const close = rows[i].quaiPriceClose;
    if (close != null) {
      const price = Number(close);
      if (Number.isFinite(price) && price > 0) {
        return {
          price,
          source: rows[i].priceSource ?? "market",
          asOf: rows[i].periodStart,
        };
      }
    }
  }
  return null;
}

function quoteById(quotes: PowMarketQuote[] | undefined) {
  return new Map((quotes ?? []).map((q) => [q.id, q]));
}

function historyById(history: PowMarketHistory[] | undefined) {
  return new Map((history ?? []).map((h) => [h.id, h.rows]));
}

function priceByDate(rows: QiMarketRow[] | undefined) {
  const out = new Map<string, number>();
  for (const row of rows ?? []) {
    if (row.quaiPriceClose == null) continue;
    const price = Number(row.quaiPriceClose);
    if (Number.isFinite(price) && price > 0) {
      out.set(row.periodStart, price);
    }
  }
  return out;
}

function usd(n: number | null | undefined, compact = false): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (compact) {
    return `$${formatCompact(n)}`;
  }
  if (Math.abs(n) >= 1_000) {
    return n.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
  }
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n < 1 ? 4 : 2,
  });
}

function pct(n: number | null | undefined, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) < 0.01 && n !== 0) return "<0.01%";
  return `${n.toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: Math.min(1, decimals),
  })}%`;
}

function ratio(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n > 0 && n < 0.0001) return "<0.0001x";
  if (n < 0.01) return `${n.toFixed(4)}x`;
  if (n < 1) return `${n.toFixed(3)}x`;
  return `${n.toFixed(2)}x`;
}

function tokenAmount(n: number | null | undefined, symbol: string): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${formatCompact(n)} ${symbol}`;
}

function dateTimeFromUnix(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  return new Date(seconds * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function sumNullable(values: Array<number | null>): number | null {
  const known = values.filter(
    (v): v is number => v != null && Number.isFinite(v),
  );
  if (known.length === 0) return null;
  return known.reduce((acc, v) => acc + v, 0);
}

function capacityTxPerSecurityDollar(
  metric: PowNetworkMetric,
): number | null {
  if (
    metric.dailySecurityCostUsd == null ||
    metric.dailySecurityCostUsd <= 0
  ) {
    return null;
  }
  return (
    capacityTransactionsPerDay(metric.capacityTps) /
    metric.dailySecurityCostUsd
  );
}

function formatTxPerDollar(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1_000) return `${formatCompact(v)} tx/$`;
  if (v >= 1) return `${v.toFixed(1)} tx/$`;
  return `${v.toFixed(2)} tx/$`;
}

function formatMultiple(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1_000) return `${formatCompact(n)}x`;
  if (n >= 100) return `${Math.round(n)}x`;
  return `${n.toFixed(1)}x`;
}

function annualizedSecuritySpendUsd(metric: PowNetworkMetric): number | null {
  if (metric.dailySecurityCostUsd == null) return null;
  return metric.dailySecurityCostUsd * 365;
}

export function PowDominanceDashboard() {
  const [timeframe, setTimeframe] = useState<Timeframe>("30d");
  const from = clampSoapFrom(timeframeToFromIso(timeframe));
  const to = todayIso();

  const { data: rollups, isLoading: rollupsLoading } = useRollups({
    period: "day",
    from,
    to,
  });
  const { data: supply } = useSupply({
    period: "day",
    from,
    to,
    include: ["qi", "burn", "mined"],
  });
  const { data: qiMarket, isLoading: qiMarketLoading } = useQiMarket({
    from,
    to,
  });
  const {
    data: powMarketHistory,
    isLoading: powMarketHistoryLoading,
    error: powMarketHistoryError,
  } = usePowMarketHistory({ from, to });
  const {
    data: powMarkets,
    isLoading: powMarketsLoading,
    error: powMarketsError,
  } = usePowMarkets();

  const derived = useMemo(() => {
    const price = latestQuaiPrice(qiMarket);
    const latestSupply = supply?.[supply.length - 1] ?? null;
    const circulatingQuai = latestSupply
      ? weiToFloat(latestSupply.realizedCirculatingQuai, 0)
      : null;

    const exactRows =
      rollups?.filter(
        (r) =>
          r.blockCount > 0 &&
          r.coinbaseRewardIndexedCount >= r.blockCount &&
          r.coinbaseQuaiLockedRewardSum > 0n,
      ) ?? [];
    const totalMinedWei = exactRows.reduce(
      (acc, r) => acc + r.coinbaseQuaiLockedRewardSum,
      0n,
    );
    const avgDailyMinedWei =
      exactRows.length > 0 ? totalMinedWei / BigInt(exactRows.length) : null;
    const dailyQuaiSubsidy =
      avgDailyMinedWei == null ? null : weiToFloat(avgDailyMinedWei, 2);

    const burnStart = rollups?.[0]?.burnClose ?? null;
    const burnEnd = rollups?.[rollups.length - 1]?.burnClose ?? null;
    const burnInWindowWei =
      burnStart != null && burnEnd != null ? burnEnd - burnStart : null;
    const soapOffset =
      burnInWindowWei != null && totalMinedWei > 0n
        ? (weiToFloat(burnInWindowWei, 2) / weiToFloat(totalMinedWei, 2)) * 100
        : null;

    const quotes = quoteById(powMarkets?.rows);
    const externalMetrics: PowNetworkMetric[] = POW_BENCHMARK_NETWORKS.map(
      (network) => {
        const quote = quotes.get(network.coinGeckoId);
        const dailySubsidy = dailySubsidyTokens(network);
        const priceUsd = quote?.usd ?? null;
        return {
          id: network.id,
          label: network.label,
          symbol: network.symbol,
          algorithm: network.algorithm,
          color: network.color,
          capacityTps: network.capacityTps,
          rewardNote: network.rewardNote,
          mergeMiningNote: network.mergeMiningNote,
          dailySubsidy,
          priceUsd,
          marketCapUsd: quote?.usdMarketCap ?? null,
          dailySecurityCostUsd:
            priceUsd == null ? null : dailySubsidy * priceUsd,
          lastUpdatedAt: quote?.lastUpdatedAt ?? null,
        };
      },
    );

    const quaiMetric: PowNetworkMetric = {
      id: "quai",
      label: "Quai",
      symbol: "QUAI",
      algorithm: "KawPoW, SHA, and Scrypt",
      color: "#e20101",
      capacityTps: QUAI_CAPACITY_TPS,
      rewardNote:
        "Average QUAI paid to miners per day for the days selected above.",
      mergeMiningNote:
        "SOAP turns merge-mined BCH/LTC/DOGE/RVN work into QUAI rewards and burn pressure.",
      dailySubsidy: dailyQuaiSubsidy,
      priceUsd: price?.price ?? null,
      marketCapUsd:
        circulatingQuai == null || price == null
          ? null
          : circulatingQuai * price.price,
      dailySecurityCostUsd:
        dailyQuaiSubsidy == null || price == null
          ? null
          : dailyQuaiSubsidy * price.price,
      lastUpdatedAt: null,
      isQuai: true,
    };

    const metrics = [quaiMetric, ...externalMetrics];
    const btcMetric = metrics.find((m) => m.symbol === "BTC") ?? null;
    const securityTotal = sumNullable(
      metrics.map((m) => m.dailySecurityCostUsd),
    );
    const marketCapTotal = sumNullable(metrics.map((m) => m.marketCapUsd));
    const quaiCost = quaiMetric.dailySecurityCostUsd;
    const btcCost = btcMetric?.dailySecurityCostUsd ?? null;
    const securityCostRatio =
      quaiCost != null && btcCost != null && btcCost > 0
        ? quaiCost / btcCost
        : null;
    const btcCostAdvantage =
      quaiCost != null && btcCost != null && quaiCost > 0
        ? btcCost / quaiCost
        : null;
    const savingsVsBtc =
      securityCostRatio == null ? null : (1 - securityCostRatio) * 100;
    const quaiBudgetShare =
      securityTotal != null && quaiCost != null && securityTotal > 0
        ? (quaiCost / securityTotal) * 100
        : null;
    const quaiMarketCapShare =
      marketCapTotal != null &&
      quaiMetric.marketCapUsd != null &&
      marketCapTotal > 0
        ? (quaiMetric.marketCapUsd / marketCapTotal) * 100
        : null;
    const quaiCostPerCapacityTx = costPerCapacityTransaction(
      quaiMetric.dailySecurityCostUsd,
      quaiMetric.capacityTps,
    );
    const btcCostPerCapacityTx = btcMetric
      ? costPerCapacityTransaction(
          btcMetric.dailySecurityCostUsd,
          btcMetric.capacityTps,
        )
      : null;
    const capacityEfficiencyRatio =
      quaiCostPerCapacityTx != null &&
      btcCostPerCapacityTx != null &&
      btcCostPerCapacityTx > 0
        ? quaiCostPerCapacityTx / btcCostPerCapacityTx
        : null;

    return {
      metrics,
      externalMetrics,
      quaiMetric,
      btcMetric,
      price,
      latestSupply,
      exactRows,
      totalMinedWei,
      burnInWindowWei,
      securityTotal,
      marketCapTotal,
      securityCostRatio,
      btcCostAdvantage,
      savingsVsBtc,
      quaiBudgetShare,
      quaiMarketCapShare,
      quaiCostPerCapacityTx,
      btcCostPerCapacityTx,
      capacityEfficiencyRatio,
      soapOffset,
    };
  }, [qiMarket, supply, rollups, powMarkets]);

  const securityCostHistory = useMemo(() => {
    const rowsByDate = new Map<
      string,
      { date: string; [key: string]: string | number | null }
    >();
    const ensureRow = (date: string) => {
      const existing = rowsByDate.get(date);
      if (existing) return existing;
      const next: { date: string; [key: string]: string | number | null } = {
        date,
      };
      rowsByDate.set(date, next);
      return next;
    };

    const histories = historyById(powMarketHistory?.rows);
    const quotes = quoteById(powMarkets?.rows);
    const fallbackDates = dateRangeIso(from, to);
    for (const network of POW_BENCHMARK_NETWORKS) {
      const historyRows = histories.get(network.coinGeckoId) ?? [];
      if (historyRows.length === 0) {
        const fallbackPrice = quotes.get(network.coinGeckoId)?.usd ?? null;
        if (fallbackPrice != null) {
          for (const date of fallbackDates) {
            const subsidy = dailySubsidyTokens(network, date);
            ensureRow(date)[network.symbol] = subsidy * fallbackPrice;
          }
        }
        continue;
      }
      for (const row of historyRows) {
        if (row.priceUsd == null) continue;
        const subsidy = dailySubsidyTokens(network, row.date);
        ensureRow(row.date)[network.symbol] = subsidy * row.priceUsd;
      }
    }

    const quaiPrices = priceByDate(qiMarket);
    for (const row of rollups ?? []) {
      const price = quaiPrices.get(row.periodStart);
      if (
        price == null ||
        row.blockCount === 0 ||
        row.coinbaseRewardIndexedCount < row.blockCount ||
        row.coinbaseQuaiLockedRewardSum <= 0n
      ) {
        continue;
      }
      ensureRow(row.periodStart).QUAI =
        weiToFloat(row.coinbaseQuaiLockedRewardSum, 2) * price;
    }

    return [...rowsByDate.values()]
      .filter((row) =>
        Object.entries(row).some(([key, value]) => key !== "date" && value != null),
      )
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [powMarketHistory, powMarkets, from, to, qiMarket, rollups]);

  const loading = rollupsLoading || powMarketsLoading || qiMarketLoading;

  return (
    <main className="mx-auto max-w-[1400px] px-3 py-4 sm:px-4 sm:py-6 md:px-8 md:py-10">
      <div className="mb-4 sm:mb-5">
        <PowHero derived={derived} loading={loading} timeframe={timeframe} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-start gap-2 sm:justify-end">
        <span className="text-[0.7rem] uppercase tracking-wider text-slate-900/55 dark:text-white/55">
          Days averaged
        </span>
        <TimeframeToggle
          value={timeframe}
          onChange={setTimeframe}
          options={WINDOW_OPTIONS}
        />
      </div>

      <div className="fade-in-stagger space-y-4 sm:space-y-6">
        <SecurityBudgetLineChart
          metrics={derived.metrics}
          data={securityCostHistory}
          isLoading={rollupsLoading || qiMarketLoading || powMarketHistoryLoading}
          error={powMarketHistoryError}
          historyErrors={powMarketHistory?.errors ?? []}
        />

        <SecurityCostsTable
          metrics={derived.metrics}
          btc={derived.btcMetric}
          securityTotal={derived.securityTotal}
        />

        <SoapUmbrellaCard
          externalMetrics={derived.externalMetrics}
          quai={derived.quaiMetric}
        />

        <CapacityPerDollarChart metrics={derived.metrics} isLoading={loading} />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <PowEfficiencyCard
            quai={derived.quaiMetric}
            btc={derived.btcMetric}
            ratio={derived.capacityEfficiencyRatio}
          />
          <SoapOffsetCard derived={derived} from={from} to={to} />
          <MarketShareCard
            quai={derived.quaiMetric}
            securityShare={derived.quaiBudgetShare}
            marketCapShare={derived.quaiMarketCapShare}
            securityTotal={derived.securityTotal}
            marketCapTotal={derived.marketCapTotal}
          />
        </div>

        <SoapMiningChart to={to} />

        <AssumptionsCard
          externalMetrics={derived.externalMetrics}
          price={derived.price}
          powMarketsFetchedAt={powMarkets?.fetchedAt ?? null}
          powMarketsError={powMarketsError}
        />
      </div>
    </main>
  );
}

function PowHero({
  derived,
  loading,
  timeframe,
}: {
  derived: Derived;
  loading: boolean;
  timeframe: Timeframe;
}) {
  const capacitySavings =
    derived.capacityEfficiencyRatio == null
      ? null
      : (1 - derived.capacityEfficiencyRatio) * 100;

  const securityRatio: HeroCard = {
    id: "security-ratio",
    label: "BTC cost multiple vs QUAI",
    value:
      derived.btcCostAdvantage == null
        ? "—"
        : `${ratio(derived.btcCostAdvantage)} higher`,
    sub: "How many times more BTC pays miners per day than QUAI.",
    loading,
    accent: "emerald",
  };

  const savings: HeroCard = {
    id: "savings",
    label: "Cost savings vs BTC",
    value: pct(derived.savingsVsBtc, 2),
    sub: "Reward-only security budget reduction.",
    loading,
    accent: "emerald",
  };

  const budgetShare: HeroCard = {
    id: "budget-share",
    label: "QUAI PoW budget share",
    value: pct(derived.quaiBudgetShare, 3),
    sub: "Share of tracked daily PoW reward spend.",
    loading,
    accent: "blue",
  };

  const marketShare: HeroCard = {
    id: "market-share",
    label: "QUAI market share",
    value: pct(derived.quaiMarketCapShare, 3),
    sub: "Share of tracked PoW market caps.",
    loading,
    accent: "purple",
  };

  const capacity: HeroCard = {
    id: "capacity-efficiency",
    label: "Capacity-cost efficiency",
    value:
      derived.capacityEfficiencyRatio == null
        ? "—"
        : `${ratio(derived.capacityEfficiencyRatio)} of BTC`,
    sub:
      capacitySavings == null
        ? "Security budget per capacity transaction."
        : `${pct(capacitySavings, 2)} lower cost per capacity transaction.`,
    loading,
    accent: "amber",
  };

  const soap: HeroCard = {
    id: "soap-offset",
    label: `SOAP offset · ${timeframe}`,
    value: pct(derived.soapOffset, 1),
    sub: "Window burn divided by exact mined QUAI.",
    loading,
    accent: "orange",
  };

  const price: HeroCard = {
    id: "quai-price",
    label: "QUAI price",
    value: usd(derived.quaiMetric.priceUsd),
    sub: derived.price
      ? `${derived.price.source.toUpperCase()} close · ${formatPeriodDate(
          derived.price.asOf,
        )}`
      : "Awaiting market price.",
    loading,
    accent: "slate",
  };

  const cards = [
    securityRatio,
    savings,
    budgetShare,
    marketShare,
    capacity,
    soap,
    price,
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      {cards.map((card) => (
        <CompactKpiCard key={card.id} card={card} />
      ))}
    </div>
  );
}

function CompactKpiCard({ card }: { card: HeroCard }) {
  const accent = card.accent ?? "slate";
  return (
    <div
      className={cn(
        "card min-w-0 border-l-4",
        KPI_ACCENT_BORDER[accent],
      )}
    >
      <div
        className={cn(
          "text-[0.65rem] font-semibold uppercase tracking-wider",
          KPI_ACCENT_LABEL[accent],
        )}
      >
        {card.label}
      </div>
      <div className="mt-1 min-w-0 text-lg font-medium leading-tight tracking-tight text-slate-900 dark:text-white">
        {card.loading ? (
          <div className="h-6 w-20 animate-pulse rounded bg-slate-900/5 dark:bg-white/5" />
        ) : (
          card.value
        )}
      </div>
      {card.sub && (
        <div className="mt-1 hidden text-xs leading-5 text-slate-900/50 dark:text-white/50 sm:block">
          {card.sub}
        </div>
      )}
    </div>
  );
}

function SecurityBudgetLineChart({
  metrics,
  data,
  isLoading,
  error,
  historyErrors,
}: {
  metrics: PowNetworkMetric[];
  data: Array<{ date: string; [key: string]: string | number | null }>;
  isLoading: boolean;
  error: unknown;
  historyErrors: { id: string; message: string }[];
}) {
  const compact = useCompactViewport();
  const [scaleMode, setScaleMode] = useState<SecurityScaleMode>("log");
  const [activeSymbols, setActiveSymbols] = useState<string[]>(() =>
    metrics.map((m) => m.symbol),
  );
  const activeSet = useMemo(() => new Set(activeSymbols), [activeSymbols]);
  const activeMetrics = metrics.filter((m) => activeSet.has(m.symbol));
  const yRange = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    for (const row of data) {
      for (const symbol of activeSymbols) {
        const value = row[symbol];
        if (typeof value === "number" && Number.isFinite(value)) {
          if (value > 0) min = Math.min(min, value);
          max = Math.max(max, value);
        }
      }
    }
    return {
      min: Number.isFinite(min) ? min : 0,
      max,
    };
  }, [activeSymbols, data]);
  const yDomainMax = yRange.max > 0 ? yRange.max * 1.08 : 1;
  const yDomainMin =
    scaleMode === "log" && yRange.min > 0
      ? Math.max(yRange.min * 0.8, 0.000001)
      : 0;
  const yScale =
    scaleMode === "log" ? "log" : scaleMode === "sqrt" ? "sqrt" : "linear";

  const toggleSymbol = (symbol: string) => {
    setActiveSymbols((current) => {
      if (current.includes(symbol)) {
        return current.length === 1
          ? current
          : current.filter((s) => s !== symbol);
      }
      return [...current, symbol];
    });
  };

  return (
    <Card>
      <div className="chart-card-header">
        <CardTitle>Daily security cost by network</CardTitle>
        <InfoPopover label="About security cost">
          <p>
            This card uses reward-only miner revenue as a security-budget
            proxy: daily subsidy multiplied by each day's USD close. Fees are
            excluded for consistency across networks. Log scale shows smaller
            networks like QUAI; linear scale preserves raw distance.
          </p>
          <p className="mt-2">
            QUAI uses each day's exact lockup-adjusted{" "}
            <code>CoinbaseType</code> rewards from the Quai rollup database.
            External chains use fixed subsidy assumptions and CoinGecko daily
            prices.
          </p>
        </InfoPopover>
      </div>

      <SecurityBudgetLegend
        metrics={metrics}
        activeSet={activeSet}
        onToggle={toggleSymbol}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[0.7rem] uppercase tracking-wider text-slate-900/55 dark:text-white/55">
          Scale
        </span>
        <div
          role="tablist"
          aria-label="Security cost scale"
          className="inline-flex items-center gap-0.5 rounded-md border border-slate-900/10 p-0.5 dark:border-white/10"
        >
          {SECURITY_SCALE_OPTIONS.map((option) => {
            const active = option.value === scaleMode;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setScaleMode(option.value)}
                className={cn(
                  "rounded px-2 py-0.5 text-xs transition",
                  active
                    ? "bg-slate-900/10 text-slate-900 dark:bg-white/15 dark:text-white"
                    : "text-slate-700 hover:text-slate-900 dark:text-white/60 dark:hover:text-white/90",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="chart-shell">
        {isLoading ? (
          <ChartSkeleton />
        ) : error != null ? (
          <div className="text-sm text-quai-600 dark:text-quai-400">
            {String(error)}
          </div>
        ) : data.length === 0 ? (
          <div className="text-sm text-slate-900/50 dark:text-white/50">
            Awaiting historical market data.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                stroke="var(--chart-grid-soft)"
                strokeDasharray="2 4"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickFormatter={formatPeriodDate}
                tickLine={false}
                axisLine={false}
                minTickGap={compact ? 72 : 48}
              />
              <YAxis
                scale={yScale}
                domain={[yDomainMin, yDomainMax]}
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickFormatter={(v) => usd(Number(v), true)}
                tickLine={false}
                axisLine={false}
                width={compact ? 56 : 72}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    labelFormatter={(v) => formatPeriodDate(String(v))}
                    formatter={(v, name) => [
                      usd(Number(v), true),
                      name,
                    ]}
                  />
                }
              />
              {activeMetrics.map((m) => (
                <Line
                  key={m.symbol}
                  type="monotone"
                  dataKey={m.symbol}
                  name={m.label}
                  stroke={m.color}
                  strokeWidth={m.isQuai ? 2 : 1.5}
                  dot={false}
                  connectNulls
                  isAnimationActive
                  animationDuration={500}
                  animationEasing="ease-out"
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <p className="mt-4 text-xs leading-5 text-slate-900/50 dark:text-white/50">
        Reward-only security cost equals daily subsidy times USD close. Click a
        label to hide or show that network; the y-axis recalculates from the
        visible lines and selected scale.
        {historyErrors.length > 0
          ? " Some historical series are temporarily using latest-price fallback because CoinGecko rate-limited the range endpoint."
          : ""}
      </p>
    </Card>
  );
}

function SecurityBudgetLegend({
  metrics,
  activeSet,
  onToggle,
}: {
  metrics: PowNetworkMetric[];
  activeSet: Set<string>;
  onToggle: (symbol: string) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-1 sm:gap-1.5">
      {metrics.map((m) => {
        const active = activeSet.has(m.symbol);
        return (
          <button
            key={m.symbol}
            type="button"
            onClick={() => onToggle(m.symbol)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-1.5 py-0.5 text-[0.68rem] transition sm:px-2 sm:text-xs",
              active
                ? "border-slate-900/10 bg-slate-900/[0.04] text-slate-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/75"
                : "border-slate-900/5 bg-transparent text-slate-900/35 line-through decoration-slate-900/35 dark:border-white/5 dark:text-white/35 dark:decoration-white/35",
            )}
          >
            <span
              aria-hidden
              className="inline-block h-2 w-2 shrink-0 rounded-sm"
              style={{
                background: m.color,
                opacity: active ? 1 : 0.35,
              }}
            />
            <span>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SecurityCostsTable({
  metrics,
  btc,
  securityTotal,
}: {
  metrics: PowNetworkMetric[];
  btc: PowNetworkMetric | null;
  securityTotal: number | null;
}) {
  const rows = [...metrics].sort(
    (a, b) => (b.dailySecurityCostUsd ?? -1) - (a.dailySecurityCostUsd ?? -1),
  );
  const btcCost = btc?.dailySecurityCostUsd ?? null;

  return (
    <Card>
      <div className="chart-card-header">
        <CardTitle>Tracked PoW security-cost table</CardTitle>
        <InfoPopover label="About this table">
          <p>
            Daily security cost is a comparable reward-spend metric, not a full
            miner P&amp;L model. It intentionally excludes transaction fees,
            hardware depreciation, pool fees, and retained miner margin.
          </p>
          <p className="mt-2">
            Throughput is the capacity assumption used by the capacity-cost
            comparison below. It is not observed daily utilization.
          </p>
        </InfoPopover>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-[1200px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-900/10 text-xs uppercase tracking-wider text-slate-900/50 dark:border-white/10 dark:text-white/45">
              <th className="py-2 pr-4 font-normal">Network</th>
              <th className="py-2 pr-4 font-normal">Throughput</th>
              <th className="py-2 pr-4 font-normal">Daily security cost</th>
              <th className="py-2 pr-4 font-normal">Annualized spend</th>
              <th className="py-2 pr-4 font-normal">Subsidy/day</th>
              <th className="py-2 pr-4 font-normal">Price</th>
              <th className="py-2 pr-4 font-normal">Ratio vs BTC</th>
              <th className="py-2 pr-4 font-normal">Budget share</th>
              <th className="py-2 pr-4 font-normal">Market cap</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-900/5 dark:divide-white/10">
            {rows.map((m) => {
              const ratioVsBtc =
                btcCost != null &&
                m.dailySecurityCostUsd != null &&
                btcCost > 0
                  ? m.dailySecurityCostUsd / btcCost
                  : null;
              const budgetShare =
                securityTotal != null &&
                m.dailySecurityCostUsd != null &&
                securityTotal > 0
                  ? (m.dailySecurityCostUsd / securityTotal) * 100
                  : null;
              const annualSpend = annualizedSecuritySpendUsd(m);
              return (
                <tr
                  key={m.id}
                  className={cn(
                    "align-top",
                    m.isQuai &&
                      "bg-quai-500/[0.035] dark:bg-quai-500/[0.08]",
                  )}
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: m.color }}
                      />
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white">
                          {m.label}
                        </div>
                        <div className="text-xs text-slate-900/45 dark:text-white/45">
                          {m.symbol} · {m.algorithm}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4 font-mono">
                    <span
                      className={cn(
                        "inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-xs",
                        m.isQuai
                          ? "border-quai-500/40 bg-quai-500/[0.08] font-semibold text-quai-600 dark:border-quai-400/40 dark:bg-quai-400/[0.10] dark:text-quai-300"
                          : "border-transparent text-slate-900/75 dark:text-white/70",
                      )}
                    >
                      {m.capacityTps.toLocaleString()} TPS
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-mono">
                    {usd(m.dailySecurityCostUsd, true)}
                  </td>
                  <td className="py-3 pr-4 font-mono">
                    {usd(annualSpend, true)}
                  </td>
                  <td className="py-3 pr-4 font-mono">
                    {tokenAmount(m.dailySubsidy, m.symbol)}
                  </td>
                  <td className="py-3 pr-4 font-mono">{usd(m.priceUsd)}</td>
                  <td className="py-3 pr-4 font-mono">{ratio(ratioVsBtc)}</td>
                  <td className="py-3 pr-4 font-mono">
                    {pct(budgetShare, 3)}
                  </td>
                  <td className="py-3 pr-4 font-mono">
                    {usd(m.marketCapUsd, true)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

type CapacityPerDollarRow = {
  label: string;
  symbol: string;
  value: number;
  isQuai: boolean;
};

function CapacityPerDollarChart({
  metrics,
  isLoading,
}: {
  metrics: PowNetworkMetric[];
  isLoading: boolean;
}) {
  const compact = useCompactViewport();
  const rows = useMemo(() => {
    const out: CapacityPerDollarRow[] = [];
    for (const m of metrics) {
      const value = capacityTxPerSecurityDollar(m);
      if (value == null) continue;
      out.push({
        label: m.label,
        symbol: m.symbol,
        value,
        isQuai: m.isQuai === true,
      });
    }
    return out.sort((a, b) => b.value - a.value);
  }, [metrics]);

  const quaiRow = rows.find((r) => r.isQuai) ?? null;
  const bestOther = rows.find((r) => !r.isQuai) ?? null;
  const leadMultiple =
    quaiRow != null && bestOther != null && bestOther.value > 0
      ? quaiRow.value / bestOther.value
      : null;

  return (
    <Card>
      <div className="chart-card-header">
        <CardTitle>Transactions supported per $1 paid to miners</CardTitle>
        <InfoPopover label="About transactions per miner dollar">
          <p>
            This compares how much maximum transaction capacity each network
            gets for the money it pays miners each day. It divides capacity
            transactions per day by daily miner rewards in USD.
          </p>
          <p className="mt-2">
            Uses each network's capacity assumption (see the assumptions table
            below), not observed daily utilization.
          </p>
        </InfoPopover>
      </div>

      <div className="mt-3" style={{ height: rows.length > 0 ? rows.length * 40 + 40 : 280 }}>
        {isLoading ? (
          <ChartSkeleton />
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-900/50 dark:text-white/50">
            Awaiting price and reward data.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 4, right: compact ? 64 : 88, left: 8, bottom: 0 }}
            >
              <CartesianGrid
                stroke="var(--chart-grid-soft)"
                strokeDasharray="2 4"
                horizontal={false}
              />
              <XAxis
                type="number"
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickFormatter={(v) => formatCompact(Number(v))}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={compact ? 76 : 100}
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: "var(--chart-grid-soft)" }}
                content={
                  <ChartTooltip
                    formatter={(v, name) => [
                      formatTxPerDollar(Number(v)),
                      name,
                    ]}
                  />
                }
              />
              <Bar
                dataKey="value"
                name="Transactions supported per $1 paid to miners"
                barSize={18}
                radius={[0, 4, 4, 0]}
                isAnimationActive
                animationDuration={500}
                animationEasing="ease-out"
              >
                {rows.map((r) => (
                  <Cell
                    key={r.symbol}
                    fill={r.isQuai ? "#e20101" : "var(--chart-axis-muted)"}
                  />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  fill="var(--chart-axis)"
                  fontSize={11}
                  formatter={(v) => formatTxPerDollar(Number(v))}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {leadMultiple != null && (
        <div className="mt-3 rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-sm text-slate-900/70 dark:text-white/70">
          At current rewards and prices, $1 paid to miners supports{" "}
          <span className="font-mono text-emerald-700 dark:text-emerald-300">
            {formatMultiple(leadMultiple)}
          </span>{" "}
          more transaction capacity on QUAI than on {bestOther?.label}, the
          next-most efficient tracked network.
        </div>
      )}

      <p className="mt-4 text-xs leading-5 text-slate-900/50 dark:text-white/50">
        This is a capacity-efficiency view, not observed traffic. Linear scale
        is intentional; every bar is labeled because the gap is too large for
        most non-QUAI bars to stay visually prominent.
      </p>
    </Card>
  );
}

const SOAP_UMBRELLA_ORDER = ["BCH", "LTC", "DOGE", "RVN"] as const;

function SoapUmbrellaCard({
  externalMetrics,
  quai,
  className,
}: {
  externalMetrics: PowNetworkMetric[];
  quai: PowNetworkMetric;
  className?: string;
}) {
  const bySymbol = new Map(externalMetrics.map((m) => [m.symbol, m]));
  const btc = bySymbol.get("BTC") ?? null;
  const bch = bySymbol.get("BCH") ?? null;
  const segments = SOAP_UMBRELLA_ORDER.map((symbol) => bySymbol.get(symbol))
    .filter(
      (m): m is PowNetworkMetric =>
        m != null &&
        m.mergeMiningNote != null &&
        m.dailySecurityCostUsd != null,
    );
  const total = sumNullable(segments.map((m) => m.dailySecurityCostUsd));
  const quaiCost = quai.dailySecurityCostUsd;
  const multiple =
    total != null && quaiCost != null && quaiCost > 0
      ? total / quaiCost
      : null;
  const bchCost = bch?.dailySecurityCostUsd ?? null;
  const btcCost = btc?.dailySecurityCostUsd ?? null;
  const addressableWithoutBch =
    total != null && bchCost != null ? total - bchCost : null;
  const bchLiftPct =
    bchCost != null && addressableWithoutBch != null && addressableWithoutBch > 0
      ? (bchCost / addressableWithoutBch) * 100
      : null;
  const bchMultiple =
    bchCost != null && quaiCost != null && quaiCost > 0
      ? bchCost / quaiCost
      : null;

  return (
    <Card className={className}>
      <div className="chart-card-header">
        <CardTitle>SOAP-addressable security if SHA uses BCH</CardTitle>
        <InfoPopover label="About the umbrella">
          <p>
            BTC stays in the table as the main security-cost benchmark. This
            panel shows the tracked miner reward spend that can actually become
            SOAP-addressable: BCH for SHA, LTC and DOGE for Scrypt, and RVN for
            KawPoW.
          </p>
          <p className="mt-2">
            It measures the addressable pool of merge-mineable work, not spend
            currently securing Quai.
          </p>
        </InfoPopover>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <SoapStoryStat
          label="SOAP-addressable rewards"
          value={`${usd(total, true)}/day`}
          detail="BCH + LTC + DOGE + RVN miner rewards."
          tone="quai"
        />
        <SoapStoryStat
          label="Added by using BCH for SHA"
          value={`${usd(bchCost, true)}/day`}
          detail={
            bchLiftPct == null
              ? "Awaiting BCH market data."
              : `${pct(bchLiftPct, 1)} more than Scrypt + KawPoW alone.`
          }
          tone="emerald"
        />
        <SoapStoryStat
          label="Compared with QUAI direct spend"
          value={formatMultiple(multiple)}
          detail={
            bchMultiple == null
              ? "Awaiting QUAI or BCH reward data."
              : `BCH alone is ${formatMultiple(bchMultiple)} QUAI direct spend.`
          }
        />
      </div>

      <div className="mt-4 rounded-md border border-quai-500/20 bg-quai-500/[0.05] px-3 py-2 text-sm leading-6 text-slate-900/70 dark:text-white/70">
        <p>
          The BTC row shows the benchmark security budget, but BTC contributes{" "}
          <span className="font-mono">$0/day</span> to this SOAP-addressable
          pool. If the SHA leg is framed around BCH instead,{" "}
          <span className="font-mono text-quai-600 dark:text-quai-400">
            {usd(bchCost, true)}/day
          </span>{" "}
          of SHA miner rewards becomes part of the addressable story.
        </p>
        <p className="mt-2 text-xs text-slate-900/50 dark:text-white/50">
          BTC daily rewards are still shown in the table as{" "}
          <span className="font-mono">{usd(btcCost, true)}/day</span>, but this
          panel counts only tracked algorithms with a SOAP route.
        </p>
      </div>

      {total != null && addressableWithoutBch != null && (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-md border border-slate-900/10 p-3 dark:border-white/10">
            <div className="text-xs uppercase tracking-wider text-slate-900/45 dark:text-white/45">
              Without BCH SHA route
            </div>
            <div className="mt-1 font-mono text-lg text-slate-900 dark:text-white">
              {usd(addressableWithoutBch, true)}/day
            </div>
          </div>
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
            <div className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              With BCH SHA route
            </div>
            <div className="mt-1 font-mono text-lg text-slate-900 dark:text-white">
              {usd(total, true)}/day
            </div>
          </div>
        </div>
      )}

      {segments.length > 0 && total != null && total > 0 && (
        <>
          <div className="mt-4 flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
            {segments.map((m) => (
              <div
                key={m.symbol}
                style={{
                  width: `${((m.dailySecurityCostUsd ?? 0) / total) * 100}%`,
                  background: m.color,
                }}
              />
            ))}
          </div>

          <div className="mt-3 grid gap-1.5 md:grid-cols-2">
            {segments.map((m) => {
              const share =
                m.dailySecurityCostUsd == null
                  ? null
                  : (m.dailySecurityCostUsd / total) * 100;
              return (
                <div
                  key={m.symbol}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="flex items-center gap-2 text-slate-900/70 dark:text-white/65">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-sm"
                      style={{ background: m.color }}
                    />
                    {m.label}
                  </span>
                  <span className="font-mono text-slate-900 dark:text-white">
                    {usd(m.dailySecurityCostUsd, true)}
                    <span className="ml-2 text-xs text-slate-900/45 dark:text-white/45">
                      {pct(share, 1)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

function SoapStoryStat({
  label,
  value,
  detail,
  tone = "slate",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "quai" | "emerald" | "slate";
}) {
  return (
    <div
      className={cn(
        "rounded-md border p-3",
        tone === "quai" &&
          "border-quai-500/20 bg-quai-500/[0.05] dark:border-quai-400/20",
        tone === "emerald" &&
          "border-emerald-500/20 bg-emerald-500/[0.05] dark:border-emerald-400/20",
        tone === "slate" && "border-slate-900/10 dark:border-white/10",
      )}
    >
      <div className="text-xs uppercase tracking-wider text-slate-900/45 dark:text-white/45">
        {label}
      </div>
      <div className="mt-1 font-mono text-lg text-slate-900 dark:text-white">
        {value}
      </div>
      <div className="mt-1 text-xs leading-5 text-slate-900/55 dark:text-white/55">
        {detail}
      </div>
    </div>
  );
}

function PowEfficiencyCard({
  quai,
  btc,
  ratio: efficiencyRatio,
}: {
  quai: PowNetworkMetric;
  btc: PowNetworkMetric | null;
  ratio: number | null;
}) {
  const btcCost = btc
    ? costPerCapacityTransaction(btc.dailySecurityCostUsd, btc.capacityTps)
    : null;
  const quaiCost = costPerCapacityTransaction(
    quai.dailySecurityCostUsd,
    quai.capacityTps,
  );
  const btcKwh = btc
    ? energyCostEquivalentKwhPerTx(btc.dailySecurityCostUsd, btc.capacityTps)
    : null;
  const quaiKwh = energyCostEquivalentKwhPerTx(
    quai.dailySecurityCostUsd,
    quai.capacityTps,
  );
  const cheaper =
    efficiencyRatio == null ? null : 1 / Math.max(efficiencyRatio, 1e-12);

  return (
    <Card>
      <div className="chart-card-header">
        <CardTitle>Security cost per capacity transaction</CardTitle>
        <InfoPopover label="About capacity efficiency">
          <p>
            Capacity transaction cost divides daily security spend by assumed
            maximum transaction capacity, not by observed utilization.
          </p>
          <p className="mt-2">
            Energy-cost equivalent converts that cost through a shared{" "}
            {usd(SECURITY_ELECTRICITY_USD_PER_KWH)}/kWh electricity assumption,
            so the QUAI/BTC ratio is driven by security budget and scalability.
          </p>
        </InfoPopover>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CapacityNetworkPanel
          label="Bitcoin"
          symbol="BTC"
          color="#f7931a"
          tps={btc?.capacityTps ?? null}
          dailyTx={btc ? capacityTransactionsPerDay(btc.capacityTps) : null}
          costPerTx={btcCost}
          kwhPerTx={btcKwh}
        />
        <CapacityNetworkPanel
          label="Quai"
          symbol="QUAI"
          color="#e20101"
          tps={quai.capacityTps}
          dailyTx={capacityTransactionsPerDay(quai.capacityTps)}
          costPerTx={quaiCost}
          kwhPerTx={quaiKwh}
        />
      </div>

      <div className="mt-4 rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-sm text-slate-900/70 dark:text-white/70">
        {cheaper == null ? (
          "Awaiting price and reward data for the capacity comparison."
        ) : (
          <>
            QUAI is{" "}
            <span className="font-mono text-emerald-700 dark:text-emerald-300">
              {cheaper >= 1_000
                ? `${formatCompact(cheaper)}x`
                : `${cheaper.toFixed(1)}x`}
            </span>{" "}
            lower cost per capacity transaction than BTC under this model.
          </>
        )}
      </div>
    </Card>
  );
}

function CapacityNetworkPanel({
  label,
  symbol,
  color,
  tps,
  dailyTx,
  costPerTx,
  kwhPerTx,
}: {
  label: string;
  symbol: string;
  color: string;
  tps: number | null;
  dailyTx: number | null;
  costPerTx: number | null;
  kwhPerTx: number | null;
}) {
  return (
    <div className="rounded-md border border-slate-900/10 p-3 dark:border-white/10">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="font-medium text-slate-900 dark:text-white">
            {label}
          </span>
        </div>
        <span className="font-mono text-xs text-slate-900/45 dark:text-white/45">
          {symbol}
        </span>
      </div>
      <dl className="mt-3 grid gap-2 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-900/55 dark:text-white/50">Capacity</dt>
          <dd className="font-mono text-slate-900 dark:text-white">
            {tps == null ? "—" : `${tps.toLocaleString()} TPS`}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-900/55 dark:text-white/50">Tx/day</dt>
          <dd className="font-mono text-slate-900 dark:text-white">
            {dailyTx == null ? "—" : formatCompact(dailyTx)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-900/55 dark:text-white/50">Cost/tx</dt>
          <dd className="font-mono text-slate-900 dark:text-white">
            {usd(costPerTx)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-900/55 dark:text-white/50">
            kWh/tx eq.
          </dt>
          <dd className="font-mono text-slate-900 dark:text-white">
            {kwhPerTx == null
              ? "—"
              : kwhPerTx < 0.001
                ? "<0.001"
                : kwhPerTx.toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function SoapOffsetCard({
  derived,
  from,
  to,
}: {
  derived: Derived;
  from: string;
  to: string;
}) {
  const mined = weiToFloat(derived.totalMinedWei, 0);
  const burn =
    derived.burnInWindowWei == null
      ? null
      : weiToFloat(derived.burnInWindowWei, 0);
  const net = burn == null ? null : mined - burn;

  return (
    <Card>
      <div className="chart-card-header">
        <CardTitle>SOAP offset summary</CardTitle>
        <InfoPopover label="About SOAP offset">
          <p>
            Mined QUAI uses exact lockup-adjusted coinbase rewards for fully
            indexed days only. Burn uses the authoritative{" "}
            <code>burn_close</code> window delta.
          </p>
        </InfoPopover>
      </div>

      <p className="mt-2 text-xs uppercase tracking-wider text-slate-900/50 dark:text-white/50">
        {formatPeriodDate(from)} to {formatPeriodDate(to)}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SoapStat label="Mined" value={tokenAmount(mined, "QUAI")} />
        <SoapStat
          label="Burned"
          value={burn == null ? "—" : tokenAmount(burn, "QUAI")}
          tone="orange"
        />
        <SoapStat
          label="Mined minus burned"
          value={net == null ? "—" : tokenAmount(net, "QUAI")}
          tone={net != null && net <= 0 ? "emerald" : "slate"}
        />
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-900/5 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-amber-400"
          style={{
            width: `${Math.max(
              0,
              Math.min(100, derived.soapOffset ?? 0),
            )}%`,
          }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-900/50 dark:text-white/50">
        <span>Burn offset</span>
        <span className="font-mono">{pct(derived.soapOffset, 1)}</span>
      </div>
    </Card>
  );
}

function SoapStat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "orange" | "emerald" | "slate";
}) {
  return (
    <div className="rounded-md border border-slate-900/10 p-3 dark:border-white/10">
      <div className="text-[0.65rem] uppercase tracking-wider text-slate-900/50 dark:text-white/45">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-base text-slate-900 dark:text-white",
          tone === "orange" && "text-amber-700 dark:text-amber-300",
          tone === "emerald" && "text-emerald-700 dark:text-emerald-300",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function MarketShareCard({
  quai,
  securityShare,
  marketCapShare,
  securityTotal,
  marketCapTotal,
}: {
  quai: PowNetworkMetric;
  securityShare: number | null;
  marketCapShare: number | null;
  securityTotal: number | null;
  marketCapTotal: number | null;
}) {
  return (
    <Card>
      <div className="chart-card-header">
        <CardTitle>QUAI share of tracked PoW</CardTitle>
        <InfoPopover label="About tracked share">
          <p>
            Shares are computed only over the networks shown on this page:
            QUAI, BTC, LTC, BCH, DOGE, RVN, and KAS.
          </p>
        </InfoPopover>
      </div>

      <div className="mt-4 grid gap-4">
        <ShareRow
          label="Daily security budget share"
          value={securityShare}
          total={usd(securityTotal, true)}
        />
        <ShareRow
          label="Market cap share"
          value={marketCapShare}
          total={usd(marketCapTotal, true)}
        />
      </div>

      <div className="mt-4 rounded-md border border-quai-500/20 bg-quai-500/[0.05] px-3 py-2 text-sm text-slate-900/70 dark:text-white/70">
        QUAI daily security spend:{" "}
        <span className="font-mono text-quai-600 dark:text-quai-400">
          {usd(quai.dailySecurityCostUsd, true)}
        </span>{" "}
        from{" "}
        <span className="font-mono text-quai-600 dark:text-quai-400">
          {tokenAmount(quai.dailySubsidy, "QUAI")}
        </span>{" "}
        average daily rewards.
      </div>
    </Card>
  );
}

function ShareRow({
  label,
  value,
  total,
}: {
  label: string;
  value: number | null;
  total: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-slate-900/70 dark:text-white/65">{label}</span>
        <span className="font-mono text-slate-900 dark:text-white">
          {pct(value, 3)}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-900/5 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-quai-500"
          style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-slate-900/45 dark:text-white/45">
        Tracked total: <span className="font-mono">{total}</span>
      </div>
    </div>
  );
}

function AssumptionsCard({
  externalMetrics,
  price,
  powMarketsFetchedAt,
  powMarketsError,
}: {
  externalMetrics: PowNetworkMetric[];
  price: ReturnType<typeof latestQuaiPrice>;
  powMarketsFetchedAt: string | null;
  powMarketsError: unknown;
}) {
  return (
    <Card>
      <div className="chart-card-header">
        <CardTitle>Model assumptions and price freshness</CardTitle>
        <InfoPopover label="About sources">
          <p>
            External prices and market caps come from CoinGecko's simple price
            endpoint. QUAI price comes from the dashboard's daily MEXC market
            rows. QUAI rewards, burn, and supply come from Quai rollups.
          </p>
        </InfoPopover>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-md border border-slate-900/10 p-3 text-sm dark:border-white/10">
          <div className="text-xs uppercase tracking-wider text-slate-900/50 dark:text-white/45">
            Freshness
          </div>
          <dl className="mt-3 grid gap-2">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-900/55 dark:text-white/50">
                External markets
              </dt>
              <dd className="font-mono text-slate-900 dark:text-white">
                {powMarketsFetchedAt
                  ? new Date(powMarketsFetchedAt).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : powMarketsError
                    ? "unavailable"
                    : "loading"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-900/55 dark:text-white/50">
                QUAI price
              </dt>
              <dd className="font-mono text-slate-900 dark:text-white">
                {price ? formatPeriodDate(price.asOf) : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-900/55 dark:text-white/50">
                Electricity assumption
              </dt>
              <dd className="font-mono text-slate-900 dark:text-white">
                {usd(SECURITY_ELECTRICITY_USD_PER_KWH)}/kWh
              </dd>
            </div>
          </dl>
          {powMarketsError != null && (
            <p className="mt-3 text-xs leading-5 text-quai-600 dark:text-quai-400">
              External market feed error: {String(powMarketsError)}
            </p>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-900/10 text-xs uppercase tracking-wider text-slate-900/50 dark:border-white/10 dark:text-white/45">
                <th className="py-2 pr-4 font-normal">Network</th>
                <th className="py-2 pr-4 font-normal">Reward model</th>
                <th className="py-2 pr-4 font-normal">Capacity model</th>
                <th className="py-2 pr-4 font-normal">Last price update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/5 dark:divide-white/10">
              {externalMetrics.map((m) => (
                <tr key={m.id}>
                  <td className="py-3 pr-4">
                    <div className="font-medium text-slate-900 dark:text-white">
                      {m.label}
                    </div>
                    <div className="text-xs text-slate-900/45 dark:text-white/45">
                      {m.symbol} · {m.algorithm}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-slate-900/65 dark:text-white/60">
                    {m.rewardNote}
                  </td>
                  <td className="py-3 pr-4 font-mono">
                    {m.capacityTps.toLocaleString()} TPS
                  </td>
                  <td className="py-3 pr-4 font-mono">
                    {dateTimeFromUnix(m.lastUpdatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
