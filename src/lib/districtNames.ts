/**
 * Deterministic district name generator.
 * Names are derived from cityId + districtIndex — same seed always produces the same name.
 * No randomness per render. No API needed.
 *
 * District owners can override the default name by setting a sectorIndex (1–30) on-chain.
 * Index 0 = unset, falls back to the deterministic default name.
 */

// ── 30 constrained sector names (indices 1–30) ──────────────────────────────
// Index 0 is reserved for "unset" — use getDistrictName() as fallback.
export const SECTOR_NAMES: Record<number, string> = {
   1: 'Finance Row',
   2: 'Tech Yards',
   3: 'Trade Wharf',
   4: 'Culture Mile',
   5: 'Industry Gate',
   6: 'Media Square',
   7: 'Health Plaza',
   8: 'Civic Heights',
   9: 'Commerce Bridge',
  10: 'Power Corridor',
  11: 'Research Green',
  12: 'Transport Hub',
  13: 'Tourism Bay',
  14: 'Arts Quarter',
  15: 'Agri Vale',
  16: 'The Exchange',
  17: 'The Foundry',
  18: 'The Grid',
  19: 'The Market',
  20: 'The Forum',
  21: 'The Yards',
  22: 'The Commons',
  23: 'The Harbor',
  24: 'The Strip',
  25: 'The Campus',
  26: 'The Heights',
  27: 'The Corridor',
  28: 'The Plaza',
  29: 'The Basin',
  30: 'The Quarter',
};

export const SECTOR_ICONS: Record<number, string> = {
   1: 'building-2',     2: 'cpu',           3: 'ship',         4: 'music',
   5: 'factory',        6: 'radio',         7: 'heart-pulse',  8: 'landmark',
   9: 'shopping-bag',  10: 'zap',          11: 'flask-conical', 12: 'bus',
  13: 'sun',           14: 'palette',      15: 'leaf',         16: 'bar-chart',
  17: 'hammer',        18: 'network',      19: 'store',        20: 'scale',
  21: 'package',       22: 'trees',        23: 'anchor',       24: 'star',
  25: 'graduation-cap',26: 'crown',        27: 'arrow-right',  28: 'map-pin',
  29: 'flame',         30: 'layers',
};

/** Returns the sector name for a given index, or undefined if unset (index 0). */
export function getSectorName(sectorIndex: number): string | undefined {
  if (!sectorIndex) return undefined;
  return SECTOR_NAMES[sectorIndex];
}

/** Returns the sector icon for a given index, or undefined if unset. */
export function getSectorIcon(sectorIndex: number): string | undefined {
  if (!sectorIndex) return SECTOR_ICONS[sectorIndex];
  return SECTOR_ICONS[sectorIndex];
}

// ── Deterministic fallback (used when sectorIndex == 0) ─────────────────────
const PREFIXES = [
  'Financial', 'Tech', 'Old Town', 'Port', 'Central', 'Market', 'Royal',
  'Garden', 'Harbor', 'Heritage', 'Arts', 'University', 'Commerce', 'Cultural',
  'Industrial', 'Media', 'Embassy', 'Grand', 'New', 'East', 'West', 'North', 'South', 'Lakeside',
];

const SUFFIXES = [
  'District', 'Quarter', 'Hub', 'Block', 'Zone', 'Estate', 'Heights',
  'Centre', 'Row', 'Ward', 'Park', 'Commons', 'Plaza', 'Point',
];

// Icons for districts (maps to lucide icon names)
const DISTRICT_ICONS = [
  'building-2', 'cpu', 'landmark', 'ship', 'building', 'shopping-bag', 'crown',
  'trees', 'anchor', 'library', 'palette', 'graduation-cap', 'bar-chart', 'music',
  'factory', 'radio', 'flag', 'star', 'map-pin', 'sunrise', 'sunset', 'compass', 'mountain', 'waves',
];

function seededHash(a: number, b: number): number {
  let h = (a * 2654435761 ^ b * 2246822519) >>> 0;
  h = ((h ^ (h >>> 16)) * 2246822519) >>> 0;
  h = ((h ^ (h >>> 13)) * 3266489917) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function getDistrictName(cityId: number, index: number): string {
  const h = seededHash(cityId, index);
  const prefix = PREFIXES[h % PREFIXES.length];
  const suffix = SUFFIXES[(h >> 8) % SUFFIXES.length];
  if (suffix === 'District' && prefix.includes('District')) return prefix;
  return `${prefix} ${suffix}`;
}

/** Returns the display name for a district — sector name if set, otherwise deterministic fallback. */
export function getDistrictDisplayName(cityId: number, index: number, sectorIndex: number): string {
  return getSectorName(sectorIndex) ?? getDistrictName(cityId, index);
}

export function getDistrictIcon(cityId: number, index: number): string {
  const h = seededHash(cityId, index + 100);
  return DISTRICT_ICONS[h % DISTRICT_ICONS.length];
}

export function getDistrictColor(index: number): string {
  const colors = [
    '#2d7a3a', '#1e5228', '#3a9648', '#4fb860', '#c8922a', '#7ab8d4',
    '#a855f7', '#3b82f6', '#ef4444', '#f59e0b', '#22c55e', '#06b6d4',
  ];
  return colors[index % colors.length];
}
