/**
 * District generator — computes district layout for a city on demand.
 * No district data is stored or shipped; this runs in the browser.
 */
import type { City } from './merkle';

export type District = {
  index: number;       // 0-based
  tokenId: number;     // cityId * 100 + index
  name: string;
  lat: number;
  lng: number;
  cityId: number;
  displayTier: number; // 1–6
};

/** Number of districts per display tier (matches DistrictRegistry.sol defaults) */
export const DISTRICTS_PER_TIER: Record<number, number> = {
  1: 24, // Mega City (10M+)
  2: 16, // Major City (3M–10M)
  3: 12, // Large City (1M–3M)
  4:  8, // City (300k–1M)
  5:  6, // Town (100k–300k)
  6:  4, // Small Town (15k–100k)
};

/** District price in USDC by display tier (cityPrice * 5%, floor $5) */
export const DISTRICT_PRICES_USDC: Record<number, number> = {
  1: 375, // Mega:   $7,500 * 5%
  2: 150, // Major:  $3,000 * 5%
  3:  60, // Large:  $1,200 * 5%
  4:  20, // City:   $400   * 5%
  5:   6, // Town:   $120   * 5%
  6:   5, // Small:  $40    * 5% = $2 → floor $5
};

const DISTRICT_NAMES = [
  'North', 'East', 'South', 'West',
  'Central', 'Old Town', 'New Town', 'Market',
  'Heights', 'Bay', 'Park', 'Harbor',
  'Tech', 'Arts', 'Financial', 'University',
  'Gardens', 'Riverside', 'Uptown', 'Downtown',
  'Industrial', 'Plaza', 'Lakeside', 'Westgate',
];

/**
 * Generate district layout for a city.
 * Districts are placed in a radial pattern around the city centre.
 * The radius scales with the number of districts.
 */
export function generateDistricts(city: City): District[] {
  const count = DISTRICTS_PER_TIER[city.displayTier] ?? 4;
  const radius = 0.05 + (count / 24) * 0.15; // degrees ~5km–20km
  const districts: District[] = [];

  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count;
    const lat = city.lat + radius * Math.cos(angle);
    const lng = city.lng + radius * Math.sin(angle) / Math.cos((city.lat * Math.PI) / 180);
    districts.push({
      index:       i,
      tokenId:     city.id * 100 + i,
      name:        DISTRICT_NAMES[i % DISTRICT_NAMES.length],
      lat:         parseFloat(lat.toFixed(5)),
      lng:         parseFloat(lng.toFixed(5)),
      cityId:      city.id,
      displayTier: city.displayTier,
    });
  }
  return districts;
}
