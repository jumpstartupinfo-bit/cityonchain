import React, { useState, useCallback } from 'react';
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { type Abi } from 'viem';
import { ShoppingCart, X, Plus, ExternalLink, Loader2, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, TrendingUp, Zap } from 'lucide-react';
import { CITY_MARKETPLACE, CITY_REGISTRY, DISTRICT_REGISTRY, CHAIN_ID, USDC_ADDRESS, DISTRICT_COUNT_BY_DISPLAY_TIER } from '../contracts';
import { formatUsdc, parseUsdc } from '@/onchain-money';
import { useCities } from '../lib/useCities';
import { tierLabel, TIER_COLORS } from '../lib/tierConfig';
import { useOwnedTokens } from '../lib/useOwnedTokens';
import { buildTxExplorerUrl } from '@/onchain-facts';
import { useAssetHistory } from '../lib/useAssetHistory';
import { getDistrictName } from '../lib/districtNames';

// ── Error parser ─────────────────────────────────────────────────────────────
const REVERT_MESSAGES: Record<string, string> = {
  'below district floor price': 'Price is below the minimum floor price for this district. Increase the price and try again.',
  'below floor price':           'Price is below the minimum floor price for this district. Increase the price and try again.',
  'InvalidPrice':                'Price must be greater than zero.',
  'NotOwner':                    'You no longer own this token.',
  'AlreadyListed':               'This token is already listed.',
  'NotApproved':                 'Marketplace is not approved to transfer this token.',
  'InactiveListing':             'This listing is no longer active.',
  'InsufficientAllowance':       'USDC allowance too low. Please approve the exact amount first.',
  'User rejected':               'Transaction cancelled.',
  'user rejected':               'Transaction cancelled.',
  'denied':                      'Transaction cancelled.',
};

function parseContractError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  for (const [key, friendly] of Object.entries(REVERT_MESSAGES)) {
    if (msg.includes(key)) return friendly;
  }
  // viem ContractFunctionRevertedError has a .reason field
  const asAny = e as Record<string, unknown>;
  if (typeof asAny?.reason === 'string' && asAny.reason) return `Transaction reverted: ${asAny.reason}`;
  // strip the long hex calldata from the message
  const short = msg.replace(/0x[0-9a-fA-F]{64,}/g, '').replace(/\s+/g, ' ').trim();
  return short.length > 120 ? short.slice(0, 120) + '…' : short;
}

const USDC_ABI = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;

const ERC721_ABI = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [] },
  { name: 'getApproved', type: 'function', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] },
] as const;

interface Listing {
  id: number;
  nftContract: string;
  tokenId: bigint;
  seller: string;
  price: bigint;
  active: boolean;
}

// ─── Header ──────────────────────────────────────────────────────────────────
function Header() {
  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--green-dark) 0%, var(--green) 60%, #4fb860 100%)',
      padding: '40px 24px 28px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', right: 32, bottom: -4, opacity: 0.15, display: 'flex', gap: 3, alignItems: 'flex-end' }}>
        {[36, 52, 28, 60, 44, 24, 40].map((h, i) => (
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
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7ef1b3', display: 'inline-block' }} />
          <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: 600 }}>Secondary Market</span>
        </div>
        <h1 className="display" style={{ color: '#fff', fontSize: 36, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.04em', lineHeight: 1.1 }}>
          Marketplace
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 15, margin: 0 }}>
          Buy and sell mayor licenses and district licenses. All transactions settle in USDC.
        </p>
      </div>
    </div>
  );
}

