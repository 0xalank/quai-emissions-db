"use client";

import { useMemo } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { useSupply } from "@/lib/hooks";
import { formatCompact, formatPeriodDate, weiToFloat } from "@/lib/format";
import {
  dateOfScheduleMonth,
  POST_SINGULARITY_UNLOCK_SCHEDULE,
} from "@/lib/quai/genesis-schedule";
import { BLOCKS_PER_MONTH } from "@/lib/quai/protocol-constants";

const UPCOMING_UNLOCK_COUNT = 10;

type UnlockRow = {
  blockNumber: bigint;
  date: string;
  amount: bigint;
};

function formatUnlockPct(amount: bigint, circulatingSupply: bigint | null): string {
  if (!circulatingSupply || circulatingSupply <= 0n) return "—";
  const milliPct = (amount * 100_000n) / circulatingSupply;
  const whole = milliPct / 1000n;
  const frac = (milliPct % 1000n).toString().padStart(3, "0");
  return `${whole}.${frac}%`;
}

export function UpcomingUnlocks() {
  const today = new Date().toISOString().slice(0, 10);
  const supplyFrom = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 14);
    return d.toISOString().slice(0, 10);
  }, []);
  const { data: latestSupply } = useSupply({
    period: "day",
    from: supplyFrom,
    to: today,
    include: [],
  });
  const circulatingSupply = latestSupply?.at(-1)?.realizedCirculatingQuai ?? null;

  const rows = useMemo<UnlockRow[]>(() => {
    return POST_SINGULARITY_UNLOCK_SCHEDULE.map(
      ([month, amount]) => ({
        blockNumber: BigInt(month) * BLOCKS_PER_MONTH,
        date: dateOfScheduleMonth(month),
        amount,
      }),
    )
      .filter((row) => row.date >= today && row.amount > 0n)
      .slice(0, UPCOMING_UNLOCK_COUNT);
  }, []);

  return (
    <Card>
      <CardTitle>Upcoming unlocks</CardTitle>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-md border border-slate-200/70 px-3 py-2 text-sm text-slate-900/60 dark:border-white/10 dark:text-white/60">
          No future genesis unlocks remain in the post-Singularity schedule.
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-slate-200/70 text-xs uppercase tracking-wider text-slate-900/50 dark:border-white/10 dark:text-white/45">
              <tr>
                <th className="py-2 pr-4 font-medium">Estimated date</th>
                <th className="py-2 pr-4 font-medium">Block</th>
                <th className="py-2 pr-4 text-right font-medium">Unlock</th>
                <th className="py-2 text-right font-medium">
                  Unlock % of circulating
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-white/10">
              {rows.map((row) => {
                return (
                  <tr key={row.blockNumber.toString()}>
                    <td className="py-2.5 pr-4 font-medium text-slate-900 dark:text-white">
                      {formatPeriodDate(row.date)}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-slate-900/55 dark:text-white/55">
                      #{row.blockNumber.toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono text-slate-900/75 dark:text-white/75">
                      {formatCompact(weiToFloat(row.amount, 0))} QUAI
                    </td>
                    <td className="py-2.5 text-right font-mono text-slate-900/75 dark:text-white/75">
                      {formatUnlockPct(row.amount, circulatingSupply)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
