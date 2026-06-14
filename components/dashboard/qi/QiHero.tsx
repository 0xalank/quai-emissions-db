"use client";
import { HeroStrip, type HeroCard } from "@/components/dashboard/shared/HeroStrip";
import { formatBigQi, formatBlockNumber, formatQi } from "@/lib/format";
import { useQiMarket } from "@/lib/hooks";
import {
  formatCurrency,
  formatPct,
  formatQuaiPerQi,
  impliedQiPrice,
  latestWith,
  qiToQuai,
  quaiPrice,
} from "./qi-format";

export function QiHero({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQiMarket({ from, to });

  const latestQuote = latestWith(data, qiToQuai);
  const latestQiPrice = latestWith(data, impliedQiPrice);
  const latestQuaiPrice = latestWith(data, quaiPrice);
  const latestSupply = data?.findLast((r) => r.qiTotalEnd > 0n);

  const quoteSeries =
    data
      ?.map(qiToQuai)
      .filter((v): v is number => v != null && Number.isFinite(v))
      .slice(-14) ?? [];

  const blockCount =
    data?.reduce((sum, r) => sum + r.blockCount, 0) ?? 0;
  const qiWinnerCount =
    data?.reduce((sum, r) => sum + r.winnerQiCount, 0) ?? 0;
  const qiWinnerShare = blockCount === 0 ? null : (qiWinnerCount / blockCount) * 100;

  const qiNet =
    data?.reduce((sum, r) => sum + r.qiNetEmitted, 0n) ?? null;

  const dominant: HeroCard = {
    id: "quote",
    label: "Qi to QUAI quote",
    value: formatQuaiPerQi(latestQuote?.value),
    numericValue: latestQuote?.value,
    sub: latestQuote
      ? `1 Qi at ${formatBlockNumber(latestQuote.row.qiQuoteBlock ?? latestQuote.row.lastBlock)}`
      : "Awaiting daily quote index",
    loading: isLoading,
    accent: "blue",
    sparkline: { data: quoteSeries },
  };

  const cards: HeroCard[] = [
    {
      id: "qi-price",
      label: "Implied Qi price",
      value: formatCurrency(latestQiPrice?.value),
      numericValue: latestQiPrice?.value,
      sub: latestQiPrice
        ? `${latestQiPrice.row.quoteCurrency ?? "USDT"} from MEXC close`
        : "Needs quote and market candle",
      loading: isLoading,
      accent: "emerald",
    },
    {
      id: "quai-price",
      label: "QUAI market close",
      value: formatCurrency(latestQuaiPrice?.value),
      numericValue: latestQuaiPrice?.value,
      sub: latestQuaiPrice
        ? `${latestQuaiPrice.row.priceSource?.toUpperCase() ?? "MEXC"} ${latestQuaiPrice.row.quoteCurrency ?? "USDT"}`
        : "No market candle",
      loading: isLoading,
      accent: "slate",
    },
    {
      id: "qi-supply",
      label: "Qi supply",
      value: latestSupply ? formatBigQi(latestSupply.qiTotalEnd) : "-",
      numericValue: latestSupply ? Number(latestSupply.qiTotalEnd / 1000n) : undefined,
      sub: latestSupply?.periodStart ?? "No supply row",
      loading: isLoading,
      accent: "amber",
    },
    {
      id: "qi-share",
      label: "Qi-winning blocks",
      value: formatPct(qiWinnerShare),
      numericValue: qiWinnerShare ?? undefined,
      sub: qiNet == null ? "Selected range" : `${formatQi(qiNet)} net in range`,
      loading: isLoading,
      accent: "purple",
    },
  ];

  return <HeroStrip dominant={dominant} cards={cards} />;
}
