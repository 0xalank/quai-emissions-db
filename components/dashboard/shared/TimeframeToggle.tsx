"use client";
import { cn } from "@/lib/utils";

// TimeframeToggle — small inline tab strip for switching the time window on
// a chart or page. URL-state friendly (caller controls value + onChange).
//
// Used both at the page level (home page picks 30d/90d/1y/all for the supply
// flagship) and at the chart level (each chart can override the page default).

export type Timeframe = "7d" | "30d" | "90d" | "1y" | "all";

const ORDER: Timeframe[] = ["7d", "30d", "90d", "1y", "all"];
const LABEL: Record<Timeframe, string> = {
  "7d": "7d",
  "30d": "30d",
  "90d": "90d",
  "1y": "1y",
  all: "All",
};

export function TimeframeToggle({
  value,
  onChange,
  options = ORDER,
  className,
}: {
  value: Timeframe;
  onChange: (t: Timeframe) => void;
  options?: Timeframe[];
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Timeframe"
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 overflow-x-auto whitespace-nowrap rounded-md border p-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "border-slate-900/10 dark:border-white/10",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt)}
            className={cn(
              "shrink-0 rounded px-2 py-1 text-xs transition sm:py-0.5",
              active
                ? "bg-slate-900/10 text-slate-900 dark:bg-white/15 dark:text-white"
                : "text-slate-700 hover:text-slate-900 dark:text-white/60 dark:hover:text-white/90",
            )}
          >
            {LABEL[opt]}
          </button>
        );
      })}
    </div>
  );
}

/** Convert a Timeframe into a from-date string (YYYY-MM-DD UTC). The "to"
 *  is always today (UTC). For "all" we return null and the caller should
 *  fall back to the rollup-meta earliest period. */
export function timeframeToFromIso(t: Timeframe): string | null {
  if (t === "all") return null;
  const days = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 }[t];
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
