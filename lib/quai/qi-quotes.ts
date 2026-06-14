import { ZONE_RPC, QITS_PER_QI, RPC_BATCH_PARALLELISM } from "./constants";

const QI_TO_QUAI_BATCH_SIZE = 100;

type BatchResp<T> = { id: number; result?: T; error?: { message: string } };

export type QiQuoteRow = {
  period_start: string;
  block_number: number;
  qi_amount_qits: bigint;
  quai_amount_wei: bigint;
};

function hex(n: number | bigint): string {
  return `0x${BigInt(n).toString(16)}`;
}

async function batchQiToQuai(
  rows: { period_start: string; block_number: number }[],
  signal?: AbortSignal,
): Promise<Map<number, bigint>> {
  if (rows.length === 0) return new Map();
  const payload = rows.map((r, id) => ({
    jsonrpc: "2.0",
    id,
    method: "quai_qiToQuai",
    params: [hex(QITS_PER_QI), hex(r.block_number)],
  }));

  const res = await fetch(ZONE_RPC, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`batch qiToQuai ${res.status}`);
  const raw = await res.json();
  if (!Array.isArray(raw)) {
    throw new Error(
      `batch qiToQuai non-array response: ${JSON.stringify(raw).slice(0, 160)}`,
    );
  }

  const out = new Map<number, bigint>();
  for (const row of raw as BatchResp<string>[]) {
    if (row && typeof row.id === "number" && row.result?.startsWith("0x")) {
      out.set(rows[row.id].block_number, BigInt(row.result));
    }
  }
  return out;
}

export async function walkQiToQuaiDailyQuotes(
  rows: { period_start: string; block_number: number }[],
  signal?: AbortSignal,
): Promise<QiQuoteRow[]> {
  if (rows.length === 0) return [];
  const chunks: { period_start: string; block_number: number }[][] = [];
  for (let i = 0; i < rows.length; i += QI_TO_QUAI_BATCH_SIZE) {
    chunks.push(rows.slice(i, i + QI_TO_QUAI_BATCH_SIZE));
  }

  const byBlock = new Map<number, bigint>();
  async function worker() {
    while (true) {
      const chunk = chunks.shift();
      if (!chunk) return;
      const result = await batchQiToQuai(chunk, signal);
      for (const [block, value] of result) byBlock.set(block, value);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(RPC_BATCH_PARALLELISM, chunks.length) || 1 },
      () => worker(),
    ),
  );

  return rows.flatMap((r) => {
    const quote = byBlock.get(r.block_number);
    if (quote == null) return [];
    return {
      period_start: r.period_start,
      block_number: r.block_number,
      qi_amount_qits: QITS_PER_QI,
      quai_amount_wei: quote,
    };
  });
}
