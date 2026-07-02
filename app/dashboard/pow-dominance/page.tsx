"use client";

import { useEffect } from "react";
import { PowDominanceDashboard } from "@/components/dashboard/pow/PowDominanceDashboard";

export default function PowDominancePage() {
  useEffect(() => {
    document.title = "Quai · PoW Dominance";
  }, []);

  return <PowDominanceDashboard />;
}
