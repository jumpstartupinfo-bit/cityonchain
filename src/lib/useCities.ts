/**
 * useCities — loads /public/data/cities.json once, initialises the Merkle tree,
 * and exposes viewport-filtered city lists plus per-city proof generation.
 */
import { useState, useEffect, useCallback } from 'react';
import { initMerkleTree, getMerkleProof, getMerkleRoot, verifyProof, type City } from './merkle';

type Viewport = { minLat: number; maxLat: number; minLng: number; maxLng: number };

type UseCitiesResult = {
  cities: City[];
  loading: boolean;
  error: string | null;
  merkleRoot: string;
  getCitiesInViewport: (vp: Viewport, limit?: number) => City[];
  searchCities: (query: string, limit?: number) => City[];
  getProof: (city: City) => `0x${string}`[];
  verifyCity: (city: City) => boolean;
  getCityById: (id: number) => City | undefined;
};

let _citiesCache: City[] | null = null;
let _merkleReady = false;
let _merkleRoot = '';

export function useCities(): UseCitiesResult {
  const [cities, setCities] = useState<City[]>(_citiesCache ?? []);
  const [loading, setLoading] = useState(!_citiesCache);
  const [error, setError] = useState<string | null>(null);
  const [merkleRoot, setMerkleRoot] = useState(_merkleRoot);

  useEffect(() => {
    if (_citiesCache) return; // already loaded
    let cancelled = false;
    fetch('/data/cities.json')
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load cities.json: ${r.status}`);
        return r.json() as Promise<City[]>;
      })
      .then(data => {
        if (cancelled) return;
        _citiesCache = data;
        if (!_merkleReady) {
          initMerkleTree(data);
          _merkleReady = true;
          _merkleRoot = getMerkleRoot();
        }
        setCities(data);
        setMerkleRoot(_merkleRoot);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load cities');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const getCitiesInViewport = useCallback((vp: Viewport, limit = 500): City[] => {
    if (!_citiesCache) return [];
    const results: City[] = [];
    for (const c of _citiesCache) {
      if (c.lat >= vp.minLat && c.lat <= vp.maxLat &&
          c.lng >= vp.minLng && c.lng <= vp.maxLng) {
        results.push(c);
        if (results.length >= limit) break;
      }
    }
    return results;
  }, []);

  const searchCities = useCallback((query: string, limit = 50): City[] => {
    if (!_citiesCache || !query.trim()) return [];
    const q = query.toLowerCase();
    return _citiesCache
      .filter(c => c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q))
      .slice(0, limit);
  }, []);

  const getProof = useCallback((city: City): `0x${string}`[] => {
    return getMerkleProof(city);
  }, []);

  const verifyCity = useCallback((city: City): boolean => {
    return verifyProof(city, getMerkleProof(city));
  }, []);

  const getCityById = useCallback((id: number): City | undefined => {
    return _citiesCache?.find(c => c.id === id);
  }, []);

  return { cities, loading, error, merkleRoot, getCitiesInViewport, searchCities, getProof, verifyCity, getCityById };
}
