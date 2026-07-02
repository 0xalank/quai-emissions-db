export type PowBenchmarkNetwork = {
  id: string;
  label: string;
  symbol: string;
  algorithm: string;
  coinGeckoId: string;
  color: string;
  capacityTps: number;
  rewardNote: string;
  mergeMiningNote?: string;
  blockTimeSeconds?: number;
  blockSubsidy?: number;
  emissionSchedule?: PowEmissionSchedule;
};

export type PowEmissionSchedule =
  | {
      type: "fixed-block-subsidy";
      blockTimeSeconds: number;
      blockSubsidy: number;
    }
  | {
      type: "dated-block-subsidy";
      blockTimeSeconds: number;
      events: { from: string; blockSubsidy: number }[];
    }
  | {
      type: "annual-halving";
      anchorDate: string;
      anchorDailySubsidy: number;
    };

export type PowMarketQuote = {
  id: string;
  usd: number | null;
  usdMarketCap: number | null;
  usd24hChange: number | null;
  lastUpdatedAt: number | null;
};

export type PowMarketHistoryPoint = {
  date: string;
  priceUsd: number | null;
  marketCapUsd: number | null;
};

export type PowMarketHistory = {
  id: string;
  rows: PowMarketHistoryPoint[];
};

export type PowNetworkMetric = {
  id: string;
  label: string;
  symbol: string;
  algorithm: string;
  color: string;
  capacityTps: number;
  rewardNote: string;
  mergeMiningNote?: string;
  dailySubsidy: number | null;
  priceUsd: number | null;
  marketCapUsd: number | null;
  dailySecurityCostUsd: number | null;
  lastUpdatedAt: number | null;
  isQuai?: boolean;
};

export const BTC_CAPACITY_TPS = 7;
export const QUAI_CAPACITY_TPS = 50_000;
export const SECURITY_ELECTRICITY_USD_PER_KWH = 0.05;

export const POW_BENCHMARK_NETWORKS: PowBenchmarkNetwork[] = [
  {
    id: "bitcoin",
    label: "Bitcoin",
    symbol: "BTC",
    algorithm: "SHA-256",
    coinGeckoId: "bitcoin",
    color: "#f7931a",
    emissionSchedule: {
      type: "dated-block-subsidy",
      blockTimeSeconds: 600,
      events: [
        { from: "2020-05-11", blockSubsidy: 6.25 },
        { from: "2024-04-19", blockSubsidy: 3.125 },
      ],
    },
    capacityTps: BTC_CAPACITY_TPS,
    rewardNote:
      "Halving schedule by date; currently 3.125 BTC subsidy, 144 target blocks/day. Fees excluded.",
  },
  {
    id: "litecoin",
    label: "Litecoin",
    symbol: "LTC",
    algorithm: "Scrypt",
    coinGeckoId: "litecoin",
    color: "#345d9d",
    emissionSchedule: {
      type: "dated-block-subsidy",
      blockTimeSeconds: 150,
      events: [
        { from: "2019-08-05", blockSubsidy: 12.5 },
        { from: "2023-08-02", blockSubsidy: 6.25 },
      ],
    },
    capacityTps: 56,
    rewardNote:
      "Halving schedule by date; currently 6.25 LTC subsidy, 576 target blocks/day. Fees excluded.",
    mergeMiningNote: "Scrypt work can contribute Quai workshares through SOAP.",
  },
  {
    id: "bitcoin-cash",
    label: "Bitcoin Cash",
    symbol: "BCH",
    algorithm: "SHA-256",
    coinGeckoId: "bitcoin-cash",
    color: "#8dc351",
    emissionSchedule: {
      type: "dated-block-subsidy",
      blockTimeSeconds: 600,
      events: [
        { from: "2020-04-08", blockSubsidy: 6.25 },
        { from: "2024-04-03", blockSubsidy: 3.125 },
      ],
    },
    capacityTps: 100,
    rewardNote:
      "Halving schedule by date; currently 3.125 BCH subsidy, 144 target blocks/day. Fees excluded.",
    mergeMiningNote: "SHA work can contribute Quai workshares through SOAP.",
  },
  {
    id: "dogecoin",
    label: "Dogecoin",
    symbol: "DOGE",
    algorithm: "Scrypt",
    coinGeckoId: "dogecoin",
    color: "#c2a633",
    emissionSchedule: {
      type: "fixed-block-subsidy",
      blockTimeSeconds: 60,
      blockSubsidy: 10_000,
    },
    capacityTps: 33,
    rewardNote: "10,000 DOGE subsidy, 1-minute target blocks. Fees excluded.",
    mergeMiningNote: "Scrypt work can contribute Quai workshares through SOAP.",
  },
  {
    id: "ravencoin",
    label: "Ravencoin",
    symbol: "RVN",
    algorithm: "KawPoW",
    coinGeckoId: "ravencoin",
    color: "#384182",
    emissionSchedule: {
      type: "dated-block-subsidy",
      blockTimeSeconds: 60,
      events: [
        { from: "2022-01-11", blockSubsidy: 2_500 },
        { from: "2026-01-11", blockSubsidy: 1_250 },
      ],
    },
    capacityTps: 116,
    rewardNote:
      "Halving schedule by date; 2,500 RVN before the 2026 halving, 1,250 RVN after. Fees excluded.",
    mergeMiningNote: "KawPoW work can contribute Quai workshares through SOAP.",
  },
  {
    id: "kaspa",
    label: "Kaspa",
    symbol: "KAS",
    algorithm: "kHeavyHash",
    coinGeckoId: "kaspa",
    color: "#70c7ba",
    emissionSchedule: {
      type: "annual-halving",
      anchorDate: "2026-07-02",
      anchorDailySubsidy: 1_700_000,
    },
    capacityTps: 400,
    rewardNote:
      "Approximate smooth annual-halving emission curve, anchored at 1.7M KAS/day on 2026-07-02. Fees excluded.",
  },
];

