/**
 * useOwnedTokens — ownership index for CityRegistry and DistrictRegistry.
 *
 * Strategy: balanceOf → tokenOfOwnerByIndex for each index.
 * No getLogs, no block scanning, no rate-limit storms.
 * N+1 calls where N = number of tokens owned (typically small).
 *
 * Caching: localStorage keyed by wallet + contract, survives page reloads.
 * On mount: shows cache immediately, syncs in background.
 * On error: keeps cached data, shows Retry banner.
 * Never shows "no assets" unless balanceOf confirmed 0.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPublicClient, http, parseAbiItem, type PublicClient } from 'viem';
import { activeChain } from '../config';
import { requireChain } from '../onchain-facts';
import { CHAIN_ID } from '../contracts';

// ── RPC endpoints — derived from onchain-facts so testnet/mainnet is automatic ─
const _chainFact = requireChain(CHAIN_ID);
export const ARC_RPC_ENDPOINTS: readonly string[] = _chainFact.rpcUrls.length > 0
  ? _chainFact.rpcUrls
  : [activeChain.rpcUrls.default.http[0]];

// ── ABI items ─────────────────────────────────────────────────────────────────
const BALANCE_OF_ABI    = parseAbiItem('function balanceOf(address owner) view returns (uint256)');
const TOKEN_BY_INDEX_ABI = parseAbiItem('function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)');

// ── Retry helpers ─────────────────────────────────────────────────────────────
const BACKOFF_MS = [500, 1000, 2000, 4000, 8000];

function isRateLimitError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes('429') || msg.toLowerCase().includes('rate limit') || msg.includes('Too Many Requests');
}

async function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

// ── Client pool ───────────────────────────────────────────────────────────────
function makeClients(): PublicClient[] {
  return ARC_RPC_ENDPOINTS.map(url =>
    createPublicClient({ chain: activeChain, transport: http(url, { timeout: 12_000 }) })
  );
}

// ── Single resilient call ─────────────────────────────────────────────────────
async function callWithRetry<T>(
  clients: PublicClient[],
  fn: (c: PublicClient) => Promise<T>,
): Promise<T> {
  let attempt = 0;
  let clientIdx = 0;
  while (attempt <= BACKOFF_MS.length) {
    try {
      return await fn(clients[clientIdx % clients.length]);
    } catch (e) {
      if (isRateLimitError(e)) {
        await sleep(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]);
      } else {
        clientIdx++;
        if (attempt < BACKOFF_MS.length) await sleep(300);
      }
      attempt++;
    }
  }
  throw new Error('All RPC retries exhausted');
}

// ── balanceOf ─────────────────────────────────────────────────────────────────
async function readBalance(
  clients: PublicClient[],
  contract: `0x${string}`,
  wallet: `0x${string}`,
): Promise<number> {
  const bal = await callWithRetry(clients, c =>
    c.readContract({ address: contract, abi: [BALANCE_OF_ABI], functionName: 'balanceOf', args: [wallet] })
  );
  return Number(bal);
}

// ── tokenOfOwnerByIndex — fetch all token IDs ─────────────────────────────────
async function fetchTokenIds(
  clients: PublicClient[],
  contract: `0x${string}`,
  wallet: `0x${string}`,
  balance: number,
): Promise<number[]> {
  // Batch all index calls via multicall on the first client, fall back to serial
  const client = clients[0];
  try {
    const results = await client.multicall({
      contracts: Array.from({ length: balance }, (_, i) => ({
        address: contract,
        abi: [TOKEN_BY_INDEX_ABI],
        functionName: 'tokenOfOwnerByIndex' as const,
        args: [wallet, BigInt(i)] as const,
      })),
      allowFailure: true,
    });
    const ids: number[] = [];
    for (const r of results) {
      if (r.status === 'success') ids.push(Number(r.result));
    }
    // If multicall returned all results, done
    if (ids.length === balance) return ids;
    // Otherwise fall through to serial
  } catch { /* multicall not supported — fall through to serial */ }

  // Serial fallback (one call per index)
  const ids: number[] = [];
  for (let i = 0; i < balance; i++) {
    const id = await callWithRetry(clients, c =>
      c.readContract({
        address: contract,
        abi: [TOKEN_BY_INDEX_ABI],
        functionName: 'tokenOfOwnerByIndex',
        args: [wallet, BigInt(i)],
      })
    );
    ids.push(Number(id));
  }
  return ids;
}

// ── localStorage cache ────────────────────────────────────────────────────────
interface TokenCache { ownedIds: number[]; syncedAt: number }
const LS_VERSION = 'v6';

function lsKey(address: string, contract: string) {
  return `cityonchain:${LS_VERSION}:${address.toLowerCase()}:${contract.toLowerCase()}`;
}
function readCache(address: string, contract: string): TokenCache | null {
  try {
    const raw = localStorage.getItem(lsKey(address, contract));
    return raw ? JSON.parse(raw) as TokenCache : null;
  } catch { return null; }
}
function writeCache(address: string, contract: string, ownedIds: number[]) {
  try {
    localStorage.setItem(lsKey(address, contract), JSON.stringify({ ownedIds, syncedAt: Date.now() }));
  } catch { /* storage full */ }
}



// ── Hook result ───────────────────────────────────────────────────────────────
export interface UseOwnedTokensResult {
  tokenIds: number[];
  loading: boolean;
  error: string | null;
  lastSyncTime: number | null;
  fromCache: boolean;
  retry: () => void;
}

// ── Main hook ─────────────────────────────────────────────────────────────────
export function useOwnedTokens(
  address: string | undefined,
  contract: `0x${string}`,
): UseOwnedTokensResult {
  const [tokenIds, setTokenIds] = useState<number[]>(() =>
    address ? (readCache(address, contract)?.ownedIds ?? []) : []
  );
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [lastSyncTime, setLastSync] = useState<number | null>(() =>
    address ? (readCache(address, contract)?.syncedAt ?? null) : null
  );
  const [fromCache, setFromCache]   = useState(() =>
    address ? readCache(address, contract) !== null : false
  );
  const [retryTick, setRetryTick]   = useState(0);
  const retry = useCallback(() => setRetryTick(t => t + 1), []);
  const abortRef = useRef(false);

  useEffect(() => {
    if (!address) return;
    abortRef.current = false;
    const clients = makeClients();
    const wallet  = address as `0x${string}`;

    const sync = async () => {
      setLoading(true);
      setError(null);
      try {
        const balance = await readBalance(clients, contract, wallet);
        if (abortRef.current) return;

        if (balance === 0) {
          setTokenIds([]);
          setFromCache(false);
          writeCache(address, contract, []);
          setLastSync(Date.now());
          setLoading(false);
          return;
        }

        const ids = await fetchTokenIds(clients, contract, wallet, balance);
        if (abortRef.current) return;

        writeCache(address, contract, ids);
        setTokenIds(ids);
        setLastSync(Date.now());
        setFromCache(false);
        setError(null);
      } catch (e) {
        if (abortRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
        setFromCache(readCache(address, contract) !== null);
      } finally {
        if (!abortRef.current) setLoading(false);
      }
    };

    void sync();
    return () => { abortRef.current = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, contract, retryTick]);

  return { tokenIds, loading, error, lastSyncTime, fromCache, retry };
}
