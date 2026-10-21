import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { type Abi, erc20Abi, createPublicClient, http, keccak256, toHex } from 'viem';
import { toast } from 'sonner';
import { Megaphone, Calendar, CheckCircle, Plus } from 'lucide-react';
import type { City as CityDef } from '../../lib/merkle';
import { AD_SLOTS, USDC_ADDRESS, CHAIN_ID, DISTRICT_COUNT_BY_DISPLAY_TIER } from '../../contracts';
import { requireChain } from '../../onchain-facts';
import { parseUsdc, formatUsdc } from '../../onchain-money';

interface Props {
  city: CityDef;
  ownedDistrictIds?: bigint[];
  cityOwner?: string;
}

interface SlotInfo { slotId: bigint; pricePerDay: bigint; districtTokenId: bigint; slotOwner: string; active: boolean }

const ADabi = AD_SLOTS.abi as Abi;

// SlotCreated(uint256 indexed slotId, uint256 indexed cityId, uint256 districtTokenId, address slotOwner, uint256 pricePerDay)
const SLOT_CREATED_TOPIC = keccak256(toHex('SlotCreated(uint256,uint256,uint256,address,uint256)'));

function useRealSlots(cityId: number) {
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    async function load() {
      try {
        const chain = requireChain(CHAIN_ID);
        const rpc = (chain.rpcUrls)[0] ?? '';
        const client = createPublicClient({ transport: http(rpc) });
        const current = await client.getBlockNumber();
        const from = current > 6000n ? current - 6000n : 0n;
        const cityIdTopic = ('0x' + cityId.toString(16).padStart(64, '0')) as `0x${string}`;
        type RawLog = { topics: string[]; data: string };
        const logs = await client.request({ method: 'eth_getLogs' as const, params: [{ address: AD_SLOTS.address, topics: [SLOT_CREATED_TOPIC, null, cityIdTopic] as [`0x${string}`, null, `0x${string}`], fromBlock: `0x${from.toString(16)}`, toBlock: `0x${current.toString(16)}` }] }) as unknown as RawLog[];
        const found: SlotInfo[] = logs.map(l => {
          const data = l.data.slice(2);
          const districtTokenId = BigInt('0x' + data.slice(0, 64));
          const slotOwner = ('0x' + data.slice(64, 128).slice(24)) as `0x${string}`;
          const pricePerDay = BigInt('0x' + data.slice(128, 192));
          const slotId = BigInt(l.topics[1] ?? '0x0');
          return { slotId, pricePerDay, districtTokenId, slotOwner, active: true };
        });
        setSlots(found);
      } catch { /* silent */ }
    }
    void load();
  }, [cityId]);
  return slots;
}

