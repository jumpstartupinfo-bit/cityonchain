import React, { useState, useEffect } from 'react';
import { useReadContract } from 'wagmi';
import {
  ArrowRight, TrendingUp, Building2, Ticket, CreditCard,
  FileText, ShoppingCart, ChevronDown, ChevronUp, Star,
  Users, MapPin, Coins, Globe, Calculator,
} from 'lucide-react';
import { CITY_REGISTRY, DISTRICT_REGISTRY, CHAIN_ID } from '../contracts';
import { type Abi } from 'viem';

// ── Shared styles (defined before use) ───────────────────────────────────────
const sectionHeading: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'clamp(22px, 3vw, 30px)',
  fontWeight: 700,
  color: 'var(--text-1)',
  letterSpacing: '-0.02em',
  margin: '0 0 8px',
  textWrap: 'balance',
};

const sectionSubline: React.CSSProperties = {
  fontSize: 15,
  color: 'var(--text-2)',
  lineHeight: 1.6,
  margin: '0 0 4px',
};

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: 'clamp(20px, 3vw, 28px)',
};

// ── Live stats ────────────────────────────────────────────────────────────────
function useLiveStats() {
  const { data: citiesOwned } = useReadContract({
    address: CITY_REGISTRY.address,
    abi: CITY_REGISTRY.abi as Abi,
    functionName: 'totalSupply',
    chainId: CHAIN_ID,
    query: { staleTime: 60_000 },
  });
  const { data: districtsMinted } = useReadContract({
    address: DISTRICT_REGISTRY.address,
    abi: DISTRICT_REGISTRY.abi as Abi,
    functionName: 'totalSupply',
    chainId: CHAIN_ID,
    query: { staleTime: 60_000 },
  });
  return {
    citiesOwned: citiesOwned != null ? Number(citiesOwned) : null,
    districtsMinted: districtsMinted != null ? Number(districtsMinted) : null,
  };
}

// ── Animated counter ──────────────────────────────────────────────────────────
function AnimatedNumber({ value, prefix = '', suffix = '' }: { value: number | null; prefix?: string; suffix?: string }) {
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    if (value === null) return;
    const start = 0;
    const end = value;
    const duration = 1200;
    const startTime = performance.now();
    function step(now: number) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(start + (end - start) * eased));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }, [value]);
  if (value === null) return <span style={{ color: 'var(--text-3)' }}>—</span>;
  return <span>{prefix}{displayed.toLocaleString()}{suffix}</span>;
}

// ── FAQ data ──────────────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    q: 'What do I actually own when I buy a city?',
    a: 'You receive a Mayor License NFT on the Arc blockchain. It gives you ownership of the city and all its districts, plus the right to earn revenue from every activity that happens there.',
  },
  {
    q: 'How do I earn USDC from my city?',
    a: 'When people rent ad slots, open storefronts, buy event tickets, purchase city passes, or sign leases in your city, a share of every payment goes directly to you in USDC.',
  },
  {
    q: 'How do I get USDC to buy a city?',
    a: 'You can bridge USDC from Ethereum, Base, Arbitrum, Polygon, or Avalanche directly to Arc using the Bridge page — no exchange needed. Fiat onramp coming soon.',
  },
  {
    q: 'Can I sell my city later?',
    a: 'Yes. List your city on the CityOnChain Marketplace at any price above the floor. When it sells, you keep the proceeds minus a 5% platform fee.',
  },
  {
    q: 'Are the cities based on real places?',
    a: 'The city names and locations are based on real geographic data. CityOnChain is not affiliated with any real city, municipality, or government. City names are geographic identifiers only.',
  },
  {
    q: 'Is this a game?',
    a: 'CityOnChain is a digital ownership platform with real financial mechanics. It is not a game. All revenue is paid in USDC, a regulated stablecoin issued by Circle. Participation involves financial risk.',
  },
  {
    q: 'What blockchain does this run on?',
    a: 'Arc — Circle\'s EVM-compatible blockchain where USDC is the native gas token. Transactions are fast, cheap, and paid entirely in USDC.',
  },
  {
    q: 'Do I need crypto experience?',
    a: 'You need a Web3 wallet (MetaMask or similar) and USDC on Arc. The Bridge page handles moving USDC from other chains. No coding or technical knowledge required.',
  },
];

