/**
 * ownedCities.ts
 * Client-side registry of city IDs the connected wallet has purchased.
 * Arc Testnet RPC does not support eth_getLogs, so we persist to localStorage
 * and verify ownership on-chain with ownerOf before displaying.
 */

const KEY = (address: string) => `cityonchain:owned:${address.toLowerCase()}`;

export function addOwnedCity(address: string, cityId: number): void {
  const current = getStoredCityIds(address);
  const next = [...new Set([...current, cityId])].sort((a, b) => a - b);
  try {
    localStorage.setItem(KEY(address), JSON.stringify(next));
  } catch {
    // storage full or unavailable — ignore
  }
}

export function removeOwnedCity(address: string, cityId: number): void {
  const current = getStoredCityIds(address);
  const next = current.filter(id => id !== cityId);
  try {
    localStorage.setItem(KEY(address), JSON.stringify(next));
  } catch { /* ignore */ }
}

export function getStoredCityIds(address: string): number[] {
  try {
    const raw = localStorage.getItem(KEY(address));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is number => typeof x === 'number');
  } catch {
    return [];
  }
}
