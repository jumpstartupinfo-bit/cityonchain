import React from 'react';
import { useIsMobile } from '../lib/useIsMobile';
import { ArrowLeft, MapPin, Users, Globe, Crown, Building2, ExternalLink, Loader2 } from 'lucide-react';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from 'wagmi';
import { erc20Abi } from 'viem';
import { CITY_REGISTRY, DISTRICT_REGISTRY, CHAIN_ID, USDC_ADDRESS, CITY_PRICE_BY_DISPLAY_TIER, tierLabel, TIER_COLORS } from '../contracts';
import type { City as CityDef } from '../lib/merkle';
import { Amount, usdcDecimalsFor } from '@/onchain-money';
import { buildTxExplorerUrl, requireChain } from '@/onchain-facts';
import { toast } from 'sonner';

interface CityPageProps {
  city: CityDef;
  onBack: () => void;
}

function formatAddr(addr: string) {
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function formatPop(pop: number) {
  if (pop >= 1000) return (pop / 1000).toFixed(1) + 'M';
  return pop.toLocaleString() + 'K';
}

export function CityPage({ city, onBack }: CityPageProps) {
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const decimals = usdcDecimalsFor(CHAIN_ID);

  // ownerOf reverts if not minted — treat error as "not minted"
  const { data: ownerData, refetch: refetchMinted } = useReadContract({
    address: CITY_REGISTRY.address,
    abi: CITY_REGISTRY.abi,
    functionName: 'ownerOf',
    args: [BigInt(city.id)],
    chainId: CHAIN_ID,
  });
  const minted = !!ownerData && ownerData !== '0x0000000000000000000000000000000000000000';
  const owner = ownerData as string | undefined;

  // ERC-4907 user (lessee)
  const { data: userOfData } = useReadContract({
    address: CITY_REGISTRY.address,
    abi: CITY_REGISTRY.abi,
    functionName: 'userOf',
    args: [BigInt(city.id)],
    chainId: CHAIN_ID,
    query: { enabled: minted },
  });
  const currentUser = userOfData as string | undefined;

  // USDC allowance
  const mintPrice = CITY_PRICE_BY_DISPLAY_TIER[city.displayTier] ?? 0n;
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address!, CITY_REGISTRY.address],
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  });

  // Write: approve USDC
  const { writeContract: approve, data: approveTx, isPending: isApproving } = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveTx });

  // Write: claimCity
  const { writeContract: claim, data: claimTx, isPending: isClaiming } = useWriteContract();
  const { isLoading: isClaimConfirming, isSuccess: isClaimSuccess } = useWaitForTransactionReceipt({ hash: claimTx });

  const isWrongChain = chainId !== CHAIN_ID;
  const isOwner = address && owner && owner.toLowerCase() === address.toLowerCase();
  const hasAllowance = allowance !== undefined && allowance >= mintPrice;

  // District count mock (up to 20 per city)
  const districtCount = Math.min(20, 3 + (city.id % 7) * 3);

  function handleBuy() {
    if (isWrongChain) { switchChain({ chainId: CHAIN_ID }); return; }
    if (!address) { toast.error('Connect your wallet first'); return; }

    if (!hasAllowance) {
      approve({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [CITY_REGISTRY.address, mintPrice],
        chainId: CHAIN_ID,
      });
    } else {
      // Claim with empty proof (will fail unless merkle is set — demo mode)
      claim({
        address: CITY_REGISTRY.address,
        abi: CITY_REGISTRY.abi,
        functionName: 'claimCity',
        args: [BigInt(city.id), city.name, city.country, BigInt(city.population * 1000), city.displayTier, []],
        chainId: CHAIN_ID,
      });
    }
  }

  // After approve success, refetch allowance
  React.useEffect(() => {
    if (isApproveSuccess) { void refetchAllowance(); }
  }, [isApproveSuccess, refetchAllowance]);

  // After claim success, refetch
  React.useEffect(() => {
    if (isClaimSuccess) {
      void refetchMinted();
      toast.success(`${city.name} is now yours!`);
    }
  }, [isClaimSuccess, city.name, refetchMinted]);

  const isBusy = isApproving || isApproveConfirming || isClaiming || isClaimConfirming;
  const isMobile = useIsMobile();

  function btnLabel() {
    if (isWrongChain) return 'Switch to Arc Testnet';
    if (isApproving || isApproveConfirming) return 'Approving USDC…';
    if (isClaiming || isClaimConfirming) return 'Claiming city…';
    if (!hasAllowance) return 'Approve USDC';
    return `Buy Mayor License — $${Amount.fromRaw(mintPrice, decimals).toFixed(0)} USDC`;
  }

  return (
    <div style={{ minHeight: 'calc(100dvh - 60px)', background: 'var(--bg)' }}>
      {/* Back bar */}
      <div
        style={{
          background: 'var(--surface-muted)',
          borderBottom: '1px solid var(--border)',
          padding: '12px 24px',
        }}
      >
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--muted)',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
          }}
        >
          <ArrowLeft size={16} />
          Back to World Map
        </button>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginBottom: 32, flexWrap: 'wrap' }}>
          {/* City badge */}
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              background: `linear-gradient(135deg, ${TIER_COLORS[city.displayTier]}30, ${TIER_COLORS[city.displayTier]}08)`,
              border: `2px solid ${TIER_COLORS[city.displayTier]}60`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Globe size={36} color={TIER_COLORS[city.displayTier]} />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <h1
                className="display"
                style={{
                  color: 'var(--ink)',
                  fontSize: 32,
                  fontWeight: 700,
                  margin: 0,
                  letterSpacing: '-0.03em',
                }}
              >
                {city.name}
              </h1>
              <span
                style={{
                  color: TIER_COLORS[city.displayTier],
                  background: `${TIER_COLORS[city.displayTier]}18`,
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 8,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase' as const,
                }}
              >
                {tierLabel(city.displayTier)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <Stat icon={<MapPin size={14} />} label={city.country} />
              <Stat icon={<Globe size={14} />} label={city.country} />
              <Stat icon={<Users size={14} />} label={`Pop. ${formatPop(city.population)}`} />
            </div>
          </div>
        </div>

        {/* Two columns on desktop, single column on mobile */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1.4fr) minmax(0,1fr)',
            gap: 20,
          }}
        >
          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Mayor license card */}
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: 24,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                <Crown size={18} color="var(--accent)" />
                <span
                  className="display"
                  style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 16 }}
                >
                  Mayor License
                </span>
              </div>

              {minted ? (
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ color: 'var(--subtle)', fontSize: 12, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Current Mayor</div>
                    <div
                      className="mono"
                      style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 600 }}
                    >
                      {owner ? formatAddr(owner) : '…'}
                    </div>
                    {isOwner && (
                      <span
                        style={{
                          marginTop: 4,
                          display: 'inline-block',
                          background: 'rgba(246,195,71,0.15)',
                          color: 'var(--accent)',
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontWeight: 600,
                        }}
                      >
                        You
                      </span>
                    )}
                  </div>
                  {currentUser && currentUser !== '0x0000000000000000000000000000000000000000' && (
                    <div>
                      <div style={{ color: 'var(--subtle)', fontSize: 12, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Current Lessee</div>
                      <div className="mono" style={{ color: 'var(--focus)', fontSize: 14 }}>
                        {formatAddr(currentUser)}
                      </div>
                    </div>
                  )}
                  <div
                    style={{
                      marginTop: 16,
                      padding: '10px 14px',
                      background: 'var(--accent-dim)',
                      borderRadius: 10,
                      color: 'var(--accent)',
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    Listed in Marketplace to buy or lease this city.
                  </div>
                </div>
              ) : (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 16,
                    }}
                  >
                    <span style={{ color: 'var(--muted)', fontSize: 14 }}>Mint price</span>
                    <span
                      className="display"
                      style={{ color: 'var(--accent)', fontSize: 22, fontWeight: 700 }}
                    >
                      ${Amount.fromRaw(mintPrice, decimals).toFixed(0)}{' '}
                      <span style={{ fontSize: 14 }}>USDC</span>
                    </span>
                  </div>
                  {address ? (
                    <button
                      onClick={handleBuy}
                      disabled={isBusy}
                      style={{
                        width: '100%',
                        padding: '14px',
                        background: isBusy ? 'var(--border)' : 'var(--accent)',
                        color: isBusy ? 'var(--subtle)' : '#080f1c',
                        border: 'none',
                        borderRadius: 12,
                        fontFamily: "'DM Sans', sans-serif",
                        fontWeight: 700,
                        fontSize: 15,
                        cursor: isBusy ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        transition: 'all 0.15s',
                      }}
                    >
                      {isBusy && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
                      {btnLabel()}
                    </button>
                  ) : (
                    <div style={{ color: 'var(--subtle)', fontSize: 14, textAlign: 'center', padding: 12 }}>
                      Connect wallet to buy
                    </div>
                  )}
                  {claimTx && (
                    <a
                      href={buildTxExplorerUrl(CHAIN_ID, claimTx)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        color: 'var(--focus)',
                        fontSize: 13,
                        textDecoration: 'none',
                        marginTop: 8,
                        justifyContent: 'center',
                      }}
                    >
                      <ExternalLink size={13} /> View transaction
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Revenue split info */}
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: 24,
              }}
            >
              <h3
                className="display"
                style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 700, margin: '0 0 16px' }}
              >
                Revenue Split
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <SplitRow label="Platform" pct={10} color="var(--subtle)" />
                <SplitRow label="Mayor (you)" pct={20} color="var(--accent)" />
                <SplitRow label="District Owners" pct={70} color="var(--focus)" />
              </div>
              <p style={{ color: 'var(--subtle)', fontSize: 12, marginTop: 14, lineHeight: 1.5 }}>
                Every USDC spent on ads, storefronts, and events in this city is split automatically between
                the platform, the mayor, and the district owners via the RevenueSplitter contract.
              </p>
            </div>
          </div>

          {/* Right */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Districts */}
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: 24,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Building2 size={16} color="var(--focus)" />
                <span className="display" style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 700 }}>
                  Districts ({districtCount})
                </span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 8,
                }}
              >
                {Array.from({ length: districtCount }, (_, i) => {
                  const districtTokenId = city.id * 100 + i;
                  return (
                    <DistrictDot
                      key={i}
                      index={i}
                      tokenId={districtTokenId}
                    />
                  );
                })}
              </div>
              <p style={{ color: 'var(--subtle)', fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
                Each district is a separate ERC-721. District owners earn 70% of all revenue
                from activity in their district.
              </p>
            </div>

            {/* Contract info */}
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: 20,
              }}
            >
              <h3
                className="display"
                style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}
              >
                Contracts
              </h3>
              <ContractLink label="CityRegistry" address={CITY_REGISTRY.address} chainId={CHAIN_ID} />
              <ContractLink label="DistrictRegistry" address={DISTRICT_REGISTRY.address} chainId={CHAIN_ID} />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function Stat({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--muted)', fontSize: 14 }}>
      <span style={{ color: 'var(--subtle)' }}>{icon}</span>
      {label}
    </div>
  );
}