// ─── ListModal ────────────────────────────────────────────────────────────────
function ListModal({ onClose, onListed }: { onClose: () => void; onListed: () => void }) {
  const { address } = useAccount();
  const { tokenIds: cityIds } = useOwnedTokens(address, CITY_REGISTRY.address);
  const { tokenIds: districtIds } = useOwnedTokens(address, DISTRICT_REGISTRY.address);
  const { cities } = useCities();
  const [nft, setNft] = useState<'city' | 'district'>('city');
  const [tokenId, setTokenId] = useState('');
  const [priceUsdc, setPriceUsdc] = useState('');
  const [phase, setPhase] = useState<'idle' | 'approving' | 'listing' | 'done' | 'error'>('idle');
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [errMsg, setErrMsg] = useState('');

  const nftAddress = nft === 'city' ? CITY_REGISTRY.address : DISTRICT_REGISTRY.address;
  const tokenIds = nft === 'city' ? cityIds : districtIds;

  function labelForToken(id: number): string {
    if (nft === 'city') {
      const city = cities.find(c => c.id === id);
      return city ? `${city.name}, ${city.country}` : `City #${id}`;
    }
    // District tokenId = cityId * 100 + districtIndex
    const cityId = Math.floor(id / 100);
    const distIdx = id % 100;
    const city = cities.find(c => c.id === cityId);
    const distName = getDistrictName(cityId, distIdx);
    return city ? `${distName} · ${city.name}` : `District #${id}`;
  }

  const { writeContractAsync } = useWriteContract();
  const { data: approvalReceipt, isLoading: approvalPending } = useWaitForTransactionReceipt({ hash: phase === 'approving' ? txHash : undefined, chainId: CHAIN_ID });
  const { data: listReceipt, isLoading: listPending } = useWaitForTransactionReceipt({ hash: phase === 'listing' ? txHash : undefined, chainId: CHAIN_ID });

  // auto-advance after NFT approval confirmed
  React.useEffect(() => {
    if (approvalReceipt && phase === 'approving') {
      setPhase('listing');
      void doList();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvalReceipt]);

  React.useEffect(() => {
    if (listReceipt && phase === 'listing') { setPhase('done'); onListed(); }
  }, [listReceipt, phase, onListed]);

  async function doApprove() {
    try {
      setPhase('approving');
      const hash = await writeContractAsync({
        address: nftAddress,
        abi: ERC721_ABI,
        functionName: 'approve',
        args: [CITY_MARKETPLACE.address, BigInt(tokenId)],
        chainId: CHAIN_ID,
      });
      setTxHash(hash);
    } catch (e: unknown) { setErrMsg(parseContractError(e)); setPhase('error'); }
  }

  async function doList() {
    try {
      const priceRaw = parseUsdc(priceUsdc);
      const hash = await writeContractAsync({
        address: CITY_MARKETPLACE.address,
        abi: CITY_MARKETPLACE.abi,
        functionName: 'list',
        args: [nftAddress, BigInt(tokenId), priceRaw],
        chainId: CHAIN_ID,
      });
      setTxHash(hash);
    } catch (e: unknown) { setErrMsg(parseContractError(e)); setPhase('error'); }
  }

  // Floor price check for district listings
  const selectedDistrictCityId = nft === 'district' && tokenId ? Math.floor(Number(tokenId) / 100) : 0;
  const { data: cityTierData } = useReadContract({
    address: CITY_REGISTRY.address,
    abi: CITY_REGISTRY.abi,
    functionName: 'getCityTier',
    args: [BigInt(selectedDistrictCityId)],
    query: { enabled: nft === 'district' && selectedDistrictCityId > 0 },
  });
  const CITY_PRICES: Record<number, number> = { 1: 7500, 2: 3000, 3: 1200, 4: 400, 5: 120, 6: 40 };
  const cityTier = typeof cityTierData === 'number' ? cityTierData : 0;
  const cityPriceUsdc = CITY_PRICES[cityTier] ?? 0;
  const districtFloorUsdc = Math.max(cityPriceUsdc * 0.05, 5); // 5% of city price, floor $5
  const priceNum = Number(priceUsdc) || 0;
  const belowFloor = nft === 'district' && cityTier > 0 && priceNum > 0 && priceNum < districtFloorUsdc;

  const ready = tokenId && priceUsdc && Number(priceUsdc) > 0 && !belowFloor;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--bg)', borderRadius: 18, padding: 28, width: 400, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, color: 'var(--ink)', fontSize: 20, fontWeight: 700 }}>List for Sale</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--subtle)', padding: 4 }}><X size={20} /></button>
        </div>

        {/* NFT type toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['city', 'district'] as const).map(t => (
            <button key={t} onClick={() => { setNft(t); setTokenId(''); }} style={{
              flex: 1, padding: '8px 0', borderRadius: 8, border: '1.5px solid',
              borderColor: nft === t ? 'var(--green)' : 'var(--border)',
              background: nft === t ? 'var(--green-dim)' : 'var(--surface)',
              color: nft === t ? 'var(--green-dark)' : 'var(--subtle)',
              fontWeight: 600, fontSize: 13, cursor: 'pointer', textTransform: 'capitalize',
            }}>{t} License</button>
          ))}
        </div>

        {/* Token selector */}
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--subtle)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Token ID (your licenses)</span>
          <select value={tokenId} onChange={e => setTokenId(e.target.value)} style={{
            width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--border)',
            background: 'var(--surface)', color: 'var(--ink)', fontSize: 14, fontFamily: 'inherit',
          }}>
            <option value="">Select a token…</option>
            {tokenIds.map(id => <option key={id} value={String(id)}>{labelForToken(id)}</option>)}
          </select>
        </label>

        {/* Price */}
        <label style={{ display: 'block', marginBottom: belowFloor ? 8 : 20 }}>
          <span style={{ fontSize: 12, color: 'var(--subtle)', fontWeight: 600, marginBottom: 4, display: 'block' }}>
            Price (USDC)
            {nft === 'district' && cityTier > 0 && (
              <span style={{ marginLeft: 8, color: 'var(--muted)', fontWeight: 400 }}>
                · Floor: ${districtFloorUsdc.toFixed(2)} USDC
              </span>
            )}
          </span>
          <input type="number" min="0.01" step="0.01" value={priceUsdc} onChange={e => setPriceUsdc(e.target.value)}
            placeholder="e.g. 500" style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              border: `1.5px solid ${belowFloor ? '#dc2626' : 'var(--border)'}`,
              background: 'var(--surface)', color: 'var(--ink)', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
            }} />
        </label>
        {belowFloor && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, color: '#dc2626', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={13} />
            Minimum price for this district is ${districtFloorUsdc.toFixed(2)} USDC (5% of city price).
          </div>
        )}

        {phase === 'error' && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, color: '#dc2626', fontSize: 13 }}>
            <AlertCircle size={14} style={{ marginRight: 6 }} />{errMsg}
          </div>
        )}
        {phase === 'done' && (
          <div style={{ background: 'var(--green-dim)', border: '1px solid var(--green)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, color: 'var(--green-dark)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={14} />Listed successfully!
            {txHash && <a href={buildTxExplorerUrl(CHAIN_ID, txHash)} target="_blank" rel="noreferrer" style={{ color: 'var(--green-dark)', marginLeft: 'auto' }}><ExternalLink size={12} /></a>}
          </div>
        )}

        <button
          disabled={!ready || phase === 'approving' || phase === 'listing' || approvalPending || listPending}
          onClick={() => { void doApprove(); }}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
            background: ready ? 'var(--green)' : 'var(--border)',
            color: ready ? '#fff' : 'var(--subtle)', fontSize: 15, fontWeight: 700, cursor: ready ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {(phase === 'approving' || approvalPending) && <Loader2 size={16} className="animate-spin" />}
          {(phase === 'listing' || listPending) && <Loader2 size={16} className="animate-spin" />}
          {phase === 'idle' && 'Approve NFT + List'}
          {phase === 'approving' && 'Approving NFT…'}
          {phase === 'listing' && 'Listing…'}
          {phase === 'done' && 'Listed!'}
          {phase === 'error' && 'Retry'}
        </button>
        <p style={{ fontSize: 11, color: 'var(--subtle)', textAlign: 'center', margin: '10px 0 0' }}>
          Step 1: Approve marketplace to transfer your NFT. Step 2: List it.
        </p>
      </div>
    </div>
  );
}

