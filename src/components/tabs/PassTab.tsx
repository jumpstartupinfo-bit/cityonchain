import React, { useState, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useReadContracts } from 'wagmi';
import { type Abi } from 'viem';
import { toast } from 'sonner';
import { parseUsdc, formatUsdc } from '@/onchain-money';
import { CITY_PASS, CITY_REGISTRY, DISTRICT_REGISTRY } from '@/contracts';

interface Props {
  cityId: number;
  cityOwner?: string;
  ownedDistrictIds: bigint[];
}

const PASS_KIND_LABELS = ['Permanent', 'Temporary'];
const PASS_KIND_COLORS = ['var(--green)', 'var(--gold)'];

function fmtExpiry(expiry: bigint): string {
  if (expiry === BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')) return 'Never expires';
  if (expiry === 0n) return 'Not held';
  const d = new Date(Number(expiry) * 1000);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

interface PassType {
  passTypeId: bigint;
  cityId: bigint;
  districtId: bigint;
  passKind: number;
  priceUsdc: bigint;
  maxSupply: bigint;
  totalMinted: bigint;
  durationDays: bigint;
  active: boolean;
  creator: string;
}

function CreatePassForm({ cityId, districtId, onDone }: { cityId: number; districtId: bigint | null; onDone: () => void }) {
  const [passKind, setPassKind] = useState<0 | 1>(0);
  const [price, setPrice] = useState('');
  const [maxSupply, setMaxSupply] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [step, setStep] = useState<'idle' | 'tx' | 'done'>('idle');
  const [hash, setHash] = useState<`0x${string}` | undefined>();

  const { writeContractAsync } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash });

  React.useEffect(() => {
    if (!isSuccess || step !== 'tx') return;
    toast.success('Pass type created!');
    onDone();
  }, [isSuccess, step, onDone]);

  const handleCreate = useCallback(async () => {
    const priceParsed = parseUsdc(price);
    const supply = BigInt(maxSupply || '0');
    const duration = passKind === 1 ? BigInt(durationDays || '0') : 0n;
    if (priceParsed <= 0n || supply <= 0n || (passKind === 1 && duration <= 0n)) {
      toast.error('Fill in all fields'); return;
    }
    try {
      setStep('tx');
      const tx = await writeContractAsync({
        address: CITY_PASS.address,
        abi: CITY_PASS.abi as Abi,
        functionName: 'createPassType',
        args: [BigInt(cityId), districtId ?? 0n, passKind, priceParsed, supply, duration],
      });
      setHash(tx);
    } catch (e: unknown) {
      setStep('idle');
      toast.error(e instanceof Error ? e.message : 'Transaction failed');
    }
  }, [cityId, districtId, passKind, price, maxSupply, durationDays, writeContractAsync]);

  const inp = 'w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--surface-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--green)]';

  return (
    <div className="border border-[var(--border)] rounded-xl p-4 bg-[var(--surface)] space-y-3">
      <p className="font-semibold text-sm text-[var(--text)]">
        Create Pass — {districtId ? `District #${districtId}` : `City #${cityId}`}
      </p>
      <div className="flex gap-2">
        {[0, 1].map(k => (
          <button key={k} onClick={() => setPassKind(k as 0 | 1)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${passKind === k ? 'bg-[var(--green)] text-white border-[var(--green)]' : 'bg-transparent text-[var(--text-muted)] border-[var(--border)]'}`}>
            {PASS_KIND_LABELS[k]}
          </button>
        ))}
      </div>
      <input className={inp} placeholder="Price (USDC)" value={price} onChange={e => setPrice(e.target.value)} type="number" min="0" step="0.01" />
      <input className={inp} placeholder="Max supply" value={maxSupply} onChange={e => setMaxSupply(e.target.value)} type="number" min="1" />
      {passKind === 1 && (
        <input className={inp} placeholder="Duration (days)" value={durationDays} onChange={e => setDurationDays(e.target.value)} type="number" min="1" />
      )}
      <button disabled={step === 'tx'} onClick={() => { void handleCreate(); }}
        className="w-full py-2 rounded-xl text-sm font-semibold bg-[var(--green)] text-white disabled:opacity-50">
        {step === 'tx' ? 'Creating…' : 'Create Pass Type'}
      </button>
    </div>
  );
}

function PassCard({ pt, walletAddress }: { pt: PassType; walletAddress?: string }) {
  const [qty, setQty] = useState('1');
  const [step, setStep] = useState<'idle' | 'approving' | 'minting' | 'done'>('idle');
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const { writeContractAsync } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash });

  const total = pt.priceUsdc * BigInt(Number(qty) || 1);

  // Check holder expiry
  const { data: expiryRaw } = useReadContract({
    address: CITY_PASS.address, abi: CITY_PASS.abi as Abi,
    functionName: 'passExpiry', args: [walletAddress as `0x${string}`, pt.passTypeId],
    query: { enabled: !!walletAddress },
  });
  const expiry = typeof expiryRaw === 'bigint' ? expiryRaw : 0n;

  const { data: isValid } = useReadContract({
    address: CITY_PASS.address, abi: CITY_PASS.abi as Abi,
    functionName: 'hasValidPass', args: [walletAddress as `0x${string}`, pt.passTypeId],
    query: { enabled: !!walletAddress },
  });

  React.useEffect(() => {
    if (isSuccess && (step === 'approving' || step === 'minting')) {
      if (step === 'approving') { void handleMint(); }
      else { setStep('done'); toast.success('Pass minted!'); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  const handleApprove = useCallback(async () => {
    try {
      setStep('approving');
      const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
      const tx = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: [{ name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }],
        functionName: 'approve',
        args: [CITY_PASS.address, total],
      });
      setHash(tx);
    } catch (e: unknown) {
      setStep('idle');
      toast.error(e instanceof Error ? e.message : 'Approval failed');
    }
  }, [writeContractAsync, total]);

  const handleMint = useCallback(async () => {
    try {
      setStep('minting');
      const tx = await writeContractAsync({
        address: CITY_PASS.address, abi: CITY_PASS.abi as Abi,
        functionName: 'mintPass',
        args: [pt.passTypeId, BigInt(Number(qty) || 1)],
      });
      setHash(tx);
    } catch (e: unknown) {
      setStep('idle');
      toast.error(e instanceof Error ? e.message : 'Mint failed');
    }
  }, [writeContractAsync, pt.passTypeId, qty]);

  const available = Number(pt.maxSupply - pt.totalMinted);
  const fillPct = Number(pt.totalMinted) / Number(pt.maxSupply) * 100;

  return (
    <div className="border border-[var(--border)] rounded-xl p-4 bg-[var(--surface)] space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background: `${PASS_KIND_COLORS[pt.passKind]}22`, color: PASS_KIND_COLORS[pt.passKind] }}>
            {PASS_KIND_LABELS[pt.passKind]}
          </span>
          {pt.districtId > 0n && (
            <span className="text-xs text-[var(--text-muted)]">District #{pt.districtId.toString()}</span>
          )}
        </div>
        <span className="text-lg font-bold text-[var(--green)]">${formatUsdc(pt.priceUsdc)}</span>
      </div>

      {pt.passKind === 1 && (
        <p className="text-xs text-[var(--text-muted)]">Duration: {pt.durationDays.toString()} days from first mint</p>
      )}

      {/* Supply bar */}
      <div>
        <div className="flex justify-between text-xs text-[var(--text-muted)] mb-1">
          <span>{pt.totalMinted.toString()} minted</span>
          <span>{available} remaining</span>
        </div>
        <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
          <div className="h-full bg-[var(--green)] rounded-full transition-all" style={{ width: `${fillPct}%` }} />
        </div>
      </div>

      {/* Holder status */}
      {walletAddress && expiry > 0n && (
        <div className={`text-xs font-medium px-2 py-1 rounded-lg ${isValid ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
          {isValid ? `Valid pass · Expires: ${fmtExpiry(expiry)}` : `Pass expired · ${fmtExpiry(expiry)}`}
        </div>
      )}

      {/* Buy flow */}
      {walletAddress && pt.active && available > 0 && (
        <div className="flex gap-2">
          <input type="number" min="1" max={available} value={qty}
            onChange={e => setQty(e.target.value)}
            className="w-16 border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-center bg-[var(--surface-strong)]" />
          <button disabled={step !== 'idle'} onClick={() => { void handleApprove(); }}
            className="flex-1 py-1.5 rounded-xl text-sm font-semibold bg-[var(--green)] text-white disabled:opacity-50">
            {step === 'idle' ? `Buy · $${formatUsdc(total)}` : step === 'approving' ? 'Approving…' : step === 'minting' ? 'Minting…' : 'Done!'}
          </button>
        </div>
      )}
      {!pt.active && <p className="text-xs text-[var(--text-muted)] text-center">This pass type is currently inactive</p>}
    </div>
  );
}

export function PassTab({ cityId, cityOwner, ownedDistrictIds }: Props) {
  const { address } = useAccount();
  const [showCreate, setShowCreate] = useState<bigint | null | false>(false);
  const [refresh, setRefresh] = useState(0);

  const isMayor = address && cityOwner && address.toLowerCase() === cityOwner.toLowerCase();
  const isDistrictOwner = ownedDistrictIds.length > 0;

  const [passTypeIds, setPassTypeIds] = useState<bigint[]>([]);

  React.useEffect(() => {
    async function computeIds() {
      const { keccak256, encodeAbiParameters, parseAbiParameters } = await import('viem');
      const ids: bigint[] = [];
      // City passes
      for (const k of [0, 1]) {
        const encoded = encodeAbiParameters(
          parseAbiParameters('uint256, uint256, uint8'),
          [BigInt(cityId), 0n, k]
        );
        ids.push(BigInt(keccak256(encoded)));
      }
      // District passes
      for (const dId of ownedDistrictIds) {
        for (const k of [0, 1]) {
          const resolvedCityId = dId / 100n;
          const encoded = encodeAbiParameters(
            parseAbiParameters('uint256, uint256, uint8'),
            [resolvedCityId, dId, k]
          );
          ids.push(BigInt(keccak256(encoded)));
        }
      }
      setPassTypeIds(ids);
    }
    void computeIds();
  }, [cityId, ownedDistrictIds, refresh]);

  const { data: passTypeResults } = useReadContracts({
    contracts: passTypeIds.map(id => ({
      address: CITY_PASS.address as `0x${string}`,
      abi: CITY_PASS.abi as Abi,
      functionName: 'passTypes' as const,
      args: [id],
    })),
    query: { enabled: passTypeIds.length > 0 },
  });

  const passTypes: PassType[] = (passTypeResults ?? [])
    .map((r, i) => {
      if (r?.status !== 'success' || !r.result) return null;
      const t = r.result as [bigint, bigint, number, bigint, bigint, bigint, bigint, boolean, string];
      if (t[4] === 0n) return null; // maxSupply=0 means not created
      return {
        passTypeId: passTypeIds[i],
        cityId: t[0],
        districtId: t[1],
        passKind: t[2],
        priceUsdc: t[3],
        maxSupply: t[4],
        totalMinted: t[5],
        durationDays: t[6],
        active: t[7],
        creator: t[8],
      };
    })
    .filter(Boolean) as PassType[];

  const onDone = useCallback(() => {
    setShowCreate(false);
    setRefresh(r => r + 1);
  }, []);

  // Check CityRegistry + DistrictRegistry wiring
  const { data: crAddr } = useReadContract({ ...CITY_PASS, abi: CITY_PASS.abi as Abi, functionName: 'cityRegistry', args: [] });
  const { data: drAddr } = useReadContract({ ...CITY_PASS, abi: CITY_PASS.abi as Abi, functionName: 'districtRegistry', args: [] });
  const isWired = crAddr && (crAddr as string).toLowerCase() === CITY_REGISTRY.address.toLowerCase()
    && drAddr && (drAddr as string).toLowerCase() === DISTRICT_REGISTRY.address.toLowerCase();

  if (!isWired) {
    return (
      <div className="p-6 text-center text-[var(--text-muted)] text-sm">
        CityPass contract not yet wired. Complete Setup page first.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-[var(--text)]">City Passes</h3>
          <p className="text-xs text-[var(--text-muted)]">Residency passes for this city and its districts</p>
        </div>
        {(isMayor || isDistrictOwner) && showCreate === false && (
          <button onClick={() => setShowCreate(null)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--green)] text-white">
            + Create Pass
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreate !== false && (
        <div className="space-y-2">
          {isMayor && (
            <CreatePassForm cityId={cityId} districtId={null} onDone={onDone} />
          )}
          {ownedDistrictIds.map(dId => (
            <CreatePassForm key={dId.toString()} cityId={cityId} districtId={dId} onDone={onDone} />
          ))}
          <button onClick={() => setShowCreate(false)} className="text-xs text-[var(--text-muted)] underline">Cancel</button>
        </div>
      )}

      {/* Pass type cards */}
      {passTypes.length === 0 && showCreate === false && (
        <div className="text-center py-12 text-[var(--text-muted)] text-sm">
          {isMayor || isDistrictOwner
            ? 'No passes created yet. Click "+ Create Pass" to get started.'
            : 'No passes available for this city yet.'}
        </div>
      )}
      <div className="space-y-3">
        {passTypes.map(pt => (
          <PassCard key={pt.passTypeId.toString()} pt={pt} walletAddress={address} />
        ))}
      </div>
    </div>
  );
}
