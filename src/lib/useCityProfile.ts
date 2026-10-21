/**
 * useCityProfile — reads CityProfile events, caches by (nft, tokenId), exposes history.
 *
 * Strategy: getLogs for ProfileUpdated + ProfileCleared on the CityProfile contract,
 * filtered by (nft, tokenId). Latest version wins. Cached in localStorage.
 * Re-fetches when a new tx is signalled via `refresh()`.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { CITY_PROFILE, CHAIN_ID } from '../contracts';
import { decodeProfile, type ProfileData, EMPTY_PROFILE } from './profileUtils';
import { requireChain } from '../onchain-facts';

const chain = requireChain(CHAIN_ID);
// Compass chain key — matches VITE_RPC_PROXY_CHAINS values
const COMPASS_CHAIN_KEY = (CHAIN_ID as number) === 5042 ? 'Arc' : 'Arc_Testnet';

function makeClient() {
  const proxyChains = String(import.meta.env['VITE_RPC_PROXY_CHAINS'] ?? '').split(',');
  const proxyBase = String(import.meta.env['VITE_RPC_PROXY_BASE_URL'] ?? '');
  const proxyToken = String(import.meta.env['VITE_RPC_PROXY_TOKEN'] ?? '');
  const fallbackRpc = chain.rpcUrls[0] ?? 'https://rpc.testnet.arc.io';
  const rpcUrl =
    proxyBase && proxyChains.includes(COMPASS_CHAIN_KEY)
      ? `${proxyBase}/api/rpc/${COMPASS_CHAIN_KEY}?_rpc_token=${proxyToken}`
      : fallbackRpc;
  return createPublicClient({ chain: chain as unknown as Parameters<typeof createPublicClient>[0]['chain'], transport: http(rpcUrl) });
}

const PROFILE_UPDATED_EVENT = parseAbiItem(
  'event ProfileUpdated(address indexed nft, uint256 indexed tokenId, address indexed owner, bytes32 contentHash, string content, uint32 version)'
);
const PROFILE_CLEARED_EVENT = parseAbiItem(
  'event ProfileCleared(address indexed nft, uint256 indexed tokenId, address indexed owner)'
);

export interface ProfileHistoryEntry {
  version: number;
  owner: string;
  content: string;
  profile: ProfileData;
  txHash: string;
  blockNumber: bigint;
}

export interface UseCityProfileResult {
  profile: ProfileData | null;    // null = no profile set / cleared / hidden
  isHidden: boolean;
  version: number;
  history: ProfileHistoryEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function cacheKey(nft: string, tokenId: bigint) {
  return `cityonchain:profile:v1:${nft.toLowerCase()}:${tokenId.toString()}`;
}

function readCache(nft: string, tokenId: bigint): ProfileHistoryEntry[] {
  try {
    const raw = localStorage.getItem(cacheKey(nft, tokenId));
    if (!raw) return [];
    return JSON.parse(raw) as ProfileHistoryEntry[];
  } catch { return []; }
}

function writeCache(nft: string, tokenId: bigint, entries: ProfileHistoryEntry[]) {
  try {
    localStorage.setItem(cacheKey(nft, tokenId), JSON.stringify(entries.slice(-50)));
  } catch { /* quota */ }
}

const DEPLOY_BLOCK = 66_000_000n; // approximate CityProfile deploy block
const MAX_RANGE   = 50_000n;

export function useCityProfile(nft: `0x${string}`, tokenId: bigint): UseCityProfileResult {
  const [history, setHistory] = useState<ProfileHistoryEntry[]>(() => readCache(nft, tokenId));
  const [isHidden, setIsHidden] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    async function fetchLogs() {
      setLoading(true);
      setError(null);
      try {
        const client = makeClient();
        const latest = await client.getBlockNumber();
        const from = DEPLOY_BLOCK;
        const to   = latest;

        // Fetch in chunks to respect any per-request block range caps
        const entries: ProfileHistoryEntry[] = [];
        let cursor = from;
        while (cursor <= to && !cancelled) {
          const end = cursor + MAX_RANGE - 1n < to ? cursor + MAX_RANGE - 1n : to;
          const [updated, cleared] = await Promise.all([
            client.getLogs({
              address: CITY_PROFILE.address,
              event: PROFILE_UPDATED_EVENT,
              args: { nft, tokenId },
              fromBlock: cursor,
              toBlock: end,
            }),
            client.getLogs({
              address: CITY_PROFILE.address,
              event: PROFILE_CLEARED_EVENT,
              args: { nft, tokenId },
              fromBlock: cursor,
              toBlock: end,
            }),
          ]);

          for (const log of updated) {
            const { owner, content, version } = log.args as { owner: string; content: string; version: number };
            if (!content) continue;
            entries.push({
              version,
              owner,
              content,
              profile: decodeProfile(content),
              txHash: log.transactionHash ?? '',
              blockNumber: log.blockNumber ?? 0n,
            });
          }
          // Cleared events mark the end of a profile version
          for (const log of cleared) {
            const { owner } = log.args as { owner: string };
            entries.push({
              version: 0,
              owner,
              content: '',
              profile: { ...EMPTY_PROFILE },
              txHash: log.transactionHash ?? '',
              blockNumber: log.blockNumber ?? 0n,
            });
          }
          cursor = end + 1n;
        }

        if (cancelled) return;

        // Sort by blockNumber asc, then version
        entries.sort((a, b) =>
          a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : a.version - b.version
        );

        writeCache(nft, tokenId, entries);
        setHistory(entries);

        // Check hidden status from contract
        const profileOnChain = await client.readContract({
          address: CITY_PROFILE.address,
          abi: CITY_PROFILE.abi,
          functionName: 'getProfile',
          args: [nft, tokenId],
        }) as [string, string, number, boolean];
        if (!cancelled) setIsHidden(profileOnChain[3] ?? false);

      } catch (e) {
        if (!cancelled) setError((e as Error).message ?? 'Failed to load profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchLogs();
    return () => { cancelled = true; ctrl.abort(); };
  }, [nft, tokenId, tick]);

  // Latest non-cleared entry with content
  const latestEntry = [...history].reverse().find((e) => e.content !== '');
  const profile = latestEntry ? latestEntry.profile : null;
  const version = latestEntry?.version ?? 0;

  return { profile, isHidden, version, history, loading, error, refresh };
}