function SplitRow({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</span>
          <span style={{ color, fontSize: 13, fontWeight: 700 }}>{pct}%</span>
        </div>
        <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: color,
              borderRadius: 2,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function DistrictDot({ index, tokenId }: { index: number; tokenId: number }) {
  // ownerOf reverts if not minted — treat error as "not minted"
  const { data } = useReadContract({
    address: DISTRICT_REGISTRY.address,
    abi: DISTRICT_REGISTRY.abi,
    functionName: 'ownerOf',
    args: [BigInt(tokenId)],
    chainId: CHAIN_ID,
  });
  const minted = !!data && data !== '0x0000000000000000000000000000000000000000';

  return (
    <div
      title={`District ${index + 1}`}
      style={{
        aspectRatio: '1',
        borderRadius: 8,
        background: minted ? 'rgba(246,195,71,0.2)' : 'var(--surface-muted)',
        border: minted ? '1px solid var(--accent)' : '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        fontSize: 10,
        color: minted ? 'var(--accent)' : 'var(--subtle)',
        fontWeight: 600,
      }}
    >
      D{index + 1}
    </div>
  );
}

function ContractLink({
  label,
  address,
  chainId,
}: {
  label: string;
  address: string;
  chainId: number;
}) {
  const { explorerBase } = requireChain(chainId);
  return (
    <a
      href={`${explorerBase}/address/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 0',
        borderBottom: '1px solid var(--border)',
        textDecoration: 'none',
        color: 'var(--muted)',
        fontSize: 13,
      }}
    >
      <span>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--focus)' }}>
        <span className="mono" style={{ fontSize: 12 }}>
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        <ExternalLink size={12} />
      </span>
    </a>
  );
}
