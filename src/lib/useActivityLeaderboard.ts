/**
 * useActivityLeaderboard — reads city rankings from ActivityTracker on-chain.
 *
 * Mainnet-only: all revenue contracts call recordActivity() so this is the
 * authoritative source of truth. Disabled on testnet (use useLeaderboard instead).
 *
 * Reads ActivityTracker.cityActivity(cityId) for the top N cities from the
 * cities dataset, sorted by totalVolume descending.
 */
import { useReadContracts } from 'wagmi';
import { useMemo } from 'react';
import { ACTIVITY_TRACKER } from '../contracts';
import { useCities } from './useCities';
import type { CityRankEntry } from './useLeaderboard';

interface ActivityLeaderboardState {
  loading: boolean;
  entries: CityRankEntry[];
  lastScanned: number | null;
  error: string | null;
}

// Read cityActivity for up to top 200 cities by their merkle IDs
const CITY_ACTIVITY_ABI = [
  {
    name: 'cityActivity',
    type: 'function' as const,
    stateMutability: 'view' as const,
    inputs: [{ name: 'cityId', type: 'uint256' }],
    outputs: [
      { name: 'totalVolume', type: 'uint256' },
      { name: 'activityCount', type: 'uint256' },
      { name: 'lastActivity', type: 'uint256' },
    ],
  },
] as const;

export function useActivityLeaderboard(enabled: boolean): ActivityLeaderboardState {
  const { cities } = useCities();

  // Take first 200 cities by dataset order
  const topCities = useMemo(() => cities.slice(0, 200), [cities]);

  const contracts = useMemo(() =>
    topCities.map(c => ({
      address: ACTIVITY_TRACKER.address as `0x${string}`,
      abi: CITY_ACTIVITY_ABI,
      functionName: 'cityActivity' as const,
      args: [BigInt(c.id)] as [bigint],
    })),
    [topCities]
  );

  const { data, isLoading, isError } = useReadContracts({
    contracts,
    query: {
      enabled: enabled && topCities.length > 0,
      staleTime: 60_000,
      refetchInterval: 60_000,
    },
  });

  const entries = useMemo<CityRankEntry[]>(() => {
    if (!data) return [];
    return topCities
      .map((city, i) => {
        const result = data[i];
        if (!result || result.status !== 'success') return null;
        const [totalVolume, activityCount] = result.result as [bigint, bigint, bigint];
        return {
          cityId: city.id,
          volume: Number(totalVolume) / 1_000_000,
          count: Number(activityCount),
        };
      })
      .filter((e): e is CityRankEntry => e !== null && (e.volume > 0 || e.count > 0))
      .sort((a, b) => b.volume - a.volume);
  }, [data, topCities]);

  return {
    loading: isLoading,
    entries,
    lastScanned: null,
    error: isError ? 'Failed to load activity data' : null,
  };
}
