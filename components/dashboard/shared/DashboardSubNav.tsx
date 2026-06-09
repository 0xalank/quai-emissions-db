"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Surface-level navigation rendered inline inside `TopNav` (Phase 1
// collapsed the previous double-bar layout into one bar). This component
// no longer renders its own background/border — the parent nav owns those.
//
// Phase 2: an animated underline slides between active tabs. Tabs keep
// their pill-style active background; the moving bar reinforces the
// transition without depending on Framer Motion.

const TABS = [
  { href: "/dashboard", label: "Home", exact: true },
  { href: "/dashboard/mining", label: "Mining" },
  { href: "/dashboard/faq", label: "FAQs" },
];

function isActive(pathname: string | null, t: { href: string; exact?: boolean }) {
  if (!pathname) return false;
  return t.exact
    ? pathname === t.href
    : pathname === t.href || pathname.startsWith(t.href + "/");
}

export function DashboardSubNav() {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefsRef = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
  } | null>(null);

  useLayoutEffect(() => {
    const activeTab = TABS.find((t) => isActive(pathname, t));
    if (!activeTab) {
      setIndicator(null);
      return;
    }
    const el = tabRefsRef.current.get(activeTab.href);
    if (!el) return;
    setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [pathname]);

  return (
    <div
      ref={containerRef}
      className="relative flex max-w-full items-center gap-1 overflow-x-auto whitespace-nowrap pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map((t) => {
        const active = isActive(pathname, t);
        return (
          <Link
            key={t.href}
            href={t.href}
            ref={(el) => {
              if (el) tabRefsRef.current.set(t.href, el);
              else tabRefsRef.current.delete(t.href);
            }}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1.5 text-sm transition sm:px-3 sm:py-1",
              active
                ? "bg-slate-900/10 text-slate-900 dark:bg-white/10 dark:text-white"
                : "text-slate-700 hover:text-slate-900 dark:text-white/60 dark:hover:text-white/90",
            )}
          >
            {t.label}
          </Link>
        );
      })}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-0 h-[2px] rounded-full bg-quai-500 dark:bg-quai-400",
          "transition-[left,width] duration-300 ease-out",
        )}
        style={{
          left: indicator?.left ?? 0,
          width: indicator?.width ?? 0,
        }}
      />
    </div>
  );
}
