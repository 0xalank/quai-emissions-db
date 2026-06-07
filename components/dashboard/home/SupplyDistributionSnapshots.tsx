"use client";
import { useMemo } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { ChartSkeleton } from "@/components/ui/ChartSkeleton";
import { useSupply } from "@/lib/hooks";
import { formatCompact, weiToFloat } from "@/lib/format";
import {
  cumulativeUnlockedPostSingularity,
  dateOfScheduleMonth,
  POST_SINGULARITY_LAST_UNLOCK_MONTH,
} from "@/lib/quai/genesis-schedule";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Flame } from "lucide-react";

const TEN_YEAR_MAINNET_DATE = "2035-01-29";
const VESTING_DONE_DATE = dateOfScheduleMonth(POST_SINGULARITY_LAST_UNLOCK_MONTH);
const MINED_COLOR = "#e20101";

const GENESIS_BUCKETS = [
  { name: "Foundation", pct: 33n, color: "#7f1d1d" },
  { name: "Community Incentives", pct: 23n, color: "#f97316" },
  { name: "Team", pct: 16n, color: "#fb923c" },
  { name: "Investment Rounds", pct: 14n, color: "#991b1b" },
  { name: "Development Company", pct: 6n, color: "#c2410c" },
  { name: "Testnet & Earn", pct: 6n, color: "#f59e0b" },
  { name: "Exchange Liquidity", pct: 2n, color: "#64748b" },
] as const;

type Snapshot = {
  label: string;
  date: string;
  genesisWei: bigint;
  minedWei: bigint;
  projected: boolean;
};

type PieEntry = {
  name: string;
  value: number;
  color: string;
};

