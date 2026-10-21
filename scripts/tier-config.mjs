/**
 * Tier configuration — single source of truth used by build script AND frontend.
 *
 * Display tiers (1–6): higher number = lower population.
 * Contract tiers (0–3): also higher number = higher population (mega=3, town=0).
 *
 * Display tier → contract tier mapping:
 *   Display 1 (Mega 10M+)      → Contract 3
 *   Display 2 (Major 3M-10M)   → Contract 3
 *   Display 3 (Large 1M-3M)    → Contract 2
 *   Display 4 (City 300k-1M)   → Contract 2
 *   Display 5 (Town 100k-300k) → Contract 1
 *   Display 6 (Small 15k-100k) → Contract 0
 */

export const MIN_POPULATION = 15_000;

/** Display tier boundaries — [ minPop (inclusive), displayTier ] ordered largest first */
export const DISPLAY_TIER_THRESHOLDS = [
  { min: 10_000_000, tier: 1, label: 'Mega City',   tag: 'mega'  },
  { min:  3_000_000, tier: 2, label: 'Major City',  tag: 'major' },
  { min:  1_000_000, tier: 3, label: 'Large City',  tag: 'large' },
  { min:    300_000, tier: 4, label: 'City',         tag: 'city'  },
  { min:    100_000, tier: 5, label: 'Town',         tag: 'town'  },
  { min:     15_000, tier: 6, label: 'Small Town',   tag: 'small' },
];

export function computeDisplayTier(population) {
  for (const { min, tier } of DISPLAY_TIER_THRESHOLDS) {
    if (population >= min) return tier;
  }
  return 6;
}

// The contract uses display tiers 1–6 directly. No 4-tier mapping.

/**
 * Admin-editable price table (USDC, 6 decimals).
 * Keys are display tiers 1–6.
 * These are also what the FeeConfig contract stores as tierPrice[contractTier].
 * Change these here before redeploying FeeConfig.
 */
export const TIER_PRICES_USDC = {
  1: 7_500,   // Mega City
  2: 3_000,   // Major City
  3: 1_200,   // Large City
  4:   400,   // City
  5:   120,   // Town
  6:    40,   // Small Town
};

/** Same prices as on-chain USDC amounts (6 decimals) */
export const TIER_PRICES_RAW = Object.fromEntries(
  Object.entries(TIER_PRICES_USDC).map(([t, p]) => [t, p * 1_000_000])
);

export const TIER_LABELS = {
  1: 'Mega City (10M+)',
  2: 'Major City (3M–10M)',
  3: 'Large City (1M–3M)',
  4: 'City (300k–1M)',
  5: 'Town (100k–300k)',
  6: 'Small Town (15k–100k)',
};

/**
 * District count per display tier (admin-editable in contract).
 * Mega=24, Major=16, Large=12, City=8, Town=6, Small=4.
 */
export const DISTRICT_COUNT_BY_TIER = {
  1: 24, // Mega
  2: 16, // Major
  3: 12, // Large
  4:  8, // City
  5:  6, // Town
  6:  4, // Small
};

/**
 * District price = cityPrice * DISTRICT_PRICE_BPS / 10000, floored at DISTRICT_PRICE_FLOOR.
 * These match the contract defaults.
 */
export const DISTRICT_PRICE_BPS   = 500;          // 5%
export const DISTRICT_PRICE_FLOOR = 5_000_000;    // 5 USDC (6 decimals)

/** Compute district price given the city's raw USDC price (6 decimals). */
export function computeDistrictPrice(cityPriceRaw) {
  const computed = Math.floor(cityPriceRaw * DISTRICT_PRICE_BPS / 10_000);
  return Math.max(computed, DISTRICT_PRICE_FLOOR);
}
