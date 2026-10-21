import { useState, useCallback, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { type Abi } from 'viem';
import { toast } from 'sonner';
import { Ticket, Plus, Calendar, Users } from 'lucide-react';
import type { City as CityDef } from '../../lib/merkle';
import { EVENT_TICKETS, USDC_ADDRESS } from '../../contracts';

const ERC20_APPROVE_ABI = [
  { name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
] as const;

const et = EVENT_TICKETS;
const ETabi = et.abi as Abi;

interface Props {
  city: CityDef;
  ownedDistrictIds?: bigint[];
  cityOwner?: string;
}



function useCountdown(endMs: number) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    function tick() {
      const diff = endMs - Date.now();
      if (diff <= 0) { setLabel('Started'); return; }
      const d = Math.floor(diff / 86_400_000);
      const h = Math.floor((diff % 86_400_000) / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      if (d > 0) setLabel(`${d}d ${h}h`);
      else if (h > 0) setLabel(`${h}h ${m}m`);
      else setLabel(`${m}m ${s}s`);
    }
    tick();
    const t = setInterval(tick, 1_000);
    return () => clearInterval(t);
  }, [endMs]);
  return label;
}

function useEvents(_cityId: number) {
  const { data: nextIdRaw } = useReadContract({ ...et, abi: ETabi, functionName: 'nextEventId' });
  const nextId = typeof nextIdRaw === 'bigint' ? Number(nextIdRaw) : 1;
  return Array.from({ length: Math.max(0, nextId - 1) }, (_, i) => i + 1);
}

function useEvent(eventId: number) {
  return useReadContract({ ...et, abi: ETabi, functionName: 'events', args: [BigInt(eventId)] });
}

