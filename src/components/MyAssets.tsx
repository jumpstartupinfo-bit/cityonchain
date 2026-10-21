import React, { useState } from 'react';
import { Crown, Building2, TrendingUp, ExternalLink, Loader2, AlertCircle, Wallet, ChevronDown, ChevronUp, Megaphone, ShoppingBag, Ticket, BadgeCheck, MapPin, ArrowRight } from 'lucide-react';
import { ReferralPanel } from './ReferralPanel';
import { EarningsHistory } from './EarningsHistory';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from 'wagmi';
import { useOwnedTokens } from '../lib/useOwnedTokens';
import {
  CITY_REGISTRY,
  CITY_MARKETPLACE,
  LEASE_MANAGER,
  REVENUE_SPLITTER,
  CHAIN_ID,
  tierLabel,
  TIER_COLORS,
  DISTRICT_REGISTRY,
} from '../contracts';
import { Amount, usdcDecimalsFor } from '@/onchain-money';
import { buildTxExplorerUrl } from '@/onchain-facts';
import { useCities } from '../lib/useCities';
import { toast } from 'sonner';

import type { City } from '../lib/merkle';

type MyAssetsProps = { onSelectCity?: (city: City, tab?: string) => void };

export function MyAssets({ onSelectCity }: MyAssetsProps = {}) {
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const decimals = usdcDecimalsFor(CHAIN_ID);
  const isWrongChain = chainId !== CHAIN_ID;

  if (!address) {
    return (
      <div style={{ minHeight: 'calc(100dvh - 60px)', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
        <AlertCircle size={40} color="var(--subtle)" />
        <h2 className="display" style={{ color: 'var(--ink)', fontSize: 24, fontWeight: 700, margin: 0 }}>Connect your wallet</h2>
        <p style={{ color: 'var(--muted)', fontSize: 15, margin: 0 }}>Connect your wallet to see your cities, districts, leases, and earnings.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: 'calc(100dvh - 60px)', background: 'var(--bg)' }}>
      {/* Hero header — matches Marketplace / Leaderboards green gradient */}
      <div style={{
        background: 'linear-gradient(135deg, var(--green-dark) 0%, var(--green) 60%, #4fb860 100%)',
        padding: '40px 24px 28px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', right: 32, bottom: -4, opacity: 0.15, display: 'flex', gap: 3, alignItems: 'flex-end' }}>
          {[28, 44, 32, 56, 40, 22, 36].map((h, i) => (
            <div key={i} style={{ width: 12, height: h, background: '#fff', borderRadius: '2px 2px 0 0' }} />
          ))}
        </div>
        <div style={{ maxWidth: 1000, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.18)', borderRadius: 20,
            padding: '3px 12px', marginBottom: 12,
            border: '1px solid rgba(255,255,255,0.25)',
          }}>
            <Wallet size={11} color="rgba(255,255,255,0.9)" />
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: 600 }}>Your Portfolio</span>
          </div>
          <h1 className="display" style={{ color: '#fff', fontSize: 36, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.04em', lineHeight: 1.1 }}>My Assets</h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 15, margin: 0 }}>
            Mayor licenses, district licenses, active leases, and claimable earnings.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px' }}>
        {isWrongChain && (
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid var(--danger)', borderRadius: 12, padding: '14px 18px', color: 'var(--danger)', fontSize: 14, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertCircle size={16} />
            Wrong network. Please switch to Arc Testnet.
            <button onClick={() => switchChain({ chainId: CHAIN_ID })} style={{ marginLeft: 'auto', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Switch</button>
          </div>
        )}

        <ReferralPanel walletAddress={address} />
        <EarningsPanel address={address} decimals={decimals} />
        <RevenueSplitterPanel address={address} decimals={decimals} />
        <EarningsHistory address={address} />
        <OwnershipPanels key={address} address={address} onSelectCity={onSelectCity} />

        <p style={{ color: 'var(--subtle)', fontSize: 12, marginTop: 40, lineHeight: 1.6, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
          CityOnChain is not affiliated with any real city, government, or official body. Revenue figures reflect smart-contract state only. No guaranteed returns. Use city names only — no official logos or landmarks.
        </p>
      </div>
    </div>
  );
}

// ── OwnershipPanels ──────────────────────────────────────────────────────────
// Fetches city and district ownership independently via Transfer events +
// ownerOf verification. No fixed ID ranges, no localStorage source of truth.

function SyncError({ _error, lastSyncTime, onRetry }: { _error?: string; lastSyncTime: number | null; onRetry: () => void }) {
  const [now] = useState(() => Date.now());
  const ago = lastSyncTime
    ? (() => {
        const s = Math.floor((now - lastSyncTime) / 1000);
        if (s < 60) return `${s}s ago`;
        if (s < 3600) return `${Math.floor(s / 60)}m ago`;
        return `${Math.floor(s / 3600)}h ago`;
      })()
    : null;

  return (
    <div style={{
      background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
      borderRadius: 10, padding: '10px 14px', marginBottom: 14,
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    }}>
      <AlertCircle size={14} color="var(--danger)" style={{ flexShrink: 0 }} />
      <span style={{ color: 'var(--danger)', fontSize: 13, flex: 1 }}>
        Couldn't load your assets.{ago ? ` Showing data from ${ago}.` : ''}
      </span>
      <button
        onClick={onRetry}
        style={{
          background: 'var(--danger)', color: '#fff', border: 'none',
          borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600,
          fontFamily: "'DM Sans',sans-serif", cursor: 'pointer',
        }}
      >
        Retry
      </button>
    </div>
  );
}

function OwnershipPanels({ address, onSelectCity }: { address: string; onSelectCity?: (city: City, tab?: string) => void }) {
  const { cities: allCities } = useCities();

  // Cities: Transfer events on CityRegistry
  const {
    tokenIds: cityTokenIds,
    loading: citiesLoading,
    error: citiesError,
    lastSyncTime: citiesSyncTime,
    fromCache: citiesFromCache,
    retry: retryCity,
  } = useOwnedTokens(address, CITY_REGISTRY.address);

  // Districts: Transfer events on DistrictRegistry
  const {
    tokenIds: districtTokenIds,
    loading: districtsLoading,
    error: districtsError,
    lastSyncTime: districtsSyncTime,
    fromCache: districtsFromCache,
    retry: retryDistrict,
  } = useOwnedTokens(address, DISTRICT_REGISTRY.address);

  // Whether a sync has completed successfully at least once this session
  const citiesSynced = !citiesLoading && !citiesError;
  const districtsSynced = !districtsLoading && !districtsError;

  // Enrich city IDs with metadata
  const ownedCities = cityTokenIds.map(id => {
    const meta = allCities.find(c => c.id === id);
    return meta ?? { id, name: `City #${id}`, country: '…', displayTier: 6 };
  });

  // Enrich district token IDs
  const ownedDistricts: OwnedDistrict[] = districtTokenIds.map(tokenId => {
    const cityId = Math.floor(tokenId / 100);
    const districtIndex = tokenId % 100;
    const cityMeta = allCities.find(c => c.id === cityId);
    return {
      tokenId,
      cityId,
      districtIndex,
      cityName: cityMeta?.name ?? `City #${cityId}`,
      cityTier: cityMeta?.displayTier ?? 6,
    };
  });

  return (
    <>
      {/* Mayor Licenses */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Crown size={18} color="var(--accent)" />
          <h2 className="display" style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 700, margin: 0 }}>Mayor Licenses</h2>
          {citiesLoading && <Loader2 size={14} color="var(--muted)" style={{ animation: 'spin 1s linear infinite' }} />}
          {citiesFromCache && !citiesLoading && <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface-strong)', border: '1px solid var(--border)', borderRadius: 6, padding: '1px 7px' }}>cached</span>}
          {cityTokenIds.length > 0 && <span style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 4 }}>({cityTokenIds.length})</span>}
        </div>
        <div style={{ color: 'var(--subtle)', fontSize: 13, marginBottom: 16 }}>Cities you own as mayor. Click any city to manage it.</div>
        {citiesError && <div style={{ marginTop: 8, marginBottom: 8 }}><SyncError lastSyncTime={citiesSyncTime} onRetry={retryCity} /></div>}
        {citiesSynced && cityTokenIds.length === 0 && <div style={{ color: 'var(--subtle)', fontSize: 14, padding: '20px 0', textAlign: 'center' }}>No mayor licenses yet. Buy a city to become its mayor.</div>}
        {cityTokenIds.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ownedCities.map(city => <CityManageCard key={city.id} city={city} ownedDistricts={ownedDistricts.filter(d => d.cityId === city.id)} allCities={allCities} onSelectCity={onSelectCity} />)}
          </div>
        )}
      </div>

      {/* District Licenses */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Building2 size={18} color="var(--accent)" />
          <h2 className="display" style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 700, margin: 0 }}>District Licenses</h2>
          {districtsLoading && <Loader2 size={14} color="var(--muted)" style={{ animation: 'spin 1s linear infinite' }} />}
          {districtsFromCache && !districtsLoading && <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface-strong)', border: '1px solid var(--border)', borderRadius: 6, padding: '1px 7px' }}>cached</span>}
          {districtTokenIds.length > 0 && <span style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 4 }}>({districtTokenIds.length})</span>}
        </div>
        <div style={{ color: 'var(--subtle)', fontSize: 13, marginBottom: 16 }}>Districts you own. Click to manage or navigate to the city.</div>
        {districtsError && <div style={{ marginTop: 8, marginBottom: 8 }}><SyncError lastSyncTime={districtsSyncTime} onRetry={retryDistrict} /></div>}
        {districtsSynced && districtTokenIds.length === 0 && <div style={{ color: 'var(--subtle)', fontSize: 14, padding: '20px 0', textAlign: 'center' }}>No district licenses yet.</div>}
        {districtTokenIds.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ownedDistricts.map(d => <DistrictManageCard key={d.tokenId} district={d} allCities={allCities} onSelectCity={onSelectCity} />)}
          </div>
        )}
      </div>
    </>
  );
}

