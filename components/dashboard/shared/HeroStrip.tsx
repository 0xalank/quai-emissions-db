"use client";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MiniSparkline } from "@/components/ui/MiniSparkline";
import { useCountUp } from "@/lib/hooks/useCountUp";
import { formatCompact } from "@/lib/format";

// HeroStrip — the leading KPI bento for every dashboard page. One card is
// visually dominant (large type, accent border, optional 14-day sparkline);
// the rest are supporting. Phase 2 turned this into a proper CSS-grid bento:
// dominant occupies 2×2 on lg+, supporting cards each 1 cell.
//
// Layout grid (lg+):  [ DOMINANT 2×2 ] [ S ] [ S ] ...
//                                      [ S ] [ S ] ...
// On md: dominant 2×1, supporting cards flow into the remaining cells.
// On mobile: stack.

/** Accent color — should match the chart series this KPI feeds.
 *  blue=realized, orange=SOAP burn, emerald=Qi/net, amber=Singularity-era,
 *  purple=lockup-sim, slate=neutral/static. */
export type HeroAccent =
  | "blue"
  | "orange"
  | "emerald"
  | "amber"
  | "purple"
  | "slate";

export type HeroCard = {
  /** Stable id for keying. */
  id: string;
  /** Short label above the value (e.g. "Realized circulating QUAI"). */
  label: string;
  /** The headline value. Pass a string for already-formatted output. Pass
   *  ReactNode for a value with units styled inline (e.g. "1.23 B QUAI"). */
  value: ReactNode;
  /** Numeric counterpart of `value` for count-up animation. When provided,
   *  the headline tweens via formatCompact during the animation, then settles
   *  on the original ReactNode. Omit for non-numeric values. */
  numericValue?: number;
  /** Optional sub-text below the value (one line; small, muted). */
  sub?: ReactNode;
  /** Optional delta tag ("+1.2% vs prior week"); rendered to the right. */
  delta?: { sign: "up" | "down" | "flat"; text: string };
  /** Loading skeleton if data not ready. */
  loading?: boolean;
  /** Accent color tying this KPI to its chart series. */
  accent?: HeroAccent;
  /** Sparkline series for the *dominant* card only. Color falls back to
   *  accent's hex when omitted. */
  sparkline?: { data: number[]; color?: string };
};

const ACCENT_BORDER: Record<HeroAccent, string> = {
  blue: "border-l-quai-500/80 dark:border-l-quai-500/80",
  orange: "border-l-amber-300/80 dark:border-l-amber-300/80",
  emerald: "border-l-emerald-500/80 dark:border-l-emerald-400/70",
  amber: "border-l-amber-500/80 dark:border-l-amber-400/70",
  purple: "border-l-purple-500/80 dark:border-l-purple-400/70",
  slate: "border-l-slate-400/60 dark:border-l-white/25",
};

const ACCENT_LABEL: Record<HeroAccent, string> = {
  blue: "text-quai-600 dark:text-quai-400",
  orange: "text-amber-600 dark:text-amber-300",
  emerald: "text-emerald-700 dark:text-emerald-300",
  amber: "text-amber-700 dark:text-amber-300",
  purple: "text-purple-700 dark:text-purple-300",
  slate: "text-slate-900/60 dark:text-white/60",
};

const ACCENT_HEX: Record<HeroAccent, string> = {
  blue: "#e20101",
  orange: "#f0a16d",
  emerald: "#10b981",
  amber: "#f59e0b",
  purple: "#a855f7",
  slate: "#64748b",
};

// Pre-baked Tailwind grid templates for the supported cards-count range.
// Each maps to N supporting cards arranged in 2 rows after the 2×2 dominant.
// lgCols = 2 + ceil(N/2). We need static class names so Tailwind JIT picks
// them up; arbitrary values are fine but must be literal at build time.
const LG_TEMPLATES: Record<number, string> = {
  // 1 supporting card: 1 col supporting → lg cols = 3
  1: "lg:[grid-template-columns:repeat(3,minmax(0,1fr))] lg:[grid-template-rows:repeat(2,minmax(0,1fr))]",
  // 2 supporting cards: 1 col → 3 cols total
  2: "lg:[grid-template-columns:repeat(3,minmax(0,1fr))] lg:[grid-template-rows:repeat(2,minmax(0,1fr))]",
  // 3 supporting cards: 2 cols → 4 cols total
  3: "lg:[grid-template-columns:repeat(4,minmax(0,1fr))] lg:[grid-template-rows:repeat(2,minmax(0,1fr))]",
  // 4 supporting cards: 2 cols → 4 cols total
  4: "lg:[grid-template-columns:repeat(4,minmax(0,1fr))] lg:[grid-template-rows:repeat(2,minmax(0,1fr))]",
  // 5 supporting cards: 3 cols → 5 cols total
  5: "lg:[grid-template-columns:repeat(5,minmax(0,1fr))] lg:[grid-template-rows:repeat(2,minmax(0,1fr))]",
  // 6 supporting cards: 3 cols → 5 cols total
  6: "lg:[grid-template-columns:repeat(5,minmax(0,1fr))] lg:[grid-template-rows:repeat(2,minmax(0,1fr))]",
};

