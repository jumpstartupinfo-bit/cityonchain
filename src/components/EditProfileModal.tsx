/**
 * EditProfileModal — form, live preview, save (setProfile), and reset (clearProfile).
 * Calls CityProfile.setProfile / clearProfile. Owner-only check enforced in contract.
 */
import React, { useState, useCallback } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import type { Abi } from 'viem';
import { toast } from 'sonner';
import { X, RotateCcw, Save, Eye } from 'lucide-react';
import {
  CITY_PROFILE, CITY_REGISTRY, DISTRICT_REGISTRY, CHAIN_ID,
} from '../contracts';
import {
  encodeProfile, decodeProfile, BANNER_PALETTES, EMPTY_PROFILE,
  FIELD_LIMITS, type ProfileData,
} from '../lib/profileUtils';
import { ProfileDisplay } from './ProfileDisplay';
import type { ProfileHistoryEntry } from '../lib/useCityProfile';

interface Props {
  nft: 'city' | 'district';
  tokenId: bigint;
  entityName: string;
  entityCountry?: string;
  currentProfile: ProfileData | null;
  history: ProfileHistoryEntry[];
  onClose: () => void;
  onSaved: () => void;
}

const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--surface-strong)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '9px 12px', color: 'var(--ink)',
  fontSize: 13, fontFamily: "'DM Sans', sans-serif",
  outline: 'none',
};

function CharCount({ val, max }: { val: string; max: number }) {
  const len = new TextEncoder().encode(val).length;
  const over = len > max;
  return (
    <span style={{ fontSize: 10, color: over ? '#ef4444' : 'var(--muted)', float: 'right' }}>
      {len}/{max}
    </span>
  );
}

function Label({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
      {text}{children}
    </label>
  );
}