function daysBetween(a: string, b: string): number {
  const ms =
    new Date(b + "T00:00:00Z").getTime() -
    new Date(a + "T00:00:00Z").getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

function projectMinedWei(
  anchorDate: string,
  anchorMined: bigint,
  dailyMined: bigint,
  targetDate: string,
): bigint {
  return anchorMined + dailyMined * BigInt(daysBetween(anchorDate, targetDate));
}

function genesisBreakdown(genesisWei: bigint): PieEntry[] {
  let allocated = 0n;
  return GENESIS_BUCKETS.map((bucket, index) => {
    const valueWei =
      index === GENESIS_BUCKETS.length - 1
        ? genesisWei - allocated
        : (genesisWei * bucket.pct) / 100n;
    allocated += valueWei;
    return {
      name: bucket.name,
      value: weiToFloat(valueWei, 0),
      color: bucket.color,
    };
  });
}

function sharePct(value: number, total: number): string {
  if (total <= 0) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

function formatFullDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function SupplyDistributionSnapshots({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  const { data, isLoading, error } = useSupply({
    period: "day",
    from,
    to,
    include: ["mined"],
  });
  const minedPending =
    !!data &&
    data.length > 0 &&
    data.some(
      (r) => r.minedExact !== true || r.cumulativeMinedQuai == null,
    );

  const { snapshots, dailyMinedWei } = useMemo(() => {
    if (!data || data.length === 0 || minedPending) {
      return { snapshots: [] as Snapshot[], dailyMinedWei: 0n };
    }

    const last = data[data.length - 1];
    const anchorDate = last.periodStart;
    const anchorMined = last.cumulativeMinedQuai ?? 0n;
    const baseline =
      data.find((r) => daysBetween(r.periodStart, anchorDate) <= 30) ??
      data[0];
    const baselineMined = baseline.cumulativeMinedQuai ?? 0n;
    const observedDays = Math.max(1, daysBetween(baseline.periodStart, anchorDate));
    const observedDelta =
      anchorMined > baselineMined ? anchorMined - baselineMined : 0n;
    const dailyMined = observedDelta / BigInt(observedDays);

    const at = (label: string, date: string, projected: boolean): Snapshot => ({
      label,
      date,
      genesisWei: cumulativeUnlockedPostSingularity(date),
      minedWei: projected
        ? projectMinedWei(anchorDate, anchorMined, dailyMined, date)
        : anchorMined,
      projected,
    });

    return {
      snapshots: [
        at("Today", anchorDate, false),
        at("4 years after launch", VESTING_DONE_DATE, true),
        at("10 years after launch", TEN_YEAR_MAINNET_DATE, true),
      ],
      dailyMinedWei: dailyMined,
    };
  }, [data, minedPending]);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardTitle>QUAI emission distribution</CardTitle>
          <p className="mt-1 text-sm text-slate-900/60 dark:text-white/60">
            Gross emitted QUAI only: post-Singularity genesis emissions plus
            mined QUAI. SOAP burn is intentionally not subtracted or attributed.
          </p>
        </div>
      </div>

      <div className="mt-3 text-xs text-slate-900/55 dark:text-white/55">
        {minedPending ? (
          <span>Indexing exact mined rewards…</span>
        ) : (
          <span>
            Projection uses current mined rate:{" "}
            <span className="font-mono text-slate-900/80 dark:text-white/80">
              {formatCompact(weiToFloat(dailyMinedWei, 0))} QUAI/day
            </span>
          </span>
        )}
      </div>
      <div className="mt-4">
        {isLoading || !data || minedPending ? (
          <div className="h-64">
            <ChartSkeleton />
          </div>
        ) : error ? (
          <div className="text-sm text-quai-600 dark:text-quai-400">
            {String(error)}
          </div>
        ) : snapshots.length === 0 ? (
          <div className="text-sm text-slate-900/50 dark:text-white/50">
            No supply data available.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {snapshots.map((snapshot) => {
              const totalWei = snapshot.genesisWei + snapshot.minedWei;
              const pieData: PieEntry[] = [
                ...genesisBreakdown(snapshot.genesisWei),
                {
                  name: "Mined QUAI",
                  value: weiToFloat(snapshot.minedWei, 0),
                  color: MINED_COLOR,
                },
              ];
              return (
                <div
                  key={snapshot.label}
                  className="rounded-md border border-slate-900/10 p-3 dark:border-white/10"
                >
                  <div className="text-center">
                    <div className="text-sm font-medium text-slate-900 dark:text-white">
                      {snapshot.label}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-900/60 dark:text-white">
                      {formatFullDate(snapshot.date)}
                    </div>
                  </div>
                  <div className="mt-2 h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip
                          formatter={(value, name) => [
                            `${Number(value).toLocaleString()} QUAI`,
                            name,
                          ]}
                        />
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          outerRadius="84%"
                          paddingAngle={1.5}
                          startAngle={90}
                          endAngle={-270}
                          stroke="var(--card-bg)"
                          strokeWidth={2}
                          isAnimationActive
                          animationBegin={0}
                          animationDuration={650}
                          animationEasing="ease-out"
                        >
                          {pieData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-1 text-xs text-slate-900/55 dark:text-white/55">
                    {pieData
                      .toSorted((a, b) => b.value - a.value)
                      .map((entry) => (
                        <div
                          key={entry.name}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: entry.color }}
                            />
                            <span className="truncate">{entry.name}</span>
                          </span>
                          <span className="shrink-0 font-mono text-slate-900/75 dark:text-white/75">
                            {sharePct(entry.value, weiToFloat(totalWei, 0))}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-md border border-quai-500/45 bg-quai-500/10 px-3 py-2 text-sm text-quai-900 dark:border-quai-400/35 dark:bg-quai-500/15 dark:text-quai-100">
        <Flame className="mt-0.5 h-4 w-4 shrink-0 text-quai-600 dark:text-quai-300" aria-hidden />
        <p>
          <span className="font-medium">Burn excluded:</span> SOAP burns
          open-market QUAI and cannot be assigned to genesis or miner-origin
          supply from aggregate data. These pies show emitted distribution for
          understanding where tokens were allocated; circulating supply must
          separately factor out QUAI that has been burned.
        </p>
      </div>
    </Card>
  );
}
