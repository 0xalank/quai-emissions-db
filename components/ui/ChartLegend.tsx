"use client";
import { cn } from "@/lib/utils";

export type ChartLegendItem = {
  label: string;
  color: string;
  /** Optional dasharray hint — renders the dot as a dashed line if set. */
  dasharray?: string;
  swatchClassName?: string;
};

// ChartLegend — pill-row legend rendered ABOVE the chart container, not
// inside the Recharts SVG. Keeps the chart area clean (no clipping at the
// bottom for legend space) and gives us full Tailwind control over the
// look. Each chart owns its series metadata (label + color) since Recharts
// only knows about the colors at SVG render time, but our charts have
// hard-coded colors anyway.
export function ChartLegend({
  items,
  className,
}: {
  items: ChartLegendItem[];
  className?: string;
}) {
  if (!items.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1 sm:gap-1.5", className)}>
      {items.map((item) => (
        <span
          key={item.label}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/[0.04] px-1.5 py-0.5 text-[0.68rem] font-medium text-slate-700 dark:bg-white/[0.06] dark:text-white/70 sm:px-2 sm:text-xs"
        >
          {item.dasharray ? (
            <svg
              aria-hidden
              width="12"
              height="2"
              viewBox="0 0 12 2"
              className="shrink-0"
            >
              <line
                x1="0"
                y1="1"
                x2="12"
                y2="1"
                stroke={item.color}
                strokeWidth="2"
                strokeDasharray={item.dasharray}
              />
            </svg>
          ) : (
            <span
              aria-hidden
              className={cn(
                "inline-block h-2 w-2 shrink-0 rounded-sm",
                item.swatchClassName,
              )}
              style={{ background: item.color }}
            />
          )}
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
}