// ── Revenue stream cards ──────────────────────────────────────────────────────
const REVENUE_STREAMS = [
  { icon: TrendingUp,   title: 'Ad Slots',    desc: 'Businesses rent billboard space in your districts. Paid daily in USDC.' },
  { icon: Building2,    title: 'Storefronts', desc: 'Tenants open shops and pay monthly rent automatically.' },
  { icon: Ticket,       title: 'Events',      desc: 'Organizers sell tickets to events in your city. You earn from every ticket.' },
  { icon: CreditCard,   title: 'City Passes', desc: 'Sell permanent or timed access passes. 80% of every sale goes to you.' },
  { icon: FileText,     title: 'Leases',      desc: 'Long-term district leases pay you upfront in USDC.' },
  { icon: ShoppingCart, title: 'Marketplace', desc: 'List cities and districts for resale. Set your own price above the floor.' },
];

// ── Roadmap ───────────────────────────────────────────────────────────────────
const ROADMAP = [
  {
    quarter: 'Q4 2026',
    status: 'live',
    title: 'Live Now',
    features: [
      'Buy cities and districts — all districts included at no extra cost',
      'Earn USDC from ads, storefronts, events, passes, and leases',
      'Trade on the marketplace with floor price enforcement',
      'Refer others and earn 20% commission on every purchase',
    ],
  },
  {
    quarter: 'Q1 2027',
    status: 'upcoming',
    title: '3D Immersive World + Metaverse Economy',
    features: [
      'Walk through your city in a fully rendered 3D environment',
      'Visit storefronts you can physically enter, attend live events with spatial audio',
      'Your Mayor License becomes your passport — travel between player-owned cities',
      'District owners hire managers; residents earn city credits from jobs and hustles',
      'Credits redeemable for USDC or a future CityOnChain token',
      'Real brands lease storefronts and billboard slots in high-traffic cities',
    ],
  },
  {
    quarter: 'Q2 2027',
    status: 'upcoming',
    title: 'Governance + Social Layer',
    features: [
      'District owners vote on city policies — tax rates, event permissions, storefront rules',
      'Mayors who govern well attract more residents and earn more',
      'Form crews, collaborate across cities, share referral pools',
      'Player-to-player messaging and player reputation scores',
      'A city constitution, owned entirely on-chain',
    ],
  },
];

// ── Mini income calculator ────────────────────────────────────────────────────
const TIERS = [
  { label: 'Small Town', price: 40,    monthly: { ads: 12,  storefronts: 8,   events: 6,   passes: 10, leases: 4  } },
  { label: 'Town',       price: 120,   monthly: { ads: 36,  storefronts: 24,  events: 18,  passes: 30, leases: 12 } },
  { label: 'City',       price: 400,   monthly: { ads: 48,  storefronts: 32,  events: 24,  passes: 40, leases: 16 } },
  { label: 'Large City', price: 1200,  monthly: { ads: 96,  storefronts: 64,  events: 48,  passes: 80, leases: 32 } },
  { label: 'Major City', price: 3000,  monthly: { ads: 180, storefronts: 120, events: 90,  passes: 150,leases: 60 } },
  { label: 'Mega City',  price: 7500,  monthly: { ads: 360, storefronts: 240, events: 180, passes: 300,leases: 120} },
];

