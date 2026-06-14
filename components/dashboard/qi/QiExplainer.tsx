"use client";
import { Card, CardTitle } from "@/components/ui/Card";

const DOC_LINKS = [
  {
    label: "Qi emissions",
    href: "https://docs.qu.ai/learn/tokenomics/qi-emissions",
  },
  {
    label: "Qi privacy",
    href: "https://docs.qu.ai/learn/advanced-introduction/qi-privacy",
  },
  {
    label: "Conversions",
    href: "https://docs.qu.ai/learn/tokenomics/token-dynamics/conversions",
  },
];

export function QiExplainer() {
  return (
    <Card className="border-l-4 border-l-emerald-500/80 dark:border-l-emerald-400/70">
      <div className="chart-card-header">
        <div>
          <CardTitle>What is Qi?</CardTitle>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-950 dark:text-white">
            Qi is Quai Network&apos;s energy-linked medium-of-exchange token:
            a UTXO asset designed for everyday payments, cash-like privacy, and
            supply that responds through miner emissions and protocol
            conversions. This page tracks the chain&apos;s Qi/QUAI quote, the
            implied Qi price from stored QUAI/USDT market data, Qi supply, and
            conversion context.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <ExplainerPoint
          title="Compared with USDT/USDC"
          body="Qi is native protocol money, not a tokenized claim issued by a company against bank reserves. That removes issuer and reserve-custody dependency, while still leaving protocol and market risk."
        />
        <ExplainerPoint
          title="Compared with USD"
          body="Qi can settle directly on-chain and be self-custodied like digital cash. Its design targets an energy-cost reference instead of central-bank policy or commercial banking rails."
        />
        <ExplainerPoint
          title="Why the Qi ledger matters"
          body="Qi uses fixed denominations, enforced non-address reuse, and payment-code style receive flows so payments can behave more like cash than a fully transparent account ledger."
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {DOC_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-slate-900/10 px-2.5 py-1 text-xs text-slate-950 transition hover:border-slate-900/20 dark:border-white/10 dark:text-white dark:hover:border-white/20"
          >
            {link.label}
          </a>
        ))}
      </div>
    </Card>
  );
}

function ExplainerPoint({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-slate-900/10 p-3 dark:border-white/10">
      <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-950 dark:text-white">
        {body}
      </p>
    </div>
  );
}
