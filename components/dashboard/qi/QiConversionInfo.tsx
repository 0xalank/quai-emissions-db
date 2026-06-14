"use client";
import { Card, CardTitle } from "@/components/ui/Card";
import { ChartSkeleton } from "@/components/ui/ChartSkeleton";
import { formatQi } from "@/lib/format";
import { useQiMarket } from "@/lib/hooks";
import { formatPct, impliedQiPrice, qiToQuai, quaiPrice } from "./qi-format";

export function QiConversionInfo({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  const { data, isLoading, error } = useQiMarket({ from, to });

  const rowCount = data?.length ?? 0;
  const quoteRows = data?.filter((r) => qiToQuai(r) != null).length ?? 0;
  const priceRows = data?.filter((r) => quaiPrice(r) != null).length ?? 0;
  const impliedRows = data?.filter((r) => impliedQiPrice(r) != null).length ?? 0;
  const qiNet = data?.reduce((sum, r) => sum + r.qiNetEmitted, 0n) ?? 0n;
  const totalBlocks = data?.reduce((sum, r) => sum + r.blockCount, 0) ?? 0;
  const qiWins = data?.reduce((sum, r) => sum + r.winnerQiCount, 0) ?? 0;
  const qiWinShare = totalBlocks === 0 ? null : (qiWins / totalBlocks) * 100;

  return (
    <Card>
      <div className="chart-card-header">
        <CardTitle>Quai and Qi conversions</CardTitle>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Quote coverage" value={`${quoteRows}/${rowCount}`} />
        <Metric label="Price coverage" value={`${priceRows}/${rowCount}`} />
        <Metric label="Implied price rows" value={`${impliedRows}/${rowCount}`} />
        <Metric label="Qi win share" value={formatPct(qiWinShare)} />
      </div>

      <div className="mt-4 min-h-24">
        {isLoading || !data ? (
          <ChartSkeleton height="h-24" />
        ) : error ? (
          <div className="text-sm text-quai-600 dark:text-quai-400">
            {String(error)}
          </div>
        ) : (
          <div className="grid gap-3 text-sm leading-6 text-slate-950 dark:text-white lg:grid-cols-2">
            <p>
              The Qi quote is indexed from{" "}
              <span className="font-mono text-xs">quai_qiToQuai</span> at the
              last indexed block of each UTC day, using 1000 qits as the input
              amount for 1 Qi.
            </p>
            <p>
              Implied Qi price is derived from stored market data: QUAI/USDT
              close multiplied by the indexed QUAI-per-Qi quote for that same
              daily row.
            </p>
            <p>
              Quai and Qi supply rows come from chain supply analytics, so the
              selected range currently shows{" "}
              <span className="font-medium text-slate-950 dark:text-white">
                {formatQi(qiNet)}
              </span>{" "}
              net Qi supply movement.
            </p>
            <p>
              The header <span className="font-mono text-xs">conversionFlowAmount</span>{" "}
              is a protocol flow state, not indexed trade volume or conversion
              direction. Directional conversion volume needs event-level
              indexing before it should be charted.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-900/10 px-3 py-2 dark:border-white/10">
      <div className="truncate text-[0.7rem] uppercase tracking-wider text-slate-900/55 dark:text-white/55">
        {label}
      </div>
      <div className="mt-1 truncate text-lg font-medium tabular text-slate-950 dark:text-white">
        {value}
      </div>
    </div>
  );
}