export function EditProfileModal({ nft, tokenId, entityName, entityCountry, currentProfile, history: _history, onClose, onSaved }: Props) {
  const { address } = useAccount();
  const isDistrict = nft === 'district';
  const nftAddress = (isDistrict ? DISTRICT_REGISTRY.address : CITY_REGISTRY.address) as `0x${string}`;
  const storyMax = isDistrict ? FIELD_LIMITS.storyDistrict : FIELD_LIMITS.storyCity;

  const [form, setForm] = useState<ProfileData>(currentProfile ?? { ...EMPTY_PROFILE });
  const [encodeErr, setEncodeErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');

  const set = useCallback(<K extends keyof ProfileData>(k: K, v: ProfileData[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setEncodeErr(null);
  }, []);

  // Encode to get byte count and validation
  const encoded = encodeProfile(form, isDistrict);
  const byteCount = encoded.ok ? new TextEncoder().encode(encoded.json).length : null;

  // ── setProfile tx ──────────────────────────────────────────────────────────
  const { writeContract: doSave, data: saveTxHash, isPending: savePending } = useWriteContract();
  const { isLoading: saveConfirming, isSuccess: saveOk, isError: saveFailed } = useWaitForTransactionReceipt({ hash: saveTxHash });

  // ── clearProfile tx ────────────────────────────────────────────────────────
  const { writeContract: doClear, data: clearTxHash, isPending: clearPending, reset: resetClear } = useWriteContract();
  const { isLoading: clearConfirming, isSuccess: clearOk } = useWaitForTransactionReceipt({ hash: clearTxHash });

  React.useEffect(() => {
    if (saveOk) { toast.success('Profile saved'); onSaved(); onClose(); }
  }, [saveOk, onSaved, onClose]);

  React.useEffect(() => {
    if (clearOk) { toast.success('Profile cleared'); onSaved(); onClose(); }
  }, [clearOk, onSaved, onClose]);

  React.useEffect(() => {
    if (saveFailed) toast.error('Save failed — confirm in wallet');
  }, [saveFailed]);

  function handleSave() {
    if (!address) { toast.error('Connect wallet'); return; }
    const result = encodeProfile(form, isDistrict);
    if (!result.ok) { setEncodeErr(result.error); return; }
    doSave({
      address: CITY_PROFILE.address,
      abi: CITY_PROFILE.abi as Abi,
      functionName: 'setProfile',
      args: [nftAddress, tokenId, result.json],
      chainId: CHAIN_ID,
    });
  }

  function handleReset() {
    if (!address) { toast.error('Connect wallet'); return; }
    resetClear();
    doClear({
      address: CITY_PROFILE.address,
      abi: CITY_PROFILE.abi as Abi,
      functionName: 'clearProfile',
      args: [nftAddress, tokenId],
      chainId: CHAIN_ID,
    });
  }

  const isBusy = savePending || saveConfirming || clearPending || clearConfirming;

  // Generated baseline for preview
  const generated = {
    headline: entityName,
    tagline: entityCountry ? `${nft === 'city' ? 'City' : 'District'} · ${entityCountry}` : '',
    welcome: '',
    story: `${entityName} is a ${nft} on CityOnChain. The owner has not yet written a profile.`,
  };

  // Preview uses the live form values decoded
  const previewProfile = decodeProfile(encoded.ok ? encoded.json : '{}');

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16, overflowY: 'auto',
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 20,
        width: '100%', maxWidth: 560,
        boxShadow: '0 12px 60px rgba(0,0,0,0.35)',
        border: '1px solid var(--border)',
        maxHeight: '92dvh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px 16px', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 10,
        }}>
          <div>
            <h3 style={{ margin: 0, color: 'var(--ink)', fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 800 }}>
              Edit brand
            </h3>
            <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: 12 }}>{entityName}</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setTab(tab === 'edit' ? 'preview' : 'edit')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: tab === 'preview' ? 'var(--green-dim)' : 'var(--surface-strong)',
                border: `1px solid ${tab === 'preview' ? 'rgba(45,122,58,0.25)' : 'var(--border)'}`,
                color: tab === 'preview' ? 'var(--green)' : 'var(--muted)',
                borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}
            >
              <Eye size={11} /> Preview
            </button>
            <button onClick={onClose} style={{
              background: 'var(--surface-strong)', border: '1px solid var(--border)',
              color: 'var(--muted)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
              display: 'flex', alignItems: 'center',
            }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Owner-only notice */}
        <div style={{
          margin: '12px 24px 0',
          background: 'var(--green-dim)', border: '1px solid rgba(45,122,58,0.2)',
          borderRadius: 8, padding: '8px 12px', fontSize: 11, color: 'var(--green)',
        }}>
          Only the current owner of this {nft} can save. The contract will reject if your wallet is not the NFT owner.
        </div>

        {tab === 'preview' ? (
          <div style={{ padding: '16px 24px 24px' }}>
            <ProfileDisplay
              profile={previewProfile}
              isHidden={false}
              version={0}
              generated={generated}
              isOwner={false}
              history={[]}
              onEditClick={() => setTab('edit')}
              onReportClick={() => {}}
              entityType={nft}
              entityName={entityName}
            />
            <p style={{ color: 'var(--muted)', fontSize: 11, textAlign: 'center', margin: 0 }}>
              This is a preview — not yet saved to the chain.
            </p>
          </div>
        ) : (
          <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Palette */}
            <div>
              <Label text="Banner colours" />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(BANNER_PALETTES).map(([key, pal]) => (
                  <button
                    key={key}
                    onClick={() => set('palette', key)}
                    style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: pal.bg, cursor: 'pointer',
                      border: form.palette === key ? '3px solid var(--green)' : '2px solid var(--border)',
                      transition: 'border 0.1s',
                    }}
                    title={pal.label}
                  />
                ))}
              </div>
            </div>

            {/* Headline */}
            <div>
              <Label text={`Headline`}>
                <CharCount val={form.headline} max={FIELD_LIMITS.headline} />
              </Label>
              <input
                value={form.headline}
                onChange={(e) => set('headline', e.target.value)}
                maxLength={FIELD_LIMITS.headline}
                placeholder={entityName}
                style={inp}
              />
            </div>

            {/* Tagline */}
            <div>
              <Label text="Tagline">
                <CharCount val={form.tagline} max={FIELD_LIMITS.tagline} />
              </Label>
              <input
                value={form.tagline}
                onChange={(e) => set('tagline', e.target.value)}
                maxLength={FIELD_LIMITS.tagline}
                placeholder="A short tagline"
                style={inp}
              />
            </div>

            {/* Welcome text */}
            <div>
              <Label text="Welcome text">
                <CharCount val={form.welcome} max={FIELD_LIMITS.welcome} />
              </Label>
              <textarea
                value={form.welcome}
                onChange={(e) => set('welcome', e.target.value)}
                maxLength={FIELD_LIMITS.welcome}
                placeholder="A welcome message for visitors"
                rows={2}
                style={{ ...inp, resize: 'vertical' }}
              />
            </div>

            {/* Story */}
            <div>
              <Label text={`Story (${storyMax} char max)`}>
                <CharCount val={form.story} max={storyMax} />
              </Label>
              <textarea
                value={form.story}
                onChange={(e) => set('story', e.target.value)}
                maxLength={storyMax}
                placeholder="Tell visitors about this place"
                rows={isDistrict ? 3 : 5}
                style={{ ...inp, resize: 'vertical' }}
              />
            </div>

            {/* Links */}
            <div>
              <Label text="Link 1 (https only)" />
              <input
                value={form.link1}
                onChange={(e) => set('link1', e.target.value)}
                placeholder="https://example.com"
                style={inp}
              />
            </div>
            <div>
              <Label text="Link 2 (https only)" />
              <input
                value={form.link2}
                onChange={(e) => set('link2', e.target.value)}
                placeholder="https://example.com"
                style={inp}
              />
            </div>

            {/* Logo */}
            <div>
              <Label text="Logo (https or ipfs:// link)" />
              <input
                value={form.logo}
                onChange={(e) => set('logo', e.target.value)}
                placeholder="https://… or ipfs://…"
                style={inp}
              />
              <p style={{ color: 'var(--muted)', fontSize: 10, margin: '4px 0 0' }}>
                Image link or IPFS reference only. No uploads. Optional.
              </p>
            </div>

            {/* Banner */}
            <div>
              <Label text="Banner image (https or ipfs:// link)" />
              <input
                value={form.banner}
                onChange={(e) => set('banner', e.target.value)}
                placeholder="https://… or ipfs://…"
                style={inp}
              />
            </div>

            {/* Byte counter */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'var(--surface-strong)', borderRadius: 8, padding: '8px 12px',
            }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Payload size</span>
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: (byteCount ?? 0) > 900 ? '#f59e0b' : (byteCount ?? 0) > 1000 ? '#ef4444' : 'var(--green)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {byteCount !== null ? `${byteCount} / 1000 bytes` : '—'}
              </span>
            </div>

            {/* Validation error */}
            {encodeErr && (
              <p style={{ color: '#ef4444', fontSize: 12, margin: 0, fontWeight: 600 }}>{encodeErr}</p>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                onClick={handleSave}
                disabled={isBusy || !encoded.ok}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: 'var(--green)', color: '#fff', border: 'none',
                  borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 700,
                  cursor: isBusy || !encoded.ok ? 'not-allowed' : 'pointer',
                  opacity: isBusy || !encoded.ok ? 0.6 : 1,
                  minHeight: 44, transition: 'opacity 0.15s',
                }}
              >
                <Save size={14} />
                {savePending ? 'Confirm in wallet…' : saveConfirming ? 'Saving…' : 'Save to chain'}
              </button>

              {currentProfile && (
                <button
                  onClick={handleReset}
                  disabled={isBusy}
                  title="Reset to generated baseline"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: 'var(--surface-strong)', border: '1px solid var(--border)',
                    color: 'var(--muted)', borderRadius: 10, padding: '12px 16px',
                    fontSize: 13, cursor: isBusy ? 'not-allowed' : 'pointer',
                    opacity: isBusy ? 0.5 : 1, minHeight: 44,
                  }}
                >
                  <RotateCcw size={13} /> Reset
                </button>
              )}
            </div>

            {saveTxHash && (
              <a
                href={`https://explorer.testnet.arc.io/tx/${saveTxHash}`}
                target="_blank" rel="noopener noreferrer nofollow"
                style={{ fontSize: 11, color: 'var(--green)', textDecoration: 'none', textAlign: 'center' }}
              >
                View tx ↗
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
