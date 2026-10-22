import React, { useState, useEffect } from 'react';
import { useIsMobile } from '../lib/useIsMobile';
import type { City as CityDef } from '../lib/merkle';
import { ACTIVITY_TRACKER, ACTIVITY_TYPE_LABELS, CITY_REGISTRY, DISTRICT_REGISTRY, DISTRICT_COUNT_BY_DISPLAY_TIER, LEASE_MANAGER, CHAIN_ID } from '../contracts';
import { useReadContract, useReadContracts, useAccount } from 'wagmi';
import { type Abi } from 'viem';

// Tab imports
import { OverviewTab } from './tabs/OverviewTab';
import { DistrictsTab } from './tabs/DistrictsTab';
import { AdsTab } from './tabs/AdsTab';
import { StorefrontsTab } from './tabs/StorefrontsTab';
import { EventsTab } from './tabs/EventsTab';
import { PassTab } from './tabs/PassTab';

type CityTab = 'overview' | 'districts' | 'ads' | 'storefronts' | 'events' | 'passes';

interface Props {
  initialTab?: string;
  city: CityDef;
  onBack: () => void;
}

const TABS: { id: CityTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'districts', label: 'Districts' },
  { id: 'passes', label: 'Passes' },
  { id: 'ads', label: 'Ads' },
  { id: 'storefronts', label: 'Storefronts' },
  { id: 'events', label: 'Events' },
];

export function CityPageTabs({ city, onBack, initialTab }: Props) {
  const validTabs: CityTab[] = ['overview','districts','passes','ads','storefronts','events'];
  const startTab: CityTab = validTabs.includes(initialTab as CityTab) ? (initialTab as CityTab) : 'overview';
  const [activeTab, setActiveTab] = useState<CityTab>(startTab);
  const { address } = useAccount();

  // Read city owner from CityRegistry
  const { data: cityOwnerRaw } = useReadContract({
    ...CITY_REGISTRY, abi: CITY_REGISTRY.abi as Abi,
    functionName: 'ownerOf', args: [BigInt(city.id)],
  });
  const cityOwner = typeof cityOwnerRaw === 'string' ? cityOwnerRaw : undefined;

  // Read district ownership for connected wallet in this city
  const districtCount = DISTRICT_COUNT_BY_DISPLAY_TIER[city.displayTier] ?? 0;
  const districtTokenIds = Array.from({ length: districtCount }, (_, i) => BigInt(city.id) * 100n + BigInt(i));
  const { data: districtOwners } = useReadContracts({
    contracts: districtTokenIds.map(tokenId => ({
      address: DISTRICT_REGISTRY.address as `0x${string}`,
      abi: DISTRICT_REGISTRY.abi as Abi,
      functionName: 'ownerOf' as const,
      args: [tokenId],
    })),
    query: { enabled: districtTokenIds.length > 0, staleTime: 60_000, gcTime: 120_000 },
  });
  const ownedDistrictIds: bigint[] = districtOwners
    ? districtTokenIds.filter((id, i) => {
        const r = districtOwners[i];
        return r?.status === 'success' && typeof r.result === 'string' &&
          address && r.result.toLowerCase() === address.toLowerCase();
      })
    : [];

  const { data: activityScore } = useReadContract({
    ...ACTIVITY_TRACKER,
    abi: ACTIVITY_TRACKER.abi as Abi,
    functionName: 'getActivityScore',
    args: [BigInt(city.id)],
    query: { enabled: true },
  });

  const { data: cityActivity } = useReadContract({
    ...ACTIVITY_TRACKER,
    abi: ACTIVITY_TRACKER.abi as Abi,
    functionName: 'cityActivity',
    args: [BigInt(city.id)],
    query: { enabled: true },
  });

  const activityData = cityActivity as [bigint, bigint, bigint] | undefined;
  const totalCount = activityData ? Number(activityData[0]) : 0;
  const totalVolume = activityData ? Number(activityData[1]) / 1e6 : 0;

  const [nowMs] = useState(() => Date.now());

  // First-refusal window end time from DistrictRegistry
  const { data: firstRefusalEndRaw } = useReadContract({
    ...DISTRICT_REGISTRY, abi: DISTRICT_REGISTRY.abi as Abi,
    functionName: 'firstRefusalWindowEnd',
    args: [BigInt(city.id)],
    chainId: CHAIN_ID,
  });
  const firstRefusalEnd = firstRefusalEndRaw ? Number(firstRefusalEndRaw) * 1000 : 0;

  // Active lease on this city (LeaseManager: getLease(cityId))
  const { data: leaseData } = useReadContract({
    ...LEASE_MANAGER, abi: LEASE_MANAGER.abi as Abi,
    functionName: 'getLease',
    args: [BigInt(city.id)],
    chainId: CHAIN_ID,
    query: { retry: false },
  });
  const lease = leaseData as [string, bigint, bigint, bigint, boolean] | undefined;
  const leaseEnd = lease && lease[4] ? Number(lease[2]) * 1000 : 0; // [2] = endTime, [4] = active

  const isMobile = useIsMobile();

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '16px 12px' : '24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          onClick={onBack}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            borderRadius: 8,
            padding: '6px 12px',
            cursor: 'pointer',
            fontSize: 13,
            fontFamily: "'DM Sans', sans-serif",
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          ← Back
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ color: 'var(--ink)', fontSize: isMobile ? 22 : 28, fontWeight: 700, margin: 0, letterSpacing: '-0.03em', wordBreak: 'break-word' }}>
            {city.name}
          </h1>
          <p style={{ color: 'var(--muted)', margin: '2px 0 0', fontSize: 13 }}>
            {city.country} · Pop. {city.population.toLocaleString()}K
          </p>
          {totalCount > 0 && (
            <p style={{ color: 'var(--accent)', margin: '2px 0 0', fontSize: 12 }}>
              ⚡ {totalCount} activities · ${totalVolume.toFixed(2)} USDC volume
            </p>
          )}
        </div>
        {/* Activity badge */}
        {activityScore != null && BigInt(activityScore as bigint) > 0n && (
          <div style={{
            background: 'var(--accent-dim)',
            border: '1px solid var(--accent)',
            color: 'var(--accent)',
            borderRadius: 20,
            padding: '4px 12px',
            fontSize: 12,
            fontWeight: 600,
            flexShrink: 0,
          }}>
            Score {Number(activityScore).toLocaleString()}
          </div>
        )}
      </div>

      {/* First-refusal + lease countdown badges */}
      {(firstRefusalEnd > nowMs || leaseEnd > nowMs) && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {firstRefusalEnd > nowMs && (
            <CountdownBadge
              label="First-refusal window"
              endMs={firstRefusalEnd}
              color="var(--accent)"
              dimColor="var(--accent-dim)"
            />
          )}
          {leaseEnd > nowMs && (
            <CountdownBadge
              label="Active lease expires"
              endMs={leaseEnd}
              color="var(--green)"
              dimColor="var(--green-dim)"
            />
          )}
        </div>
      )}

      {/* Activity type breakdown */}
      {totalCount > 0 && (
        <div style={{
          display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20,
        }}>
          {Object.entries(ACTIVITY_TYPE_LABELS).map(([type, label]) => (
            <ActivityTypeBadge key={type} cityId={city.id} activityType={Number(type)} label={label} />
          ))}
        </div>
      )}

      {/* Tab nav — horizontally scrollable on mobile */}
      <div style={{
        display: 'flex', gap: 0,
        borderBottom: '1px solid var(--border)',
        marginBottom: 24,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: isMobile ? '10px 14px' : '10px 20px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--muted)',
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: activeTab === tab.id ? 600 : 500,
              fontSize: isMobile ? 13 : 14,
              cursor: 'pointer',
              transition: 'all 0.12s',
              marginBottom: -1,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview'    && <OverviewTab city={city} />}
      {activeTab === 'districts'   && <DistrictsTab city={city} />}
      {activeTab === 'passes'      && <PassTab cityId={city.id} cityOwner={cityOwner} ownedDistrictIds={ownedDistrictIds} />}
      {activeTab === 'ads'         && <AdsTab city={city} cityOwner={cityOwner} ownedDistrictIds={ownedDistrictIds} />}
      {activeTab === 'storefronts' && <StorefrontsTab city={city} ownedDistrictIds={ownedDistrictIds} cityOwner={cityOwner} />}
      {activeTab === 'events'      && <EventsTab city={city} ownedDistrictIds={ownedDistrictIds} cityOwner={cityOwner} />}
    </div>
  );
}

