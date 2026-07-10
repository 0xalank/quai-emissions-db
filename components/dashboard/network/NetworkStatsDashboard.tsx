"use client";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { ChartLegend } from "@/components/ui/ChartLegend";
import { ChartSkeleton } from "@/components/ui/ChartSkeleton";
import { ChartTooltip } from "@/components/ui/ChartTooltip";
import { InfoPopover } from "@/components/ui/InfoPopover";
import { ProtocolEventLines } from "@/components/dashboard/shared/ProtocolEventLines";
import {
  TimeframeToggle,
  timeframeToFromIso,
  todayIso,
  type Timeframe,
} from "@/components/dashboard/shared/TimeframeToggle";
import { useCompactViewport, useNetworkStats } from "@/lib/hooks";
import {
  formatCompact,
  formatHashrate,
  formatPeriodDate,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { NetworkStatsRow } from "@/lib/quai/types";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const MAINNET_DATE = "2025-01-29";

type HardwareAlgo = "kawpow" | "sha" | "scrypt";

const HARDWARE_BASELINES: Array<{
  key: HardwareAlgo;
  label: string;
  shortLabel: string;
  machineLabel: string;
  unit: string;
  hashrateHps: number;
  color: string;
  getHashrate: (row: NetworkStatsRow) => bigint | null;
}> = [
  {
    key: "kawpow",
    label: "KawPoW GPU network",
    shortLabel: "KawPoW",
    machineLabel: "RTX 4090-class GPUs",
    unit: "GPUs",
    hashrateHps: 60_000_000, // 60 MH/s
    color: "#e20101",
    getHashrate: (row) => row.kawpowHashrateAvg,
  },
  {
    key: "sha",
    label: "SHA256 network",
    shortLabel: "SHA256",
    machineLabel: "Antminer S21-class miners",
    unit: "S21s",
    hashrateHps: 200_000_000_000_000, // 200 TH/s
    color: "#f59e0b",
    getHashrate: (row) => row.shaHashrateAvg,
  },
  {
    key: "scrypt",
    label: "Scrypt ASIC network",
    shortLabel: "Scrypt",
    machineLabel: "Antminer L9-class miners",
    unit: "L9s",
    hashrateHps: 16_000_000_000, // 16 GH/s
    color: "#ffffff",
    getHashrate: (row) => row.scryptHashrateAvg,
  },
];

const COLORS = {
  txs: "#2563eb",
  active: "#10b981",
  wallets: "#7c3aed",
  newWallets: "#14b8a6",
};

function machineEquivalent(hashrate: bigint | null, baselineHps: number): number | null {
  if (hashrate == null || hashrate <= 0n) return null;
  return Number(hashrate) / baselineHps;
}

function formatMachines(value: number | null | undefined, unit: string): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${formatCompact(value)} ${unit}`;
}

function latestRow(rows: NetworkStatsRow[] | undefined): NetworkStatsRow | null {
  if (!rows) return null;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].blockCount > 0) return rows[i];
  }
  return null;
}

function completeTrendRows(
  rows: NetworkStatsRow[] | undefined,
): NetworkStatsRow[] | undefined {
  if (!rows || rows.length <= 1) return rows;
  const latest = rows[rows.length - 1];
  return latest.partial ? rows.slice(0, -1) : rows;
}

function firstMeaningfulRow(
  rows: NetworkStatsRow[] | undefined,
  getter: (row: NetworkStatsRow) => number | null,
): NetworkStatsRow | null {
  for (const row of rows ?? []) {
    const value = getter(row);
    if (value != null && Number.isFinite(value) && value > 0) return row;
  }
  return rows?.[0] ?? null;
}

function pctChange(
  rows: NetworkStatsRow[] | undefined,
  getter: (row: NetworkStatsRow) => number | null,
): number | null {
  const latest = latestRow(rows);
  const first = firstMeaningfulRow(rows, getter);
  if (!latest || !first) return null;
  const start = getter(first);
  const end = getter(latest);
  if (
    start == null ||
    end == null ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start <= 0
  ) {
    return null;
  }
  return ((end - start) / start) * 100;
}

function formatGrowth(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${sign}${value.toFixed(decimals)}%`;
}

function GrowthBadge({ value }: { value: number | null }) {
  const positive = value != null && value >= 0;
  return (
    <span
      className={cn(
        "shrink-0 rounded border px-1.5 py-0.5 text-[0.68rem] font-semibold tabular-nums",
        value == null
          ? "border-slate-900/10 text-slate-900/35 dark:border-white/10 dark:text-white/35"
          : positive
            ? "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300"
            : "border-red-500/25 bg-red-500/[0.08] text-red-700 dark:text-red-300",
      )}
    >
      {formatGrowth(value)}
    </span>
  );
}