// ── CityManageCard ────────────────────────────────────────────────────────────

type OwnedCity = { id: number; name: string; country: string; displayTier: number };
type OwnedDistrict = { tokenId: number; cityId: number; districtIndex: number; cityName: string; cityTier: number };

const CITY_ACTIONS = [
  { id: 'ads',          label: 'Ad Slots',    icon: <Megaphone size={13} />,   tab: 'ads'          },
  { id: 'storefronts',  label: 'Storefronts', icon: <ShoppingBag size={13} />, tab: 'storefronts'  },
  { id: 'events',       label: 'Events',      icon: <Ticket size={13} />,      tab: 'events'       },
  { id: 'passes',       label: 'Passes',      icon: <BadgeCheck size={13} />,  tab: 'passes'       },
  { id: 'districts',    label: 'Districts',   icon: <MapPin size={13} />,      tab: 'districts'    },
] as const;

function CityManageCard({ city, ownedDistricts, allCities, onSelectCity }: {
  city: OwnedCity;
  ownedDistricts: OwnedDistrict[];
  allCities: City[];
  onSelectCity?: (city: City, tab?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const tier = city.displayTier;
  const color = TIER_COLORS[tier] ?? '#888';

  function go(tab?: string) {
    const full = allCities.find(c => c.id === city.id);
    if (full && onSelectCity) onSelectCity(full, tab);
  }

  const btnStyle = (bg = 'var(--surface-strong)', fg = 'var(--ink)', border = 'var(--border)') => ({
    display: 'inline-flex' as const, alignItems: 'center' as const, gap: 6,
    padding: '7px 13px', borderRadius: 8, background: bg,
    border: `1px solid ${border}`, color: fg, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  });

  return (
    <div style={{ border: `1.5px solid ${color}44`, borderRadius: 14, overflow: 'hidden', background: `${color}08` }}>
      {/* Header row */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer', userSelect: 'none' }}
      >
        <Crown size={16} color={color} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{city.name}</div>
          <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 1 }}>
            {city.country} ·
            <span style={{ color, fontWeight: 700, marginLeft: 4 }}>{tierLabel(tier)}</span>
            {ownedDistricts.length > 0 && <span style={{ marginLeft: 8, color: 'var(--subtle)' }}>{ownedDistricts.length} district{ownedDistricts.length > 1 ? 's' : ''} owned</span>}
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); go(); }}
          style={{ ...btnStyle(`${color}12`, color, `${color}44`), flexShrink: 0 }}
        >
          Open <ArrowRight size={11} />
        </button>
        {expanded ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
      </div>

      {/* Expanded quick-action grid */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${color}28`, padding: '14px 18px', background: 'var(--surface)' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Manage</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: ownedDistricts.length > 0 ? 16 : 0 }}>
            {CITY_ACTIONS.map(action => (
              <button key={action.id} onClick={() => go(action.tab)} style={btnStyle()}>
                {action.icon}{action.label}
              </button>
            ))}
          </div>

          {/* Owned districts in this city */}
          {ownedDistricts.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Districts</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {ownedDistricts.map(d => (
                  <button
                    key={d.tokenId}
                    onClick={() => go('districts')}
                    style={{ ...btnStyle(`${color}14`, color, `${color}44`), gap: 5 }}
                  >
                    <Building2 size={11} />District #{d.districtIndex}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── DistrictManageCard ────────────────────────────────────────────────────────

function DistrictManageCard({ district, allCities, onSelectCity }: {
  district: OwnedDistrict;
  allCities: City[];
  onSelectCity?: (city: City, tab?: string) => void;
}) {
  const color = TIER_COLORS[district.cityTier] ?? '#888';
  function go() {
    const full = allCities.find(c => c.id === district.cityId);
    if (full && onSelectCity) onSelectCity(full, 'districts');
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: `1px solid ${color}44`, borderRadius: 12, background: `${color}08` }}>
      <Building2 size={15} color={color} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 14 }}>District #{district.districtIndex}</div>
        <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 1 }}>{district.cityName} · Token #{district.tokenId}</div>
      </div>
      <span style={{ color, background: `${color}18`, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase' as const, letterSpacing: '0.04em', flexShrink: 0 }}>
        {tierLabel(district.cityTier)}
      </span>
      <button
        onClick={go}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, background: `${color}14`, border: `1px solid ${color}44`, color, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}
      >
        Manage <ArrowRight size={11} />
      </button>
    </div>
  );
}

// ── RevenueSplitterPanel ──────────────────────────────────────────────────────

function RevenueSplitterPanel({ address, decimals }: { address: string; decimals: number }) {
  const { data: pending } = useReadContract({
    address: REVENUE_SPLITTER.address,
    abi: REVENUE_SPLITTER.abi,
    functionName: 'pendingWithdrawals',
    args: [address as `0x${string}`],
    chainId: CHAIN_ID,
  });

  const amount = (pending as bigint | undefined) ?? 0n;
  const { writeContract: doWithdraw, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  React.useEffect(() => {
    if (isSuccess) toast.success('Revenue split claimed!');
  }, [isSuccess]);

  if (amount === 0n && !txHash) return null;

  return (
    <div style={{
      background: 'var(--surface)', border: '1.5px solid var(--green)',
      borderRadius: 16, padding: 20, marginBottom: 28,
      boxShadow: '0 4px 20px var(--green-glow)',
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <TrendingUp size={16} color="var(--green)" />
          <span className="display" style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 15 }}>Revenue Split</span>
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>Your share of platform revenue via RevenueSplitter</div>
      </div>
      <div>
        <div className="display" style={{ color: 'var(--green)', fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>
          ${Amount.fromRaw(amount, decimals).toFixed(2)}
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)', marginLeft: 6 }}>USDC</span>
        </div>
      </div>
      <button
        onClick={() => doWithdraw({ address: REVENUE_SPLITTER.address, abi: REVENUE_SPLITTER.abi, functionName: 'withdraw', chainId: CHAIN_ID })}
        disabled={amount === 0n || isPending || isConfirming}
        style={{
          padding: '10px 20px', borderRadius: 10, border: 'none',
          background: amount > 0n ? 'var(--green)' : 'var(--border)',
          color: amount > 0n ? '#fff' : 'var(--subtle)',
          fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14,
          cursor: amount > 0n ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: amount > 0n ? '0 2px 12px var(--green-glow)' : 'none',
        }}
      >
        {(isPending || isConfirming) && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
        {isPending || isConfirming ? 'Claiming…' : 'Claim Split'}
      </button>
      {txHash && (
        <a href={buildTxExplorerUrl(CHAIN_ID, txHash)} target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--green)', fontSize: 11, textDecoration: 'none', width: '100%' }}>
          <ExternalLink size={11} /> View tx
        </a>
      )}
    </div>
  );
}

// ── EarningsPanel ─────────────────────────────────────────────────────────────

function EarningsPanel({ address, decimals }: { address: string; decimals: number }) {
  const { data: registryEarnings } = useReadContract({ address: CITY_REGISTRY.address, abi: CITY_REGISTRY.abi, functionName: 'pendingWithdrawals', args: [address as `0x${string}`], chainId: CHAIN_ID });
  const { data: marketplaceEarnings } = useReadContract({ address: CITY_MARKETPLACE.address, abi: CITY_MARKETPLACE.abi, functionName: 'pendingWithdrawals', args: [address as `0x${string}`], chainId: CHAIN_ID });
  const { data: leaseEarnings } = useReadContract({ address: LEASE_MANAGER.address, abi: LEASE_MANAGER.abi, functionName: 'pendingWithdrawals', args: [address as `0x${string}`], chainId: CHAIN_ID });

  const reg   = (registryEarnings as bigint | undefined) ?? 0n;
  const mkt   = (marketplaceEarnings as bigint | undefined) ?? 0n;
  const lease = (leaseEarnings as bigint | undefined) ?? 0n;
  const total = reg + mkt + lease;

  const { writeContract: withdrawRegistry, data: wRegTx, isPending: isPendingReg } = useWriteContract();
  const { isLoading: isWRegConfirming, isSuccess: isWRegSuccess } = useWaitForTransactionReceipt({ hash: wRegTx });
  const { writeContract: withdrawMarket, data: wMktTx, isPending: isPendingMkt } = useWriteContract();
  const { isLoading: isWMktConfirming, isSuccess: isWMktSuccess } = useWaitForTransactionReceipt({ hash: wMktTx });
  const { writeContract: withdrawLease, data: wLeaseTx, isPending: isPendingLease } = useWriteContract();
  const { isLoading: isWLeaseConfirming, isSuccess: isWLeaseSuccess } = useWaitForTransactionReceipt({ hash: wLeaseTx });

  React.useEffect(() => {
    if (isWRegSuccess || isWMktSuccess || isWLeaseSuccess) toast.success('USDC withdrawn to your wallet');
  }, [isWRegSuccess, isWMktSuccess, isWLeaseSuccess]);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <TrendingUp size={18} color="var(--accent)" />
        <h2 className="display" style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 700, margin: 0 }}>Claimable Earnings</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <EarningsCard label="City Registry" amount={reg} decimals={decimals} onWithdraw={() => withdrawRegistry({ address: CITY_REGISTRY.address, abi: CITY_REGISTRY.abi, functionName: 'withdraw', chainId: CHAIN_ID })} busy={isPendingReg || isWRegConfirming} tx={wRegTx} />
        <EarningsCard label="Marketplace" amount={mkt} decimals={decimals} onWithdraw={() => withdrawMarket({ address: CITY_MARKETPLACE.address, abi: CITY_MARKETPLACE.abi, functionName: 'withdraw', chainId: CHAIN_ID })} busy={isPendingMkt || isWMktConfirming} tx={wMktTx} />
        <EarningsCard label="Lease Income" amount={lease} decimals={decimals} onWithdraw={() => withdrawLease({ address: LEASE_MANAGER.address, abi: LEASE_MANAGER.abi, functionName: 'withdraw', chainId: CHAIN_ID })} busy={isPendingLease || isWLeaseConfirming} tx={wLeaseTx} />
      </div>
      <div style={{ padding: '14px 18px', background: total > 0n ? 'var(--accent-dim)' : 'var(--surface-muted)', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--muted)', fontSize: 15 }}>Total claimable</span>
        <span className="display" style={{ color: total > 0n ? 'var(--accent)' : 'var(--subtle)', fontSize: 24, fontWeight: 700 }}>${Amount.fromRaw(total, decimals).toFixed(2)} USDC</span>
      </div>
    </div>
  );
}

function EarningsCard({ label, amount, decimals, onWithdraw, busy, tx }: { label: string; amount: bigint; decimals: number; onWithdraw: () => void; busy: boolean; tx?: string }) {
  const hasFunds = amount > 0n;
  return (
    <div style={{ background: 'var(--surface-muted)', borderRadius: 12, padding: '14px 16px', border: '1px solid var(--border)' }}>
      <div style={{ color: 'var(--subtle)', fontSize: 12, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{label}</div>
      <div className="display" style={{ color: hasFunds ? 'var(--accent)' : 'var(--subtle)', fontSize: 22, fontWeight: 700, marginBottom: 10 }}>${Amount.fromRaw(amount, decimals).toFixed(2)}</div>
      <button onClick={onWithdraw} disabled={!hasFunds || busy} style={{ width: '100%', padding: '8px', background: hasFunds && !busy ? 'var(--accent)' : 'var(--border)', color: hasFunds && !busy ? '#080f1c' : 'var(--subtle)', border: 'none', borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: hasFunds && !busy ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {busy && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
        {busy ? 'Withdrawing…' : hasFunds ? 'Withdraw' : 'Nothing to claim'}
      </button>
      {tx && <a href={buildTxExplorerUrl(CHAIN_ID, tx)} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--focus)', fontSize: 11, textDecoration: 'none', marginTop: 6, justifyContent: 'center' }}><ExternalLink size={11} /> View tx</a>}
    </div>
  );
}
