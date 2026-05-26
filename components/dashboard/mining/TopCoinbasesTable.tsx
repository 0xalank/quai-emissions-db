"use client";
import { Card, CardTitle } from "@/components/ui/Card";
import { useCoinbaseLeaderboard } from "@/lib/hooks";
import { ChartSkeleton } from "@/components/ui/ChartSkeleton";

// TopCoinbasesTable — top primary_coinbase addresses by blocks won in the
// trailing window. Pools and solo miners are not distinguished — a coinbase
// here is just an address that has been the primary_coinbase of at least
// one block.

export function TopCoinbasesTable({
  days = 7,
  limit = 10,
}: {
  days?: number;
  limit?: number;
}) {
  const { data, isLoading, error } = useCoinbaseLeaderboard({ days, limit });

  return (
    <Card>
      <div className="flex items-end justify-between gap-3">
        <div>
          <CardTitle>Top coinbases · {days}d</CardTitle>
          <p className="mt-1 text-xs text-slate-900/80 dark:text-white/80">
            Addresses with the most blocks sealed on cyprus1 in the trailing{" "}
            {days} days. May be pools or solo miners.
          </p>
        </div>
        {data && (
          <div className="text-xs text-slate-900/40 dark:text-white/40">
            {data.total.toLocaleString()} blocks total
          </div>
        )}
      </div>

      <div className="mt-3 overflow-x-auto">
        {isLoading ? (
          <ChartSkeleton height="h-32" />
        ) : error ? (
          <div className="text-sm text-quai-600 dark:text-quai-400">{String(error)}</div>
        ) : !data || data.rows.length === 0 ? (
          <div className="text-sm text-slate-900/50 dark:text-white/50">
            No blocks in the window.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-900/55 dark:text-white/55">
              <tr>
                <th className="py-2 font-medium">#</th>
                <th className="py-2 font-medium">Coinbase</th>
                <th className="py-2 text-right font-medium">Blocks</th>
                <th className="py-2 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => (
                <tr
                  key={row.coinbase}
                  className="border-t border-slate-900/5 dark:border-white/5"
                >
                  <td className="py-1.5 text-slate-900/55 dark:text-white/55">{i + 1}</td>
                  <td className="py-1.5 font-mono text-xs text-slate-900 dark:text-white/90">
                    {shortenAddress(row.coinbase)}
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    {row.blocks.toLocaleString()}
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    {row.pct.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}