function KpiStrip({ rows }: { rows: NetworkStatsRow[] | undefined }) {
  const latest = latestRow(rows);
  const items = [
    ...HARDWARE_BASELINES.map((algo) => {
      const hashrate = latest ? algo.getHashrate(latest) : null;
      return {
        label: algo.shortLabel,
        value: formatMachines(
          machineEquivalent(hashrate, algo.hashrateHps),
          algo.unit,
        ),
        detail:
          hashrate == null
            ? "awaiting mining samples"
            : formatHashrate(hashrate),
        growth: pctChange(rows, (row) => {
          const value = algo.getHashrate(row);
          return value == null ? null : Number(value);
        }),
      };
    }),
    {
      label: "Daily txs",
      value: latest ? latest.txCount.toLocaleString() : "-",
      detail: latest ? formatPeriodDate(latest.periodStart) : "awaiting rows",
      growth: pctChange(rows, (row) => row.txCount),
    },
    {
      label: "Active addresses",
      value: latest ? latest.activeAddresses.toLocaleString() : "-",
      detail: "daily unique senders/recipients",
      growth: pctChange(rows, (row) => row.activeAddresses),
    },
    {
      label: "Wallet growth",
      value: latest ? latest.cumulativeAddresses.toLocaleString() : "-",
      detail: "first-seen addresses indexed",
      growth: pctChange(rows, (row) => row.cumulativeAddresses),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <Card key={item.label} className="min-h-[112px]">
          <div className="flex items-start justify-between gap-2">
            <div className="text-[0.7rem] uppercase tracking-wider text-slate-900/50 dark:text-white/50">
              {item.label}
            </div>
            <GrowthBadge value={item.growth} />
          </div>
          <div className="mt-2 min-w-0 text-2xl font-medium leading-tight tracking-tight text-slate-950 dark:text-white">
            {item.value}
          </div>
          <div className="mt-1 text-xs text-slate-900/55 dark:text-white/55">
            {item.detail}
          </div>
        </Card>
      ))}
    </div>
  );
}

export function NetworkStatsDashboard() {
  const [tf, setTf] = useState<Timeframe>("90d");
  const from = timeframeToFromIso(tf) ?? MAINNET_DATE;
  const to = todayIso();
  const { data, isLoading, error } = useNetworkStats({ from, to });

  useEffect(() => {
    document.title = "Quai · Network";
  }, []);

  return (
    <main className="mx-auto max-w-[1400px] px-3 py-4 sm:px-4 sm:py-6 md:px-8 md:py-10">
      <div className="mb-4 flex flex-col gap-3 sm:mb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
            Network stats
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-900/65 dark:text-white/65">
            Daily transaction activity, active addresses, wallet growth, SOAP
            hashrate, and hardware-equivalent miner counts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.7rem] uppercase tracking-wider text-slate-900/55 dark:text-white/55">
            Range
          </span>
          <TimeframeToggle value={tf} onChange={setTf} />
        </div>
      </div>

      <div className="fade-in-stagger space-y-4 sm:space-y-6">
        <KpiStrip rows={data} />
        <HashrateTrendChart rows={data} loading={isLoading} error={error} from={from} to={to} />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ActivityTrendChart rows={data} loading={isLoading} error={error} from={from} to={to} />
          <WalletGrowthChart rows={data} loading={isLoading} error={error} from={from} to={to} />
        </div>
      </div>
    </main>
  );
}

function chartStatus({
  rows,
  loading,
  error,
}: {
  rows: NetworkStatsRow[] | undefined;
  loading: boolean;
  error: unknown;
}): ReactNode {
  if (loading || !rows) return <ChartSkeleton />;
  if (error) {
    return (
      <div className="text-sm text-quai-600 dark:text-quai-400">
        {String(error)}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="text-sm text-slate-900/50 dark:text-white/50">
        No network activity rows in this range.
      </div>
    );
  }
  return null;
}

