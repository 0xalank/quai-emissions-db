"use client";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useHeadBlock } from "@/lib/hooks";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { DashboardSubNav } from "@/components/dashboard/shared/DashboardSubNav";

// Single-bar layout: logo + dashboard surface tabs (rendered inline via
// DashboardSubNav) + status cluster + theme toggle. Replaces the previous
// stacked TopNav-over-DashboardSubNav layout. Target height ~52px.

export function TopNav() {
  return (
    <nav
      className="sticky top-0 z-10 border-b backdrop-blur"
      style={{
        background: "var(--nav-bg)",
        borderColor: "var(--nav-border)",
      }}
    >
      <div className="mx-auto flex h-[52px] max-w-[1400px] items-center justify-between gap-4 px-4 md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.02em]"
          >
            <QuaiMark />
            <span className="text-quai-500">Quai</span>
            <span className="text-slate-900 dark:text-white/90">
              Supply Tracker
            </span>
          </Link>
          <span
            aria-hidden
            className="hidden h-5 w-px shrink-0 bg-slate-900/10 dark:bg-ink-50/10 sm:inline-block"
          />
          <DashboardSubNav />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <StatusCluster />
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}

function QuaiMark() {
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-black shadow-glow"
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none">
        <circle cx="9.25" cy="12" r="6.75" fill="#e20101" />
        <circle cx="14.75" cy="12" r="6.75" fill="#ffffff" fillOpacity="0.92" />
        <path
          d="M12 6.85A6.73 6.73 0 0 1 12 17.15A6.73 6.73 0 0 1 12 6.85Z"
          fill="black"
          fillOpacity="0.1"
        />
      </svg>
    </span>
  );
}

function StatusCluster() {
  const { data, error, isLoading } = useHeadBlock();
  const hasData = !!data && typeof data.headBlock === "number";
  const dotClass = error
    ? "bg-amber-400"
    : hasData
      ? data.lagBlocks > 100
        ? "bg-amber-400"
        : "bg-emerald-400"
      : "bg-slate-400 dark:bg-white/20";
  const text = error
    ? "status unknown"
    : isLoading
      ? "loading…"
      : hasData
        ? data.lagBlocks === 0
          ? `head #${data.headBlock.toLocaleString()} · synced`
          : `head #${data.headBlock.toLocaleString()} · ${data.lagBlocks.toLocaleString()} behind`
        : "awaiting /api/health";
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-white/50">
      <span
        className={cn("inline-block h-2 w-2 rounded-full", dotClass)}
        aria-hidden
      />
      <span className="hidden md:inline">{text}</span>
    </div>
  );
}
