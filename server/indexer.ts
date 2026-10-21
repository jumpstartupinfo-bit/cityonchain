import { createPublicClient, http, parseAbiItem, type AbiEvent } from 'viem';
import { insertEvent, getLastIndexedBlock, setLastIndexedBlock } from './db';

// ── RPC URL ───────────────────────────────────────────────────────────────────
// The Arc Studio RPC proxy requires browser session auth — it cannot be used
// from a backend process. Always use the public Arc Testnet RPC URL here.
// On Railway, set ARC_TESTNET_RPC_URL to your preferred RPC endpoint.
const RPC_URL: string = (() => {
  const url = process.env.ARC_TESTNET_RPC_URL;
  if (!url) console.warn('[indexer] ARC_TESTNET_RPC_URL not set — add it to .env');
  return url ?? '';
})();

// ── Chain definition ──────────────────────────────────────────────────────────
const ARC_TESTNET_CHAIN_ID = 5042002;
const ARC_TESTNET = {
  id: ARC_TESTNET_CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};

const client = createPublicClient({
  chain: ARC_TESTNET as Parameters<typeof createPublicClient>[0]['chain'],
  transport: http(RPC_URL),
});

// ── Contract addresses (from .env — VITE_ prefix makes them public) ───────────
function requireAddr(key: string): `0x${string}` {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v as `0x${string}`;
}

const CITY_MARKETPLACE  = requireAddr('VITE_CITY_MARKETPLACE_ADDRESS');
const REVENUE_SPLITTER  = requireAddr('VITE_REVENUE_SPLITTER_ADDRESS');
const REFERRAL_VAULT    = requireAddr('VITE_REFERRAL_VAULT_ADDRESS');
const LEASE_MANAGER     = requireAddr('VITE_LEASE_MANAGER_ADDRESS');
const AD_SLOTS          = requireAddr('VITE_AD_SLOTS_ADDRESS');
const STOREFRONTS       = requireAddr('VITE_STOREFRONTS_ADDRESS');
const EVENT_TICKETS     = requireAddr('VITE_EVENT_TICKETS_ADDRESS');
const DISTRICT_REGISTRY = requireAddr('VITE_DISTRICT_REGISTRY_ADDRESS');

const DEPLOY_BLOCK = BigInt(process.env.DEPLOY_BLOCK ?? '0');
const CHUNK = 800n;
const POLL_MS = 30_000;

// ── Event ABIs ────────────────────────────────────────────────────────────────
const ABI_SOLD      = parseAbiItem('event Sold(uint256 indexed listingId, address indexed buyer, uint256 price, uint256 fee)') as AbiEvent;
const ABI_LISTED    = parseAbiItem('event Listed(uint256 indexed listingId, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 price)') as AbiEvent;
const ABI_SPLIT_WD  = parseAbiItem('event Withdrawn(address indexed account, uint256 amount)') as AbiEvent;
const ABI_REFERRAL  = parseAbiItem('event CommissionClaimed(address indexed referrer, uint256 amount)') as AbiEvent;
const ABI_LEASE     = parseAbiItem('event LeaseCreated(uint256 indexed tokenId, address lessee, uint256 fee, uint256 endTime)') as AbiEvent;
const ABI_AD        = parseAbiItem('event AdBooked(uint256 indexed adId, uint256 indexed slotId, address indexed advertiser, string adContentHash, string adLink, uint256 startTime, uint256 endTime, uint256 dailyRate)') as AbiEvent;
const ABI_RENT      = parseAbiItem('event UnitRented(uint256 indexed leaseId, uint256 indexed unitId, address indexed tenant, uint256 nextPaymentDue, uint256 gracePeriodEnd)') as AbiEvent;
const ABI_TICKETS   = parseAbiItem('event TicketsPurchased(uint256 indexed eventId, address indexed buyer, uint256 quantity, uint256 amount)') as AbiEvent;

// ── Utilities ─────────────────────────────────────────────────────────────────
function toUsd(raw: bigint): string { return (Number(raw) / 1_000_000).toFixed(6); }