// ── CountdownBadge ────────────────────────────────────────────────────────────
function CountdownBadge({ label, endMs, color, dimColor }: {
  label: string; endMs: number; color: string; dimColor: string;
}) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    function update() {
      const diff = endMs - Date.now();
      if (diff <= 0) { setRemaining('Expired'); return; }
      const d = Math.floor(diff / 86_400_000);
      const h = Math.floor((diff % 86_400_000) / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      if (d > 0) setRemaining(`${d}d ${h}h ${m}m`);
      else if (h > 0) setRemaining(`${h}h ${m}m ${s}s`);
      else setRemaining(`${m}m ${s}s`);
    }
    update();
    const t = setInterval(update, 1_000);
    return () => clearInterval(t);
  }, [endMs]);

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: dimColor, border: `1px solid ${color}`,
      borderRadius: 20, padding: '5px 14px',
      fontSize: 12,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', animation: 'pulse-ring 2s ease-in-out infinite' }} />
      <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{label}:</span>
      <span style={{ color: color, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{remaining}</span>
    </div>
  );
}

function ActivityTypeBadge({ cityId, activityType, label }: { cityId: number; activityType: number; label: string }) {
  const { data } = useReadContract({
    ...ACTIVITY_TRACKER,
    abi: ACTIVITY_TRACKER.abi as Abi,
    functionName: 'cityActivityByType',
    args: [BigInt(cityId), activityType],
    query: { enabled: true },
  });
  const rec = data as [bigint, bigint, bigint] | undefined;
  if (!rec || rec[0] === 0n) return null;
  return (
    <span style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      color: 'var(--muted)',
      borderRadius: 20,
      padding: '3px 10px',
      fontSize: 12,
    }}>
      {label}: {Number(rec[0])} × ${(Number(rec[1]) / 1e6).toFixed(2)}
    </span>
  );
}