function HashrateTrendChart({
  rows,
  loading,
  error,
  from,
  to,
}: {
  rows: NetworkStatsRow[] | undefined;
  loading: boolean;
  error: unknown;
  from: string;
  to: string;
}) {
  const compact = useCompactViewport();
  const trendRows = useMemo(() => completeTrendRows(rows), [rows]);
  const chartData = useMemo(
    () =>
      trendRows?.map((r) => ({
        date: r.periodStart,
        kawpow:
          r.kawpowHashrateAvg == null ? null : Number(r.kawpowHashrateAvg),
        sha: r.shaHashrateAvg == null ? null : Number(r.shaHashrateAvg),
        scrypt:
          r.scryptHashrateAvg == null ? null : Number(r.scryptHashrateAvg),
      })) ?? [],
    [trendRows],
  );
  const status = chartStatus({ rows, loading, error });
  const domains = useMemo(() => {
    const out: Record<HardwareAlgo, [number, number]> = {
      kawpow: [1, 1],
      sha: [1, 1],
      scrypt: [1, 1],
    };
    for (const algo of HARDWARE_BASELINES) {
      const values: number[] = [];
      for (const row of chartData) {
        const value = row[algo.key];
        if (typeof value === "number" && Number.isFinite(value) && value > 0) {
          values.push(value);
        }
      }
      if (values.length > 0) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        out[algo.key] =
          min === max ? [min * 0.9, max * 1.1] : [min * 0.8, max * 1.15];
      }
    }
    return out;
  }, [chartData]);

  const visibleAxisAlgo = useMemo(() => {
    const values: number[] = [];
    for (const row of chartData) {
      const value = row.sha;
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        values.push(value);
      }
    }
    return values.length > 0 ? "sha" : "kawpow";
  }, [chartData]);

  return (
    <Card>
      <div className="chart-card-header">
        <CardTitle>SOAP hashrate by algorithm</CardTitle>
        <InfoPopover label="About hardware equivalents">
          <p>
            The chart plots daily average hashrate for KawPoW, SHA256, and
            Scrypt together. Hover a point to see the approximate reference
            hardware count for that algorithm.
          </p>
          <p className="mt-2">
            Baselines are 60 MH/s RTX 4090-class GPUs for KawPoW, 200 TH/s
            Antminer S21-class miners for SHA256, and 16 GH/s Antminer L9-class
            miners for Scrypt.
          </p>
          <p className="mt-2">
            These are not counts of unique operators or physical devices; they
            are hardware-normalized views of merge-mined hashrate.
          </p>
        </InfoPopover>
      </div>
      <ChartLegend
        className="mt-3"
        items={HARDWARE_BASELINES.map((algo) => ({
          label: algo.shortLabel,
          color: algo.color,
          swatchClassName:
            algo.key === "scrypt"
              ? "ring-1 ring-slate-900/45 dark:ring-white/35"
              : undefined,
        }))}
      />
      <div className="mt-2 text-xs leading-5 text-slate-900/55 dark:text-white/55">
        Each line uses its own scale. Hover for hashrate and equivalent
        reference hardware.
      </div>
      <div className="chart-shell">
        {status ?? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--chart-grid-soft)" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "var(--chart-axis)", fontSize: 11 }} tickFormatter={formatPeriodDate} tickLine={false} axisLine={false} minTickGap={compact ? 64 : 32} />
              {HARDWARE_BASELINES.map((algo) => (
                <YAxis
                  key={algo.key}
                  yAxisId={algo.key}
                  scale="linear"
                  domain={domains[algo.key]}
                  hide={algo.key !== visibleAxisAlgo}
                  tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                  tickFormatter={(v) =>
                    formatHashrate(BigInt(Math.floor(Number(v))))
                  }
                  tickLine={false}
                  axisLine={false}
                  width={compact ? 54 : 78}
                />
              ))}
              <Tooltip
                content={
                  <ChartTooltip
                    labelFormatter={(v) => formatPeriodDate(String(v))}
                    formatter={(v, name) => {
                      const algo = HARDWARE_BASELINES.find(
                        (item) => item.shortLabel === name,
                      );
                      const numeric = Number(v);
                      const machines = algo
                        ? machineEquivalent(
                            BigInt(Math.floor(numeric)),
                            algo.hashrateHps,
                          )
                        : null;
                      return [
                        <span key="value" className="font-sans tabular-nums">
                          {formatHashrate(BigInt(Math.floor(numeric)))}
                          {algo ? ` (${formatMachines(machines, algo.unit)})` : ""}
                        </span>,
                        <span key="name" className="font-medium">
                          {name}
                        </span>,
                      ];
                    }}
                  />
                }
              />
              <ProtocolEventLines visibleFrom={from} visibleTo={to} />
              <Line
                yAxisId="scrypt"
                type="monotone"
                dataKey="scrypt"
                stroke="rgba(15, 23, 42, 0.72)"
                strokeWidth={4}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
                legendType="none"
                tooltipType="none"
              />
              {HARDWARE_BASELINES.map((algo) => (
                <Line
                  key={algo.key}
                  yAxisId={algo.key}
                  type="monotone"
                  dataKey={algo.key}
                  name={algo.shortLabel}
                  stroke={algo.color}
                  strokeWidth={algo.key === "kawpow" ? 1.8 : 1.6}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive
                  animationDuration={500}
                  animationEasing="ease-out"
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

function ActivityTrendChart({
  rows,
  loading,
  error,
  from,
  to,
}: {
  rows: NetworkStatsRow[] | undefined;
  loading: boolean;
  error: unknown;
  from: string;
  to: string;
}) {
  const compact = useCompactViewport();
  const trendRows = useMemo(() => completeTrendRows(rows), [rows]);
  const chartData = useMemo(
    () =>
      trendRows?.map((r) => ({
        date: r.periodStart,
        txs: r.txCount,
        active: r.activeAddresses,
      })) ?? [],
    [trendRows],
  );
  const status = chartStatus({ rows, loading, error });

  return (
    <Card>
      <div className="chart-card-header">
        <CardTitle>Active addresses / daily tx volume</CardTitle>
      </div>
      <ChartLegend
        className="mt-3"
        items={[
          { label: "Daily transactions", color: COLORS.txs },
          { label: "Active addresses", color: COLORS.active },
        ]}
      />
      <div className="chart-shell-short">
        {status ?? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--chart-grid-soft)" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "var(--chart-axis)", fontSize: 11 }} tickFormatter={formatPeriodDate} tickLine={false} axisLine={false} minTickGap={compact ? 64 : 32} />
              <YAxis yAxisId="txs" tick={{ fill: "var(--chart-axis)", fontSize: 11 }} tickFormatter={formatCompact} tickLine={false} axisLine={false} width={compact ? 46 : 60} />
              <YAxis yAxisId="active" orientation="right" tick={{ fill: "var(--chart-axis)", fontSize: 11 }} tickFormatter={formatCompact} tickLine={false} axisLine={false} width={compact ? 46 : 60} />
              <Tooltip
                content={
                  <ChartTooltip
                    labelFormatter={(v) => formatPeriodDate(String(v))}
                    formatter={(v, name) => [
                      Number(v).toLocaleString(),
                      name,
                    ]}
                  />
                }
              />
              <ProtocolEventLines visibleFrom={from} visibleTo={to} />
              <Line yAxisId="txs" type="monotone" dataKey="txs" name="Daily transactions" stroke={COLORS.txs} strokeWidth={1.6} dot={false} isAnimationActive animationDuration={500} animationEasing="ease-out" />
              <Line yAxisId="active" type="monotone" dataKey="active" name="Active addresses" stroke={COLORS.active} strokeWidth={1.6} dot={false} isAnimationActive animationDuration={500} animationEasing="ease-out" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

function WalletGrowthChart({
  rows,
  loading,
  error,
  from,
  to,
}: {
  rows: NetworkStatsRow[] | undefined;
  loading: boolean;
  error: unknown;
  from: string;
  to: string;
}) {
  const compact = useCompactViewport();
  const trendRows = useMemo(() => completeTrendRows(rows), [rows]);
  const chartData = useMemo(
    () =>
      trendRows?.map((r) => ({
        date: r.periodStart,
        wallets: r.cumulativeAddresses,
        newWallets: r.newAddresses,
      })) ?? [],
    [trendRows],
  );
  const status = chartStatus({ rows, loading, error });

  return (
    <Card>
      <div className="chart-card-header">
        <CardTitle>Wallet growth</CardTitle>
      </div>
      <ChartLegend
        className="mt-3"
        items={[
          { label: "Cumulative addresses", color: COLORS.wallets },
          { label: "New addresses", color: COLORS.newWallets, dasharray: "3 3" },
        ]}
      />
      <div className="chart-shell-short">
        {status ?? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--chart-grid-soft)" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "var(--chart-axis)", fontSize: 11 }} tickFormatter={formatPeriodDate} tickLine={false} axisLine={false} minTickGap={compact ? 64 : 32} />
              <YAxis yAxisId="wallets" tick={{ fill: "var(--chart-axis)", fontSize: 11 }} tickFormatter={formatCompact} tickLine={false} axisLine={false} width={compact ? 46 : 60} />
              <YAxis yAxisId="newWallets" orientation="right" tick={{ fill: "var(--chart-axis)", fontSize: 11 }} tickFormatter={formatCompact} tickLine={false} axisLine={false} width={compact ? 46 : 60} />
              <Tooltip
                content={
                  <ChartTooltip
                    labelFormatter={(v) => formatPeriodDate(String(v))}
                    formatter={(v, name) => [
                      Number(v).toLocaleString(),
                      name,
                    ]}
                  />
                }
              />
              <ProtocolEventLines visibleFrom={from} visibleTo={to} />
              <Line yAxisId="wallets" type="monotone" dataKey="wallets" name="Cumulative addresses" stroke={COLORS.wallets} strokeWidth={1.6} dot={false} isAnimationActive animationDuration={500} animationEasing="ease-out" />
              <Line yAxisId="newWallets" type="monotone" dataKey="newWallets" name="New addresses" stroke={COLORS.newWallets} strokeWidth={1.4} strokeDasharray="3 3" dot={false} isAnimationActive animationDuration={500} animationEasing="ease-out" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
