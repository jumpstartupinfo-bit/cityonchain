import { useEffect, useState, useCallback } from 'react';
import { parseAbiItem, type AbiEvent } from 'viem';
import { CITY_MARKETPLACE, CHAIN_ID, AD_SLOTS, STOREFRONTS, EVENT_TICKETS, LEASE_MANAGER } from '../contracts';
import { getChain } from '@/onchain-facts';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PricePoint {
  price: bigint;
  txHash: string;
}

export interface EconomicTotals {
  adRevenue:     bigint;
  rentRevenue:   bigint;
  ticketRevenue: bigint;
  leaseRevenue:  bigint;
  total:         bigint;
}

export interface AssetHistory {
  priceHistory: PricePoint[];
  economics:    EconomicTotals;
  loading:      boolean;
  error:        string | null;
  refresh:      () => void;
}

// ─── RPC client factory ───────────────────────────────────────────────────────

function makeRpcUrl(): string {
  const proxyChains: string[] = String(import.meta.env['VITE_RPC_PROXY_CHAINS'] ?? '').split(',');
  const proxyBase:   string   = String(import.meta.env['VITE_RPC_PROXY_BASE_URL'] ?? '');
  const proxyToken:  string   = String(import.meta.env['VITE_RPC_PROXY_TOKEN'] ?? '');
  if (proxyBase && proxyChains.includes('Arc_Testnet')) {
    return `${proxyBase}/api/rpc/Arc_Testnet?_rpc_token=${proxyToken}`;
  }
  const chain = getChain(CHAIN_ID);
  const urls = chain?.rpcUrls ?? [];
  return urls[0] ?? '';
}

async function makeClient() {
  const { createPublicClient, http } = await import('viem');
  const chain = getChain(CHAIN_ID);
  if (!chain) throw new Error('Chain not found');
  return createPublicClient({
    chain: chain as unknown as Parameters<typeof createPublicClient>[0]['chain'],
    transport: http(makeRpcUrl()),
  });
}

// ─── ABI items ────────────────────────────────────────────────────────────────
// Actual events from deployed CityMarketplace.sol:
//   Listed(uint256 indexed listingId, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 price)
//   Sold(uint256 indexed listingId, address indexed buyer, uint256 price, uint256 fee)

const LISTED_EVENT      = parseAbiItem('event Listed(uint256 indexed listingId, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 price)') as AbiEvent;
const SOLD_EVENT        = parseAbiItem('event Sold(uint256 indexed listingId, address indexed buyer, uint256 price, uint256 fee)') as AbiEvent;
const AD_BOOKED_EVENT   = parseAbiItem('event AdBooked(uint256 indexed adId, uint256 indexed slotId, address indexed advertiser, string adContentHash, string adLink, uint256 startTime, uint256 endTime, uint256 dailyRate)') as AbiEvent;
const UNIT_RENTED_EVENT = parseAbiItem('event UnitRented(uint256 indexed leaseId, uint256 indexed unitId, address indexed tenant, uint256 nextPaymentDue, uint256 gracePeriodEnd)') as AbiEvent;
const TICKET_EVENT      = parseAbiItem('event TicketsPurchased(uint256 indexed eventId, address indexed buyer, uint256 quantity, uint256 amount)') as AbiEvent;
const LEASE_EVENT       = parseAbiItem('event LeaseCreated(uint256 indexed tokenId, address lessee, uint256 fee, uint256 endTime)') as AbiEvent;

// CityMarketplace v2 confirmed at block 66_271_997; 66_260_000 gives a safe floor with minimal scan range
const DEPLOY_BLOCK = 66_260_000n;  // actual CityMarketplace v2 deploy block ~66.27M
// Max block range per getLogs call to avoid "block range too large" RPC errors
const MAX_RANGE = 800n;  // Arc Testnet caps eth_getLogs at ~1000 blocks per request

type LogResult = { args: Record<string, unknown>; transactionHash: string | null };

// ─── Chunked getLogs helper ───────────────────────────────────────────────────
async function getLogsChunked(
  client: Awaited<ReturnType<typeof makeClient>>,
  params: { address: `0x${string}`; event: AbiEvent; args?: Record<string, unknown>; fromBlock: bigint; toBlock: bigint },
): Promise<LogResult[]> {
  const results: LogResult[] = [];
  let from = params.fromBlock;
  while (from <= params.toBlock) {
    const to = from + MAX_RANGE - 1n < params.toBlock ? from + MAX_RANGE - 1n : params.toBlock;
    try {
      const chunk = await client.getLogs({ ...params, fromBlock: from, toBlock: to }) as LogResult[];
      results.push(...chunk);
    } catch {
      // skip chunk on error — best-effort
    }
    from = to + 1n;
  }
  return results;
}

