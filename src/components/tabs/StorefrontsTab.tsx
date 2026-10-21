import { useState, useCallback } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { type Abi } from 'viem';
import { toast } from 'sonner';
import { Store, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import type { City as CityDef } from '../../lib/merkle';
import { STOREFRONTS, USDC_ADDRESS } from '../../contracts';

const ERC20_APPROVE_ABI = [
  { name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
] as const;

const sf = STOREFRONTS;
const SFabi = sf.abi as Abi;

type View = 'list' | 'create-unit' | 'rent';

interface Props {
  city: CityDef;
  ownedDistrictIds?: bigint[]; // district tokenIds owned by connected wallet in this city
  cityOwner?: string;
}


function useUnits(_cityId: number) {
  // Read nextUnitId then fan-out reads for unit 1..nextUnitId-1
  const { data: nextIdRaw } = useReadContract({ ...sf, abi: SFabi, functionName: 'nextUnitId' });
  const nextId = typeof nextIdRaw === 'bigint' ? Number(nextIdRaw) : 1;
  const ids = Array.from({ length: Math.max(0, nextId - 1) }, (_, i) => i + 1);

  return { ids, nextId };
}

// Single unit read hook
function useUnit(unitId: number) {
  return useReadContract({ ...sf, abi: SFabi, functionName: 'units', args: [BigInt(unitId)] });
}

function UnitCard({ unitId, cityId: _cityId, onRent }: { unitId: number; cityId: number; onRent: (id: number, rent: bigint) => void }) {
  const { data, isLoading } = useUnit(unitId);
  const [open, setOpen] = useState(false);

  if (isLoading) return <div style={cardStyle}><span style={{ color: 'var(--muted)', fontSize: 13 }}>Loading unit {unitId}…</span></div>;
  if (!data) return null;

  const [districtTokenId, cityIdRaw, monthlyRent, active, unitOwner] = data as [bigint, bigint, bigint, boolean, string];
  if (Number(cityIdRaw) !== _cityId || !active) return null;

  const rentUsd = Number(monthlyRent) / 1e6;

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 14 }}>Unit #{unitId}</span>
          <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 8 }}>District {districtTokenId.toString()}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--accent)', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', fontSize: 14 }}>${rentUsd.toFixed(2)}/mo</span>
          <button onClick={() => onRent(unitId, monthlyRent)} style={accentBtn}>Rent</button>
          <button onClick={() => setOpen(o => !o)} style={{ ...ghostBtn, padding: '4px 6px' }}>
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>
      {open && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', color: 'var(--muted)', fontSize: 12 }}>
          Owner: <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{unitOwner.slice(0, 8)}…{unitOwner.slice(-6)}</span>
        </div>
      )}
    </div>
  );
}