export function HeroStrip({
  dominant,
  cards,
  className,
}: {
  dominant: HeroCard;
  /** 1–6 supporting cards. */
  cards: HeroCard[];
  className?: string;
}) {
  const lgTemplate = LG_TEMPLATES[Math.min(6, Math.max(1, cards.length))];

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 md:grid-cols-4",
        // Mobile: dominant spans the row, supporting cards use a compact
        // two-column grid. md: dominant 2×1, supporting fill remaining cells.
        // lg+: bento with dominant 2×2.
        lgTemplate,
        className,
      )}
    >
      <DominantCard card={dominant} />
      {cards.map((c) => (
        <SupportingCard key={c.id} card={c} />
      ))}
    </div>
  );
}

function DominantCard({ card }: { card: HeroCard }) {
  const accent = card.accent ?? "blue";
  const sparkColor = card.sparkline?.color ?? ACCENT_HEX[accent];
  return (
    <div
      className={cn(
        "card relative col-span-2 overflow-hidden border-l-4 md:col-span-2 lg:col-span-2 lg:row-span-2",
        "flex flex-col",
        ACCENT_BORDER[accent],
      )}
    >
      <div
        className={cn(
          "text-[0.7rem] font-semibold uppercase tracking-wider",
          ACCENT_LABEL[accent],
        )}
      >
        {card.label}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {card.loading ? (
          <div className="h-9 w-44 animate-pulse rounded bg-slate-900/5 dark:bg-white/5" />
        ) : (
          <AnimatedValue
            value={card.value}
            numericValue={card.numericValue}
            className="tabular text-[1.75rem] font-semibold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-3xl"
          />
        )}
        {card.delta && <DeltaTag delta={card.delta} />}
      </div>
      {card.sub && (
        <div className="mt-1 text-xs text-slate-900/55 dark:text-white/55">
          {card.sub}
        </div>
      )}
      {card.sparkline && card.sparkline.data.length >= 2 && (
        <div className="mt-auto pt-3">
          <MiniSparkline
            data={card.sparkline.data}
            color={sparkColor}
            height={56}
            ariaLabel={`${card.label} trend`}
          />
        </div>
      )}
    </div>
  );
}

function SupportingCard({ card }: { card: HeroCard }) {
  const accent = card.accent;
  return (
    <div
      className={cn(
        "card min-w-0",
        accent && "border-l-4",
        accent && ACCENT_BORDER[accent],
      )}
    >
      <div
        className={cn(
          "text-[0.7rem] uppercase tracking-wider",
          accent
            ? cn("font-semibold", ACCENT_LABEL[accent])
            : "text-slate-900/55 dark:text-white/55",
        )}
      >
        {card.label}
      </div>
      <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        {card.loading ? (
          <div className="h-6 w-24 animate-pulse rounded bg-slate-900/5 dark:bg-white/5" />
        ) : (
          <AnimatedValue
            value={card.value}
            numericValue={card.numericValue}
            className="tabular min-w-0 text-lg font-medium leading-tight tracking-tight text-slate-900 dark:text-white sm:text-xl"
          />
        )}
        {card.delta && <DeltaTag delta={card.delta} compact />}
      </div>
      {card.sub && (
        <div className="mt-1 hidden text-xs text-slate-900/50 dark:text-white/50 sm:block">
          {card.sub}
        </div>
      )}
    </div>
  );
}

// Wraps the headline value: when `numericValue` is supplied, runs useCountUp
// and shows formatCompact'd intermediate values until the tween settles, then
// renders the caller-provided ReactNode (which may include unit styling).
function AnimatedValue({
  value,
  numericValue,
  className,
}: {
  value: ReactNode;
  numericValue?: number;
  className?: string;
}) {
  // Always call the hook (rules of hooks) — pass 0 if no numericValue, but
  // we'll skip showing the animated number entirely when numericValue is
  // undefined.
  const target = numericValue ?? 0;
  const animated = useCountUp(target, { durationMs: 250 });

  if (numericValue == null || !Number.isFinite(numericValue)) {
    return <div className={className}>{value}</div>;
  }

  // Settled when the animated display matches the target within 0.5%.
  const settled =
    target === 0
      ? animated === 0
      : Math.abs(animated - target) / Math.abs(target) < 0.005;

  return (
    <div className={className}>
      {settled ? value : formatCompact(animated)}
    </div>
  );
}

function DeltaTag({
  delta,
  compact = false,
}: {
  delta: NonNullable<HeroCard["delta"]>;
  compact?: boolean;
}) {
  // Color rules: up = emerald, down = dimmed slate (NOT red — red is for true
  // alerts only; routine "supply went down" should not look alarming).
  const color =
    delta.sign === "up"
      ? "text-emerald-600 dark:text-emerald-300"
      : delta.sign === "down"
        ? "text-slate-700 dark:text-white/70"
        : "text-slate-500 dark:text-white/40";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 font-mono",
        compact ? "text-[0.6rem]" : "text-xs",
        color,
      )}
    >
      {delta.sign !== "flat" && (
        <svg
          viewBox="0 0 8 8"
          width={compact ? 5 : 6}
          height={compact ? 5 : 6}
          aria-hidden
          className="shrink-0"
        >
          {delta.sign === "up" ? (
            <path d="M4 0 L8 7 L0 7 Z" fill="currentColor" />
          ) : (
            <path d="M4 8 L0 1 L8 1 Z" fill="currentColor" />
          )}
        </svg>
      )}
      {delta.text}
    </span>
  );
}