function MiniCalculator({ onOpenFull }: { onOpenFull: () => void }) {
  const [selected, setSelected] = useState(2); // default: City
  const tier = TIERS[selected];
  const streams = [
    { label: 'Ad Slots',    value: tier.monthly.ads },
    { label: 'Storefronts', value: tier.monthly.storefronts },
    { label: 'Events',      value: tier.monthly.events },
    { label: 'City Passes', value: tier.monthly.passes },
    { label: 'Leases',      value: tier.monthly.leases },
  ];
  const total = streams.reduce((s, r) => s + r.value, 0);

  return (
    <section style={{
      padding: 'clamp(40px, 6vw, 72px) clamp(20px, 5vw, 80px)',
      background: 'var(--surface-alt, var(--surface))',
      borderTop: '1px solid var(--border)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: 'var(--green-faint, rgba(34,197,94,0.1))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Calculator size={22} style={{ color: 'var(--green)' }} />
          </div>
          <div>
            <h2 style={sectionHeading}>What Could Your City Earn?</h2>
            <p style={sectionSubline}>Pick a tier and see projected monthly income. No guesswork — based on platform fee structure at 50% activity.</p>
          </div>
        </div>

        {/* Tier selector */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 28, marginBottom: 28 }}>
          {TIERS.map((t, i) => (
            <button
              key={t.label}
              onClick={() => setSelected(i)}
              style={{
                padding: '8px 16px',
                borderRadius: 100,
                border: selected === i ? '2px solid var(--green)' : '1.5px solid var(--border)',
                background: selected === i ? 'var(--green-faint, rgba(34,197,94,0.1))' : 'var(--surface)',
                color: selected === i ? 'var(--green)' : 'var(--text-2)',
                fontFamily: 'var(--font-body)',
                fontWeight: selected === i ? 700 : 500,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {t.label} <span style={{ opacity: 0.6, fontWeight: 400 }}>${t.price.toLocaleString()}</span>
            </button>
          ))}
        </div>

        {/* Income breakdown */}
        <div style={{
          ...card,
          padding: 0,
          overflow: 'hidden',
        }}>
          {streams.map(({ label, value }, i) => (
            <div key={label} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 24px',
              borderBottom: i < streams.length - 1 ? '1px solid var(--border)' : 'none',
              background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)',
            }}>
              <span style={{ fontSize: 14, color: 'var(--text-2)', fontWeight: 500 }}>{label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Bar */}
                <div style={{ width: 80, height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    background: 'var(--green)',
                    width: `${Math.round((value / total) * 100)}%`,
                    transition: 'width 0.4s',
                  }} />
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums', minWidth: 56, textAlign: 'right' }}>
                  ${value}/mo
                </span>
              </div>
            </div>
          ))}
          {/* Total row */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '16px 24px',
            background: 'var(--green-faint, rgba(34,197,94,0.06))',
            borderTop: '2px solid var(--green)',
          }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Estimated Monthly Total</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>${total}/mo</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, maxWidth: '50ch' }}>
            Projections based on platform fee structure at 50% typical activity rates. Actual earnings depend on how you run your city.
          </p>
          <button
            onClick={onOpenFull}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--green)', fontWeight: 700, fontSize: 13,
              fontFamily: 'var(--font-body)', padding: 0,
              textDecoration: 'underline', textUnderlineOffset: 3,
            }}
          >
            Run full projection <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </section>
  );
}

