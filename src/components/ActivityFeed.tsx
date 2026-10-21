/**
 * ActivityFeed — scrolling ticker of recent on-chain events across all CityOnChain contracts.
 * Polls eth_getLogs manually every 30s — avoids eth_newFilter / eth_getFilterChanges entirely
 * since Arc Testnet does not reliably support those methods.
 */
import React, { useState, useEffect, useRef } from 'react';
import { createPublicClient, http, parseAbiItem } from 'viem';
import type { Chain } from 'viem';
import { Zap } from 'lucide-react';
import {
  CITY_REGISTRY, DISTRICT_REGISTRY, AD_SLOTS, STOREFRONTS, EVENT_TICKETS,
  CITY_MARKETPLACE, CHAIN_ID,
} from '../contracts';
import { getChain } from '../onchain-facts';

interface FeedItem {
  id: string;
  icon: string;
  text: string;
  sub: string;
  time: number;
}

interface ActivityFeedProps {
  onCityEvent?: (cityId: number) => void;
}

const MAX_ITEMS = 40;
const POLL_MS = 30_000;

function makeId() { return Math.random().toString(36).slice(2); }
function timeAgo(ms: number) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
function shortAddr(addr: string) { return addr.slice(0, 6) + '…' + addr.slice(-4); }

// From Transfer events on ERC721 contracts
const TRANSFER_ABI    = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)');
// AdSlots.sol: AdBooked(adId, slotId, advertiser, adContentHash, adLink, startTime, endTime, dailyRate)
const AD_BOOKED_ABI   = parseAbiItem('event AdBooked(uint256 indexed adId, uint256 indexed slotId, address indexed advertiser, string adContentHash, string adLink, uint256 startTime, uint256 endTime, uint256 dailyRate)');
// Storefronts.sol: UnitRented(leaseId, unitId, tenant, nextPaymentDue, gracePeriodEnd)
const UNIT_RENTED_ABI = parseAbiItem('event UnitRented(uint256 indexed leaseId, uint256 indexed unitId, address indexed tenant, uint256 nextPaymentDue, uint256 gracePeriodEnd)');
// EventTickets.sol: TicketsPurchased(eventId, buyer, quantity, amount)
const TICKET_ABI      = parseAbiItem('event TicketsPurchased(uint256 indexed eventId, address indexed buyer, uint256 quantity, uint256 amount)');
// CityMarketplace.sol: Sold(listingId, buyer, price, fee)
const SOLD_ABI        = parseAbiItem('event Sold(uint256 indexed listingId, address indexed buyer, uint256 price, uint256 fee)');
// CityMarketplace.sol: Listed(listingId, seller, nftContract, tokenId, price)
const LISTED_ABI      = parseAbiItem('event Listed(uint256 indexed listingId, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 price)');

