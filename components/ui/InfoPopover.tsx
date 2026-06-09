"use client";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small click/hover popover used on chart card titles to surface non-obvious
 * semantics (e.g. why burn_close is the only authoritative burn signal).
 * Closes on outside click, Escape, or another click on the trigger.
 */
export function InfoPopover({
  label = "More info",
  children,
  align = "right",
}: {
  label?: string;
  children: ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((s) => !s)}
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded-full transition",
          "text-slate-700 hover:bg-slate-900/10 hover:text-slate-900",
          "dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white/90",
          open &&
            "bg-slate-900/10 text-slate-900 dark:bg-white/10 dark:text-white/90",
        )}
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className={cn(
            "fixed inset-x-3 bottom-3 z-20 max-h-[70vh] overflow-y-auto rounded-lg border p-3 text-xs leading-relaxed shadow-xl",
            "sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-7 sm:w-72",
            align === "right" ? "sm:right-0" : "sm:left-0",
          )}
          style={{
            background: "var(--popover-bg)",
            borderColor: "var(--popover-border)",
            color: "var(--popover-text)",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