function EventCard({ eventId, cityId, onBuy }: { eventId: number; cityId: number; onBuy: (id: number, price: bigint, title: string) => void }) {
  const { data, isLoading } = useEvent(eventId);
  const [now] = useState(() => Date.now());

  if (isLoading) return <div style={cardStyle}><span style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</span></div>;
  if (!data) return null;

  const [evCityId, , organizer, title, eventDate, capacity, ticketPrice, ticketsSold, cancelled, , resaleEnabled] = data as [bigint, bigint, string, string, string, bigint, bigint, bigint, bigint, boolean, boolean, boolean, bigint];
  if (Number(evCityId) !== cityId) return null;
  if (cancelled) return null;

  const dateMs = Number(eventDate) * 1000;
  const isPast = now > dateMs;
  const totalCap = Number(capacity);
  const sold = Number(ticketsSold);
  const available = totalCap - sold;
  const soldPct = totalCap > 0 ? Math.round((sold / totalCap) * 100) : 0;
  const priceUsd = (Number(ticketPrice) / 1e6).toFixed(2);

  return (
    <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{title}</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--muted)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Calendar size={12} />{new Date(dateMs).toLocaleDateString()}
            </span>
            <span style={{ color: 'var(--muted)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Users size={12} />{available} / {totalCap} left
            </span>
            {resaleEnabled && <span style={{ color: 'var(--muted)', fontSize: 11, background: 'var(--border)', padding: '1px 6px', borderRadius: 4 }}>Resale</span>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, marginLeft: 12 }}>
          <span style={{ color: 'var(--accent)', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', fontSize: 14 }}>${priceUsd}</span>
          {!isPast && available > 0 ? (
            <button onClick={() => onBuy(eventId, ticketPrice, title)} style={accentBtn}>Buy Ticket</button>
          ) : (
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>{isPast ? 'Ended' : 'Sold out'}</span>
          )}
        </div>
      </div>

      {/* Ticket availability bar */}
      <div>
        <div style={{ height: 5, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${soldPct}%`,
            background: soldPct > 80 ? 'var(--danger)' : soldPct > 50 ? 'var(--warning)' : 'var(--green)',
            borderRadius: 4, transition: 'width 0.3s',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
          <span style={{ color: 'var(--subtle)', fontSize: 10 }}>{soldPct}% sold</span>
          {!isPast && <EventCountdownInline dateMs={dateMs} />}
        </div>
      </div>

      <div style={{ color: 'var(--muted)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>
        {organizer.slice(0, 8)}…{organizer.slice(-6)}
      </div>
    </div>
  );
}

function EventCountdownInline({ dateMs }: { dateMs: number }) {
  const label = useCountdown(dateMs);
  return <span style={{ color: 'var(--accent)', fontSize: 10, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>Starts in {label}</span>;
}

function CreateEventForm({ city, ownedDistrictIds, onBack }: { city: CityDef; ownedDistrictIds: bigint[]; onBack: () => void }) {
  const { address } = useAccount();
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [capacity, setCapacity] = useState('100');
  const [ticketPrice, setTicketPrice] = useState('5');
  const [resaleEnabled, setResaleEnabled] = useState(false);
  const [forDistrict, setForDistrict] = useState(false);
  const [districtId, setDistrictId] = useState(ownedDistrictIds[0]?.toString() ?? '');

  const { writeContract, data: txHash } = useWriteContract();
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const handleCreate = useCallback(() => {
    const dateTs = BigInt(Math.floor(new Date(eventDate).getTime() / 1000));
    const priceRaw = BigInt(Math.round(Number(ticketPrice) * 1e6));
    const districtTokenId = forDistrict && districtId ? BigInt(districtId) : 0n;
    writeContract({
      ...et, abi: ETabi, functionName: 'createEvent',
      args: [BigInt(city.id), districtTokenId, title, dateTs, BigInt(capacity), priceRaw, resaleEnabled, 5000n],
    });
    toast.info('Creating event…');
  }, [writeContract, city.id, title, eventDate, capacity, ticketPrice, resaleEnabled, forDistrict, districtId]);

  void address;

  if (isSuccess) return (
    <div style={successBox}>
      <Ticket size={20} style={{ color: '#4ade80' }} />
      <p style={{ color: '#4ade80', fontWeight: 600, margin: 0 }}>Event created! Revenue is escrowed until after the event date.</p>
      <button onClick={onBack} style={ghostBtn}>Back to Events</button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 520 }}>
      <Field label="Event Title"><input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} placeholder="CityOnChain Summit 2027" /></Field>
      <Field label="Event Date & Time"><input type="datetime-local" value={eventDate} onChange={e => setEventDate(e.target.value)} style={inputStyle} /></Field>
      <Field label="Capacity"><input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} style={inputStyle} /></Field>
      <Field label="Ticket Price (USDC)"><input type="number" step="0.01" value={ticketPrice} onChange={e => setTicketPrice(e.target.value)} style={inputStyle} /></Field>

      {ownedDistrictIds.length > 0 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={forDistrict} onChange={e => setForDistrict(e.target.checked)} />
          Host under a specific district
        </label>
      )}
      {forDistrict && ownedDistrictIds.length > 0 && (
        <Field label="District">
          <select value={districtId} onChange={e => setDistrictId(e.target.value)} style={inputStyle}>
            {ownedDistrictIds.map(id => <option key={id.toString()} value={id.toString()}>District #{id.toString()}</option>)}
          </select>
        </Field>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={resaleEnabled} onChange={e => setResaleEnabled(e.target.checked)} />
        Allow ticket resale (max 50% markup)
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onBack} style={ghostBtn}>Cancel</button>
        <button onClick={handleCreate} disabled={isLoading || !title || !eventDate} style={accentBtn}>
          {isLoading ? 'Creating…' : 'Create Event'}
        </button>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 11, margin: 0 }}>
        Ticket revenue is escrowed and released after the event date, minus platform fee and city/district owner split.
      </p>
    </div>
  );
}

function BuyTicketForm({ eventId, ticketPrice, eventTitle, onBack }: { eventId: number; ticketPrice: bigint; eventTitle: string; onBack: () => void }) {
  const [qty, setQty] = useState(1);
  const total = ticketPrice * BigInt(qty);
  const totalUsd = (Number(total) / 1e6).toFixed(2);

  const { writeContract: approveWrite, data: approveTx } = useWriteContract();
  const { writeContract: buyWrite, data: buyTx } = useWriteContract();
  const { isLoading: approving, isSuccess: approveOk } = useWaitForTransactionReceipt({ hash: approveTx });
  const { isLoading: buying, isSuccess: buyOk } = useWaitForTransactionReceipt({ hash: buyTx });

  const doApprove = useCallback(() => {
    approveWrite({ address: USDC_ADDRESS, abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [et.address as `0x${string}`, total] });
    toast.info('Approving USDC…');
  }, [approveWrite, total]);

  const doBuy = useCallback(() => {
    buyWrite({ ...et, abi: ETabi, functionName: 'buyTicket', args: [BigInt(eventId), BigInt(qty)] });
    toast.info('Buying ticket…');
  }, [buyWrite, eventId, qty]);

  if (buyOk) return (
    <div style={successBox}>
      <Ticket size={20} style={{ color: '#4ade80' }} />
      <p style={{ color: '#4ade80', fontWeight: 600, margin: 0 }}>Ticket purchased! Your NFT ticket is in your wallet.</p>
      <button onClick={onBack} style={ghostBtn}>Back to Events</button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400 }}>
      <div style={{ padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <div style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 14 }}>{eventTitle}</div>
        <div style={{ color: 'var(--accent)', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', fontSize: 14, marginTop: 2 }}>${totalUsd} total</div>
      </div>
      <Field label="Quantity">
        <input type="number" min={1} max={10} value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value)))} style={inputStyle} />
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onBack} style={ghostBtn}>Cancel</button>
        <button onClick={doApprove} disabled={approving || approveOk} style={approveOk ? { ...accentBtn, opacity: 0.5 } : accentBtn}>
          {approving ? 'Approving…' : approveOk ? '✓ Approved' : `1. Approve $${totalUsd}`}
        </button>
        <button onClick={doBuy} disabled={buying || !approveOk} style={approveOk ? accentBtn : { ...accentBtn, opacity: 0.4, cursor: 'not-allowed' }}>
          {buying ? 'Buying…' : '2. Buy Ticket'}
        </button>
      </div>
    </div>
  );
}

export function EventsTab({ city, ownedDistrictIds = [], cityOwner }: Props) {
  const { address, isConnected } = useAccount();
  const [view, setView] = useState<'list' | 'create' | 'buy'>('list');
  const [buyTarget, setBuyTarget] = useState<{ id: number; price: bigint; title: string } | null>(null);

  const eventIds = useEvents(city.id);
  const isCityOwner = !!address && !!cityOwner && address.toLowerCase() === cityOwner.toLowerCase();
  const isDistrictOwner = ownedDistrictIds.length > 0;
  const canCreate = isCityOwner || isDistrictOwner;

  const handleBuy = useCallback((id: number, price: bigint, title: string) => {
    setBuyTarget({ id, price, title });
    setView('buy');
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 18, margin: 0 }}>Events in {city.name}</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '2px 0 0' }}>Concerts, expos, markets, meetups. Tickets are NFTs on Arc.</p>
        </div>
        {isConnected && canCreate && view === 'list' && (
          <button onClick={() => setView('create')} style={accentBtn}><Plus size={14} style={{ marginRight: 4 }} />Create Event</button>
        )}
        {view !== 'list' && (
          <button onClick={() => { setView('list'); setBuyTarget(null); }} style={ghostBtn}>← Back</button>
        )}
      </div>

      {view === 'create' && <CreateEventForm city={city} ownedDistrictIds={ownedDistrictIds} onBack={() => setView('list')} />}
      {view === 'buy' && buyTarget && (
        <BuyTicketForm eventId={buyTarget.id} ticketPrice={buyTarget.price} eventTitle={buyTarget.title} onBack={() => { setView('list'); setBuyTarget(null); }} />
      )}

      {view === 'list' && (
        <>
          {eventIds.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: 'center', padding: 32 }}>
              <Ticket size={28} style={{ color: 'var(--muted)', marginBottom: 8 }} />
              <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>No events yet in {city.name}.</p>
              {canCreate && <p style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0 0' }}>Own the city or a district? Create the first event.</p>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {eventIds.map(id => <EventCard key={id} eventId={id} cityId={city.id} onBuy={handleBuy} />)}
            </div>
          )}
          {isConnected && !canCreate && eventIds.length === 0 && (
            <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 12 }}>
              Own the city or a district to create events.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</label>{children}</div>;
}

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px',
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
  padding: 24, background: '#4ade8010', border: '1px solid #4ade8044', borderRadius: 12, textAlign: 'center',
};