type Log<T> = { args?: T; transactionHash?: string; logIndex?: number; blockNumber?: bigint };

async function getLogs<T>(
  address: `0x${string}`,
  event: AbiEvent,
  from: bigint,
  to: bigint,
): Promise<Log<T>[]> {
  const out: Log<T>[] = [];
  let cur = from;
  while (cur <= to) {
    const end = cur + CHUNK - 1n < to ? cur + CHUNK - 1n : to;
    try {
      const logs = await client.getLogs({ address, event, fromBlock: cur, toBlock: end });
      out.push(...(logs as Log<T>[]));
    } catch (e) {
      console.warn(`[indexer] chunk ${cur}-${end} skipped:`, String(e).slice(0, 80));
    }
    await new Promise(r => setTimeout(r, 400));
    cur = end + 1n;
  }
  return out;
}

// ── Index pass ────────────────────────────────────────────────────────────────
export async function indexNewBlocks() {
  try {
    const current = await client.getBlockNumber();
    const last = await getLastIndexedBlock();
    const from = last === 0n
      ? (current > DEPLOY_BLOCK + 5000n ? current - 5000n : DEPLOY_BLOCK)
      : last + 1n;

    if (from > current) return;
    console.log(`[indexer] blocks ${from}–${current}`);

    // 1. Marketplace sales
    type ListedArgs = { listingId?: bigint; seller?: string; nftContract?: string; tokenId?: bigint };
    type SoldArgs   = { listingId?: bigint; buyer?: string; price?: bigint };

    const [listed, sold] = await Promise.all([
      getLogs<ListedArgs>(CITY_MARKETPLACE, ABI_LISTED, from, current),
      getLogs<SoldArgs>(CITY_MARKETPLACE, ABI_SOLD, from, current),
    ]);

    const listingMap = new Map<string, { seller: string; nftContract: string; tokenId: bigint }>();
    for (const log of listed) {
      const a = log.args ?? {};
      if (a.listingId != null && a.seller && a.nftContract && a.tokenId != null)
        listingMap.set(a.listingId.toString(), { seller: a.seller.toLowerCase(), nftContract: a.nftContract.toLowerCase(), tokenId: a.tokenId });
    }

    for (const log of sold) {
      const a = log.args ?? {};
      if (a.listingId == null || !log.transactionHash) continue;
      const listing = listingMap.get(a.listingId.toString());
      if (!listing?.seller) continue;
      const isCity = listing.nftContract !== DISTRICT_REGISTRY.toLowerCase();
      const cityId = isCity ? Number(listing.tokenId) : Math.floor(Number(listing.tokenId) / 100);
      await insertEvent({
        wallet: listing.seller,
        event_type: 'marketplace_sale',
        amount_raw: (a.price ?? 0n).toString(),
        amount_usd: toUsd(a.price ?? 0n),
        tx_hash: log.transactionHash,
        log_index: log.logIndex ?? 0,
        block_number: (log.blockNumber ?? 0n).toString(),
        block_time: null,
        metadata: { listingId: a.listingId.toString(), buyer: a.buyer ?? '', cityId, isCity },
      });
    }

    // 2. Revenue split withdrawals
    type WdArgs = { account?: string; amount?: bigint };
    for (const log of await getLogs<WdArgs>(REVENUE_SPLITTER, ABI_SPLIT_WD, from, current)) {
      const a = log.args ?? {};
      if (!a.account || !log.transactionHash) continue;
      await insertEvent({ wallet: a.account, event_type: 'revenue_split', amount_raw: (a.amount ?? 0n).toString(), amount_usd: toUsd(a.amount ?? 0n), tx_hash: log.transactionHash, log_index: log.logIndex ?? 0, block_number: (log.blockNumber ?? 0n).toString(), block_time: null, metadata: {} });
    }

    // 3. Referral commissions
    type RefArgs = { referrer?: string; amount?: bigint };
    for (const log of await getLogs<RefArgs>(REFERRAL_VAULT, ABI_REFERRAL, from, current)) {
      const a = log.args ?? {};
      if (!a.referrer || !log.transactionHash) continue;
      await insertEvent({ wallet: a.referrer, event_type: 'referral_commission', amount_raw: (a.amount ?? 0n).toString(), amount_usd: toUsd(a.amount ?? 0n), tx_hash: log.transactionHash, log_index: log.logIndex ?? 0, block_number: (log.blockNumber ?? 0n).toString(), block_time: null, metadata: {} });
    }

    // 4. Leases
    type LeaseArgs = { tokenId?: bigint; lessee?: string; fee?: bigint; endTime?: bigint };
    for (const log of await getLogs<LeaseArgs>(LEASE_MANAGER, ABI_LEASE, from, current)) {
      const a = log.args ?? {};
      if (!a.lessee || !log.transactionHash) continue;
      await insertEvent({ wallet: a.lessee, event_type: 'lease_payment', amount_raw: (a.fee ?? 0n).toString(), amount_usd: toUsd(a.fee ?? 0n), tx_hash: log.transactionHash, log_index: log.logIndex ?? 0, block_number: (log.blockNumber ?? 0n).toString(), block_time: null, metadata: { tokenId: a.tokenId?.toString(), endTime: a.endTime?.toString() } });
    }

    // 5. Ad bookings
    type AdArgs = { adId?: bigint; slotId?: bigint; advertiser?: string; dailyRate?: bigint; startTime?: bigint; endTime?: bigint };
    for (const log of await getLogs<AdArgs>(AD_SLOTS, ABI_AD, from, current)) {
      const a = log.args ?? {};
      if (!a.advertiser || !log.transactionHash) continue;
      const days = (a.startTime != null && a.endTime != null) ? (a.endTime - a.startTime) / 86400n : 1n;
      const total = (a.dailyRate ?? 0n) * (days > 0n ? days : 1n);
      await insertEvent({ wallet: a.advertiser, event_type: 'ad_booking', amount_raw: total.toString(), amount_usd: toUsd(total), tx_hash: log.transactionHash, log_index: log.logIndex ?? 0, block_number: (log.blockNumber ?? 0n).toString(), block_time: null, metadata: { adId: a.adId?.toString(), slotId: a.slotId?.toString() } });
    }

    // 6. Storefront rentals
    type RentArgs = { leaseId?: bigint; unitId?: bigint; tenant?: string };
    for (const log of await getLogs<RentArgs>(STOREFRONTS, ABI_RENT, from, current)) {
      const a = log.args ?? {};
      if (!a.tenant || !log.transactionHash) continue;
      await insertEvent({ wallet: a.tenant, event_type: 'storefront_rent', amount_raw: '0', amount_usd: '0.000000', tx_hash: log.transactionHash, log_index: log.logIndex ?? 0, block_number: (log.blockNumber ?? 0n).toString(), block_time: null, metadata: { leaseId: a.leaseId?.toString(), unitId: a.unitId?.toString() } });
    }

    // 7. Event ticket purchases
    type TicketArgs = { eventId?: bigint; buyer?: string; quantity?: bigint; amount?: bigint };
    for (const log of await getLogs<TicketArgs>(EVENT_TICKETS, ABI_TICKETS, from, current)) {
      const a = log.args ?? {};
      if (!a.buyer || !log.transactionHash) continue;
      await insertEvent({ wallet: a.buyer, event_type: 'ticket_purchase', amount_raw: (a.amount ?? 0n).toString(), amount_usd: toUsd(a.amount ?? 0n), tx_hash: log.transactionHash, log_index: log.logIndex ?? 0, block_number: (log.blockNumber ?? 0n).toString(), block_time: null, metadata: { eventId: a.eventId?.toString(), quantity: a.quantity?.toString() } });
    }

    await setLastIndexedBlock(current);
    console.log(`[indexer] indexed to block ${current}`);
  } catch (e) {
    console.error('[indexer] error:', e);
  }
}

export function startIndexer() {
  console.log('[indexer] starting — polling every', POLL_MS / 1000, 's');
  void indexNewBlocks();
  setInterval(() => { void indexNewBlocks(); }, POLL_MS);
}
