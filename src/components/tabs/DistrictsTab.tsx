/**
 * DistrictsTab — isometric district map via CityIsoMap, with buy flow per district.
 * Clicking a district tile opens an inline buy panel below the map.
 */
import React, { useEffect, useState } from 'react';
import { useReadContract, useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { type Abi } from 'viem';
import type { City as CityDef } from '../../lib/merkle';
import {
  DISTRICT_REGISTRY,
  DISPLAY_TIER_LABELS,
  DISTRICT_COUNT_BY_DISPLAY_TIER,
  CITY_PRICE_BY_DISPLAY_TIER,
  computeDistrictPrice,
  CHAIN_ID,

} from '../../contracts';
import { CityIsoMap } from '../WorldMap';
import { getDistrictDisplayName, SECTOR_NAMES } from '../../lib/districtNames';
import { toast } from 'sonner';
import { Crown, MapPin, Pencil } from 'lucide-react';
import { useCityProfile } from '../../lib/useCityProfile';
import { EditProfileModal } from '../EditProfileModal';
import { ReportModal } from '../ProfileDisplay';

interface Props { city: CityDef }



export function DistrictsTab({ city }: Props) {
  const displayTier = city.displayTier ?? 6;
  const districtCount = DISTRICT_COUNT_BY_DISPLAY_TIER[displayTier] ?? 4;
  const districtPrice = computeDistrictPrice(CITY_PRICE_BY_DISPLAY_TIER[displayTier] ?? 40_000_000n);
  const tierLabel = DISPLAY_TIER_LABELS[displayTier] ?? 'City';
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h3 className="display" style={{ color: 'var(--ink)', margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {districtCount} Districts
          </h3>
          <p style={{ color: 'var(--muted)', margin: '4px 0 0', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <MapPin size={12} />
            {tierLabel} · Each district{' '}
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
              ${(Number(districtPrice) / 1e6).toFixed(0)} USDC
            </span>
            {' '}(5% of city price)
          </p>
        </div>
        
      </div>

      {/* Isometric district map */}
      <div style={{
        background: 'var(--surface-strong)', border: '1.5px solid var(--border)',
        borderRadius: 16, padding: '16px 12px', marginBottom: 20,
        boxShadow: '0 4px 16px rgba(45,122,58,0.08)',
      }}>
        <CityIsoMap
          city={city}
          onSelectDistrict={(idx) => setSelectedIdx(idx === selectedIdx ? null : idx)}
        />
      </div>

      {/* Selected district buy panel */}
      {selectedIdx !== null && (
        <div style={{
          background: 'var(--surface-strong)',
          border: '2px solid var(--green)',
          borderRadius: 16, padding: '20px',
          marginBottom: 20,
          boxShadow: '0 4px 20px var(--green-glow)',
        }}>
          <DistrictBuyPanel
            key={selectedIdx}
            city={city}
            districtIndex={selectedIdx}
            price={districtPrice}
            onClose={() => setSelectedIdx(null)}
          />
        </div>
      )}

      {/* District list below map */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 8,
      }}>
        {Array.from({ length: districtCount }, (_, i) => (
          <DistrictChip
            key={i}
            city={city}
            index={i}
            selected={selectedIdx === i}
            onSelect={() => setSelectedIdx(i === selectedIdx ? null : i)}
          />
        ))}
      </div>

      <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 16, textAlign: 'center' }}>
        District ID = cityId × 100 + index &nbsp;·&nbsp; Districts are included with the city purchase.
      </p>
    </div>
  );
}

// ── Compact district chip ────────────────────────────────────────────────────
function DistrictChip({ city, index, selected, onSelect }: {
  city: CityDef; index: number; selected: boolean; onSelect: () => void;
}) {
  const tokenId = BigInt(city.id * 100 + index);
  const { data: owner } = useReadContract({
    ...DISTRICT_REGISTRY, abi: DISTRICT_REGISTRY.abi as Abi,
    functionName: 'ownerOf', args: [tokenId], query: { retry: false },
  });
  const { data: sectorRaw } = useReadContract({
    ...DISTRICT_REGISTRY, abi: DISTRICT_REGISTRY.abi as Abi,
    functionName: 'districtSector', args: [tokenId],
    query: { staleTime: 30_000 },
  });
  const sectorIndex = typeof sectorRaw === 'number' ? sectorRaw : 0;
  const name = getDistrictDisplayName(city.id, index, sectorIndex);
  const isMinted = !!owner;

  return (
    <button
      onClick={onSelect}
      style={{
        background: selected ? 'var(--green-dim)' : isMinted ? 'rgba(200,146,42,0.08)' : 'var(--surface-strong)',
        border: selected ? '1.5px solid var(--green)' : `1.5px solid ${isMinted ? 'rgba(200,146,42,0.3)' : 'var(--border)'}`,
        borderRadius: 10, padding: '10px 12px',
        cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
        {isMinted && <Crown size={10} color="var(--accent)" />}
        <span style={{ fontSize: 11, fontWeight: 700, color: selected ? 'var(--green)' : 'var(--ink)' }}>
          {name}
        </span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)' }}>
        {isMinted ? `${(owner as string).slice(0, 6)}…${(owner as string).slice(-4)}` : 'Available'}
      </div>
    </button>
  );
}

// ── Full buy panel (shown when a district is selected) ───────────────────────
function DistrictBuyPanel({ city, districtIndex, price, onClose }: {
  city: CityDef;
  districtIndex: number;
  price: bigint;
  onClose: () => void;
}) {
  const tokenId = BigInt(city.id * 100 + districtIndex);
  const { address } = useAccount();

  const { data: owner } = useReadContract({
    ...DISTRICT_REGISTRY, abi: DISTRICT_REGISTRY.abi as Abi,
    functionName: 'ownerOf', args: [tokenId], query: { retry: false },
  });
  const { data: sectorRaw, refetch: refetchSector } = useReadContract({
    ...DISTRICT_REGISTRY, abi: DISTRICT_REGISTRY.abi as Abi,
    functionName: 'districtSector', args: [tokenId], query: { staleTime: 30_000 },
  });
  const sectorIndex = typeof sectorRaw === 'number' ? sectorRaw : 0;
  const name = getDistrictDisplayName(city.id, districtIndex, sectorIndex);
  const isMinted = !!owner;
  const ownerAddr = isMinted && typeof owner === 'string' ? owner : null;
  const isOwner = ownerAddr && address && ownerAddr.toLowerCase() === address.toLowerCase();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div className="display" style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}>
            {name}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 3 }}>
            District #{city.id * 100 + districtIndex} · {city.name}, {city.country}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, lineHeight: 1 }}>×</button>
      </div>

      {isMinted && ownerAddr ? (
        <DistrictOwnerPanel
          city={city}
          districtIndex={districtIndex}
          ownerAddr={ownerAddr}
          isOwner={!!isOwner}
          name={name}
          tokenId={tokenId}
          sectorIndex={sectorIndex}
          onSectorChanged={() => { void refetchSector(); }}
        />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>Floor price for resale</div>
            <div className="display" style={{ color: 'var(--accent)', fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em' }}>
              ${(Number(price) / 1e6).toFixed(0)}
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)', marginLeft: 4 }}>USDC</span>
            </div>
          </div>
          <div style={{
            background: 'var(--surface-strong)', borderRadius: 12,
            padding: '10px 16px', fontSize: 12, color: 'var(--muted)',
            border: '1px solid var(--border)', maxWidth: 180, textAlign: 'center', lineHeight: 1.5,
          }}>
            Included free with city purchase. List on marketplace to sell.
          </div>
        </div>
      )}

    </div>
  );
}