function CreateUnitForm({ cityId, ownedDistrictIds, onBack }: { cityId: number; ownedDistrictIds: bigint[]; onBack: () => void }) {
  const [districtId, setDistrictId] = useState(ownedDistrictIds[0]?.toString() ?? '');
  const [monthlyRent, setMonthlyRent] = useState('10');

  const { writeContract, data: txHash } = useWriteContract();
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const handleCreate = useCallback(() => {
    const rentRaw = BigInt(Math.round(Number(monthlyRent) * 1e6));
    writeContract({ ...sf, abi: SFabi, functionName: 'createUnit', args: [BigInt(districtId), BigInt(cityId), rentRaw] });
    toast.info('Creating storefront unit…');
  }, [writeContract, districtId, cityId, monthlyRent]);

  if (isSuccess) return (
    <div style={successBox}>
      <Store size={20} style={{ color: '#4ade80' }} />
      <p style={{ color: '#4ade80', fontWeight: 600, margin: 0 }}>Unit created! Tenants can now rent it.</p>
      <button onClick={onBack} style={ghostBtn}>Back to units</button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label="District Token ID">
        {ownedDistrictIds.length > 0 ? (
          <select value={districtId} onChange={e => setDistrictId(e.target.value)} style={inputStyle}>
            {ownedDistrictIds.map(id => <option key={id.toString()} value={id.toString()}>District #{id.toString()}</option>)}
          </select>
        ) : (
          <input value={districtId} onChange={e => setDistrictId(e.target.value)} style={inputStyle} placeholder="e.g. 16401" />
        )}
      </Field>
      <Field label="Monthly Rent (USDC)">
        <input type="number" step="0.01" value={monthlyRent} onChange={e => setMonthlyRent(e.target.value)} style={inputStyle} />
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onBack} style={ghostBtn}>Cancel</button>
        <button onClick={handleCreate} disabled={isLoading || !districtId || !monthlyRent} style={accentBtn}>
          {isLoading ? 'Creating…' : 'Create Unit'}
        </button>
      </div>
    </div>
  );
}

function RentForm({ unitId, monthlyRent, cityId: _cityId, onBack }: { unitId: number; monthlyRent: bigint; cityId: number; onBack: () => void }) {
  const [bizName, setBizName] = useState('');
  const [category, setCategory] = useState('');
  const [desc, setDesc] = useState('');
  const [logo, setLogo] = useState('');
  const [link, setLink] = useState('');

  const { writeContract: approveWrite, data: approveTx } = useWriteContract();
  const { writeContract: rentWrite, data: rentTx } = useWriteContract();
  const { isLoading: approving, isSuccess: approveOk } = useWaitForTransactionReceipt({ hash: approveTx });
  const { isLoading: renting, isSuccess: rentOk } = useWaitForTransactionReceipt({ hash: rentTx });

  const rentUsd = (Number(monthlyRent) / 1e6).toFixed(2);

  const doApprove = useCallback(() => {
    approveWrite({ address: USDC_ADDRESS, abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [sf.address as `0x${string}`, monthlyRent] });
    toast.info('Approving USDC…');
  }, [approveWrite, monthlyRent]);

  const doRent = useCallback(() => {
    rentWrite({ ...sf, abi: SFabi, functionName: 'rentUnit', args: [BigInt(unitId), bizName, category, desc, logo, link] });
    toast.info('Renting unit…');
  }, [rentWrite, unitId, bizName, category, desc, logo, link]);

  if (rentOk) return (
    <div style={successBox}>
      <Store size={20} style={{ color: '#4ade80' }} />
      <p style={{ color: '#4ade80', fontWeight: 600, margin: 0 }}>Storefront rented! You can now add products.</p>
      <button onClick={onBack} style={ghostBtn}>Back to units</button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
        <span style={{ color: 'var(--muted)' }}>Renting Unit #{unitId} — </span>
        <span style={{ color: 'var(--accent)', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>${rentUsd}/mo</span>
      </div>
      <Field label="Business Name"><input value={bizName} onChange={e => setBizName(e.target.value)} style={inputStyle} placeholder="Acme Corp" /></Field>
      <Field label="Category"><input value={category} onChange={e => setCategory(e.target.value)} style={inputStyle} placeholder="Retail, Food, Services…" /></Field>
      <Field label="Description"><input value={desc} onChange={e => setDesc(e.target.value)} style={inputStyle} placeholder="Short description" /></Field>
      <Field label="Logo (IPFS CID, optional)"><input value={logo} onChange={e => setLogo(e.target.value)} style={inputStyle} placeholder="Qm…" /></Field>
      <Field label="Website (optional)"><input value={link} onChange={e => setLink(e.target.value)} style={inputStyle} placeholder="https://…" /></Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onBack} style={ghostBtn}>Cancel</button>
        <button onClick={doApprove} disabled={approving || approveOk} style={approveOk ? { ...accentBtn, opacity: 0.5 } : accentBtn}>
          {approving ? 'Approving…' : approveOk ? '✓ Approved' : `1. Approve $${rentUsd}`}
        </button>
        <button onClick={doRent} disabled={renting || !approveOk || !bizName} style={approveOk ? accentBtn : { ...accentBtn, opacity: 0.4, cursor: 'not-allowed' }}>
          {renting ? 'Renting…' : '2. Rent Unit'}
        </button>
      </div>
    </div>
  );
}

export function StorefrontsTab({ city, ownedDistrictIds = [], cityOwner }: Props) {
  const { address, isConnected } = useAccount();
  const [view, setView] = useState<View>('list');
  const [rentTarget, setRentTarget] = useState<{ id: number; rent: bigint } | null>(null);

  const { ids: unitIds } = useUnits(city.id);

  const isDistrictOwner = ownedDistrictIds.length > 0;
  const isCityOwner = !!address && !!cityOwner && address.toLowerCase() === cityOwner.toLowerCase();
  const canCreateUnit = isDistrictOwner || isCityOwner;

  const handleRent = useCallback((id: number, rent: bigint) => {
    setRentTarget({ id, rent });
    setView('rent');
  }, []);

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 18, margin: 0 }}>Storefronts in {city.name}</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '2px 0 0' }}>
            District owners create units. Tenants pay monthly rent in USDC.
          </p>
        </div>
        {isConnected && canCreateUnit && view === 'list' && (
          <button onClick={() => setView('create-unit')} style={accentBtn}>
            <Plus size={14} style={{ marginRight: 4 }} />Create Unit
          </button>
        )}
        {view !== 'list' && (
          <button onClick={() => { setView('list'); setRentTarget(null); }} style={ghostBtn}>← Back</button>
        )}
      </div>

      {view === 'create-unit' && (
        <CreateUnitForm cityId={city.id} ownedDistrictIds={ownedDistrictIds} onBack={() => setView('list')} />
      )}

      {view === 'rent' && rentTarget && (
        <RentForm unitId={rentTarget.id} monthlyRent={rentTarget.rent} cityId={city.id} onBack={() => { setView('list'); setRentTarget(null); }} />
      )}

      {view === 'list' && (
        <>
          {unitIds.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: 'center', padding: 32 }}>
              <Store size={28} style={{ color: 'var(--muted)', marginBottom: 8 }} />
              <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>No storefront units yet.</p>
              {canCreateUnit && <p style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0 0' }}>You own a district — create the first unit.</p>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {unitIds.map(id => <UnitCard key={id} unitId={id} cityId={city.id} onRent={handleRent} />)}
            </div>
          )}
          {isConnected && !canCreateUnit && (
            <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 12 }}>
              Own a district in {city.name} to create storefront units.
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


