/**
 * OverviewTab — city status + Buy City flow.
 *
 * Two-step purchase, no unlimited allowance:
 *   1. Read live price from FeeConfig.getTierPrice(tier)
 *   2. Block if live price != config price (guard against stale frontend)
 *   3. approve(registry, exactPrice)   — exact amount only
 *   4. claimCity(...)                  — auto-fires once approval confirmed
 *
 * Leaf: keccak256(bytes.concat(keccak256(abi.encode(cityId, name, country, population, tier))))
 * No msg.sender — any wallet can claim.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAccount, useReadContract, useWriteContract,
  useWaitForTransactionReceipt, useSwitchChain,
} from 'wagmi';
import { erc20Abi, type Abi } from 'viem';
import { toast } from 'sonner';
import type { City as CityDef } from '../../lib/merkle';
import { getMerkleProof } from '../../lib/merkle';
import { addOwnedCity } from '../../lib/ownedCities';
import {
  CITY_REGISTRY, FEE_CONFIG, tierLabel, TIER_COLORS,
  CITY_PRICE_BY_DISPLAY_TIER, DISTRICT_COUNT_BY_DISPLAY_TIER,
  CHAIN_ID, USDC_ADDRESS,
} from '../../contracts';
import { useCityProfile } from '../../lib/useCityProfile';
import { ProfileDisplay, ReportModal } from '../ProfileDisplay';
import { EditProfileModal } from '../EditProfileModal';

interface Props { city: CityDef }

function fmtUsdc(raw: bigint): string {
  return `$${(Number(raw) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 0 })} USDC`;
}

type BtnVariant = 'primary' | 'ghost' | 'disabled';
function btnStyle(v: BtnVariant): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'block', width: '100%', padding: '10px 0', minHeight: 44,
    borderRadius: 8, fontFamily: "'DM Sans', sans-serif",
    fontSize: 14, fontWeight: 600, border: 'none', marginTop: 8,
    cursor: v === 'disabled' ? 'not-allowed' : 'pointer',
    opacity: v === 'disabled' ? 0.6 : 1,
    transition: 'opacity 0.15s',
  };
  if (v === 'primary') return { ...base, background: 'var(--accent)', color: '#fff' };
  if (v === 'ghost')   return { ...base, background: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent)' };
  return { ...base, background: 'var(--border)', color: 'var(--muted)' };
}

function StatCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
      <p style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
        {title}
      </p>
      {children}
    </div>
  );
}

export function OverviewTab({ city }: Props) {
  const { address, chainId: walletChain } = useAccount();
  const { switchChain }                   = useSwitchChain();
  const isConnected                       = !!address;
  const isWrongChain                      = isConnected && walletChain !== CHAIN_ID;

  // ── Profile ───────────────────────────────────────────────────────────────
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showReport, setShowReport]           = useState(false);
  const { profile, isHidden, version, history, refresh: refreshProfile } = useCityProfile(
    CITY_REGISTRY.address, BigInt(city.id)
  );

  // ── Chain reads ───────────────────────────────────────────────────────────
  const { data: ownerRaw, refetch: refetchOwner } = useReadContract({
    ...CITY_REGISTRY, abi: CITY_REGISTRY.abi as Abi,
    functionName: 'ownerOf', args: [BigInt(city.id)],
    query: { retry: false },
  });
  const mayorAddress = ownerRaw as `0x${string}` | undefined;
  const isMinted = !!mayorAddress && mayorAddress !== '0x0000000000000000000000000000000000000000';

  const feeConfigDeployed = true;
  const { data: livePriceData } = useReadContract({
    ...FEE_CONFIG, abi: FEE_CONFIG.abi as Abi,
    functionName: 'getTierPrice', args: [city.displayTier],
    query: { enabled: feeConfigDeployed },
  });
  const livePriceRaw   = livePriceData as bigint | undefined;
  const configPrice    = CITY_PRICE_BY_DISPLAY_TIER[city.displayTier] ?? 0n;
  const effectivePrice = livePriceRaw ?? configPrice;
  const priceMismatch  = feeConfigDeployed && livePriceRaw !== undefined && livePriceRaw !== configPrice;

  // ── Transaction hooks ─────────────────────────────────────────────────────
  const {
    writeContract: sendApprove, data: approveHash,
    isPending: approveSigning, error: approveWriteErr, reset: resetApprove,
  } = useWriteContract();

  const {
    writeContract: sendClaim, data: claimHash,
    isPending: claimSigning, error: claimWriteErr, reset: resetClaim,
  } = useWriteContract();

  const { isLoading: approveConfirming, isSuccess: approveOk } =
    useWaitForTransactionReceipt({ hash: approveHash });
  const { isLoading: claimConfirming, isSuccess: claimOk, isError: claimBad, error: claimReceiptErr } =
    useWaitForTransactionReceipt({ hash: claimHash });

  // Claim-fired guard so we don't double-fire
  const claimFiredRef = useRef(false);
  // Toast-fired guard so we don't show the toast on re-renders
  const toastFiredRef = useRef(false);

  // Track whether this buy session was started by the user
  const [sessionActive, setSessionActive] = useState(false);

  // Once approval lands, fire the claim (once only per session)
  useEffect(() => {
    if (!approveOk || !sessionActive || claimFiredRef.current) return;
    claimFiredRef.current = true;
    const proof = getMerkleProof(city);
    sendClaim({
      ...CITY_REGISTRY, abi: CITY_REGISTRY.abi as Abi,
      functionName: 'claimCity',
      args: [BigInt(city.id), city.name, city.country, BigInt(city.population), city.displayTier, proof],
      chainId: CHAIN_ID,
    });
  }, [approveOk, sessionActive, city, sendClaim]);

  // When claim lands, show toast once and refresh owner (toast + refetch are not setState — this is fine)
  useEffect(() => {
    if (!claimOk || toastFiredRef.current) return;
    toastFiredRef.current = true;
    toast.success(`${city.name} claimed!`);
    if (address) addOwnedCity(address, city.id);
    void refetchOwner();
  }, [claimOk, city.name, city.id, address, refetchOwner]);

  // ── Buy handler ───────────────────────────────────────────────────────────
  const handleBuy = useCallback(() => {
    if (!isConnected || isWrongChain || priceMismatch || effectivePrice === 0n) return;
    claimFiredRef.current = false;
    toastFiredRef.current = false;
    setSessionActive(true);
    resetApprove();
    resetClaim();
    sendApprove({
      address: USDC_ADDRESS, abi: erc20Abi,
      functionName: 'approve',
      args: [CITY_REGISTRY.address, effectivePrice],
      chainId: CHAIN_ID,
    });
  }, [isConnected, isWrongChain, priceMismatch, effectivePrice, sendApprove, resetApprove, resetClaim]);

  const handleReset = () => {
    setSessionActive(false);
    toastFiredRef.current = false;
    claimFiredRef.current = false;
    resetApprove();
    resetClaim();
  };

  // ── Derived display ───────────────────────────────────────────────────────
  const anyError  = approveWriteErr ?? claimWriteErr ?? (claimBad ? claimReceiptErr : undefined);
  const errorMsg  = anyError?.message?.split('\n')[0] ?? '';
  const inApprove = sessionActive && !approveOk;
  const inClaim   = approveOk && sessionActive && !claimOk && !claimBad;
  const busy      = inApprove || inClaim;
  const done      = claimOk;

  function statusLabel(): string {
    if (inApprove && approveSigning)    return 'Confirm approval in wallet…';
    if (inApprove && approveConfirming) return 'Approving USDC…';
    if (inClaim   && claimSigning)      return 'Confirm mint in wallet…';
    if (inClaim   && claimConfirming)   return 'Minting city…';
    return 'Processing…';
  }

  const isMayor = isMinted && mayorAddress && address &&
    mayorAddress.toLowerCase() === address.toLowerCase();

  const generated = {
    headline: city.name,
    tagline: `${tierLabel(city.displayTier)} · ${city.country}`,
    welcome: '',
    story: `${city.name} is a ${tierLabel(city.displayTier)} on CityOnChain with a population of ${city.population.toLocaleString()}.`,
  };

  return (
    <div>
      {/* Profile display */}
      <ProfileDisplay
        profile={profile}
        isHidden={isHidden}
        version={version}
        generated={generated}
        isOwner={!!isMayor}
        history={history}
        onEditClick={() => setShowEditProfile(true)}
        onReportClick={() => setShowReport(true)}
        entityType="city"
        entityName={city.name}
      />

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>

      {/* Mayor License */}
      <StatCard title="Mayor License">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: (isMinted || done) ? 'var(--success)' : 'var(--accent)',
            display: 'inline-block',
          }} />
          <span style={{ color: 'var(--ink)', fontWeight: 600 }}>
            {isMinted ? 'Owned' : done ? 'Just claimed!' : 'Available'}
          </span>
        </div>

        {isMinted && mayorAddress ? (
          <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0, wordBreak: 'break-all' }}>
            {mayorAddress}
          </p>
        ) : done ? (
          claimHash && (
            <a href={`https://explorer.arc.io/tx/${claimHash}`} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 13, color: 'var(--accent)' }}>
              View on explorer ↗
            </a>
          )
        ) : (
          <div>
            {/* Price */}
            <p style={{ color: 'var(--accent)', fontSize: 22, fontWeight: 700, margin: '0 0 4px', fontVariantNumeric: 'tabular-nums' }}>
              {fmtUsdc(effectivePrice)}
            </p>
            {feeConfigDeployed && livePriceRaw !== undefined && (
              <p style={{ color: 'var(--muted)', fontSize: 11, margin: '0 0 8px' }}>Live price from contract</p>
            )}

            {/* Price mismatch */}
            {priceMismatch && (
              <p style={{ color: '#ef4444', fontSize: 12, margin: '0 0 10px', fontWeight: 600 }}>
                Contract price ({fmtUsdc(livePriceRaw)}) differs from app config ({fmtUsdc(configPrice)}).
                Reload the app.
              </p>
            )}

            {/* Status */}
            {busy && <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 8px' }}>{statusLabel()}</p>}

            {/* Error */}
            {errorMsg && (
              <p style={{ color: '#ef4444', fontSize: 12, margin: '0 0 8px', wordBreak: 'break-word' }}>{errorMsg}</p>
            )}

            {/* CTA */}
            {!isConnected ? (
              <p style={{ color: 'var(--muted)', fontSize: 13, margin: '8px 0 0' }}>Connect wallet to buy</p>
            ) : isWrongChain ? (
              <button onClick={() => switchChain({ chainId: CHAIN_ID })} style={btnStyle('primary')}>Switch network</button>
            ) : anyError ? (
              <button onClick={handleReset} style={btnStyle('ghost')}>Try again</button>
            ) : (
              <button onClick={handleBuy} disabled={busy || priceMismatch}
                style={btnStyle(busy || priceMismatch ? 'disabled' : 'primary')}>
                {busy ? statusLabel() : `Buy for ${fmtUsdc(effectivePrice)}`}
              </button>
            )}

            {/* Approve tx link while waiting for claim */}
            {approveHash && !claimHash && (
              <a href={`https://explorer.arc.io/tx/${approveHash}`} target="_blank" rel="noopener noreferrer"
                style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                Approval tx ↗
              </a>
            )}
          </div>
        )}
      </StatCard>

      {/* Tier */}
      <StatCard title="City Tier">
        <span style={{ color: TIER_COLORS[city.displayTier], fontWeight: 700, fontSize: 18 }}>
          {tierLabel(city.displayTier)}
        </span>
        <p style={{ color: 'var(--muted)', fontSize: 12, margin: '4px 0 0' }}>
          Pop. {city.population.toLocaleString()}
        </p>
      </StatCard>

      {/* Location */}
      <StatCard title="Location">
        <p style={{ color: 'var(--ink)', fontWeight: 600, margin: 0 }}>{city.country}</p>
        <p style={{ color: 'var(--muted)', fontSize: 12, margin: '4px 0 0' }}>
          {city.lat.toFixed(2)}°, {city.lng.toFixed(2)}°
        </p>
      </StatCard>

      {/* Districts */}
      <StatCard title="Districts">
        <p style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 20, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
          {DISTRICT_COUNT_BY_DISPLAY_TIER[city.displayTier] ?? 0}
        </p>
        <p style={{ color: 'var(--muted)', fontSize: 12, margin: '4px 0 0' }}>
          Available to claim after purchase
        </p>
      </StatCard>
      </div>{/* end stat grid */}

      {/* Modals */}
      {showEditProfile && isMayor && (
        <EditProfileModal
          nft="city"
          tokenId={BigInt(city.id)}
          entityName={city.name}
          entityCountry={city.country}
          currentProfile={profile}
          history={history}
          onClose={() => setShowEditProfile(false)}
          onSaved={refreshProfile}
        />
      )}
      {showReport && (
        <ReportModal
          entityType="city"
          entityName={city.name}
          nft={CITY_REGISTRY.address}
          tokenId={BigInt(city.id)}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