function daysBetween(a: string, b: string): number {
  const aMs = new Date(a + "T00:00:00Z").getTime();
  const bMs = new Date(b + "T00:00:00Z").getTime();
  return (aMs - bMs) / 86_400_000;
}

function blockSubsidyForDate(
  events: { from: string; blockSubsidy: number }[],
  isoDate: string,
): number {
  const sorted = [...events].sort((a, b) => a.from.localeCompare(b.from));
  let subsidy = sorted[0]?.blockSubsidy ?? 0;
  for (const event of sorted) {
    if (event.from <= isoDate) {
      subsidy = event.blockSubsidy;
    } else {
      break;
    }
  }
  return subsidy;
}

export function dailySubsidyTokens(
  network: PowBenchmarkNetwork,
  isoDate = new Date().toISOString().slice(0, 10),
): number {
  const schedule = network.emissionSchedule;
  if (!schedule) return 0;
  if (schedule.type === "fixed-block-subsidy") {
    return (86_400 / schedule.blockTimeSeconds) * schedule.blockSubsidy;
  }
  if (schedule.type === "dated-block-subsidy") {
    const subsidy = blockSubsidyForDate(schedule.events, isoDate);
    return (86_400 / schedule.blockTimeSeconds) * subsidy;
  }
  const daysFromAnchor = daysBetween(isoDate, schedule.anchorDate);
  return schedule.anchorDailySubsidy * Math.pow(0.5, daysFromAnchor / 365.25);
}

export function capacityTransactionsPerDay(tps: number): number {
  return tps * 86_400;
}

export function costPerCapacityTransaction(
  dailySecurityCostUsd: number | null,
  capacityTps: number,
): number | null {
  if (dailySecurityCostUsd == null || capacityTps <= 0) return null;
  return dailySecurityCostUsd / capacityTransactionsPerDay(capacityTps);
}

export function energyCostEquivalentKwhPerTx(
  dailySecurityCostUsd: number | null,
  capacityTps: number,
  electricityUsdPerKwh = SECURITY_ELECTRICITY_USD_PER_KWH,
): number | null {
  const cost = costPerCapacityTransaction(dailySecurityCostUsd, capacityTps);
  if (cost == null || electricityUsdPerKwh <= 0) return null;
  return cost / electricityUsdPerKwh;
}