// ─── BuyModal ─────────────────────────────────────────────────────────────────
function BuyModal({ listing, onClose, onBought }: { listing: Listing; onClose: () => void; onBought: () => void }) {
  const { address } = useAccount();
  const [phase, setPhase] = useState<'idle' | 'approving' | 'buying' | 'done' | 'error'>('idle');
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [errMsg, setErrMsg] = useState('');

  const { writeContractAsync } = useWriteContract();
  const { data: approveReceipt } = useWaitForTransactionReceipt({ hash: phase === 'approving' ? txHash : undefined, chainId: CHAIN_ID });
  const { data: buyReceipt } = useWaitForTransactionReceipt({ hash: phase === 'buying' ? txHash : undefined, chainId: CHAIN_ID });

  React.useEffect(() => {
    if (approveReceipt && phase === 'approving') { setPhase('buying'); void doBuy(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveReceipt]);

  React.useEffect(() => {
    if (buyReceipt && phase === 'buying') { setPhase('done'); onBought(); }
  }, [buyReceipt, phase, onBought]);

  async function doApprove() {
    try {
      setPhase('approving');
      const hash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [CITY_MARKETPLACE.address, listing.price],
        chainId: CHAIN_ID,
      });
      setTxHash(hash);
    } catch (e: unknown) { setErrMsg(e instanceof Error ? e.message : String(e)); setPhase('error'); }
  }

  async function doBuy() {
    try {
      const hash = await writeContractAsync({
        address: CITY_MARKETPLACE.address,
        abi: CITY_MARKETPLACE.abi,
        functionName: 'buy',
        args: [BigInt(listing.id), listing.price],
        chainId: CHAIN_ID,
      });
      setTxHash(hash);
    } catch (e: unknown) { setErrMsg(e instanceof Error ? e.message : String(e)); setPhase('error'); }
  }

  const { cities } = useCities();
  const isSelf = address?.toLowerCase() === listing.seller.toLowerCase();
  const priceStr = formatUsdc(listing.price);
  const isCity = listing.nftContract.toLowerCase() === CITY_REGISTRY.address.toLowerCase();
  const dCityId = isCity ? 0 : Math.floor(Number(listing.tokenId) / 100);
  const dIdx    = isCity ? 0 : Number(listing.tokenId) % 100;
  const buyCity = isCity ? cities.find(c => c.id === Number(listing.tokenId)) : cities.find(c => c.id === dCityId);
  const assetLabel = isCity
    ? (buyCity ? buyCity.name : `City #${String(listing.tokenId)}`)
    : (buyCity ? `${getDistrictName(dCityId, dIdx)} · ${buyCity.name}` : `District #${String(listing.tokenId)}`);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--bg)', borderRadius: 18, padding: 28, width: 380, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, color: 'var(--ink)', fontSize: 20, fontWeight: 700 }}>Buy {assetLabel}</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--subtle)', padding: 4 }}><X size={20} /></button>
        </div>

        <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'var(--subtle)', fontSize: 13 }}>Asset</span>
            <span style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 13 }}>{assetLabel}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'var(--subtle)', fontSize: 13 }}>Seller</span>
            <span style={{ color: 'var(--ink)', fontSize: 12, fontFamily: 'monospace' }}>{listing.seller.slice(0,6)}…{listing.seller.slice(-4)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--subtle)', fontSize: 13 }}>Price</span>
            <span className="display" style={{ color: 'var(--accent)', fontSize: 18, fontWeight: 700 }}>${priceStr} USDC</span>
          </div>
        </div>

        {isSelf && (
          <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, color: '#92400e', fontSize: 13 }}>
            This is your own listing. Cancel it from the listings panel instead.
          </div>
        )}

        {phase === 'error' && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, color: '#dc2626', fontSize: 13 }}>
            <AlertCircle size={14} style={{ marginRight: 6 }} />{errMsg}
          </div>
        )}
        {phase === 'done' && (
          <div style={{ background: 'var(--green-dim)', border: '1px solid var(--green)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, color: 'var(--green-dark)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={14} />Purchase complete!
            {txHash && <a href={buildTxExplorerUrl(CHAIN_ID, txHash)} target="_blank" rel="noreferrer" style={{ color: 'var(--green-dark)', marginLeft: 'auto' }}><ExternalLink size={12} /></a>}
          </div>
        )}

        <button
          disabled={isSelf || phase === 'approving' || phase === 'buying' || phase === 'done'}
          onClick={() => { void doApprove(); }}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
            background: isSelf || phase === 'done' ? 'var(--border)' : 'var(--green)',
            color: isSelf || phase === 'done' ? 'var(--subtle)' : '#fff',
            fontSize: 15, fontWeight: 700, cursor: isSelf || phase === 'done' ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {(phase === 'approving' || phase === 'buying') && <Loader2 size={16} className="animate-spin" />}
          {phase === 'idle' && `Approve $${priceStr} + Buy`}
          {phase === 'approving' && 'Approving USDC…'}
          {phase === 'buying' && 'Buying…'}
          {phase === 'done' && 'Purchased!'}
          {phase === 'error' && 'Retry'}
        </button>
      </div>
    </div>
  );
}

