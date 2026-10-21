/**
 * useLeaderboard — derives city rankings from on-chain events directly.
 *
 * Reads Sold, AdBooked, UnitRented, and TicketsPurchased events from the
 * last ~12,000 blocks (800-block chunks, Arc Testnet cap) and sums USDC
 * volume + event count per cityId.
 *
 * MAINNET NOTE: When deploying to mainnet, replace ActivityTracker with
 * Option A — update all revenue contracts to call recordActivity() so
 * rankings are maintained on-chain. This hook is a testnet-only fallback.
 * Remove this hook and revert Leaderboards.tsx to use ActivityTracker reads.
 */
import { useState, useEffect, useRef } from 'react';
import { createPublicClient, http, parseAbiItem } from 'viem';
import type { Chain, AbiEvent } from 'viem';
import {
  CITY_MARKETPLACE, AD_SLOTS, STOREFRONTS, EVENT_TICKETS, LEASE_MANAGER,
  DISTRICT_REGISTRY, CHAIN_ID,
} from '../contracts';
import { getChain } from '../onchain-facts';

export interface CityRankEntry {
  cityId: number;
  volume: number;   // USDC, human-readable (e.g. 200.00)
  count: number;    // number of activity events
}

interface LeaderboardState {
  loading: boolean;
  entries: CityRankEntry[];
  lastScanned: number | null;  // block number
  error: string | null;
}

// Arc Testnet hard cap: 800 blocks per getLogs request
const MAX_RANGE = 800n;
// Scan the last 6,000 blocks for activity (fewer chunks = fewer rate-limit hits)
const SCAN_WINDOW = 6_000n;

const DEPLOY_BLOCK = 66_260_000n;

const SOLD_ABI        = parseAbiItem('event Sold(uint256 indexed listingId, address indexed buyer, uint256 price, uint256 fee)') as AbiEvent;
const AD_BOOKED_ABI   = parseAbiItem('event AdBooked(uint256 indexed adId, uint256 indexed slotId, address indexed advertiser, string adContentHash, string adLink, uint256 startTime, uint256 endTime, uint256 dailyRate)') as AbiEvent;
const UNIT_RENTED_ABI = parseAbiItem('event UnitRented(uint256 indexed leaseId, uint256 indexed unitId, address indexed tenant, uint256 nextPaymentDue, uint256 gracePeriodEnd)') as AbiEvent;
const TICKET_ABI      = parseAbiItem('event TicketsPurchased(uint256 indexed eventId, address indexed buyer, uint256 quantity, uint256 amount)') as AbiEvent;
const LEASE_ABI       = parseAbiItem('event LeaseCreated(uint256 indexed tokenId, address lessee, uint256 fee, uint256 endTime)') as AbiEvent;
// CityMarketplace Listed event to resolve nftContract + tokenId for Sold events
const LISTED_ABI      = parseAbiItem('event Listed(uint256 indexed listingId, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 price)') as AbiEvent;

async function getLogsChunked(
  client: ReturnType<typeof createPublicClient>,
  params: { address: `0x${string}`; event: AbiEvent; fromBlock: bigint; toBlock: bigint },
): Promise<unknown[]> {
  const results: unknown[] = [];
  let from = params.fromBlock;
  while (from <= params.toBlock) {
    const to = from + MAX_RANGE - 1n < params.toBlock ? from + MAX_RANGE - 1n : params.toBlock;
    try {
      const logs = await client.getLogs({ ...params, fromBlock: from, toBlock: to });
      results.push(...logs);
    } catch {
      // rate-limited chunk — skip silently
    }
    await new Promise(r => setTimeout(r, 800));
    from = to + 1n;
  }
  return results;
}

/** Extract cityId from a district tokenId: floor(tokenId / 100) */
function districtCityId(tokenId: bigint): number {
  return Number(tokenId / 100n);
}

