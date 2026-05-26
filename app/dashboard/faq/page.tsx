"use client";

import { useEffect } from "react";
import { Card, CardTitle } from "@/components/ui/Card";

const DOC_LINKS = [
  {
    label: "Tokenomics Overview",
    href: "https://docs.qu.ai/learn/tokenomics/tokenomics-overview",
  },
  {
    label: "QUAI Emissions",
    href: "https://docs.qu.ai/learn/tokenomics/quai-emissions",
  },
  {
    label: "Qi Emissions",
    href: "https://docs.qu.ai/learn/tokenomics/qi-emissions",
  },
  {
    label: "Token Dynamics",
    href: "https://docs.qu.ai/learn/tokenomics/token-dynamics/token-dynamics",
  },
  {
    label: "Project SOAP",
    href: "https://docs.qu.ai/learn/advanced-introduction/soap",
  },
  {
    label: "SOAP Burn Dashboard",
    href: "https://soap.qu.ai",
  },
];

const FAQS = [
  {
    q: "What is this tracker showing?",
    a: "This dashboard tracks realized QUAI and Qi supply on cyprus1 from live chain/RPC data and Postgres rollups. The key QUAI number is circulating supply after SOAP burn has already been factored into the RPC-reported total.",
  },
  {
    q: "What is the difference between QUAI and Qi?",
    a: "QUAI is the EVM-compatible store-of-value token. Qi is the energy-linked medium-of-exchange token. The docs frame the pair as complementary: QUAI is designed for scarcity and long-term value storage, while Qi is designed for payments, stability, and unit-of-account use.",
  },
  {
    q: "Why are there two supply curves?",
    a: "QUAI and Qi follow different emission logic. QUAI rewards scale logarithmically with difficulty, so supply growth becomes more constrained as the network grows. Qi rewards scale linearly with difficulty, tying issuance more directly to energy/hash cost.",
  },
  {
    q: "What changed at Singularity?",
    a: "The Singularity Fork reduced future genesis unlocks by 1,667,159,984 QUAI. That moved the vested genesis baseline from 3,000,000,000 QUAI to 1,332,840,016 QUAI. This was a reduction of future unlocks, not a balance transfer shown as daily circulating burn.",
  },
  {
    q: "What is SOAP burn?",
    a: "SOAP routes selected merge-mined value into open-market QUAI buybacks and burns. In this app, Total SOAP burn is the balance at the known burn address; circulating QUAI supply already reflects that burn in the RPC total, so the main supply chart does not subtract it again.",
  },
  {
    q: "How does SOAP work at a high level?",
    a: "SOAP stands for Subsidized Open-market Acquisition Protocol. Parent-chain merge-mining rewards from supported chains such as BCH, LTC, DOGE, and RVN can be routed to protocol-controlled addresses, converted into QUAI, and burned. Miners still earn QUAI for valid Quai work; the parent-chain subsidy becomes buy pressure and burn pressure instead of direct sell pressure.",
  },
  {
    q: "What does SOAP mean for miners?",
    a: "KAWPOW miners can author Quai blocks normally. SHA256d, Scrypt, and other supported parent-chain miners can contribute workshares through AuxPoW, adding security and earning QUAI rewards. SOAP is additive: if parent-chain participation disappears, Quai blocks can still be produced by regular KAWPOW mining.",
  },
  {
    q: "What is the QUAI soft cap?",
    a: "The tracker uses 1.4B QUAI as a soft-cap target for forecast and comparison views. It is not a Bitcoin-style hard-coded absolute cap. The tokenomics docs describe a cap scenario where total supply equals genesis unlocks plus mining emissions minus SOAP burns; if SOAP fully offsets mining emissions over time, net emissions approach zero and supply trends toward the post-Singularity genesis baseline of about 1.33284B QUAI.",
  },
  {
    q: "What are tail emissions?",
    a: "Tail emissions are the continuing mining rewards after the early supply phase. Quai does not rely on a fixed halving schedule like Bitcoin. QUAI rewards scale logarithmically with difficulty, so issuance can continue for security while becoming progressively more constrained as network difficulty grows. SOAP burn can offset some or all of that ongoing issuance depending on market activity.",
  },
  {
    q: "Why does the forecast use a straight line?",
    a: "The Circulating QUAI Supply forecast is an intentionally simple line from the latest observed circulating supply to the current 1.4B QUAI cap target date used in the comparison model. It is a planning guide, not a block-by-block protocol simulation.",
  },
  {
    q: "How does Qi supply change?",
    a: "Qi supply changes through miner-selected emissions and conversions. Miners can choose Qi rewards when economics favor it, and users can convert between Qi and QUAI at the current reward ratio. This makes Qi supply more demand-responsive.",
  },
  {
    q: "Why do some mining charts mention sampling?",
    a: "Historical per-algorithm mining data is sampled during backfill because full block/workshare and mining-info calls are more expensive. Period rollups handle the extrapolation; the chart footnotes call out which values are sampled versus dense.",
  },
];

const METRICS = [
  {
    metric: "Circulating QUAI",
    meaning: "RPC supply total plus genesis schedule handling, already net of SOAP burn.",
  },
  {
    metric: "Circulating Qi",
    meaning: "Cumulative Qi supply from emissions and conversions on cyprus1.",
  },
  {
    metric: "Total SOAP burn",
    meaning: "QUAI held at the SOAP burn address, shown separately as burn context. For the live SOAP program view, use soap.qu.ai.",
  },
  {
    metric: "Genesis allocation",
    meaning: "Post-Singularity genesis baseline, reduced from 3B to ~1.333B QUAI.",
  },
  {
    metric: "Upcoming unlocks",
    meaning: "Estimated genesis unlock dates derived from the block-based schedule.",
  },
  {
    metric: "Soft cap forecast",
    meaning: "A simple projection toward 1.4B QUAI, not a hard cap or protocol-accurate emission simulator.",
  },
];

export default function FaqPage() {
  useEffect(() => {
    document.title = "Quai · FAQs";
  }, []);

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6 md:px-8 md:py-10">
      <div className="mb-6">
        <p className="eyebrow">Reference</p>
        <h1 className="display-heading mt-2 text-3xl text-slate-900 dark:text-white md:text-5xl">
          FAQs
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-900/65 dark:text-white/60">
          Short answers for interpreting the supply, burn, unlock, and mining
          charts. Source docs are linked at the bottom for deeper protocol
          details.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="space-y-4">
          {FAQS.map((item) => (
            <Card key={item.q}>
              <CardTitle>{item.q}</CardTitle>
              <p className="mt-2 text-sm leading-6 text-slate-900/70 dark:text-white/65">
                {item.a}
              </p>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card>
            <CardTitle>Dashboard metrics</CardTitle>
            <div className="mt-3 divide-y divide-slate-200/70 dark:divide-white/10">
              {METRICS.map((row) => (
                <div key={row.metric} className="py-3 first:pt-0 last:pb-0">
                  <div className="font-mono text-xs uppercase tracking-wider text-quai-600 dark:text-quai-400">
                    {row.metric}
                  </div>
                  <p className="mt-1 text-sm leading-5 text-slate-900/65 dark:text-white/60">
                    {row.meaning}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle>Official docs</CardTitle>
            <div className="mt-3 grid gap-2">
              {DOC_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-slate-900/10 px-3 py-2 text-sm text-slate-900/70 transition hover:border-quai-500/60 hover:text-quai-600 dark:border-white/10 dark:text-white/65 dark:hover:border-quai-500/70 dark:hover:text-quai-400"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
