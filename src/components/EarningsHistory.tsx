import { useState } from 'react';
import { TrendingUp, ExternalLink, Loader2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useEarningsHistory, EVENT_TYPE_LABELS, EVENT_TYPE_COLORS, type EarningEventType } from '../lib/useEarningsHistory';
import { buildTxExplorerUrl } from '@/onchain-facts';
import { CHAIN_ID } from '../contracts';

interface Props { address: string }

export function EarningsHistory({ address }: Props) {
  const [open, setOpen] = useState(false);
  const { loading, rows, error } = useEarningsHistory(address, open);

  // Lifetime total
  const totalUsd = rows.reduce((s, r) => s + parseFloat(r.amount_usd), 0);

  // Source breakdown
  const byType = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.event_type] = (acc[r.event_type] ?? 0) + parseFloat(r.amount_usd);
    return acc;
  }, {});

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      marginBottom: 28,
      overflow: 'hidden',
    }}>
      {/* Header — always visible */}
      <button
        onClick={() => { setOpen(o => !o); }}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 10,
          textAlign: 'left',
        }}
      >
        <TrendingUp size={18} color="var(--green)" />
        <span className="display" style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 700, flex: 1 }}>
          Earnings History
        </span>
        {rows.length > 0 && (
          <span className="display" style={{ color: 'var(--green)', fontSize: 20, fontWeight: 800 }}>
            ${totalUsd.toFixed(2)}
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginLeft: 4 }}>lifetime</span>
          </span>
        )}
        {open ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '0 24px 20px' }}>

          {/* Loading */}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 0', color: 'var(--muted)', fontSize: 14 }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              Loading earnings history…
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0', color: 'var(--muted)', fontSize: 13 }}>
              <AlertCircle size={14} />
              {error.includes('coming soon')
                ? 'Earnings history will be available once the platform launches on mainnet.'
                : error.includes('fetch') || error.includes('network') || error.includes('Failed')
                  ? 'Earnings history is temporarily unavailable. Please try again later.'
                  : error}
            </div>
          )}

          {/* Source breakdown chips */}
          {!loading && rows.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '16px 0 12px' }}>
              {Object.entries(byType).map(([type, amount]) => (
                <span
                  key={type}
                  style={{
                    background: `${EVENT_TYPE_COLORS[type as EarningEventType]}18`,
                    color: EVENT_TYPE_COLORS[type as EarningEventType],
                    border: `1px solid ${EVENT_TYPE_COLORS[type as EarningEventType]}44`,
                    borderRadius: 20, padding: '3px 10px',
                    fontSize: 12, fontWeight: 600,
                  }}
                >
                  {EVENT_TYPE_LABELS[type as EarningEventType]} · ${amount.toFixed(2)}
                </span>
              ))}
            </div>
          )}

          {/* Table */}
          {!loading && rows.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: 'var(--subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 11 }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px 10px', fontWeight: 600 }}>Source</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px 10px', fontWeight: 600 }}>Amount</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px 10px', fontWeight: 600 }}>Block</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px 10px', fontWeight: 600 }}>Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={`${row.tx_hash}-${row.log_index}`}
                      style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 8px' }}>
                        <span style={{
                          color: EVENT_TYPE_COLORS[row.event_type],
                          fontWeight: 600, fontSize: 13,
                        }}>
                          {EVENT_TYPE_LABELS[row.event_type]}
                        </span>
                        {row.metadata.cityId != null && (
                          <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 6 }}>
                            City #{row.metadata.cityId as number}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 8px', color: 'var(--green)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {parseFloat(row.amount_usd) > 0 ? `$${parseFloat(row.amount_usd).toFixed(2)}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 8px', color: 'var(--muted)', fontFamily: 'monospace', fontSize: 11 }}>
                        {row.block_number}
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 8px' }}>
                        <a
                          href={buildTxExplorerUrl(CHAIN_ID, row.tx_hash as `0x${string}`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--focus)', fontSize: 11, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                        >
                          {row.tx_hash.slice(0, 6)}…{row.tx_hash.slice(-4)}
                          <ExternalLink size={10} />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && rows.length === 0 && (
            <p style={{ color: 'var(--subtle)', fontSize: 14, padding: '20px 0', margin: 0 }}>
              No earnings yet. List a city or district, book an ad slot, or earn referral commissions to see history here.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