// ── District owner panel (shown when district is minted) ─────────────────────
function DistrictOwnerPanel({ city, districtIndex: _districtIndex, ownerAddr, isOwner, name, tokenId, sectorIndex, onSectorChanged }: {
  city: CityDef; districtIndex: number; ownerAddr: string;
  isOwner: boolean; name: string; tokenId: bigint;
  sectorIndex: number; onSectorChanged: () => void;
}) {
  const [showEdit, setShowEdit] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const { profile, history, refresh } = useCityProfile(DISTRICT_REGISTRY.address, tokenId);

  return (
    <div>
      <div style={{
        background: isOwner ? 'var(--accent-dim)' : 'var(--green-dim)',
        borderRadius: 12, padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Crown size={16} color={isOwner ? 'var(--accent)' : 'var(--green)'} />
          <div>
            <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13 }}>
              {isOwner ? 'You own this district' : 'Already owned'}
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>
              {ownerAddr.slice(0, 10)}…{ownerAddr.slice(-6)}
            </div>
          </div>
        </div>
        {isOwner && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => setShowRename(v => !v)} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: showRename ? 'var(--accent)' : 'var(--accent-dim)',
              color: showRename ? '#fff' : 'var(--accent)',
              border: '1px solid var(--accent)', borderRadius: 8,
              padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}>
              <Pencil size={11} /> Rename
            </button>
            <button onClick={() => setShowEdit(true)} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'var(--green)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
            }}>
              <Pencil size={11} /> Edit brand
            </button>
            <button onClick={() => setShowReport(true)} style={{
              background: 'var(--surface-strong)', border: '1px solid var(--border)',
              color: 'var(--muted)', borderRadius: 8, padding: '6px 10px',
              cursor: 'pointer', fontSize: 12,
            }}>
              Report
            </button>
          </div>
        )}
      </div>

      {/* Rename panel */}
      {showRename && isOwner && (
        <RenameSectorPanel
          tokenId={tokenId}
          currentSector={sectorIndex}
          onRenamed={() => { setShowRename(false); onSectorChanged(); }}
        />
      )}

      {/* Profile preview if set */}
      {profile && !isOwner && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
          {profile.headline && (
            <p style={{ fontWeight: 600, color: 'var(--ink)', margin: '0 0 2px' }}>{profile.headline}</p>
          )}
          {profile.tagline && <p style={{ margin: 0 }}>{profile.tagline}</p>}
        </div>
      )}

      {showEdit && (
        <EditProfileModal
          nft="district"
          tokenId={tokenId}
          entityName={name}
          entityCountry={city.country}
          currentProfile={profile}
          history={history}
          onClose={() => setShowEdit(false)}
          onSaved={refresh}
        />
      )}
      {showReport && (
        <ReportModal
          entityType="district"
          entityName={`${name} (${city.name})`}
          nft={DISTRICT_REGISTRY.address}
          tokenId={tokenId}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}

// ── Rename sector panel ───────────────────────────────────────────────────────
function RenameSectorPanel({ tokenId, currentSector, onRenamed }: {
  tokenId: bigint; currentSector: number; onRenamed: () => void;
}) {
  const [selected, setSelected] = useState<number>(currentSector);
  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  const { isSuccess, isError } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess) { toast.success('District renamed!'); onRenamed(); }
  }, [isSuccess, onRenamed]);

  useEffect(() => {
    if (isError) { toast.error('Rename failed'); reset(); }
  }, [isError, reset]);

  function handleSave() {
    writeContract({
      ...DISTRICT_REGISTRY,
      abi: DISTRICT_REGISTRY.abi as Abi,
      functionName: 'setDistrictSector',
      args: [tokenId, selected],
      chainId: CHAIN_ID,
    });
  }

  return (
    <div style={{
      marginTop: 12, background: 'var(--surface-strong)',
      border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>
        Choose a sector identity
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6, marginBottom: 14,
      }}>
        <button
          onClick={() => setSelected(0)}
          style={{
            padding: '7px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
            cursor: 'pointer', textAlign: 'left', transition: 'all 0.1s',
            background: selected === 0 ? 'var(--green-dim)' : 'var(--surface)',
            border: `1.5px solid ${selected === 0 ? 'var(--green)' : 'var(--border)'}`,
            color: selected === 0 ? 'var(--green)' : 'var(--muted)',
          }}
        >
          Default name
        </button>
        {Object.entries(SECTOR_NAMES).map(([idx, label]) => {
          const i = Number(idx);
          return (
            <button
              key={i}
              onClick={() => setSelected(i)}
              style={{
                padding: '7px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', textAlign: 'left', transition: 'all 0.1s',
                background: selected === i ? 'var(--accent-dim)' : 'var(--surface)',
                border: `1.5px solid ${selected === i ? 'var(--accent)' : 'var(--border)'}`,
                color: selected === i ? 'var(--accent)' : 'var(--ink)',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={handleSave}
          disabled={isPending || selected === currentSector}
          style={{
            background: 'var(--green)', color: '#fff', border: 'none',
            borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 700,
            cursor: isPending || selected === currentSector ? 'not-allowed' : 'pointer',
            opacity: isPending || selected === currentSector ? 0.6 : 1,
          }}
        >
          {isPending ? 'Saving…' : 'Save name'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          {selected > 0 ? `"${SECTOR_NAMES[selected]}" will be saved on-chain` : 'Default deterministic name will be shown'}
        </span>
      </div>
    </div>
  );
}

