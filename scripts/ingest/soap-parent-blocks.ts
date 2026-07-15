import { MINING_POOL_STATS_FEEDS } from "../../lib/quai/miningpoolstats";
import { fetchSoapParentBlockPage } from "../../lib/quai/soap-parent-blocks";
import {
  getSoapParentBlockCount,
  markSoapParentBlockSync,
  upsertSoapParentBlocks,
} from "./db";

const BACKFILL_PAGE_SIZE = 1000;
const INCREMENTAL_PAGE_SIZE = 100;
const INCREMENTAL_OVERLAP = 100;

export type SoapParentBlockSyncResult = {
  target: string;
  storedBefore: number;
  fetched: number;
  indexed: number;
  sourceTotal: number;
};

async function syncFeed(
  config: (typeof MINING_POOL_STATS_FEEDS)[number],
): Promise<SoapParentBlockSyncResult> {
  const storedBefore = await getSoapParentBlockCount(config.soapChain);
  let offset = 0;
  let fetched = 0;
  let sourceTotal = 0;
  let targetFetchCount =
    storedBefore === 0 ? BACKFILL_PAGE_SIZE : INCREMENTAL_PAGE_SIZE;

  while (true) {
    const pageSize =
      storedBefore === 0 || offset > 0
        ? BACKFILL_PAGE_SIZE
        : INCREMENTAL_PAGE_SIZE;
    const page = await fetchSoapParentBlockPage(config, {
      limit: pageSize,
      offset,
    });
    sourceTotal = page.totalCount;
    if (offset === 0) {
      const missing = Math.max(0, sourceTotal - storedBefore);
      targetFetchCount =
        storedBefore === 0
          ? sourceTotal
          : Math.max(
              INCREMENTAL_PAGE_SIZE,
              missing + INCREMENTAL_OVERLAP,
            );
    }

    await upsertSoapParentBlocks(page.blocks);
    fetched += page.blocks.length;
    offset += page.blocks.length;

    if (
      page.blocks.length === 0 ||
      !page.hasMore ||
      fetched >= targetFetchCount
    ) {
      break;
    }
  }

  await markSoapParentBlockSync(config.soapChain, sourceTotal);
  return {
    target: config.target,
    storedBefore,
    fetched,
    indexed: await getSoapParentBlockCount(config.soapChain),
    sourceTotal,
  };
}

export async function syncSoapParentBlocks(): Promise<
  SoapParentBlockSyncResult[]
> {
  return Promise.all(MINING_POOL_STATS_FEEDS.map(syncFeed));
}