export function useLeaderboard(enabled = false): LeaderboardState {
  const [state, setState] = useState<LeaderboardState>({
    loading: true, entries: [], lastScanned: null, error: null,
  });
  const ranOnce = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (ranOnce.current) return;
    ranOnce.current = true;

    async function load() {
      const chain = getChain(CHAIN_ID);
      if (!chain) { setState(s => ({ ...s, loading: false, error: 'Chain not found' })); return; }

      const client = createPublicClient({
        chain: chain as unknown as Chain,
        transport: http((chain.rpcUrls)[0]),
      });

      try {
        const currentBlock = await client.getBlockNumber();
        const fromBlock = currentBlock - SCAN_WINDOW < DEPLOY_BLOCK ? DEPLOY_BLOCK : currentBlock - SCAN_WINDOW;

        // Accumulator: cityId → { volume (raw bigint USDC 6-dec), count }
        const acc: Record<number, { volume: bigint; count: number }> = {};
        function add(cityId: number, amount: bigint) {
          if (!cityId || cityId <= 0) return;
          if (!acc[cityId]) acc[cityId] = { volume: 0n, count: 0 };
          acc[cityId].volume += amount;
          acc[cityId].count += 1;
        }

        // 1. Sold events — need Listed events to resolve cityId from tokenId
        const [soldLogs, listedLogs] = await Promise.all([
          getLogsChunked(client, { address: CITY_MARKETPLACE.address, event: SOLD_ABI, fromBlock, toBlock: currentBlock }),
          getLogsChunked(client, { address: CITY_MARKETPLACE.address, event: LISTED_ABI, fromBlock, toBlock: currentBlock }),
        ]);

        // Build listingId → { nftContract, tokenId } map from Listed events
        const listingMap = new Map<bigint, { nftContract: string; tokenId: bigint }>();
        for (const log of listedLogs) {
          const a = (log as { args?: { listingId?: bigint; nftContract?: string; tokenId?: bigint } }).args ?? {};
          if (a.listingId != null && a.nftContract && a.tokenId != null) {
            listingMap.set(a.listingId, { nftContract: a.nftContract.toLowerCase(), tokenId: a.tokenId });
          }
        }

        for (const log of soldLogs) {
          const a = (log as { args?: { listingId?: bigint; price?: bigint } }).args ?? {};
          if (a.listingId == null || a.price == null) continue;
          const listing = listingMap.get(a.listingId);
          if (!listing) continue;
          const isCity = listing.nftContract === CITY_MARKETPLACE.address.toLowerCase() ||
            listing.nftContract !== DISTRICT_REGISTRY.address.toLowerCase();
          const cityId = isCity
            ? Number(listing.tokenId)
            : districtCityId(listing.tokenId);
          add(cityId, a.price);
        }

        // 2. AdBooked — slotId encodes cityId as floor(slotId / 100)
        const adLogs = await getLogsChunked(client, { address: AD_SLOTS.address, event: AD_BOOKED_ABI, fromBlock, toBlock: currentBlock });
        for (const log of adLogs) {
          const a = (log as { args?: { slotId?: bigint; dailyRate?: bigint; startTime?: bigint; endTime?: bigint } }).args ?? {};
          if (a.slotId == null) continue;
          const cityId = Number(a.slotId / 100n);
          // Approximate total: dailyRate * days
          const days = a.startTime != null && a.endTime != null ? (a.endTime - a.startTime) / 86400n : 1n;
          const amount = (a.dailyRate ?? 0n) * (days > 0n ? days : 1n);
          add(cityId, amount);
        }

        // 3. UnitRented — unitId encodes districtId as floor(unitId / 1000), districtId encodes cityId as floor(districtId / 100)
        const rentLogs = await getLogsChunked(client, { address: STOREFRONTS.address, event: UNIT_RENTED_ABI, fromBlock, toBlock: currentBlock });
        for (const log of rentLogs) {
          const a = (log as { args?: { unitId?: bigint } }).args ?? {};
          if (a.unitId == null) continue;
          const districtTokenId = a.unitId / 1000n;
          const cityId = districtCityId(districtTokenId);
          add(cityId, 0n); // amount not in event — count only
        }

        // 4. TicketsPurchased — eventId encodes cityId via district ownership
        const ticketLogs = await getLogsChunked(client, { address: EVENT_TICKETS.address, event: TICKET_ABI, fromBlock, toBlock: currentBlock });
        for (const log of ticketLogs) {
          const a = (log as { args?: { amount?: bigint; eventId?: bigint } }).args ?? {};
          add(0, a.amount ?? 0n); // eventId→cityId mapping not available without extra read — count globally
        }

        // 5. LeaseCreated — tokenId is cityId (city leases)
        const leaseLogs = await getLogsChunked(client, { address: LEASE_MANAGER.address, event: LEASE_ABI, fromBlock, toBlock: currentBlock });
        for (const log of leaseLogs) {
          const a = (log as { args?: { tokenId?: bigint; fee?: bigint } }).args ?? {};
          if (a.tokenId == null) continue;
          add(Number(a.tokenId), a.fee ?? 0n);
        }

        // Sort by volume descending
        const entries: CityRankEntry[] = Object.entries(acc)
          .filter(([id]) => Number(id) > 0)
          .map(([id, { volume, count }]) => ({
            cityId: Number(id),
            volume: Number(volume) / 1_000_000,
            count,
          }))
          .sort((a, b) => b.volume - a.volume || b.count - a.count);

        setState({ loading: false, entries, lastScanned: Number(currentBlock), error: null });
      } catch (e) {
        setState(s => ({ ...s, loading: false, error: String(e) }));
      }
    }

    void load();
  }, [enabled]);

  return state;
}
