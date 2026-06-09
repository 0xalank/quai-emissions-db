"use client";
import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { reviveBig } from "@/lib/quai/serialize";
import type {
  MiningInfo,
  Period,
  Rollup,
  RollupsMeta,
  SupplyAnalytics,
  SupplyInfo,
  SupplyRow,
} from "@/lib/quai/types";
import { STATS_REFRESH_MS } from "@/lib/quai/constants";

export function useCompactViewport(query = "(max-width: 639px)") {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

export type StatsPayload = {
  supply: SupplyInfo;
  info: MiningInfo;
  analytics: SupplyAnalytics | null;
};

export function useStats() {
  return useQuery<StatsPayload>({
    queryKey: ["stats"],
    queryFn: async () => {
      const res = await fetch("/api/stats");
      if (!res.ok) throw new Error(`stats ${res.status}`);
      const raw = await res.json();
      return {
        supply: reviveBig<SupplyInfo>(raw.supply),
        info: reviveBig<MiningInfo>(raw.info),
        analytics: raw.analytics ? reviveBig<SupplyAnalytics>(raw.analytics) : null,
      };
    },
    refetchInterval: STATS_REFRESH_MS,
  });
}

export type HealthPayload = {
  headBlock: number;
  lastIngestedBlock: number;
  lagBlocks: number;
  lastTailedAt: string;
  backfillDone: boolean;
};

/**
 * Shell-level indicator of chain head + ingest cursor lag. Reads `/api/health`,
 * which is scheduled to ship with PR2. Until then this quietly resolves to
 * `null` on 404 so the TopNav renders an "awaiting" state instead of an error.
 */
export function useHeadBlock() {
  return useQuery<HealthPayload | null>({
    queryKey: ["head-block"],
    queryFn: async () => {
      const res = await fetch("/api/health");
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`health ${res.status}`);
      return (await res.json()) as HealthPayload;
    },
    refetchInterval: 15_000,
    retry: false,
  });
}

export function useRollups(args: { period: Period; from: string; to: string }) {
  return useQuery<Rollup[]>({
    queryKey: ["rollups", args.period, args.from, args.to],
    queryFn: async () => {
      const res = await fetch(
        `/api/rollups?period=${args.period}&from=${args.from}&to=${args.to}`,
      );
      if (!res.ok) throw new Error(`rollups ${res.status}`);
      const raw = (await res.json()) as { period: string; rows: unknown };
      return reviveBig<Rollup[]>(raw.rows);
    },
    // Past periods are immutable; today's partial row updates on tail ticks.
    // Single query + 60s refetch is simpler than a range/tail merge and fine at
    // this row count (<~2k even over multi-year ranges).
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });
}

export function useRollupsMeta() {
  return useQuery<RollupsMeta>({
    queryKey: ["rollups-meta"],
    queryFn: async () => {
      const res = await fetch("/api/rollups/meta");
      if (!res.ok) throw new Error(`rollups-meta ${res.status}`);
      return (await res.json()) as RollupsMeta;
    },
    staleTime: 60 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export type RollupSummary = {
  quaiIssued: bigint;
  qiIssued: bigint;
  burnInRange: bigint;
  netQuaiIssuance: bigint;
  peakDailyQuaiIssued: bigint | null;
};

/**
 * Derived summary over rollup rows. Pure function — consumers call this with
 * `useRollups().data` to get KPI values without a second network round-trip.
 */
export function computeRollupSummary(
  rows: Rollup[] | undefined,
  period: Period,
): RollupSummary | null {
  if (!rows || rows.length === 0) return null;
  let quaiIssued = 0n;
  let qiIssued = 0n;
  let quaiNetSum = 0n;
  let peakDailyQuaiIssued: bigint | null = null;
  for (const r of rows) {
    quaiIssued += r.quaiAddedSum;
    qiIssued += r.qiAddedSum;
    quaiNetSum += r.quaiNetEmitted;
    if (period === "day") {
      if (peakDailyQuaiIssued === null || r.quaiAddedSum > peakDailyQuaiIssued) {
        peakDailyQuaiIssued = r.quaiAddedSum;
      }
    }
  }
  const burnInRange = rows[rows.length - 1].burnClose - rows[0].burnClose;
  const netQuaiIssuance = quaiNetSum - burnInRange;
  return {
    quaiIssued,
    qiIssued,
    burnInRange,
    netQuaiIssuance,
    peakDailyQuaiIssued: period === "day" ? peakDailyQuaiIssued : null,
  };
}

export type CoinbaseLeaderboardRow = {
  coinbase: string;
  blocks: number;
  pct: number;
};

export type CoinbaseLeaderboardPayload = {
  window: { days: number; since: string };
  total: number;
  rows: CoinbaseLeaderboardRow[];
};

export function useCoinbaseLeaderboard(args: { days?: number; limit?: number } = {}) {
  const days = args.days ?? 7;
  const limit = args.limit ?? 10;
  return useQuery<CoinbaseLeaderboardPayload>({
    queryKey: ["coinbase-leaderboard", days, limit],
    queryFn: async () => {
      const res = await fetch(`/api/coinbase-leaderboard?days=${days}&limit=${limit}`);
      if (!res.ok) throw new Error(`coinbase-leaderboard ${res.status}`);
      return (await res.json()) as CoinbaseLeaderboardPayload;
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

/** Hook for /api/supply (realized circulating + optional qi/burn/genesis). */
export function useSupply(args: {
  period: Period;
  from: string;
  to: string;
  include?: ("qi" | "burn" | "genesis" | "mined")[];
}) {
  const include = (args.include ?? ["qi", "burn"]).join(",");
  return useQuery<SupplyRow[]>({
    queryKey: ["supply", args.period, args.from, args.to, include],
    queryFn: async () => {
      const res = await fetch(
        `/api/supply?period=${args.period}&from=${args.from}&to=${args.to}&include=${include}`,
      );
      if (!res.ok) throw new Error(`supply ${res.status}`);
      const raw = (await res.json()) as { period: string; rows: unknown };
      return reviveBig<SupplyRow[]>(raw.rows);
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });
}
