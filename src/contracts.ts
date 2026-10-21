import cityRegistryArtifact from '../contracts/out/CityOnChain.sol/CityRegistry.json';
import districtRegistryArtifact from '../contracts/out/DistrictRegistry.sol/DistrictRegistry.json';
import marketplaceArtifact from '../contracts/out/CityMarketplace.sol/CityMarketplace.json';
import leaseManagerArtifact from '../contracts/out/LeaseManager.sol/LeaseManager.json';
import revenueSplitterArtifact from '../contracts/out/RevenueSplitter.sol/RevenueSplitter.json';
import adSlotsArtifact from '../contracts/out/AdSlots.sol/AdSlots.json';
import feeConfigArtifact from '../contracts/out/FeeConfig.sol/FeeConfig.json';
import treasuryArtifact from '../contracts/out/Treasury.sol/Treasury.json';
import storefrontsArtifact from '../contracts/out/Storefronts.sol/Storefronts.json';
import eventTicketsArtifact from '../contracts/out/EventTickets.sol/EventTickets.json';
import activityTrackerArtifact from '../contracts/out/ActivityTracker.sol/ActivityTracker.json';
import referralVaultArtifact from '../contracts/out/ReferralVault.sol/ReferralVault.json';
import cityProfileArtifact from '../contracts/out/CityProfile.sol/CityProfile.json';
import cityPassArtifact from '../contracts/out/CityPass.sol/CityPass.json';

// Deprecated registry addresses — do not use in any new code
export const DEPRECATED_CITY_REGISTRY   = '0xa050c3766fb586f0e9ad9a4ce1b73966ea895cb3' as const;
export const DEPRECATED_DISTRICT_REGISTRY = '0x2b5ec5ce07a6fb81de824a9007ca867f03e5585d' as const;
// v2 — deprecated 2026-10-14 (no mintBatch, attacker-controlled district price)
export const DEPRECATED_CITY_REGISTRY_V2   = '0xdfcc641304b0203681151811c900041560aae21c' as const;
export const DEPRECATED_DISTRICT_REGISTRY_V2 = '0xdfad95dca46ad031463f8a117ad0ab25302d2269' as const;
export const DEPRECATED_CITY_MARKETPLACE_V2 = '0x09ea7584863b69895bd726ce37115b890e47c585' as const;
// v3 DistrictRegistry — deprecated 2026-10-15 (no mintBatchAdmin)
export const DEPRECATED_DISTRICT_REGISTRY_V3 = '0x08913c285e289cd53d69f2d2bc12e6110f0c1421' as const;
export const DEPRECATED_DISTRICT_REGISTRY_V4 = '0x7c976628d458d9b9a1bcfe3612c2cadab85b173c' as const;

export const CITY_REGISTRY = {
  address: '0x594c5818268be1f61df21688dadd7f5164aa4737' as const,
  abi: cityRegistryArtifact.abi,
};

export const DISTRICT_REGISTRY = {
  address: '0x970f9c991e1dceee4d73a9c4d74841a0fc87ca0c' as const,
  abi: districtRegistryArtifact.abi,
};

export const REFERRAL_VAULT = {
  address: '0xf10915f35195fe581dafa6c158647dffad9038fe' as const,
  abi: referralVaultArtifact.abi,
};

export const CITY_PROFILE = {
  address: '0xb60800a4eb4ff170c0ebbe38befce38b225dd59f' as const,
  abi: cityProfileArtifact.abi,
};

export const CITY_MARKETPLACE = {
  address: '0xbf1892693217a3f64f3f3b67456adb2abbc0ed9e' as const,
  abi: marketplaceArtifact.abi,
};

export const LEASE_MANAGER = {
  address: '0x5936eb002a88548c57349cb1ed5158ab41ba3ff8' as const,
  abi: leaseManagerArtifact.abi,
};

export const REVENUE_SPLITTER = {
  address: '0x3162861d8bb4a5bdf7786070174a5bd6e0f70ef7' as const,
  abi: revenueSplitterArtifact.abi,
};

export const AD_SLOTS = {
  address: '0x95d75ce64d956817c37c9753074e24836658bfbe' as const,
  abi: adSlotsArtifact.abi,
};

// Arc Testnet chain ID
export const CHAIN_ID = 5042002;

// USDC on Arc Testnet
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const;

// The contract uses display tiers 1–6 directly. No 4-tier mapping.

// District price = cityPrice * DISTRICT_PRICE_BPS / 10000, floor 5 USDC
export const DISTRICT_PRICE_BPS = 500n;          // 5%
export const DISTRICT_PRICE_FLOOR = 5_000_000n;  // $5 USDC

/** Compute district price from the city's raw USDC price (bigint, 6 decimals). */
export function computeDistrictPrice(cityPriceRaw: bigint): bigint {
  const computed = cityPriceRaw * DISTRICT_PRICE_BPS / 10_000n;
  return computed > DISTRICT_PRICE_FLOOR ? computed : DISTRICT_PRICE_FLOOR;
}