// ─── CancelButton ─────────────────────────────────────────────────────────────
function CancelButton({ listingId, onCancelled }: { listingId: number; onCancelled: () => void }) {
  const { writeContractAsync } = useWriteContract();
  const [loading, setLoading] = useState(false);

  async function doCancel() {
    setLoading(true);
    try {
      await writeContractAsync({
        address: CITY_MARKETPLACE.address,
        abi: CITY_MARKETPLACE.abi,
        functionName: 'cancel',
        args: [BigInt(listingId)],
        chainId: CHAIN_ID,
      });
      onCancelled();
    } finally { setLoading(false); }
  }

  return (
    <button onClick={() => { void doCancel(); }} disabled={loading} style={{
      padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border)',
      background: 'var(--surface)', color: 'var(--subtle)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
    }}>
      {loading ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}Cancel
    </button>
  );
}

// ─── PriceSparkline ───────────────────────────────────────────────────────────
function PriceSparkline({ points, currentPrice }: { points: bigint[]; currentPrice: bigint }) {
  const all = [...points, currentPrice];
  if (all.length < 2) return <div style={{ height: 36, display: 'flex', alignItems: 'center', color: 'var(--muted)', fontSize: 11 }}>No sale history yet</div>;

  const nums = all.map(p => Number(p));
  const min  = Math.min(...nums);
  const max  = Math.max(...nums);
  const range = max - min || 1;
  const W = 160; const H = 36; const pad = 4;

  const pts = nums.map((v, i) => {
    const x = pad + (i / (nums.length - 1)) * (W - 2 * pad);
    const y = H - pad - ((v - min) / range) * (H - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const last = nums[nums.length - 1];
  const prev = nums[nums.length - 2];
  const up   = last >= prev;

  return (
    <svg width={W} height={H} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={up ? 'var(--green)' : '#ef4444'} strokeWidth={1.5} strokeLinejoin="round" />
      {nums.map((_, i) => {
        const [x, y] = (pts.split(' ')[i] ?? '0,0').split(',').map(Number);
        return <circle key={i} cx={x} cy={y} r={i === nums.length - 1 ? 3 : 2} fill={up ? 'var(--green)' : '#ef4444'} />;
      })}
    </svg>
  );
}

// ─── ListingCard ──────────────────────────────────────────────────────────────
function ListingCard({ listing, address, onBuy, onCancelled }: { listing: Listing; address: string | undefined; onBuy: (l: Listing) => void; onCancelled: () => void }) {
  const [showHistory,  setShowHistory]  = useState(false);
  const [showEcon,     setShowEcon]     = useState(false);

  const isMine  = address?.toLowerCase() === listing.seller.toLowerCase();
  const isCity  = listing.nftContract.toLowerCase() === CITY_REGISTRY.address.toLowerCase();
  const priceStr = formatUsdc(listing.price);

  const { cities } = useCities();

  // For cities: tokenId IS the cityId
  // For districts: tokenId = cityId * 100 + districtIndex
  const districtCityId = isCity ? 0 : Math.floor(Number(listing.tokenId) / 100);
  const districtIdx    = isCity ? 0 : Number(listing.tokenId) % 100;

  const city = isCity
    ? cities.find(c => c.id === Number(listing.tokenId))
    : cities.find(c => c.id === districtCityId);
  const districtCount = city && isCity ? DISTRICT_COUNT_BY_DISPLAY_TIER[city.displayTier] ?? 0 : 0;

  const assetName = isCity
    ? (city ? `${city.name}` : `City #${String(listing.tokenId)}`)
    : (city ? `${getDistrictName(districtCityId, districtIdx)} · ${city.name}` : `District #${String(listing.tokenId)}`);

  const { priceHistory, economics, loading: histLoading } = useAssetHistory(
    listing.nftContract,
    listing.tokenId,
    city?.id ?? 0,
    showHistory || showEcon,  // only fetch when a section is expanded
  );

  const pricePts = priceHistory.map(p => p.price);
  const hasPriceHistory = pricePts.length > 0;
  const hasEcon = economics.total > 0n;

  // Price delta vs first sale
  const firstPrice = pricePts[0];
  const pctChange  = firstPrice && firstPrice > 0n
    ? ((Number(listing.price) - Number(firstPrice)) / Number(firstPrice) * 100).toFixed(0)
    : null;

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      transition: 'box-shadow 0.15s',
    }}
      onMouseEnter={e => { if (!isMine) (e.currentTarget).style.boxShadow = '0 4px 20px rgba(34,197,94,0.15)'; }}
      onMouseLeave={e => { (e.currentTarget).style.boxShadow = 'none'; }}
    >
      {/* Main card body */}
      <div style={{ padding: 18, cursor: isMine ? 'default' : 'pointer' }} onClick={() => !isMine && onBuy(listing)}>

        {/* Top row: name + badges */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div>
            <div style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 15, marginBottom: 2 }}>
              {assetName}
            </div>
            <div style={{ color: 'var(--subtle)', fontSize: 12 }}>
              {city ? `${city.country} · ${isCity ? 'City License' : 'District License'}` : (isCity ? 'City License' : 'District License')} · {listing.seller.slice(0,6)}…{listing.seller.slice(-4)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {isMine && (
              <span style={{ background: 'rgba(245,158,11,0.12)', color: '#92400e', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>MINE</span>
            )}
            {city && (
              <span style={{ background: 'rgba(0,0,0,0.06)', color: TIER_COLORS[city.displayTier], fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>
                {tierLabel(city.displayTier)}
              </span>
            )}
          </div>
        </div>

        {/* District count + activity badges */}
        {city && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface-strong)', padding: '2px 8px', borderRadius: 10 }}>
              {districtCount} districts
            </span>
            {hasEcon && (
              <span style={{ fontSize: 11, color: 'var(--green-dark)', background: 'var(--green-dim)', padding: '2px 8px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Zap size={9} />${formatUsdc(economics.total)} activity
              </span>
            )}
            {pctChange !== null && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                color: Number(pctChange) >= 0 ? 'var(--green-dark)' : '#dc2626',
                background: Number(pctChange) >= 0 ? 'var(--green-dim)' : 'rgba(239,68,68,0.08)',
              }}>
                {Number(pctChange) >= 0 ? '+' : ''}{pctChange}% from mint
              </span>
            )}
          </div>
        )}

        {/* Price row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="display" style={{ color: 'var(--accent)', fontSize: 20, fontWeight: 700 }}>
            ${priceStr} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>USDC</span>
          </span>
          {isMine
            ? <CancelButton listingId={listing.id} onCancelled={onCancelled} />
            : (
              <button onClick={e => { e.stopPropagation(); onBuy(listing); }} style={{
                padding: '7px 16px', borderRadius: 8, border: 'none',
                background: 'var(--green)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <ShoppingCart size={13} />Buy
              </button>
            )
          }
        </div>
      </div>

      {/* Expandable: Price History */}
      <div style={{ borderTop: '1px solid var(--border)' }}>
        <button onClick={() => setShowHistory(h => !h)} style={{
          width: '100%', padding: '8px 18px', background: 'none', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          color: 'var(--subtle)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <TrendingUp size={12} />Price History {histLoading ? '…' : hasPriceHistory ? `(${pricePts.length} sales)` : '(no data)'}
          </span>
          {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {showHistory && (
          <div style={{ padding: '4px 18px 14px', background: 'var(--surface-strong)' }}>
            <PriceSparkline points={pricePts} currentPrice={listing.price} />
            {hasPriceHistory && (
              <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  First: <strong style={{ color: 'var(--ink)' }}>${formatUsdc(pricePts[0])}</strong>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  Now: <strong style={{ color: 'var(--accent)' }}>${priceStr}</strong>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expandable: Economic Activity */}
      <div style={{ borderTop: '1px solid var(--border)' }}>
        <button onClick={() => setShowEcon(e => !e)} style={{
          width: '100%', padding: '8px 18px', background: 'none', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          color: 'var(--subtle)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={12} />Economic Activity {hasEcon ? `($${formatUsdc(economics.total)} total)` : '(none yet)'}
          </span>
          {showEcon ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {showEcon && (
          <div style={{ padding: '4px 18px 14px', background: 'var(--surface-strong)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[
              { label: 'Ad Revenue',      val: economics.adRevenue },
              { label: 'Rent Revenue',    val: economics.rentRevenue },
              { label: 'Ticket Revenue',  val: economics.ticketRevenue },
              { label: 'Lease Revenue',   val: economics.leaseRevenue },
            ].map(({ label, val }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--muted)' }}>{label}</span>
                <span style={{ color: val > 0n ? 'var(--ink)' : 'var(--muted)', fontWeight: val > 0n ? 600 : 400 }}>
                  {val > 0n ? `$${formatUsdc(val)}` : '—'}
                </span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--ink)', fontWeight: 700 }}>Total</span>
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>${formatUsdc(economics.total)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ActiveListings ───────────────────────────────────────────────────────────
function ActiveListings({ tab, refresh, count, address, onBuy, onCancelled, onActiveCount }: {
  tab: 'cities' | 'districts';
  refresh: number;
  count: number;
  address: string | undefined;
  onBuy: (l: Listing) => void;
  onCancelled: () => void;
  onActiveCount: (n: number) => void;
}) {
  const ids = Array.from({ length: count }, (_, i) => i + 1);

  const contracts = ids.map(id => ({
    address: CITY_MARKETPLACE.address as `0x${string}`,
    abi: CITY_MARKETPLACE.abi as Abi,
    functionName: 'listings' as const,
    args: [BigInt(id)] as const,
    chainId: CHAIN_ID,
  }));

  const { data: rawListings } = useReadContracts({
    contracts,
    query: { enabled: count > 0, refetchInterval: 30_000, staleTime: 20_000 },
  });

  const allListings: Listing[] = (rawListings ?? [])
    .flatMap((r, i) => {
      if (r.status !== 'success') return [] as Listing[];
      const raw = r.result;
      let seller: string, nftContract: string, tokenId: bigint, price: bigint, active: boolean;
      if (Array.isArray(raw)) {
        [seller, nftContract, tokenId, price, active] = raw as [string, string, bigint, bigint, boolean];
      } else {
        const d = raw as { seller: string; nftContract: string; tokenId: bigint; price: bigint; active: boolean };
        ({ seller, nftContract, tokenId, price, active } = d);
      }
      if (!active) return [] as Listing[];
      return [{ id: ids[i], seller, nftContract, tokenId, price, active }] as Listing[];
    });

  const listings = allListings.filter(l => {
    const isCity = l.nftContract.toLowerCase() === CITY_REGISTRY.address.toLowerCase();
    const isDistrict = l.nftContract.toLowerCase() === DISTRICT_REGISTRY.address.toLowerCase();
    if (tab === 'cities') return isCity;
    if (tab === 'districts') return isDistrict;
    return false;
  });

  // report active count (across both tabs) to parent for the header
  React.useEffect(() => {
    if (rawListings) onActiveCount(allListings.length);
  }, [allListings.length, rawListings, onActiveCount]);

  if (count === 0) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--subtle)', fontSize: 15 }}>
      No active listings yet. Owners can list their {tab === 'cities' ? 'city' : 'district'} licenses for sale.
    </div>
  );

  if (listings.length === 0 && rawListings) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--subtle)', fontSize: 15 }}>
      No active {tab} listings right now.
    </div>
  );

  const key = refresh; // force re-render on refresh
  void key;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
      {listings.map(l => (
        <ListingCard key={l.id} listing={l} address={address} onBuy={onBuy} onCancelled={onCancelled} />
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function Marketplace() {
  const { address, chainId } = useAccount();
  const isWrongChain = chainId !== CHAIN_ID;
  const [tab, setTab] = useState<'cities' | 'districts'>('cities');
  const [showListModal, setShowListModal] = useState(false);
  const [buyTarget, setBuyTarget] = useState<Listing | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const bump = useCallback(() => setRefresh(r => r + 1), []);

  const { data: nextId } = useReadContract({
    address: CITY_MARKETPLACE.address,
    abi: CITY_MARKETPLACE.abi,
    functionName: 'nextListingId',
    chainId: CHAIN_ID,
    query: { refetchInterval: 30_000, staleTime: 20_000 },
  });
  const totalEver = nextId ? Number(nextId) - 1 : 0;

  return (
    <div style={{ minHeight: 'calc(100dvh - 60px)', background: 'var(--bg)' }}>
      <Header />

      {showListModal && (
        <ListModal
          onClose={() => setShowListModal(false)}
          onListed={() => { setShowListModal(false); bump(); }}
        />
      )}
      {buyTarget && (
        <BuyModal
          listing={buyTarget}
          onClose={() => setBuyTarget(null)}
          onBought={() => { setBuyTarget(null); bump(); }}
        />
      )}

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', borderRadius: 10, padding: 4 }}>
            {(['cities', 'districts'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '8px 20px', borderRadius: 8, border: 'none',
                background: tab === t ? 'var(--surface-strong)' : 'none',
                color: tab === t ? 'var(--ink)' : 'var(--subtle)',
                fontFamily: "'DM Sans', sans-serif", fontWeight: tab === t ? 600 : 400,
                fontSize: 14, cursor: 'pointer', textTransform: 'capitalize',
              }}>{t}</button>
            ))}
          </div>

          {address && !isWrongChain && (
            <button onClick={() => setShowListModal(true)} style={{
              padding: '9px 18px', borderRadius: 10, border: 'none',
              background: 'var(--green)', color: '#fff',
              fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Plus size={15} />List an Asset
            </button>
          )}
        </div>

        <div style={{ color: 'var(--subtle)', fontSize: 13, marginBottom: 20 }}>
          {activeCount === null
            ? 'Loading listings…'
            : activeCount === 0
              ? 'No active listings right now.'
              : `${activeCount} active listing${activeCount !== 1 ? 's' : ''}`}
        </div>

        {isWrongChain ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--subtle)', fontSize: 15 }}>
            Switch to Arc Testnet to view listings.
          </div>
        ) : (
          <ActiveListings
            tab={tab}
            refresh={refresh}
            count={totalEver}
            address={address}
            onBuy={setBuyTarget}
            onCancelled={bump}
            onActiveCount={setActiveCount}
          />
        )}

        <div style={{
          marginTop: 40, padding: '16px 20px',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
          color: 'var(--subtle)', fontSize: 13, lineHeight: 1.6,
        }}>
          <strong style={{ color: 'var(--muted)' }}>Platform fee:</strong> 5% on all secondary sales, deducted automatically from the sale price at the time of purchase. The seller receives the remaining 95% directly in the same transaction.
        </div>
      </div>
    </div>
  );
}
