import React, { useState, useMemo, useRef, useCallback, lazy, Suspense, Component, type ErrorInfo, type ReactNode } from 'react';
import { Search, X, ChevronDown, MapPin, Globe, Grid3X3, Map } from 'lucide-react';
import { ActivityFeed } from './ActivityFeed';
import { tierLabel, TIER_COLORS, TIER_PRICES_USDC } from '../lib/tierConfig';
import { useCities } from '../lib/useCities';
import { CITY_REGISTRY, DISTRICT_REGISTRY, DISTRICT_COUNT_BY_DISPLAY_TIER, CHAIN_ID } from '../contracts';
import { useReadContract, useReadContracts } from 'wagmi';
import { type Abi } from 'viem';
import type { City } from '../lib/merkle';
import { getDistrictName, getDistrictColor } from '../lib/districtNames';
import type { GlobeHandle } from './GlobeScene';

// Lazy-load the heavy R3F globe — only downloaded when user opens Globe view
const GlobeScene = lazy(() => import('./GlobeScene').then(m => ({ default: m.GlobeScene })));

// ── WebGL capability probe ────────────────────────────────────────────────────
function probeWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')
    );
  } catch { return false; }
}

// ── WebGL error boundary ──────────────────────────────────────────────────────
interface EBState { failed: boolean; }
class GlobeErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, EBState> {
  state: EBState = { failed: false };
  componentDidCatch(_: Error, __: ErrorInfo) { this.setState({ failed: true }); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export type { City as CityDef };

interface WorldMapProps { onSelectCity: (city: City) => void; }

// ── Isometric building block ─────────────────────────────────────────────────
function IsoBuilding({ tier, owned, active, size = 48 }: {
  tier: number; owned: boolean; active: boolean; size?: number;
}) {
  const h = [0, 48, 38, 30, 22, 16, 10][tier] ?? 10;
  const baseColor = owned
    ? 'var(--green)'
    : ['', '#1e5228', '#2d7a3a', '#3a9648', '#4fb860', '#86c992', '#b2e8bd'][tier] ?? '#b2e8bd';
  const topColor  = owned ? 'var(--green-light)' : baseColor;
  const sideColor = owned ? 'var(--green-dark)'  : 'rgba(0,0,0,0.18)';

  const w = size, bh = h;
  const hw = w / 2;

  return (
    <svg width={w + 4} height={bh + w * 0.6 + 4} viewBox={`0 0 ${w + 4} ${bh + w * 0.6 + 4}`} overflow="visible">
      {/* Shadow */}
      <ellipse cx={hw + 6} cy={bh + w * 0.58} rx={hw * 0.7} ry={w * 0.14} fill="var(--iso-shadow)" />
      {/* Left face */}
      <polygon
        points={`2,${bh + w * 0.3} ${hw + 2},${bh + w * 0.58} ${hw + 2},${w * 0.28} 2,${w * 0}`}
        fill={sideColor}
      />
      {/* Right face */}
      <polygon
        points={`${hw + 2},${bh + w * 0.58} ${w + 2},${bh + w * 0.3} ${w + 2},${w * 0} ${hw + 2},${w * 0.28}`}
        fill={`${baseColor}cc`}
      />
      {/* Top face */}
      <polygon
        points={`${hw + 2},0 ${w + 2},${w * 0.28} ${hw + 2},${w * 0.56} 2,${w * 0.28}`}
        fill={topColor}
      />
      {/* Active glow on roof */}
      {active && (
        <polygon
          points={`${hw + 2},0 ${w + 2},${w * 0.28} ${hw + 2},${w * 0.56} 2,${w * 0.28}`}
          fill="rgba(255,205,80,0.35)"
        />
      )}
      {/* Owned crown dot */}
      {owned && (
        <circle cx={hw + 2} cy={w * 0.14} r={4} fill="#fff" opacity={0.9} />
      )}
    </svg>
  );
}

// ── City card in list view ───────────────────────────────────────────────────
function CityCard({ city, onClick, hideIfOwned = false, owned = false }: { city: City; onClick: () => void; hideIfOwned?: boolean; owned?: boolean }) {
  if (hideIfOwned && owned) return null;
  const price = TIER_PRICES_USDC[city.displayTier] ?? 0;
  const color = TIER_COLORS[city.displayTier] ?? '#4fb860';

  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--surface-strong)',
        border: '1.5px solid var(--border)',
        borderRadius: 16,
        padding: '14px 16px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--green)';
        e.currentTarget.style.boxShadow = '0 4px 20px var(--green-glow)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'none';
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="display" style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em' }}>
            {city.name}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <MapPin size={11} />
            {city.country}
          </div>
        </div>
        <IsoBuilding tier={city.displayTier} owned={owned} active={false} size={36} />
      </div>

      {/* Bottom row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          background: `${color}20`,
          color: color,
          fontSize: 11, fontWeight: 700,
          padding: '3px 9px', borderRadius: 20,
          textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>
          {tierLabel(city.displayTier)}
        </span>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: owned ? 'var(--accent)' : 'var(--green)', fontWeight: 700, fontSize: 14 }}>
            {owned ? 'Owned' : `$${price.toLocaleString()}`}
          </div>
          {!owned && (
            <div style={{ color: 'var(--muted)', fontSize: 11 }}>USDC</div>
          )}
        </div>
      </div>
    </button>
  );
}

// ── CityGrid — batched ownerOf reads, one multicall per render cycle ─────────
function CityGrid({ cities: gridCities, onSelectCity, unownedOnly }: {
  cities: City[];
  onSelectCity: (city: City) => void;
  unownedOnly: boolean;
}) {
  const { data: ownersData } = useReadContracts({
    contracts: gridCities.map(city => ({
      address: CITY_REGISTRY.address as `0x${string}`,
      abi: CITY_REGISTRY.abi as Abi,
      functionName: 'ownerOf' as const,
      args: [BigInt(city.id)],
    })),
    query: {
      enabled: gridCities.length > 0,
      staleTime: 120_000,
      gcTime: 300_000,
      refetchInterval: 120_000,
    },
  });
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
      gap: 12,
    }}>
      {gridCities.map((city, i) => {
        const ownerResult = ownersData?.[i];
        const owned = ownerResult?.status === 'success' &&
          !!ownerResult.result &&
          ownerResult.result !== '0x0000000000000000000000000000000000000000';
        return (
          <CityCard
            key={city.id}
            city={city}
            onClick={() => onSelectCity(city)}
            hideIfOwned={unownedOnly}
            owned={owned}
          />
        );
      })}
    </div>
  );
}

// ── Mini isometric district map (inside city panel) ──────────────────────────
export function CityIsoMap({ city, onSelectDistrict }: {
  city: City;
  onSelectDistrict?: (index: number, name: string) => void;
}) {
  const districtCount = DISTRICT_COUNT_BY_DISPLAY_TIER[city.displayTier] ?? 4;
  const tokenIds = Array.from({ length: districtCount }, (_, i) => BigInt(city.id) * 100n + BigInt(i));
  const { data: owners } = useReadContracts({
    contracts: tokenIds.map(id => ({
      address: DISTRICT_REGISTRY.address as `0x${string}`,
      abi: DISTRICT_REGISTRY.abi as Abi,
      functionName: 'ownerOf' as const,
      args: [id],
    })),
    query: { enabled: tokenIds.length > 0, staleTime: 60_000, gcTime: 120_000 },
  });

  const cols = Math.ceil(Math.sqrt(districtCount));
  const tileW = 72;
  const tileH = 44;

  return (
    <div style={{ overflowX: 'auto', padding: '12px 0' }}>
      <div className="iso-container" style={{ width: cols * tileW + 40, margin: '0 auto' }}>
        <div className="iso-world" style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, ${tileW}px)`,
          gap: 4,
          transformOrigin: '50% 0',
        }}>
          {Array.from({ length: districtCount }, (_, i) => {
            const name = getDistrictName(city.id, i);
            const color = getDistrictColor(i);
            const isOwned = owners?.[i]?.status === 'success' &&
              owners[i].result !== '0x0000000000000000000000000000000000000000';
            const ownerAddr = isOwned && typeof owners?.[i]?.result === 'string'
              ? (owners[i].result).slice(0, 6) + '…'
              : null;

            return (
              <button
                key={i}
                onClick={() => onSelectDistrict?.(i, name)}
                title={name}
                style={{
                  width: tileW, height: tileH,
                  background: isOwned ? color : `${color}40`,
                  border: `1.5px solid ${color}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  padding: '4px 6px',
                  transition: 'all 0.15s',
                  position: 'relative',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateZ(8px) scale(1.06)';
                  e.currentTarget.style.zIndex = '10';
                  e.currentTarget.style.boxShadow = `0 6px 20px ${color}55`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.zIndex = 'auto';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{
                  fontSize: 9, fontWeight: 700, color: isOwned ? '#fff' : color,
                  textAlign: 'center', lineHeight: 1.2,
                  maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {name}
                </div>
                {isOwned && ownerAddr && (
                  <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
                    {ownerAddr}
                  </div>
                )}
                {!isOwned && (
                  <div style={{ fontSize: 8, color: color, marginTop: 2 }}>Available</div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Dot world map (SVG, geographic) ──────────────────────────────────────────
function DotMap({ cities, onSelect, W = 920, H = 460 }: {
  cities: City[]; onSelect: (c: City) => void; W?: number; H?: number;
}) {
  const [hovered, setHovered] = useState<City | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  function toXY(lat: number, lng: number) {
    return { x: ((lng + 180) / 360) * W, y: ((90 - lat) / 180) * H };
  }
  const dotR: Record<number, number> = { 1: 8, 2: 6, 3: 5, 4: 3.5, 5: 2.5, 6: 1.5 };

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGElement>, city: City) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top - 36 });
    setHovered(city);
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{
          width: '100%', height: '100%',
          background: 'linear-gradient(180deg,#d8eed2 0%,#c4dfc0 100%)',
          borderRadius: 16, cursor: 'crosshair',
        }}
      >
        {/* Grid lines */}
        {Array.from({ length: 18 }, (_, i) => (
          <line key={`v${i}`} x1={(i * W) / 18} y1={0} x2={(i * W) / 18} y2={H}
            stroke="rgba(45,122,58,0.08)" strokeWidth={0.5} />
        ))}
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`h${i}`} x1={0} y1={(i * H) / 9} x2={W} y2={(i * H) / 9}
            stroke="rgba(45,122,58,0.08)" strokeWidth={0.5} />
        ))}
        {/* Equator */}
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="rgba(45,122,58,0.25)" strokeWidth={1} strokeDasharray="4 4" />

        {/* City dots */}
        {cities.map((c) => {
          const { x, y } = toXY(c.lat, c.lng);
          const r = dotR[c.displayTier] ?? 1.5;
          const color = TIER_COLORS[c.displayTier] ?? '#4fb860';
          return (
            <g key={c.id}
              onClick={() => onSelect(c)}
              onMouseMove={e => handleMouseMove(e, c)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'pointer' }}
            >
              <circle cx={x} cy={y} r={r + 5} fill="transparent" />
              <circle cx={x} cy={y} r={r} fill={color} opacity={0.88}
                style={{ filter: hovered?.id === c.id ? `drop-shadow(0 0 4px ${color})` : 'none' }} />
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hovered && (
        <div style={{
          position: 'absolute',
          left: tooltipPos.x, top: tooltipPos.y,
          background: 'rgba(26,46,26,0.92)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 10, padding: '7px 12px',
          pointerEvents: 'none', zIndex: 10,
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap',
        }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{hovered.name}</div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>
            {hovered.country} · {tierLabel(hovered.displayTier)} · ${TIER_PRICES_USDC[hovered.displayTier]?.toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Hero billboard banner ─────────────────────────────────────────────────────
function HeroBanner({ totalCities }: { totalCities: number }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--green-dark) 0%, var(--green) 60%, #4fb860 100%)',
      borderRadius: 20, padding: '36px 40px',
      position: 'relative', overflow: 'hidden',
      marginBottom: 28,
    }}>
      {/* Background iso building silhouettes */}
      <div style={{
        position: 'absolute', right: 32, bottom: -8, opacity: 0.18,
        display: 'flex', gap: 4, alignItems: 'flex-end',
      }}>
        {[48, 64, 40, 72, 56, 36].map((h, i) => (
          <div key={i} style={{
            width: 14, height: h, background: '#fff',
            borderRadius: '3px 3px 0 0',
          }} />
        ))}
      </div>
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 560 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,0.18)', borderRadius: 20,
          padding: '4px 12px', marginBottom: 14,
          border: '1px solid rgba(255,255,255,0.25)',
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#7ef1b3', display: 'inline-block' }} />
          <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: 600 }}>Live on Arc Testnet</span>
        </div>
        <h1 className="display" style={{
          color: '#fff', fontSize: 42, fontWeight: 800,
          letterSpacing: '-0.04em', margin: '0 0 10px', lineHeight: 1.1,
        }}>
          Own the World
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16, margin: 0, maxWidth: 400 }}>
          {totalCities > 0
            ? `${totalCities.toLocaleString()} cities available. Buy, lease districts, run events, and earn USDC.`
            : 'Loading cities…'}
        </p>
      </div>
    </div>
  );
}