// ─── delay helper ─────────────────────────────────────────────────────────────
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAssetHistory(
  nftAddress: string,
  tokenId: bigint | undefined,
  cityId: number,
  enabled = false,   // lazy — only load when the user expands the history section
): AssetHistory {
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [economics,    setEconomics]    = useState<EconomicTotals>({ adRevenue: 0n, rentRevenue: 0n, ticketRevenue: 0n, leaseRevenue: 0n, total: 0n });
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [tick,         setTick]         = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!enabled || tokenId === undefined) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const client = await makeClient();
        const latest = await client.getBlockNumber();

        // ── Price history ──────────────────────────────────────────────────
        // Step 1: fetch all Listed events for this nftContract to build listingId→tokenId map
        const listedLogs = await getLogsChunked(client, {
          address:   CITY_MARKETPLACE.address,
          event:     LISTED_EVENT,
          args:      { nftContract: nftAddress },
          fromBlock: DEPLOY_BLOCK,
          toBlock:   latest,
        });

        // Build map: listingId → { tokenId, initialPrice }
        const listingMap = new Map<bigint, { tokenId: bigint; price: bigint }>();
        for (const l of listedLogs) {
          const a = l.args as { listingId?: bigint; tokenId?: bigint; price?: bigint };
          if (a.listingId != null && a.tokenId != null && a.price != null) {
            listingMap.set(a.listingId, { tokenId: a.tokenId, price: a.price });
          }
        }

        await delay(400);
        // Step 2: fetch all Sold events
        const soldLogs = await getLogsChunked(client, {
          address:   CITY_MARKETPLACE.address,
          event:     SOLD_EVENT,
          fromBlock: DEPLOY_BLOCK,
          toBlock:   latest,
        });

        // Match Sold events to this tokenId via the listing map
        const points: PricePoint[] = soldLogs
          .filter(l => {
            const a = l.args as { listingId?: bigint; price?: bigint };
            if (a.listingId == null) return false;
            const listing = listingMap.get(a.listingId);
            return listing?.tokenId === tokenId;
          })
          .map(l => {
            const a = l.args as { listingId?: bigint; price?: bigint };
            return { price: a.price ?? 0n, txHash: l.transactionHash ?? '' };
          });

        // ── Economic activity ──────────────────────────────────────────────
        let adRev     = 0n;
        let rentRev   = 0n;
        let ticketRev = 0n;
        let leaseRev  = 0n;

        await delay(400);
        if (cityId > 0) {
          const adLogs = await getLogsChunked(client, {
            address:   AD_SLOTS.address,
            event:     AD_BOOKED_EVENT,
            args:      { cityId: BigInt(cityId) },
            fromBlock: DEPLOY_BLOCK,
            toBlock:   latest,
          });
          adRev = adLogs.reduce((acc, l) => acc + ((l.args as { dailyRate?: bigint }).dailyRate ?? 0n), 0n);

          const rentLogs = await getLogsChunked(client, {
            address:   STOREFRONTS.address,
            event:     UNIT_RENTED_EVENT,
            args:      { cityId: BigInt(cityId) },
            fromBlock: DEPLOY_BLOCK,
            toBlock:   latest,
          });
          // UnitRented doesn't emit amount directly — count events only
          rentRev = BigInt(rentLogs.length) * 1_000_000n; // 1 USDC placeholder per rental counted
        }

        await delay(400);
        const ticketLogs = await getLogsChunked(client, {
          address:   EVENT_TICKETS.address,
          event:     TICKET_EVENT,
          fromBlock: DEPLOY_BLOCK,
          toBlock:   latest,
        });
        ticketRev = ticketLogs.reduce((acc, l) => acc + ((l.args as { amount?: bigint; quantity?: bigint }).amount ?? 0n), 0n);

        await delay(400);
        const leaseLogs = await getLogsChunked(client, {
          address:   LEASE_MANAGER.address,
          event:     LEASE_EVENT,
          args:      { tokenId },
          fromBlock: DEPLOY_BLOCK,
          toBlock:   latest,
        });
        leaseRev = leaseLogs.reduce((acc, l) => acc + ((l.args as { fee?: bigint }).fee ?? 0n), 0n);

        const total = adRev + rentRev + ticketRev + leaseRev;

        if (!cancelled) {
          setPriceHistory(points);
          setEconomics({ adRevenue: adRev, rentRevenue: rentRev, ticketRevenue: ticketRev, leaseRevenue: leaseRev, total });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [nftAddress, tokenId, cityId, tick, enabled]);

  return { priceHistory, economics, loading, error, refresh };
}
