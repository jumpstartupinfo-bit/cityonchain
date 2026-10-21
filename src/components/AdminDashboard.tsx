import React, { useState } from 'react';
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { type Abi } from 'viem';
import { toast } from 'sonner';
import {
  ADMIN_ADDRESS,
  FEE_CONFIG,
  TREASURY,
  CITY_REGISTRY,
  DISTRICT_REGISTRY,

  tierLabel,
  CITY_PRICE_BY_DISPLAY_TIER,
  computeDistrictPrice,
  TIER_COLORS,
  FEE_TYPES,
  REVENUE_SOURCE_LABELS,
} from '../contracts';
import { useCities } from '../lib/useCities';

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(usdc: bigint | undefined): string {
  if (usdc === undefined) return '–';
  return '$' + (Number(usdc) / 1e6).toFixed(2);
}

function bpsToPercent(bps: bigint | undefined): string {
  if (bps === undefined) return '–';
  return (Number(bps) / 100).toFixed(2) + '%';
}

function timeLeft(ts: bigint | undefined): string {
  if (!ts) return '';
  const secs = Number(ts) - Math.floor(Date.now() / 1000);
  if (secs <= 0) return 'Ready to execute';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${m}m remaining`;
}

const CARD: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: 24,
};

const LABEL: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--muted)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 6,
};

// ─── sub-components ─────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{ ...CARD, flex: 1, minWidth: 160 }}>
      <div style={LABEL}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent ?? 'var(--ink)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', margin: '0 0 16px' }}>
      {children}
    </h2>
  );
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      background: color + '22',
      color,
      border: `1px solid ${color}55`,
      borderRadius: 6,
      padding: '2px 10px',
      fontSize: 12,
      fontWeight: 600,
    }}>
      {children}
    </span>
  );
}

// ─── Revenue overview panel ──────────────────────────────────────────────────

function RevenuePanel() {
  const treasuryIsDeployed = true;

  const { data: balance } = useReadContract({
    ...TREASURY,
    functionName: 'getBalance',
    query: { enabled: treasuryIsDeployed },
  });

  const { data: totalRevenue } = useReadContract({
    ...TREASURY,
    functionName: 'totalRevenue',
    query: { enabled: treasuryIsDeployed },
  });

  // Read each revenue source: 0=Primary,1=Activity,2=Marketplace,3=Lease,4=Ad
  const sourceContracts = [0, 1, 2, 3, 4].map((src) => ({
    ...TREASURY,
    abi: TREASURY.abi as Abi,
    functionName: 'revenueBySource' as const,
    args: [src] as const,
  }));
  const { data: sourceData } = useReadContracts({ contracts: sourceContracts, query: { enabled: treasuryIsDeployed } });

  if (!treasuryIsDeployed) {
    return (
      <div style={CARD}>
        <SectionTitle>Platform Revenue</SectionTitle>
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>
          Treasury contract not yet deployed. Revenue tracking will be live after the next deploy window.
        </div>
      </div>
    );
  }

  const sources = [0, 1, 2, 3, 4].map((i) => ({
    label: REVENUE_SOURCE_LABELS[i],
    amount: (sourceData?.[i]?.result ?? 0n) as bigint,
  }));

  const total = (totalRevenue ?? 0n) as bigint;
  const bal = (balance ?? 0n) as bigint;

  return (
    <div>
      <SectionTitle>Platform Revenue</SectionTitle>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatCard label="Treasury Balance" value={fmt(bal)} accent="var(--accent)" />
        <StatCard label="Total Revenue" value={fmt(total)} />
        {sources.map((s) => (
          <StatCard key={s.label} label={s.label} value={fmt(s.amount)} />
        ))}
      </div>

      {/* Bar chart */}
      <div style={CARD}>
        <div style={LABEL}>Revenue by Source</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {sources.map((s) => {
            const pct = total > 0n ? Number((s.amount * 100n) / total) : 0;
            return (
              <div key={s.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: 'var(--ink)' }}>{s.label}</span>
                  <span style={{ color: 'var(--muted)' }}>{fmt(s.amount)} ({pct}%)</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-2, #1a2540)' }}>
                  <div style={{
                    height: '100%',
                    borderRadius: 4,
                    background: 'var(--accent)',
                    width: `${pct}%`,
                    minWidth: pct > 0 ? 8 : 0,
                    transition: 'width 0.5s',
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Inventory panel ─────────────────────────────────────────────────────────

function InventoryPanel() {
  const { cities } = useCities();
  const tiers = [1, 2, 3, 4, 5, 6];

  // Count cities per display tier (1–6) from loaded data
  const cityCountByTier = tiers.map((tier) => ({
    tier,
    total: cities.filter((c) => c.displayTier === tier).length,
  }));

  // Check city registry ownership for a sample set — we just show static counts
  // since we'd need to iterate all city IDs onchain (expensive); show "total available"
  return (
    <div>
      <SectionTitle>Unsold Inventory</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {cityCountByTier.map(({ tier, total }) => (
          <div key={tier} style={{ ...CARD, borderLeft: `3px solid ${TIER_COLORS[tier]}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Tag color={TIER_COLORS[tier]}>{tierLabel(tier)}</Tag>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--ink)' }}>{total}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>cities in dataset</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
              Mayor: {fmt(CITY_PRICE_BY_DISPLAY_TIER[tier])} · District: {fmt(computeDistrictPrice(CITY_PRICE_BY_DISPLAY_TIER[tier] ?? 0n))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Fee settings panel ──────────────────────────────────────────────────────

function FeePanel() {
  const { address } = useAccount();
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const feeConfigDeployed = true;
  const isAdmin = address?.toLowerCase() === ADMIN_ADDRESS.toLowerCase();

  // Read current fee values
  const feeContracts = FEE_TYPES.map((ft) => ({
    ...FEE_CONFIG,
    abi: FEE_CONFIG.abi as Abi,
    functionName: 'getFee' as const,
    args: [ft.key] as const,
  }));
  const { data: feeData, refetch: refetchFees } = useReadContracts({
    contracts: feeContracts,
    query: { enabled: feeConfigDeployed },
  });

  // Read pending changes
  const pendingContracts = FEE_TYPES.map((ft) => ({
    ...FEE_CONFIG,
    abi: FEE_CONFIG.abi as Abi,
    functionName: 'pendingChanges' as const,
    args: [ft.key] as const,
  }));
  const { data: pendingData, refetch: refetchPending } = useReadContracts({
    contracts: pendingContracts,
    query: { enabled: feeConfigDeployed },
  });

  // Read tier prices
  const tierPriceContracts = [0, 1, 2, 3].map((tier) => ({
    ...FEE_CONFIG,
    abi: FEE_CONFIG.abi as Abi,
    functionName: 'getTierPrice' as const,
    args: [tier] as const,
  }));
  const { data: tierPriceData, refetch: refetchTiers } = useReadContracts({
    contracts: tierPriceContracts,
    query: { enabled: feeConfigDeployed },
  });

  // Propose form state
  const [proposeKey, setProposeKey] = useState('');
  const [proposeValue, setProposeValue] = useState('');
  const [tierProposeKey, setTierProposeKey] = useState('');
  const [tierProposeValue, setTierProposeValue] = useState('');

  React.useEffect(() => {
    if (isSuccess) {
      toast.success('Transaction confirmed');
      void refetchFees();
      void refetchPending();
      void refetchTiers();
    }
  }, [isSuccess, refetchFees, refetchPending, refetchTiers]);

  function proposeFee(key: string, bps: number) {
    writeContract({
      ...FEE_CONFIG,
      functionName: 'proposeFeeChange',
      args: [key, BigInt(bps)],
    });
    toast.info('Proposing fee change…');
  }

  function executeFee(key: string) {
    writeContract({
      ...FEE_CONFIG,
      functionName: 'executeFeeChange',
      args: [key],
    });
    toast.info('Executing fee change…');
  }

  function cancelFee(key: string) {
    writeContract({
      ...FEE_CONFIG,
      functionName: 'cancelFeeChange',
      args: [key],
    });
    toast.info('Cancelling fee change…');
  }

  function proposeTierPrice(key: string, usdcAmt: number) {
    // usdcAmt is in dollars — convert to 6 decimals
    writeContract({
      ...FEE_CONFIG,
      functionName: 'proposeFeeChange',
      args: [key, BigInt(Math.round(usdcAmt * 1_000_000))],
    });
    toast.info('Proposing tier price change…');
  }

  if (!feeConfigDeployed) {
    return (
      <div style={CARD}>
        <SectionTitle>Fee Settings</SectionTitle>
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>
          FeeConfig contract not yet deployed. Fee editing will be available after the next deploy window.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Current fees */}
      <div>
        <SectionTitle>Fee Settings</SectionTitle>
        {!isAdmin && (
          <div style={{ ...CARD, background: '#2a1a0a', borderColor: '#f59e0b44', marginBottom: 16, fontSize: 13, color: '#f59e0b' }}>
            ⚠ You are viewing as a non-admin. Connect with {ADMIN_ADDRESS.slice(0, 8)}… to edit fees.
          </div>
        )}
        <div style={{ ...CARD }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Fee Type', 'Current', 'Hard Cap', 'Pending Change', ''].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--muted)', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEE_TYPES.map((ft, i) => {
                const current = feeData?.[i]?.result as bigint | undefined;
                const pending = pendingData?.[i]?.result as [bigint, bigint, boolean] | undefined;
                const hasPending = pending?.[2] === true;
                const effectiveAt = pending?.[1];
                return (
                  <tr key={ft.key} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--ink)', fontWeight: 500 }}>{ft.label}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <Tag color="var(--accent)">{bpsToPercent(current)}</Tag>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{(ft.hardCap / 100).toFixed(0)}%</td>
                    <td style={{ padding: '10px 12px' }}>
                      {hasPending ? (
                        <div>
                          <Tag color="#f59e0b">{bpsToPercent(pending?.[0])}</Tag>
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{timeLeft(effectiveAt)}</div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>None</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {isAdmin && hasPending && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <ActionBtn color="var(--accent)" onClick={() => executeFee(ft.key)} disabled={isPending || isConfirming}>Execute</ActionBtn>
                          <ActionBtn color="var(--error, #ef4444)" onClick={() => cancelFee(ft.key)} disabled={isPending || isConfirming}>Cancel</ActionBtn>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Propose fee change */}
      {isAdmin && (
        <div style={CARD}>
          <div style={LABEL}>Propose Fee Change (48h timelock)</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            <select
              value={proposeKey}
              onChange={(e) => setProposeKey(e.target.value)}
              style={inputStyle}
            >
              <option value="">Select fee type…</option>
              {FEE_TYPES.map((ft) => (
                <option key={ft.key} value={ft.key}>{ft.label}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="New value in bps (e.g. 500 = 5%)"
              value={proposeValue}
              onChange={(e) => setProposeValue(e.target.value)}
              style={{ ...inputStyle, width: 240 }}
            />
            <ActionBtn
              color="var(--accent)"
              onClick={() => {
                if (proposeKey && proposeValue) {
                  proposeFee(proposeKey, parseInt(proposeValue));
                  setProposeValue('');
                }
              }}
              disabled={!proposeKey || !proposeValue || isPending || isConfirming}
            >
              Propose
            </ActionBtn>
          </div>
        </div>
      )}

      {/* Tier prices */}
      <div>
        <SectionTitle>Tier Prices</SectionTitle>
        <div style={CARD}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Tier', 'Mayor Price', 'District Price', 'Pending Change', ''].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--muted)', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[3, 2, 1, 0].map((tier) => {
                const onChainPrice = tierPriceData?.[tier]?.result as bigint | undefined;
                // Read pending for tier price keys
                return (
                  <tr key={tier} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <Tag color={TIER_COLORS[tier]}>{tierLabel(tier)}</Tag>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--ink)' }}>
                      {fmt(onChainPrice ?? CITY_PRICE_BY_DISPLAY_TIER[tier])}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>
                      {fmt(computeDistrictPrice(onChainPrice ?? CITY_PRICE_BY_DISPLAY_TIER[tier] ?? 0n))}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 12 }}>—</td>
                    <td style={{ padding: '10px 12px' }} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Propose tier price change */}
      {isAdmin && (
        <div style={CARD}>
          <div style={LABEL}>Propose Tier Price Change (48h timelock)</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            <select
              value={tierProposeKey}
              onChange={(e) => setTierProposeKey(e.target.value)}
              style={inputStyle}
            >
              <option value="">Select tier…</option>
              {[3, 2, 1, 0].map((tier) => (
                <option key={tier} value={`tierPrice_${tier}`}>{tierLabel(tier)} (Mayor)</option>
              ))}
              {[3, 2, 1, 0].map((tier) => (
                <option key={`d${tier}`} value={`districtPrice_${tier}`}>{tierLabel(tier)} (District)</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="New price in USD (e.g. 200)"
              value={tierProposeValue}
              onChange={(e) => setTierProposeValue(e.target.value)}
              style={{ ...inputStyle, width: 220 }}
            />
            <ActionBtn
              color="var(--accent)"
              onClick={() => {
                if (tierProposeKey && tierProposeValue) {
                  proposeTierPrice(tierProposeKey, parseFloat(tierProposeValue));
                  setTierProposeValue('');
                }
              }}
              disabled={!tierProposeKey || !tierProposeValue || isPending || isConfirming}
            >
              Propose
            </ActionBtn>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Top cities panel ────────────────────────────────────────────────────────

function TopCitiesPanel() {
  // Show top cities by claimed count per tier — static from city data
  // In a fully live system this would read RevenueSplitter events onchain
  const { cities } = useCities();
  const sorted = [...cities].sort((a, b) => b.population - a.population).slice(0, 20);

  return (
    <div>
      <SectionTitle>Top Cities by Population</SectionTitle>
      <div style={CARD}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['#', 'City', 'Country', 'Tier', 'Mayor Price', 'Districts'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--muted)', fontWeight: 600, fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((city, i) => (
              <tr key={city.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{i + 1}</td>
                <td style={{ padding: '8px 12px', color: 'var(--ink)', fontWeight: 600 }}>{city.name}</td>
                <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{city.country}</td>
                <td style={{ padding: '8px 12px' }}>
                  <Tag color={TIER_COLORS[city.displayTier]}>{tierLabel(city.displayTier)}</Tag>
                </td>
                <td style={{ padding: '8px 12px', color: 'var(--ink)' }}>{fmt(CITY_PRICE_BY_DISPLAY_TIER[city.displayTier])}</td>
                <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>20</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Treasury info ────────────────────────────────────────────────────────────

function TreasuryPanel() {
  const { address } = useAccount();
  const isAdmin = address?.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const [withdrawTo, setWithdrawTo] = useState('');
  const [withdrawAmt, setWithdrawAmt] = useState('');

  const treasuryDeployed = true;

  const { data: balance, refetch } = useReadContract({
    ...TREASURY,
    functionName: 'getBalance',
    query: { enabled: treasuryDeployed },
  });

  React.useEffect(() => {
    if (isSuccess) {
      toast.success('Withdrawal sent');
      void refetch();
    }
  }, [isSuccess, refetch]);

  function handleWithdraw() {
    if (!withdrawTo || !withdrawAmt) return;
    writeContract({
      ...TREASURY,
      functionName: 'withdraw',
      args: [withdrawTo as `0x${string}`, BigInt(Math.round(parseFloat(withdrawAmt) * 1_000_000))],
    });
    toast.info('Submitting withdrawal…');
  }

  return (
    <div>
      <SectionTitle>Treasury</SectionTitle>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatCard
          label="Treasury Contract"
          value={treasuryDeployed ? `${TREASURY.address.slice(0, 8)}…${TREASURY.address.slice(-6)}` : 'Not deployed'}
          accent={treasuryDeployed ? 'var(--accent)' : 'var(--muted)'}
        />
        <StatCard label="Balance" value={fmt((balance ?? 0n) as bigint)} accent="var(--accent)" />
        <StatCard label="Admin Address" value={`${ADMIN_ADDRESS.slice(0, 8)}…${ADMIN_ADDRESS.slice(-6)}`} />
      </div>

      {isAdmin && treasuryDeployed && (
        <div style={CARD}>
          <div style={LABEL}>Withdraw USDC</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            <input
              placeholder="Recipient address (0x…)"
              value={withdrawTo}
              onChange={(e) => setWithdrawTo(e.target.value)}
              style={{ ...inputStyle, flex: 2, minWidth: 280 }}
            />
            <input
              type="number"
              placeholder="Amount in USD"
              value={withdrawAmt}
              onChange={(e) => setWithdrawAmt(e.target.value)}
              style={{ ...inputStyle, width: 160 }}
            />
            <ActionBtn
              color="var(--accent)"
              onClick={handleWithdraw}
              disabled={!withdrawTo || !withdrawAmt || isPending || isConfirming}
            >
              {isPending || isConfirming ? 'Sending…' : 'Withdraw'}
            </ActionBtn>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Contract health panel ───────────────────────────────────────────────────

function ContractHealthPanel() {
  const contracts = [
    { name: 'CityRegistry',      address: CITY_REGISTRY.address },
    { name: 'DistrictRegistry',  address: DISTRICT_REGISTRY.address },
    { name: 'FeeConfig',         address: FEE_CONFIG.address },
    { name: 'Treasury',          address: TREASURY.address },
  ];

  return (
    <div>
      <SectionTitle>Contract Addresses</SectionTitle>
      <div style={CARD}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {contracts.map((c) => {
            const deployed = true;
            return (
              <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 14 }}>{c.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {deployed ? (
                    <a
                      href={`https://explorer.arc.io/address/${c.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'monospace' }}
                    >
                      {c.address.slice(0, 10)}…{c.address.slice(-8)}
                    </a>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Pending next deploy window</span>
                  )}
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: deployed ? 'var(--success, #22c55e)' : '#f59e0b',
                    display: 'inline-block',
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Shared styles ───────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: 'var(--surface-2, #1a2540)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '8px 12px',
  color: 'var(--ink)',
  fontSize: 14,
  fontFamily: "'DM Sans', sans-serif",
  outline: 'none',
};

function ActionBtn({ children, color, onClick, disabled }: { children: React.ReactNode; color: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: color,
        color: '#080f1c',
        border: 'none',
        borderRadius: 8,
        padding: '8px 16px',
        fontWeight: 700,
        fontSize: 13,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: "'DM Sans', sans-serif",
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

type AdminTab = 'revenue' | 'fees' | 'inventory' | 'cities' | 'treasury' | 'contracts';

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'revenue',   label: 'Revenue' },
  { id: 'fees',      label: 'Fee Settings' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'cities',    label: 'Top Cities' },
  { id: 'treasury',  label: 'Treasury' },
  { id: 'contracts', label: 'Contracts' },
];

export function AdminDashboard() {
  const { address } = useAccount();
  const [tab, setTab] = useState<AdminTab>('revenue');

  const isAdmin = address?.toLowerCase() === ADMIN_ADDRESS.toLowerCase();

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 80px' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>
          Admin Dashboard
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: '6px 0 0' }}>
          Platform revenue, fee configuration, and inventory management.
          {!isAdmin && (
            <span style={{ color: '#f59e0b', marginLeft: 8 }}>
              Read-only — connect admin wallet to make changes.
            </span>
          )}
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: 'none',
              background: tab === t.id ? 'var(--accent-dim)' : 'var(--surface)',
              color: tab === t.id ? 'var(--accent)' : 'var(--muted)',
              fontWeight: tab === t.id ? 700 : 500,
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              transition: 'all 0.12s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'revenue'   && <RevenuePanel />}
      {tab === 'fees'      && <FeePanel />}
      {tab === 'inventory' && <InventoryPanel />}
      {tab === 'cities'    && <TopCitiesPanel />}
      {tab === 'treasury'  && <TreasuryPanel />}
      {tab === 'contracts' && <ContractHealthPanel />}

      {/* Disclaimer */}
      <div style={{
        marginTop: 48,
        padding: 16,
        borderRadius: 12,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        fontSize: 12,
        color: 'var(--muted)',
        lineHeight: 1.5,
      }}>
        CityOnChain is not affiliated with any real city, municipality, or government.
        Ownership of a city or district NFT confers no rights over any real-world property or jurisdiction.
        No guaranteed returns. Virtual assets only. Revenue comes from real platform activity (ads, rent, fees), not from payouts to earlier buyers.
      </div>
    </div>
  );
}