// ── Main WorldMap component ───────────────────────────────────────────────────
export function WorldMap({ onSelectCity }: WorldMapProps) {
  const { cities, loading, error, searchCities } = useCities();
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<number | ''>('');
  const [unownedOnly, setUnownedOnly] = useState(false);
  const [webglAvailable] = useState(() => probeWebGL());
  const [view, setView] = useState<'globe' | 'grid' | 'map'>(() => probeWebGL() ? 'globe' : 'grid');
  const globeRef = useRef<GlobeHandle>(null);

  // Read minted count from CityRegistry to know which are owned
  const { data: totalMinted } = useReadContract({
    address: CITY_REGISTRY.address,
    abi: CITY_REGISTRY.abi as Abi,
    functionName: 'totalSupply',
    chainId: CHAIN_ID,
  });
  const mintedCount = totalMinted ? Number(totalMinted) : 0;

  const handleCityEvent = useCallback((cityId: number) => {
    globeRef.current?.pulseCity(cityId);
  }, []);

  const mapCities = useMemo(() => {
    if (search) return searchCities(search, 200);
    return cities.filter(c => c.displayTier <= 4);
  }, [cities, search, searchCities]);

  const gridCities = useMemo(() => {
    if (search) return searchCities(search, 200);
    let list = cities;
    if (tierFilter !== '') list = list.filter(c => c.displayTier === tierFilter);
    return list.slice(0, 200);
  }, [cities, search, tierFilter, searchCities]);

  return (
    <div style={{ minHeight: 'calc(100dvh - 60px)', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 20px' }}>

        {!loading && <HeroBanner totalCities={cities.length} />}

        {/* Live activity feed */}
        {!loading && (
          <div style={{ marginBottom: 24 }}>
            <ActivityFeed
              onCityEvent={handleCityEvent}
            />
          </div>
        )}

        {/* Controls bar */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24, alignItems: 'center' }}>
          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--surface-strong)',
            border: '1.5px solid var(--border)',
            borderRadius: 24, padding: '0 16px',
            flex: '1 1 260px', minWidth: 200,
            boxShadow: '0 2px 8px rgba(45,122,58,0.06)',
          }}>
            <Search size={15} color="var(--subtle)" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search cities or countries…"
              style={{
                background: 'none', border: 'none', outline: 'none',
                color: 'var(--ink)', fontSize: 14, width: '100%', height: 42,
                fontFamily: "'DM Sans', sans-serif",
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <X size={14} color="var(--subtle)" />
              </button>
            )}
          </div>

          {/* Tier filter */}
          <div style={{ position: 'relative' }}>
            <select
              value={tierFilter}
              onChange={e => setTierFilter(e.target.value === '' ? '' : Number(e.target.value))}
              style={{
                appearance: 'none', background: 'var(--surface-strong)',
                border: '1.5px solid var(--border)', borderRadius: 24,
                color: tierFilter !== '' ? 'var(--green)' : 'var(--muted)',
                fontSize: 14, fontWeight: 500, padding: '0 36px 0 16px', height: 42,
                cursor: 'pointer', outline: 'none',
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              <option value="">All Tiers</option>
              {[1, 2, 3, 4, 5, 6].map(t => (
                <option key={t} value={t}>{tierLabel(t)} — ${TIER_PRICES_USDC[t]?.toLocaleString()}</option>
              ))}
            </select>
            <ChevronDown size={14} color="var(--subtle)" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          </div>

          {/* Unowned toggle */}
          <button
            onClick={() => setUnownedOnly(v => !v)}
            style={{
              padding: '0 18px', height: 42, borderRadius: 24, cursor: 'pointer',
              background: unownedOnly ? 'var(--green)' : 'var(--surface-strong)',
              color: unownedOnly ? '#fff' : 'var(--muted)',
              border: `1.5px solid ${unownedOnly ? 'var(--green)' : 'var(--border)'}`,
              fontFamily: "'DM Sans', sans-serif", fontWeight: unownedOnly ? 700 : 500, fontSize: 14,
              transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}
          >
            🏗️ Available Only
          </button>

          {/* View toggle */}
          <div style={{
            display: 'flex', background: 'var(--surface-strong)',
            border: '1.5px solid var(--border)', borderRadius: 24, overflow: 'hidden',
          }}>
            {([
              { id: 'globe', label: 'Globe', icon: <Globe size={13} /> },
              { id: 'grid',  label: 'Cities', icon: <Grid3X3 size={13} /> },
              { id: 'map',   label: 'Map',    icon: <Map size={13} /> },
            ] as const).map(v => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                style={{
                  padding: '0 16px', height: 42, border: 'none', cursor: 'pointer',
                  background: view === v.id ? 'var(--green)' : 'none',
                  color: view === v.id ? '#fff' : 'var(--muted)',
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: view === v.id ? 600 : 500, fontSize: 13,
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                {v.icon}{v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '80px 0' }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14, background: 'var(--green-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                border: '2.5px solid var(--green)', borderTopColor: 'transparent',
                animation: 'spin 0.8s linear infinite',
              }} />
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 15 }}>Loading world cities…</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 12, padding: 16, color: '#ef4444', marginBottom: 24,
          }}>
            Failed to load cities: {error}
          </div>
        )}

        {/* Globe view */}
        {!loading && view === 'globe' && (
          <div style={{
            borderRadius: 20, overflow: 'hidden',
            border: '1.5px solid var(--border)',
            height: 560, marginBottom: 24,
            boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
            position: 'relative',
            background: '#050f0a',
          }}>
            {webglAvailable ? (
              <>
                {/* Tier legend overlay */}
                <div style={{
                  position: 'absolute', bottom: 16, left: 16, zIndex: 10,
                  display: 'flex', flexWrap: 'wrap', gap: 8,
                  pointerEvents: 'none',
                }}>
                  {[1,2,3,4,5,6].map(t => (
                    <div key={t} style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      background: 'rgba(5,15,10,0.75)', borderRadius: 20,
                      padding: '3px 10px',
                    }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: TIER_COLORS[t], display: 'inline-block' }} />
                      <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, fontFamily: "'DM Sans',sans-serif" }}>
                        {tierLabel(t)}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Hint */}
                <div style={{
                  position: 'absolute', top: 14, right: 14, zIndex: 10,
                  background: 'rgba(5,15,10,0.7)', borderRadius: 10, padding: '4px 10px',
                  color: 'rgba(255,255,255,0.5)', fontSize: 10,
                  fontFamily: "'DM Sans',sans-serif", pointerEvents: 'none',
                }}>
                  Drag to rotate · Scroll to zoom · Click a city
                </div>
                <GlobeErrorBoundary fallback={
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, fontFamily: "'DM Sans',sans-serif" }}>Globe failed to load</p>
                    <button onClick={() => setView('grid')} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 20, padding: '8px 20px', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                      View Cities Grid
                    </button>
                  </div>
                }>
                  <Suspense fallback={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 16 }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid var(--green)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>Loading globe…</p>
                      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                  }>
                    <GlobeScene
                      ref={globeRef}
                      cities={cities}
                      unownedOnly={unownedOnly}
                      onClickCity={onSelectCity}
                    />
                  </Suspense>
                </GlobeErrorBoundary>
              </>
            ) : (
              /* WebGL blocked (e.g. sandboxed iframe) — show a preview card instead */
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 16, padding: 32 }}>
                <div style={{ fontSize: 52 }}>🌍</div>
                <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 18, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif", textAlign: 'center' }}>
                  Interactive 3D Globe
                </p>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", textAlign: 'center', maxWidth: 320 }}>
                  WebGL is not available in this preview environment. The globe renders fully on deploy — drag to rotate, scroll to zoom, click any city to open it.
                </p>
                <button
                  onClick={() => setView('grid')}
                  style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 20, padding: '10px 24px', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 14 }}
                >
                  Browse Cities Grid
                </button>
              </div>
            )}
          </div>
        )}

        {/* Map view */}
        {!loading && view === 'map' && (
          <>
            <div style={{
              background: 'var(--surface-strong)', borderRadius: 20,
              border: '1.5px solid var(--border)',
              overflow: 'hidden', height: 460, marginBottom: 24,
              boxShadow: '0 8px 32px rgba(45,122,58,0.10)',
            }}>
              <DotMap cities={mapCities} onSelect={onSelectCity} />
            </div>
            {/* Tier legend */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5, 6].map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: TIER_COLORS[t], display: 'inline-block' }} />
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {tierLabel(t)} — ${TIER_PRICES_USDC[t]?.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Grid view */}
        {!loading && view === 'grid' && (
          <>
            <div style={{ color: 'var(--subtle)', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span>
                Showing {gridCities.length.toLocaleString()} of {cities.length.toLocaleString()} cities
                {(search || tierFilter !== '') ? ' matching filters' : gridCities.length < cities.length ? ' — use search or filter to narrow' : ''}
              </span>
              {mintedCount > 0 && (
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                  {mintedCount} minted · {(cities.length - mintedCount).toLocaleString()} available
                </span>
              )}
              {unownedOnly && (
                <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                  Showing available cities only
                </span>
              )}
            </div>

            <CityGrid cities={gridCities} onSelectCity={onSelectCity} unownedOnly={unownedOnly} />

            {gridCities.length === 0 && !error && (
              <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--subtle)' }}>
                No cities match your filters.
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <footer style={{ borderTop: '1px solid var(--border)', marginTop: 48, paddingTop: 20, paddingBottom: 16 }}>
          <p style={{ color: 'var(--subtle)', fontSize: 12, textAlign: 'center', margin: 0 }}>
            CityOnChain is not affiliated with any real city, government, or official body. City names are used for identification only.
            Ownership of a city NFT does not confer real-world rights or guaranteed returns. Experimental onchain game.
            {' · '}
            <button
              onClick={() => onSelectCity({ id: -1, name: '__about_data__', country: '', population: 0, lat: 0, lng: 0, displayTier: 1 })}
              style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0 }}
            >
              Data credits
            </button>
          </p>
        </footer>
      </div>
    </div>
  );
}
