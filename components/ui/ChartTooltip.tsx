"use client";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Recharts passes a payload array of entries when the tooltip is active.
// We don't import Recharts types directly because the shape is permissive
// and varies slightly by chart kind; the structural type below is enough.
type TooltipPayloadEntry = {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
};

export type ChartTooltipFormatter = (
  value: number | string,
  name: string,
  entry: TooltipPayloadEntry,
) => ReactNode | [ReactNode, ReactNode];

export type ChartTooltipLabelFormatter = (
  label: string | number,
  payload?: TooltipPayloadEntry[],
) => ReactNode;

export type ChartTooltipProps = {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
  formatter?: ChartTooltipFormatter;
  labelFormatter?: ChartTooltipLabelFormatter;
};

// ChartTooltip — drop-in replacement for Recharts' default tooltip rendered
// via the `content` prop on `<Tooltip>`. Uses the same CSS variables the
// inline contentStyle did so the theming stays in lockstep with the rest
// of the chart palette.
//
// `formatter` and `labelFormatter` mirror the Recharts API so each chart
// keeps its existing number/date formatting logic.
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const header =
    labelFormatter && label !== undefined
      ? labelFormatter(label, payload)
      : (label ?? null);

  return (
    <div
      className="max-w-[calc(100vw-2rem)] min-w-[160px] rounded-md border p-2.5 shadow-md sm:min-w-[180px]"
      style={{
        background: "var(--chart-tooltip-bg)",
        color: "var(--chart-tooltip-text)",
        borderColor: "var(--chart-tooltip-border)",
      }}
      role="tooltip"
    >
      {header !== null && header !== "" && (
        <div className="mb-1.5 text-[0.65rem] uppercase tracking-wider text-slate-900/55 dark:text-white/55">
          {header}
        </div>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((entry, idx) => {
          const name = String(entry.name ?? entry.dataKey ?? "");
          const rawValue = entry.value ?? "";
          const formatted = formatter
            ? formatter(rawValue as number | string, name, entry)
            : rawValue;
          let displayValue: ReactNode = formatted as ReactNode;
          let displayName: ReactNode = name;
          if (Array.isArray(formatted) && formatted.length === 2) {
            displayValue = formatted[0];
            displayName = formatted[1];
          }
          return (
            <div
              key={`${name}-${idx}`}
              className="flex min-w-0 items-center gap-2 text-xs"
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-sm"
                style={{ background: entry.color ?? "currentColor" }}
              />
              <span className="flex-1 truncate text-slate-900/75 dark:text-white/75">
                {displayName}
              </span>
              <span
                className={cn(
                  "tabular text-right font-mono text-slate-900 dark:text-white",
                )}
              >
                {displayValue}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