// ── FAQ item ──────────────────────────────────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', padding: '18px 0',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 12,
        }}
      >
        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 15, color: 'var(--text-1)', lineHeight: 1.4 }}>{q}</span>
        {open
          ? <ChevronUp size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          : <ChevronDown size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
      </button>
      {open && (
        <p style={{ margin: '0 0 18px', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7, maxWidth: '65ch' }}>{a}</p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface LandingPageProps {
  onBrowse: () => void;
  onReferral: () => void;
  onCalculator: () => void;
}

export function LandingPage({ onBrowse, onReferral, onCalculator }: LandingPageProps) {
  const { citiesOwned, districtsMinted } = useLiveStats();

  return (
    <div style={{ fontFamily: 'var(--font-body)' }}>

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <section style={{
        padding: 'clamp(48px, 8vw, 96px) clamp(20px, 5vw, 80px) clamp(40px, 6vw, 72px)',
        textAlign: 'center',
        maxWidth: 760,
        margin: '0 auto',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--green-faint, rgba(34,197,94,0.1))',
          border: '1px solid var(--green-border, rgba(34,197,94,0.25))',
          borderRadius: 100, padding: '4px 12px', marginBottom: 24,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Live on Arc Testnet</span>
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(36px, 6vw, 64px)',
          fontWeight: 700,
          color: 'var(--text-1)',
          letterSpacing: '-0.03em',
          lineHeight: 1.1,
          margin: '0 0 20px',
          textWrap: 'balance' as never,
        }}>
          Own a City.<br />Earn Real USDC.
        </h1>

        <p style={{
          fontSize: 'clamp(16px, 2vw, 19px)',
          color: 'var(--text-2)',
          lineHeight: 1.65,
          maxWidth: '55ch',
          margin: '0 auto 36px',
          textWrap: 'pretty' as never,
        }}>
          CityOnChain gives you digital ownership of real cities. Buy a Mayor License, collect revenue from ad slots, storefronts, events, and passes — all paid in USDC, all on-chain.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={onBrowse}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'var(--text-1)', color: 'var(--bg)',
              border: 'none', borderRadius: 12, padding: '14px 28px',
              fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 16, cursor: 'pointer', letterSpacing: '-0.01em',
            }}
          >
            Explore Cities <ArrowRight size={16} />
          </button>
          <button
            onClick={onReferral}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'transparent', color: 'var(--text-1)',
              border: '1.5px solid var(--border)', borderRadius: 12, padding: '14px 28px',
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 16, cursor: 'pointer',
            }}
          >
            Earn Referrals
          </button>
        </div>

        {/* Tagline chip */}
        <div style={{ marginTop: 36, display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
          {[
            { icon: Globe,     text: '24,323 cities' },
            { icon: MapPin,    text: '195 countries' },
            { icon: Coins,     text: 'USDC earnings' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 100, padding: '6px 14px',
              fontSize: 13, color: 'var(--text-2)', fontWeight: 500,
            }}>
              <Icon size={13} style={{ color: 'var(--green)' }} />
              {text}
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────────────────── */}
      <section style={{
        padding: 'clamp(40px, 6vw, 72px) clamp(20px, 5vw, 80px)',
        background: 'var(--surface-alt, var(--surface))',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <h2 style={{ ...sectionHeading, textAlign: 'center' }}>How It Works</h2>
          <p style={{ ...sectionSubline, textAlign: 'center', marginBottom: 0 }}>Three steps to owning a city and earning USDC.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 32 }}>
            {[
              {
                num: '01',
                title: 'Buy a Mayor License',
                body: 'Browse 24,323 cities across 195 countries. Pay once in USDC. Become the mayor — all districts included at no extra cost.',
              },
              {
                num: '02',
                title: 'Earn From Your City',
                body: 'Rent ad slots to businesses, open storefronts, host ticketed events, sell city passes, and lease districts. Every activity in your city earns you USDC.',
              },
              {
                num: '03',
                title: 'Grow Your Portfolio',
                body: 'Sell districts on the marketplace, buy more cities, and earn 20% referral commissions when you bring other owners in.',
              },
            ].map(({ num, title, body }) => (
              <div key={num} style={card}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', letterSpacing: '0.1em', marginBottom: 12 }}>{num}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10, letterSpacing: '-0.01em' }}>{title}</div>
                <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.65, margin: 0 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── REVENUE STREAMS ────────────────────────────────────────────────── */}
      <section style={{
        padding: 'clamp(40px, 6vw, 72px) clamp(20px, 5vw, 80px)',
      }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <h2 style={sectionHeading}>Six Ways to Earn From Your City</h2>
          <p style={sectionSubline}>Every transaction in your city puts USDC in your wallet.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 32 }}>
            {REVENUE_STREAMS.map(({ icon: Icon, title, desc }) => (
              <div key={title} style={card}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: 'var(--green-faint, rgba(34,197,94,0.1))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 12,
                }}>
                  <Icon size={20} style={{ color: 'var(--green)' }} />
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-1)', marginBottom: 6 }}>{title}</div>
                <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-3)', marginTop: 24 }}>
            Platform fee: 5% on all transactions. The rest goes directly to city and district owners.
          </p>
        </div>
      </section>

      {/* ── MINI CALCULATOR ────────────────────────────────────────────────── */}
      <MiniCalculator onOpenFull={onCalculator} />

      {/* ── ROADMAP ────────────────────────────────────────────────────────── */}
      <section style={{
        padding: 'clamp(40px, 6vw, 72px) clamp(20px, 5vw, 80px)',
      }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <h2 style={sectionHeading}>Just the Beginning</h2>
          <p style={sectionSubline}>CityOnChain is launching with real ownership economics. The metaverse is next.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 32 }}>
            {ROADMAP.map(({ quarter, status, title, features }) => (
              <div key={quarter} style={{
                ...card,
                borderColor: status === 'live' ? 'var(--green)' : 'var(--border)',
                position: 'relative',
                overflow: 'hidden',
              }}>
                {status === 'live' && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--green)' }} />
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: status === 'live' ? 'var(--green)' : 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{quarter}</span>
                  {status === 'live' && (
                    <span style={{ background: 'var(--green-faint, rgba(34,197,94,0.1))', color: 'var(--green)', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Live</span>
                  )}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 12, letterSpacing: '-0.01em' }}>{title}</div>
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {features.map(f => (
                    <li key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
                      <span style={{ color: 'var(--green)', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-3)', marginTop: 20 }}>
            Roadmap is indicative. Timelines subject to change.
          </p>
        </div>
      </section>

      {/* ── LIVE STATS ─────────────────────────────────────────────────────── */}
      <section style={{
        padding: 'clamp(40px, 6vw, 72px) clamp(20px, 5vw, 80px)',
        background: 'var(--surface-alt, var(--surface))',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={sectionHeading}>CityOnChain by the Numbers</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginTop: 32 }}>
            {[
              { icon: Globe,     label: 'Cities Available',  value: 24323,           prefix: '' },
              { icon: MapPin,    label: 'Cities Owned',      value: citiesOwned,     prefix: '' },
              { icon: Building2, label: 'Districts Minted',  value: districtsMinted, prefix: '' },
              { icon: Users,     label: 'Active Owners',     value: citiesOwned,     prefix: '' },
              { icon: Coins,     label: 'USDC Earned',       value: null,            prefix: '$' },
            ].map(({ icon: Icon, label, value, prefix }) => (
              <div key={label} style={{ ...card, textAlign: 'center' }}>
                <Icon size={22} style={{ color: 'var(--green)', marginBottom: 10 }} />
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                  <AnimatedNumber value={value} prefix={prefix} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, fontWeight: 500 }}>{label}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 20 }}>
            Live data from Arc Testnet. Mainnet figures will appear at launch.
          </p>
        </div>
      </section>

      {/* ── REFERRAL CTA ───────────────────────────────────────────────────── */}
      <section style={{
        padding: 'clamp(40px, 6vw, 72px) clamp(20px, 5vw, 80px)',
        maxWidth: 760, margin: '0 auto', textAlign: 'center',
      }}>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 20, padding: 'clamp(32px, 5vw, 56px) clamp(24px, 4vw, 48px)',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'var(--green-faint, rgba(34,197,94,0.1))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <Star size={26} style={{ color: 'var(--green)' }} />
          </div>
          <h2 style={{ ...sectionHeading, marginBottom: 12, textAlign: 'center' }}>Earn 20% for Every Referral that Buys a City</h2>
          <p style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.65, maxWidth: '50ch', margin: '0 auto 28px' }}>
            Share your referral link. When someone buys a city or district through your link, you earn 20% of the purchase price — paid instantly in USDC, directly to your wallet. Your referrals' referrals earn you another 10%.
          </p>
          <button
            onClick={onReferral}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'var(--green)', color: '#fff', border: 'none',
              borderRadius: 12, padding: '14px 28px',
              fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 15, cursor: 'pointer',
            }}
          >
            Get My Referral Link <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <section style={{
        padding: 'clamp(40px, 6vw, 72px) clamp(20px, 5vw, 80px)',
        background: 'var(--surface-alt, var(--surface))',
        borderTop: '1px solid var(--border)',
      }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <h2 style={{ ...sectionHeading, marginBottom: 32 }}>Frequently Asked Questions</h2>
          {FAQ_ITEMS.map(({ q, a }) => <FaqItem key={q} q={q} a={a} />)}
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer style={{ padding: 'clamp(32px, 5vw, 56px) clamp(20px, 5vw, 80px)', borderTop: '1px solid var(--border)' }}>
        <div style={{
          maxWidth: 1000, margin: '0 auto',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 32,
        }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text-1)', marginBottom: 8 }}>CityOnChain</div>
            <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, margin: 0 }}>Digital city ownership, powered by USDC on Arc.</p>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Explore</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Explore Cities', page: 'explore' },
                { label: 'Marketplace',    page: 'marketplace' },
                { label: 'Bridge USDC',    page: 'bridge' },
                { label: 'Income Calculator', page: 'calculator' },
                { label: 'Leaderboard',    page: 'leaderboards' },
              ].map(({ label, page }) => (
                <button
                  key={label}
                  onClick={() => window.dispatchEvent(new CustomEvent('cityonchain:goto', { detail: page }))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Legal</div>
            <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.7, margin: 0 }}>
              CityOnChain is not affiliated with any real city, government, or municipality. City names are geographic identifiers only. All transactions are on-chain and irreversible. USDC is a regulated stablecoin issued by Circle. Participation involves financial risk. Past earnings do not guarantee future returns.
            </p>
          </div>
        </div>
        <div style={{ maxWidth: 1000, margin: '32px auto 0', paddingTop: 20, borderTop: '1px solid var(--border)', textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>
          © {new Date().getFullYear()} CityOnChain. Built on Arc, powered by USDC.
        </div>
      </footer>

    </div>
  );
}
