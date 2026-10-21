/**
 * Leaderboards — ranks cities by on-chain USDC volume and activity count.
 *
 * Data source (chain-aware):
 *   - Testnet (CHAIN_ID !== 5042): useLeaderboard reads Sold/AdBooked/etc events directly.
 *   - Mainnet (CHAIN_ID === 5042): useActivityTracker reads ActivityTracker.cityActivity.
 */
import React, { useMemo } from 'react';
import { Trophy, Zap, TrendingUp, RefreshCw } from 'lucide-react';
import { useLeaderboard } from '../lib/useLeaderboard';
import { useActivityLeaderboard } from '../lib/useActivityLeaderboard';
import { useCities } from '../lib/useCities';
import { CHAIN_ID } from '../contracts';

const IS_MAINNET = (CHAIN_ID as number) === 5042;

export function Leaderboards() {
  const { cities, getCityById } = useCities();
  const testnetData = useLeaderboard(!IS_MAINNET);
  const mainnetData = useActivityLeaderboard(IS_MAINNET);
  const { loading, entries, lastScanned, error } = IS_MAINNET ? mainnetData : testnetData;

  const byVolume = useMemo(() => {
    if (loading || entries.length === 0) {
      // Fallback: show first 20 cities with zero values while loading
      return cities.slice(0, 20).map(c => ({ city: c, volume: 0, count: 0 }));
    }
    return entries
      .slice(0, 20)
      .map(e => ({ city: getCityById(e.cityId), volume: e.volume, count: e.count }))
      .filter(r => r.city != null) as { city: NonNullable<ReturnType<typeof getCityById>>; volume: number; count: number }[];
  }, [loading, entries, cities, getCityById]);

  const byCount = useMemo(() => [...byVolume].sort((a, b) => b.count - a.count), [byVolume]);

  return (
    <div style={{ minHeight: 'calc(100dvh - 60px)', background: 'var(--bg)' }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, var(--green-dark) 0%, var(--green) 60%, #4fb860 100%)',
        padding: '40px 24px 28px', position: 'relative', overflow: 'hidden',
        marginBottom: 32,
      }}>
        <div style={{ position: 'absolute', right: 32, bottom: -4, opacity: 0.15, display: 'flex', gap: 3, alignItems: 'flex-end' }}>
          {[24, 40, 30, 56, 36, 20].map((h, i) => (
            <div key={i} style={{ width: 12, height: h, background: '#fff', borderRadius: '2px 2px 0 0' }} />
          ))}
        </div>
        <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.18)', borderRadius: 20, padding: '3px 12px', marginBottom: 12, border: '1px solid rgba(255,255,255,0.25)' }}>
            <Trophy size={11} color="rgba(255,255,255,0.9)" />
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: 600 }}>On-chain Rankings</span>
          </div>
          <h1 className="display" style={{ color: '#fff', fontSize: 36, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.04em', lineHeight: 1.1 }}>
            Leaderboards
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 15, margin: 0 }}>
            Top cities ranked by on-chain USDC volume and activity count.
            {lastScanned && (
              <span style={{ fontSize: 12, opacity: 0.75, marginLeft: 8 }}>
                Scanned to block {lastScanned.toLocaleString()}
              </span>
            )}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 48px' }}>

        {/* Loading state */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: 'var(--muted)', fontSize: 14 }}>
            <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
            Scanning on-chain activity…
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div style={{ padding: 16, background: '#fff3f3', border: '1px solid #fca5a5', borderRadius: 10, marginBottom: 20, color: '#b91c1c', fontSize: 13 }}>
            Could not load rankings: {error}
          </div>
        )}

        {/* No activity yet */}
        {!loading && !error && entries.length === 0 && (
          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏙️</div>
            No on-chain activity found in the last 12,000 blocks.
            <br />
            <span style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
              Buy a city, list an ad slot, or rent a storefront to appear here.
            </span>
          </div>
        )}

        {/* Rankings grid */}
        {byVolume.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
            <LeaderSection
              title="Top Cities by USDC Volume"
              icon={<TrendingUp size={16} color="var(--accent)" />}
              rows={byVolume}
              renderRow={(item, i) => (
                <LeaderRow
                  key={item.city.id}
                  rank={i + 1}
                  name={item.city.name}
                  sub={item.city.country}
                  value={item.volume > 0 ? `$${item.volume.toFixed(2)}` : loading ? '…' : '$0'}
                  highlight={i === 0}
                />
              )}
            />
            <LeaderSection
              title="Top Cities by Activity Count"
              icon={<Zap size={16} color="#f59e0b" />}
              rows={byCount}
              renderRow={(item, i) => (
                <LeaderRow
                  key={item.city.id}
                  rank={i + 1}
                  name={item.city.name}
                  sub={item.city.country}
                  value={item.count > 0 ? `${item.count} txn${item.count !== 1 ? 's' : ''}` : loading ? '…' : '0 txns'}
                  highlight={i === 0}
                />
              )}
            />
          </div>
        )}

        <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 32, textAlign: 'center' }}>
          CityOnChain is not affiliated with any real city or government. Virtual ownership confers no real-world rights. No guaranteed returns.
        </p>
      </div>
    </div>
  );
}

const MEDAL = ['🥇', '🥈', '🥉'];

function LeaderSection<T>({ title, icon, rows, renderRow }: {
  title: string;
  icon: React.ReactNode;
  rows: T[];
  renderRow: (item: T, i: number) => React.ReactNode;
}) {
  return (
    <div style={{
      background: 'var(--surface-strong)',
      border: '1.5px solid var(--border)',
      borderRadius: 16, overflow: 'hidden',
      boxShadow: '0 4px 16px rgba(45,122,58,0.07)',
    }}>
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--green-dim)',
      }}>
        {icon}
        <span className="display" style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em' }}>{title}</span>
      </div>
      <div>{rows.map((item, i) => renderRow(item, i))}</div>
    </div>
  );
}

function LeaderRow({ rank, name, sub, value, highlight }: {
  rank: number; name: string; sub: string; value: string; highlight: boolean;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 20px',
      borderBottom: '1px solid var(--border)',
      background: highlight ? 'var(--accent-dim)' : 'transparent',
    }}>
      <span style={{
        width: 28, height: 28, borderRadius: '50%',
        background: rank <= 3 ? 'var(--accent-dim)' : 'rgba(45,122,58,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: rank <= 3 ? 15 : 11, fontWeight: 700, flexShrink: 0,
        color: rank <= 3 ? 'var(--accent)' : 'var(--muted)',
      }}>
        {rank <= 3 ? MEDAL[rank - 1] : rank}
      </span>
      <div style={{ flex: 1 }}>
        <p style={{ color: 'var(--ink)', fontWeight: 600, margin: 0, fontSize: 14 }}>{name}</p>
        <p style={{ color: 'var(--muted)', fontSize: 11, margin: '1px 0 0' }}>{sub}</p>
      </div>
      <span style={{
        color: highlight ? 'var(--accent)' : 'var(--green)',
        fontWeight: 700, fontSize: 14,
        background: highlight ? 'var(--accent-dim)' : 'var(--green-dim)',
        padding: '3px 10px', borderRadius: 20,
      }}>
        {value}
      </span>
    </div>
  );
}
