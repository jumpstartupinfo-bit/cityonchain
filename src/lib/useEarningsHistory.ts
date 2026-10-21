/**
 * useEarningsHistory — fetches earnings history from the indexer backend.
 *
 * In dev: calls /api/earnings (Vite proxies to http://localhost:3001).
 * In prod: calls VITE_INDEXER_URL/api/earnings (set in Railway env vars).
 *
 * MAINNET NOTE: Update VITE_INDEXER_URL in Railway to point at the mainnet
 * indexer service. Also update DEPLOY_BLOCK and contract addresses in
 * server/.env on Railway.
 */
import { useState, useEffect, useRef } from 'react';

export type EarningEventType =
  | 'marketplace_sale'
  | 'revenue_split'
  | 'referral_commission'
  | 'lease_payment'
  | 'ad_booking'
  | 'storefront_rent'
  | 'ticket_purchase';

export interface EarningsRow {
  id: number;
  wallet: string;
  event_type: EarningEventType;
  amount_raw: string;
  amount_usd: string;
  tx_hash: string;
  log_index: number;
  block_number: string;
  block_time: string | null;
  metadata: Record<string, unknown>;
}

interface EarningsState {
  loading: boolean;
  rows: EarningsRow[];
  error: string | null;
}

const BASE_URL = (import.meta.env['VITE_INDEXER_URL'] as string | undefined) ?? '';
const IS_DEV_HOST = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' ||
  window.location.hostname.includes('preview') ||
  window.location.hostname.includes('127.0.0.1')
);
const INDEXER_AVAILABLE = BASE_URL !== '' || IS_DEV_HOST;

export function useEarningsHistory(address: string | undefined, enabled = false): EarningsState {
  const [state, setState] = useState<EarningsState>(() => ({
    loading: false,
    rows: [],
    error: INDEXER_AVAILABLE ? null : 'Earnings history coming soon — backend indexer not yet configured.',
  }));
  const prevAddress = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!enabled || !address || !INDEXER_AVAILABLE) return;
    if (prevAddress.current === address && state.rows.length > 0) return; // cached
    prevAddress.current = address;

    setState({ loading: true, rows: [], error: null });

    const url = `${BASE_URL}/api/earnings?address=${address}&limit=200`;

    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ rows: EarningsRow[]; error?: string }>;
      })
      .then(data => {
        if (data.error) throw new Error(data.error);
        setState({ loading: false, rows: data.rows ?? [], error: null });
      })
      .catch((e: unknown) => {
        setState({ loading: false, rows: [], error: String(e) });
      });
  }, [enabled, address, state.rows.length]);

  return state;
}

export const EVENT_TYPE_LABELS: Record<EarningEventType, string> = {
  marketplace_sale:    'Marketplace Sale',
  revenue_split:       'Revenue Split',
  referral_commission: 'Referral Commission',
  lease_payment:       'Lease Payment',
  ad_booking:          'Ad Booking',
  storefront_rent:     'Storefront Rent',
  ticket_purchase:     'Ticket Purchase',
};

export const EVENT_TYPE_COLORS: Record<EarningEventType, string> = {
  marketplace_sale:    'var(--accent)',
  revenue_split:       'var(--green)',
  referral_commission: '#8b5cf6',
  lease_payment:       '#0ea5e9',
  ad_booking:          '#f59e0b',
  storefront_rent:     '#10b981',
  ticket_purchase:     '#ec4899',
};