export function ActivityFeed({ onCityEvent }: ActivityFeedProps = {}) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const onCityEventRef = useRef(onCityEvent);
  const lastBlockRef = useRef<bigint | null>(null);
  useEffect(() => { onCityEventRef.current = onCityEvent; }, [onCityEvent]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [items.length]);

  useEffect(() => {
    const chain = getChain(CHAIN_ID);
    if (!chain) return;

    const rpcUrl = chain.rpcUrls[0];

    const client = createPublicClient({
      chain: chain as unknown as Chain,
      transport: http(rpcUrl),
    });

    function push(item: Omit<FeedItem, 'id' | 'time'>, cityId?: number) {
      setItems(prev => [{ ...item, id: makeId(), time: Date.now() }, ...prev].slice(0, MAX_ITEMS));
      if (cityId != null) onCityEventRef.current?.(cityId);
    }

    async function poll() {
      try {
        const currentBlock = await client.getBlockNumber();
        // On first call, scan the last 500 blocks for recent history
        if (lastBlockRef.current === null) {
          const historyFrom = currentBlock - 500n > 0n ? currentBlock - 500n : 0n;
          lastBlockRef.current = historyFrom - 1n; // will be incremented to historyFrom below
        }
        const fromBlock = lastBlockRef.current + 1n;
        if (fromBlock > currentBlock) return;
        // Limit range to 50 blocks max to avoid "range too large" errors
        const toBlock = currentBlock - fromBlock > 50n ? fromBlock + 49n : currentBlock;
        lastBlockRef.current = toBlock;

        const [cityTransfers, districtTransfers, adBooked, unitRented, ticketPurchased, soldEvents, listedEvents] = await Promise.allSettled([
          client.getLogs({ address: CITY_REGISTRY.address, event: TRANSFER_ABI, fromBlock, toBlock }),
          client.getLogs({ address: DISTRICT_REGISTRY.address, event: TRANSFER_ABI, fromBlock, toBlock }),
          client.getLogs({ address: AD_SLOTS.address, event: AD_BOOKED_ABI, fromBlock, toBlock }),
          client.getLogs({ address: STOREFRONTS.address, event: UNIT_RENTED_ABI, fromBlock, toBlock }),
          client.getLogs({ address: EVENT_TICKETS.address, event: TICKET_ABI, fromBlock, toBlock }),
          client.getLogs({ address: CITY_MARKETPLACE.address, event: SOLD_ABI, fromBlock, toBlock }),
          client.getLogs({ address: CITY_MARKETPLACE.address, event: LISTED_ABI, fromBlock, toBlock }),
        ]);

        if (cityTransfers.status === 'fulfilled') {
          for (const log of cityTransfers.value) {
            const a = log.args as { from?: string; to?: string; tokenId?: bigint };
            if (a.from === '0x0000000000000000000000000000000000000000') {
              push({ icon: '🏙️', text: `Mayor License #${a.tokenId} minted`, sub: a.to ? shortAddr(a.to) : '' },
                a.tokenId != null ? Number(a.tokenId) : undefined);
            } else {
              push({ icon: '🏙️', text: `Mayor License #${a.tokenId} transferred`, sub: a.to ? shortAddr(a.to) : '' },
                a.tokenId != null ? Number(a.tokenId) : undefined);
            }
          }
        }
        if (districtTransfers.status === 'fulfilled') {
          for (const log of districtTransfers.value) {
            const a = log.args as { from?: string; to?: string; tokenId?: bigint };
            if (a.from === '0x0000000000000000000000000000000000000000') {
              push({ icon: '🏘️', text: `District #${a.tokenId} minted`, sub: a.to ? shortAddr(a.to) : '' });
            }
          }
        }
        if (adBooked.status === 'fulfilled') {
          for (const log of adBooked.value) {
            const a = log.args as { advertiser?: string; slotId?: bigint };
            push({ icon: '📢', text: `Ad slot #${a.slotId} booked`, sub: a.advertiser ? shortAddr(a.advertiser) : '' });
          }
        }
        if (unitRented.status === 'fulfilled') {
          for (const log of unitRented.value) {
            const a = log.args as { tenant?: string; unitId?: bigint };
            push({ icon: '🏪', text: `Storefront unit #${a.unitId} rented`, sub: a.tenant ? shortAddr(a.tenant) : '' });
          }
        }
        if (ticketPurchased.status === 'fulfilled') {
          for (const log of ticketPurchased.value) {
            const a = log.args as { buyer?: string; eventId?: bigint; quantity?: bigint };
            push({ icon: '🎟️', text: `${a.quantity ?? 1} ticket${Number(a.quantity ?? 1) > 1 ? 's' : ''} for event #${a.eventId}`, sub: a.buyer ? shortAddr(a.buyer) : '' });
          }
        }
        if (listedEvents.status === 'fulfilled') {
          for (const log of listedEvents.value) {
            const a = log.args as { seller?: string; nftContract?: string; tokenId?: bigint; price?: bigint };
            const isCity = a.nftContract?.toLowerCase() === CITY_REGISTRY.address.toLowerCase();
            push({ icon: '🏷️', text: `${isCity ? 'City' : 'District'} #${a.tokenId} listed`, sub: a.seller ? shortAddr(a.seller) : '' });
          }
        }
        if (soldEvents.status === 'fulfilled') {
          for (const log of soldEvents.value) {
            const a = log.args as { buyer?: string; price?: bigint };
            push({ icon: '💰', text: `Marketplace sale · $${a.price != null ? (Number(a.price) / 1_000_000).toFixed(0) : '?'} USDC`, sub: a.buyer ? shortAddr(a.buyer) : '' });
          }
        }
      } catch {
        // Silent — feed is best-effort
      }
    }

    // Initial call
    void poll();
    const interval = setInterval(() => { void poll(); }, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      background: 'var(--surface-strong)',
      border: '1.5px solid var(--border)',
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: '0 4px 16px rgba(45,122,58,0.07)',
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--green-dim)',
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
        <span className="display" style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em' }}>
          Live Activity
        </span>
        <Zap size={13} color="var(--green)" style={{ marginLeft: 'auto' }} />
      </div>
      <div ref={listRef} style={{ maxHeight: 320, overflowY: 'auto', scrollbarWidth: 'thin' }}>
        {items.length === 0 ? (
          <div style={{ padding: '28px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🌐</div>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Waiting for on-chain activity…</div>
            <div style={{ color: 'var(--subtle)', fontSize: 11, marginTop: 4 }}>Events will appear here in real time.</div>
          </div>
        ) : (
          items.map((item) => <FeedRow key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  const [age, setAge] = useState(timeAgo(item.time));
  useEffect(() => {
    const t = setInterval(() => setAge(timeAgo(item.time)), 15_000);
    return () => clearInterval(t);
  }, [item.time]);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 16px',
      borderBottom: '1px solid var(--border)',
      animation: 'feedIn 0.2s ease',
    }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--ink)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.text}
        </div>
        {item.sub && <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 1 }}>{item.sub}</div>}
      </div>
      <span style={{ color: 'var(--subtle)', fontSize: 11, flexShrink: 0 }}>{age}</span>
    </div>
  );
}