// District count per display tier (1–6). Matches contract districtCountByTier.
export const DISTRICT_COUNT_BY_DISPLAY_TIER: Record<number, number> = {
  1: 24, // Mega
  2: 16, // Major
  3: 12, // Large
  4:  8, // City
  5:  6, // Town
  6:  4, // Small
};

// Display tier labels (1–6)
export const DISPLAY_TIER_LABELS: Record<number, string> = {
  1: 'Mega City (10M+)',
  2: 'Major City (3M–10M)',
  3: 'Large City (1M–3M)',
  4: 'City (300k–1M)',
  5: 'Town (100k–300k)',
  6: 'Small Town (15k–100k)',
};

// City price per display tier (raw USDC, 6 decimals) — 6 distinct tiers
export const CITY_PRICE_BY_DISPLAY_TIER: Record<number, bigint> = {
  1: 7_500_000_000n, // Mega        — $7,500
  2: 3_000_000_000n, // Major       — $3,000
  3: 1_200_000_000n, // Large       — $1,200
  4:   400_000_000n, // City        — $400
  5:   120_000_000n, // Town        — $120
  6:    40_000_000n, // Small Town  — $40
};

// Display tier labels (1–6) — contract now uses these directly
export const TIER_LABELS: Record<number, string> = {
  1: 'Mega City',
  2: 'Major City',
  3: 'Large City',
  4: 'City',
  5: 'Town',
  6: 'Small Town',
};

/** Safe tier label — always returns a string even for 0 / undefined / out-of-range */
export function tierLabel(tier: number | undefined): string {
  return (tier != null && TIER_LABELS[tier]) ? TIER_LABELS[tier] : 'City';
}

export const TIER_COLORS: Record<number, string> = {
  1: '#f59e0b', // gold
  2: '#f97316', // orange
  3: '#a78bfa', // purple
  4: '#60a5fa', // blue
  5: '#4ade80', // green
  6: '#94a3b8', // slate
};

// FeeConfig — timelocked fee rates and tier prices
export const FEE_CONFIG = {
  address: '0xf65bc1c49df763341320aa3ca8ae9bf8cd9723b1' as const,
  abi: feeConfigArtifact.abi,
};

// Treasury — collects all platform revenue by source
export const TREASURY = {
  address: '0x3e83b5390f65022593cc8f59128bfa61aa062326' as const,
  abi: treasuryArtifact.abi,
};

// Phase 2: Storefronts
export const STOREFRONTS = {
  address: '0x6550dad7a6f94ecd939703ea1a6ea1ccedd886c5' as const,
  abi: storefrontsArtifact.abi,
};

// Phase 2: EventTickets (ERC-1155)
export const EVENT_TICKETS = {
  address: '0x194443b870b8cdd14dc8af5f093252f10c29fa13' as const,
  abi: eventTicketsArtifact.abi,
};

// Phase 2: ActivityTracker — deployed 2026-10-08
export const ACTIVITY_TRACKER = {
  address: '0xb2313fd07af4a708e3ece2fc92219095fd034674' as const,
  abi: activityTrackerArtifact.abi,
};

// CityPass — ERC-1155 residency passes, deployed 2026-10-09
export const CITY_PASS = {
  address: '0x94b2bc62d0ed08f673b2db40b20f145da9f7b026' as const,
  abi: cityPassArtifact.abi,
};

// Activity type labels (matches ActivityTracker.sol uint8 enum)
export const ACTIVITY_TYPE_LABELS: Record<number, string> = {
  0: 'Ad',
  1: 'Rent',
  2: 'Ticket',
  3: 'Checkout',
  4: 'Resale',
};

// Admin wallet — owns all contracts, receives treasury, can edit fees
export const ADMIN_ADDRESS = '0xb3FfE33BB506d316D4995C8FF5E63d5A742B10C1' as const;

// Revenue source enum (matches Treasury.sol RevenueSource)
export const REVENUE_SOURCE_LABELS: Record<number, string> = {
  0: 'Primary Sale',
  1: 'Activity Fee',
  2: 'Marketplace Fee',
  3: 'Lease Fee',
  4: 'Ad Fee',
};

// Fee type keys used in FeeConfig (must match contract strings)
export const FEE_TYPES = [
  { key: 'primarySaleFee',  label: 'Primary Sale Fee',   hardCap: 1000 },
  { key: 'activityFee',     label: 'Activity Fee',        hardCap: 3000 },
  { key: 'marketplaceFee',  label: 'Marketplace Fee',     hardCap: 2000 },
  { key: 'leaseFee',        label: 'Lease Fee',           hardCap: 2000 },
  { key: 'adFee',           label: 'Ad Fee',              hardCap: 3000 },
] as const;
