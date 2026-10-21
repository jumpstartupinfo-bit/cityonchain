/**
 * Frontend tier config — mirrors scripts/tier-config.mjs.
 * Edit here AND in tier-config.mjs to keep them in sync, then re-run build-cities.
 */

export const TIER_LABELS: Record<number, string> = {
  1: 'Mega City',
  2: 'Major City',
  3: 'Large City',
  4: 'City',
  5: 'Town',
  6: 'Small Town',
};

export const TIER_POPULATION_RANGE: Record<number, string> = {
  1: '10M+',
  2: '3M–10M',
  3: '1M–3M',
  4: '300k–1M',
  5: '100k–300k',
  6: '15k–100k',
};

/** Mayor license price in USDC by display tier */
export const TIER_PRICES_USDC: Record<number, number> = {
  1: 7_500,
  2: 3_000,
  3: 1_200,
  4:   400,
  5:   120,
  6:    40,
};

/** USDC raw (6 decimals) */
export const TIER_PRICES_RAW: Record<number, bigint> = Object.fromEntries(
  Object.entries(TIER_PRICES_USDC).map(([t, p]) => [Number(t), BigInt(p) * 1_000_000n])
);

/** Display tier → contract tier */
export const DISPLAY_TO_CONTRACT_TIER: Record<number, number> = {
  1: 3, 2: 3, 3: 2, 4: 2, 5: 1, 6: 0,
};

/** Safe tier label — always returns a string even for 0 / undefined / out-of-range */
export function tierLabel(tier: number | undefined): string {
  return (tier != null && TIER_LABELS[tier]) ? TIER_LABELS[tier] : 'City';
}

/** Tier accent colours for UI */
export const TIER_COLORS: Record<number, string> = {
  1: '#f59e0b',  // amber — mega
  2: '#f97316',  // orange — major
  3: '#8b5cf6',  // purple — large
  4: '#3b82f6',  // blue — city
  5: '#10b981',  // green — town
  6: '#6b7280',  // gray — small
};