// ── Slot status card ──────────────────────────────────────────────────────────
function SlotCard({ slot, onBook }: { slot: SlotInfo; onBook: (s: SlotInfo) => void }) {
  const { data } = useReadContract({
    ...AD_SLOTS, abi: ADabi,
    functionName: 'isSlotAvailable', args: [slot.slotId],
    chainId: CHAIN_ID,
    query: { retry: false },
  });
  const [nowMs] = useState(() => Date.now());
  const available = data === true;
  const dailyUsd = (Number(slot.pricePerDay) / 1e6).toFixed(2);

  void nowMs;

  return (
    <div style={{
      background: available ? 'var(--surface-strong)' : 'var(--green-dim)',
      border: `1.5px solid ${available ? 'var(--border)' : 'var(--green)'}`,
      borderRadius: 10, padding: '10px 14px',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: available ? 'var(--border)' : 'var(--green)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {available ? <Megaphone size={14} color="var(--muted)" /> : <CheckCircle size={14} color="#fff" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
          Slot #{slot.slotId.toString()}
          <span style={{
            marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 10,
            background: available ? 'rgba(45,122,58,0.1)' : 'var(--accent-dim)',
            color: available ? 'var(--green)' : 'var(--accent)', fontWeight: 700,
          }}>{available ? 'OPEN' : 'BOOKED'}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
          ${dailyUsd}/day
          {slot.districtTokenId > 0n && <span style={{ marginLeft: 8 }}>District #{slot.districtTokenId.toString()}</span>}
        </div>
      </div>
      {available && (
        <button onClick={() => onBook(slot)} style={bookBtn}>Book</button>
      )}
    </div>
  );
}

// ── Book form ─────────────────────────────────────────────────────────────────
function BookForm({ slot, onBack }: { slot: SlotInfo; onBack: () => void }) {
  const [contentHash, setContentHash] = useState('');
  const [adLink, setAdLink] = useState('');
  const [days, setDays] = useState('7');
  const daysN = Math.max(1, Number(days));
  const totalCost = slot.pricePerDay * BigInt(daysN);

  const { writeContract: doApprove, data: approveTx } = useWriteContract();
  const { writeContract: doBook, data: bookTx } = useWriteContract();
  const { isLoading: approving, isSuccess: approveOk } = useWaitForTransactionReceipt({ hash: approveTx });
  const { isLoading: booking, isSuccess: bookOk } = useWaitForTransactionReceipt({ hash: bookTx });

  const handleApprove = useCallback(() => {
    doApprove({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [AD_SLOTS.address as `0x${string}`, totalCost], chainId: CHAIN_ID });
    toast.info('Approving USDC…');
  }, [doApprove, totalCost]);

  const handleBook = useCallback(() => {
    doBook({ ...AD_SLOTS, abi: ADabi, functionName: 'bookAd', args: [slot.slotId, contentHash, adLink, BigInt(daysN)], chainId: CHAIN_ID });
    toast.info('Booking ad slot…');
  }, [doBook, slot.slotId, contentHash, adLink, daysN]);

  if (bookOk) return (
    <div style={successBox}>
      <CheckCircle size={24} color="var(--green)" />
      <p style={{ color: 'var(--green)', fontWeight: 600, margin: 0 }}>Ad booked! Payment streamed daily to slot owner.</p>
      <button onClick={onBack} style={ghostBtn}>Back to calendar</button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
      <div style={{ padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--muted)' }}>
        Slot #{slot.slotId.toString()} · <span style={{ color: 'var(--accent)', fontWeight: 700 }}>${formatUsdc(totalCost)} total</span> for {days} days at ${(Number(slot.pricePerDay) / 1e6).toFixed(2)}/day
      </div>
      <Field label="Content (IPFS CID or URL)">
        <input value={contentHash} onChange={e => setContentHash(e.target.value)} style={inputStyle} placeholder="ipfs://Qm… or https://…" />
      </Field>
      <Field label="Click-through Link">
        <input value={adLink} onChange={e => setAdLink(e.target.value)} style={inputStyle} placeholder="https://yoursite.com" />
      </Field>
      <Field label="Duration (days)">
        <input type="number" min={1} value={days} onChange={e => setDays(e.target.value)} style={inputStyle} />
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onBack} style={ghostBtn}>Cancel</button>
        <button onClick={handleApprove} disabled={approving || approveOk} style={approveOk ? { ...accentBtn, opacity: 0.5 } : accentBtn}>
          {approving ? 'Approving…' : approveOk ? '✓ Approved' : '1. Approve USDC'}
        </button>
        <button onClick={handleBook} disabled={booking || !approveOk} style={approveOk ? accentBtn : { ...accentBtn, opacity: 0.4, cursor: 'not-allowed' }}>
          {booking ? 'Booking…' : '2. Book Ad'}
        </button>
      </div>
    </div>
  );
}

// ── Create slot form (district owners / mayor) ────────────────────────────────
function CreateSlotForm({ city, ownedDistrictIds, onBack }: { city: CityDef; ownedDistrictIds: bigint[]; onBack: () => void }) {
  const [pricePerDay, setPricePerDay] = useState('1');
  const [forDistrict, setForDistrict] = useState(ownedDistrictIds.length > 0);
  const [districtId, setDistrictId] = useState(ownedDistrictIds[0]?.toString() ?? '0');

  const { writeContract, data: txHash } = useWriteContract();
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const handleCreate = useCallback(() => {
    const priceRaw = parseUsdc(pricePerDay);
    const districtTokenId = forDistrict && districtId ? BigInt(districtId) : 0n;
    writeContract({ ...AD_SLOTS, abi: ADabi, functionName: 'createSlot', args: [BigInt(city.id), districtTokenId, priceRaw], chainId: CHAIN_ID });
    toast.info('Creating ad slot…');
  }, [writeContract, city.id, pricePerDay, forDistrict, districtId]);

  if (isSuccess) return (
    <div style={successBox}>
      <CheckCircle size={24} color="var(--green)" />
      <p style={{ color: 'var(--green)', fontWeight: 600, margin: 0 }}>Ad slot created! Advertisers can now book it.</p>
      <button onClick={onBack} style={ghostBtn}>Back to slots</button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
      <h3 style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 16, margin: 0 }}>Create Ad Slot</h3>
      <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
        Set a daily rate. Advertisers pay this amount per day when they book your slot. Payment streams to you in real time.
      </p>
      <Field label="Price per Day (USDC)">
        <input type="number" step="0.01" min="0.01" value={pricePerDay} onChange={e => setPricePerDay(e.target.value)} style={inputStyle} placeholder="1.00" />
      </Field>
      {ownedDistrictIds.length > 0 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={forDistrict} onChange={e => setForDistrict(e.target.checked)} />
          Attach to a specific district
        </label>
      )}
      {forDistrict && ownedDistrictIds.length > 0 && (
        <Field label="District">
          <select value={districtId} onChange={e => setDistrictId(e.target.value)} style={inputStyle}>
            {ownedDistrictIds.map(id => <option key={id.toString()} value={id.toString()}>District #{id.toString()}</option>)}
          </select>
        </Field>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onBack} style={ghostBtn}>Cancel</button>
        <button onClick={handleCreate} disabled={isLoading || Number(pricePerDay) <= 0} style={accentBtn}>
          {isLoading ? 'Creating…' : 'Create Slot'}
        </button>
      </div>
    </div>
  );
}

// ── Main AdsTab ───────────────────────────────────────────────────────────────
export function AdsTab({ city, ownedDistrictIds = [], cityOwner }: Props) {
  const { address, isConnected } = useAccount();
  const [view, setView] = useState<'list' | 'book' | 'create'>('list');
  const [bookSlot, setBookSlot] = useState<SlotInfo | null>(null);
  const slots = useRealSlots(city.id);
  const districtCount = DISTRICT_COUNT_BY_DISPLAY_TIER[city.displayTier] ?? 4;

  const isCityOwner = !!address && !!cityOwner && address.toLowerCase() === cityOwner.toLowerCase();
  const isDistrictOwner = ownedDistrictIds.length > 0;
  const canManage = isCityOwner || isDistrictOwner;

  const handleBook = useCallback((slot: SlotInfo) => {
    if (!isConnected) { toast.error('Connect your wallet first'); return; }
    setBookSlot(slot);
    setView('book');
  }, [isConnected]);

  if (view === 'book' && bookSlot) return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => { setView('list'); setBookSlot(null); }} style={ghostBtn}>← Back</button>
        <h3 style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 16, margin: 0 }}>Book Ad Slot</h3>
      </div>
      <BookForm slot={bookSlot} onBack={() => { setView('list'); setBookSlot(null); }} />
    </div>
  );

  if (view === 'create') return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => setView('list')} style={ghostBtn}>← Back</button>
      </div>
      <CreateSlotForm city={city} ownedDistrictIds={ownedDistrictIds} onBack={() => setView('list')} />
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h3 style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 18, margin: 0 }}>Ad Slots in {city.name}</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '2px 0 0' }}>
            Book billboard slots. Payment streams daily; pro-rata refund if cancelled.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--green-dim)', borderRadius: 20, padding: '4px 12px',
            fontSize: 12, color: 'var(--green)', border: '1px solid rgba(45,122,58,0.2)',
          }}>
            <Calendar size={11} />{slots.length} slots
          </div>
          {canManage && (
            <button onClick={() => setView('create')} style={accentBtn}>
              <Plus size={13} style={{ marginRight: 4 }} />Create Slot
            </button>
          )}
        </div>
      </div>

      {slots.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 32, textAlign: 'center' }}>
          <Megaphone size={28} style={{ color: 'var(--muted)', marginBottom: 8 }} />
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>No ad slots in {city.name} yet.</p>
          {canManage && (
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0 0' }}>
              As the city owner or a district owner, you can create the first slot above.
            </p>
          )}
          <p style={{ color: 'var(--subtle)', fontSize: 11, margin: '8px 0 0' }}>
            {districtCount} districts available · up to 3 slots each
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {slots.map(slot => (
            <SlotCard key={slot.slotId.toString()} slot={slot} onBook={handleBook} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</label>{children}</div>;
}

const bookBtn: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 8, background: 'var(--green)', border: 'none',
  color: '#fff', fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0,
};
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'var(--surface-strong)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '9px 12px', color: 'var(--ink)', fontFamily: "'DM Sans', sans-serif", fontSize: 14,
};
const accentBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', padding: '8px 16px', borderRadius: 8,
  background: 'var(--accent, #f59e0b)', border: 'none', color: '#080f1c',
  fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border)',
  color: 'var(--muted)', fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: 'pointer',
};
const successBox: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
  padding: 24, background: 'rgba(45,122,58,0.08)', border: '1px solid rgba(45,122,58,0.25)', borderRadius: 12, textAlign: 'center',
};
