import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { WalletPill, WalletSheetRow } from './MobileWalletConnect';
import {
  Globe, ShoppingBag, LayoutDashboard, Trophy,
  Shield, Settings, Zap, Calculator, ArrowLeftRight, X, ChevronRight,
  type LucideProps,
} from 'lucide-react';
import { ADMIN_ADDRESS } from '../contracts';

type Page = 'home' | 'explore' | 'marketplace' | 'myassets' | 'city' | 'admin' | 'leaderboards' | 'about-data' | 'setup' | 'calculator' | 'bridge';

interface NavProps { page: Page; onNav: (p: Page) => void; }

type LucideIcon = React.FC<LucideProps>;

const BOTTOM_TABS: { id: Page; icon: LucideIcon; label: string }[] = [
  { id: 'explore',      icon: Globe,           label: 'Explore'    },
  { id: 'marketplace',  icon: ShoppingBag,     label: 'Market'     },
  { id: 'myassets',     icon: LayoutDashboard, label: 'My Assets'  },
  { id: 'leaderboards', icon: Trophy,          label: 'Leaders'    },
  { id: 'bridge',       icon: ArrowLeftRight,  label: 'Bridge'     },
];

const DESKTOP_LINKS: { id: Page; icon: LucideIcon; label: string }[] = [
  { id: 'explore',      icon: Globe,           label: 'Explore'     },
  { id: 'marketplace',  icon: ShoppingBag,     label: 'Marketplace' },
  { id: 'myassets',     icon: LayoutDashboard, label: 'My Assets'   },
  { id: 'leaderboards', icon: Trophy,          label: 'Leaderboard' },
  { id: 'bridge',       icon: ArrowLeftRight,  label: 'Bridge'      },
  { id: 'calculator',   icon: Calculator,      label: 'Calculator'  },
];

export function Nav({ page, onNav }: NavProps) {
  const { address } = useAccount();
  const isAdmin = address?.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      {/* ─── Desktop nav ─────────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 200,
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(45,122,58,0.12)',
      }} className="nav-float">
        <div style={{
          maxWidth: 1280, margin: '0 auto', padding: '0 20px',
          height: 60, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {/* Logo */}
          <button
            onClick={() => onNav('home')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '4px 10px 4px 0', marginRight: 4,
            }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'var(--green)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px var(--green-glow)',
            }}>
              <Zap size={17} color="#fff" fill="#fff" />
            </div>
            <span className="display" style={{
              color: 'var(--ink)', fontSize: 17, fontWeight: 700,
              letterSpacing: '-0.02em',
            }}>
              CityOnChain
            </span>
          </button>

          {/* Desktop nav links */}
          <div style={{ display: 'flex', gap: 2, flex: 1 }} className="hidden-mobile">
            {DESKTOP_LINKS.map(({ id, icon: Icon, label }) => (
              <NavBtn key={id} active={page === id} icon={<Icon size={15} />} label={label} onClick={() => onNav(id)} />
            ))}
            {isAdmin && (
              <>
                <NavBtn active={page === 'admin'} icon={<Shield size={15} />} label="Admin" onClick={() => onNav('admin')} admin />
                <NavBtn active={page === 'setup'} icon={<Settings size={15} />} label="Setup" onClick={() => onNav('setup')} admin />
              </>
            )}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Live badge — desktop only */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--green-dim)', borderRadius: 20,
              padding: '4px 12px', border: '1px solid rgba(45,122,58,0.2)',
            }} className="hidden-mobile">
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
              <span style={{ color: 'var(--green)', fontSize: 12, fontWeight: 600 }}>Live</span>
            </div>

            {/* Wallet button */}
            <WalletPill />
          </div>
        </div>
      </nav>

      {/* ─── Mobile bottom tab bar ───────────────────────────────── */}
      <div className="show-mobile" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 300,
        background: 'rgba(255,255,255,0.96)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(45,122,58,0.14)',
        display: 'flex',
        paddingBottom: 'env(safe-area-inset-bottom)',
        boxShadow: '0 -4px 20px rgba(26,46,26,0.10)',
      }}>
        {BOTTOM_TABS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => onNav(id)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 3, padding: '10px 4px 8px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: (page === id || (id === 'explore' && page === 'home')) ? 'var(--green)' : 'var(--subtle)',
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: (page === id || (id === 'explore' && page === 'home')) ? 600 : 400, fontSize: 10,
              minHeight: 56, transition: 'color 0.12s',
              position: 'relative',
            }}
          >
            {(page === id || (id === 'explore' && page === 'home')) && (
              <span style={{
                position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                width: 24, height: 3, borderRadius: 2, background: 'var(--green)',
              }} />
            )}
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}

        {/* "More" tab for Calculator + Admin + Setup */}
        <button
          onClick={() => setMoreOpen(v => !v)}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 3, padding: '10px 4px 8px',
            background: 'none', border: 'none', cursor: 'pointer',
            color: (['calculator', 'admin', 'setup'] as Page[]).includes(page) ? 'var(--green)' : 'var(--subtle)',
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 400, fontSize: 10,
            minHeight: 56, transition: 'color 0.12s',
          }}
        >
          <Calculator size={20} />
          <span>More</span>
        </button>
      </div>

      {/* ─── Mobile "More" sheet ─────────────────────────────────── */}
      {moreOpen && (
        <>
          <div
            onClick={() => setMoreOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 350,
              background: 'rgba(17,28,17,0.45)',
              backdropFilter: 'blur(2px)',
            }}
          />
          <div style={{
            position: 'fixed', bottom: 'calc(56px + env(safe-area-inset-bottom))', left: 0, right: 0,
            zIndex: 360,
            background: 'rgba(255,255,255,0.98)',
            borderRadius: '20px 20px 0 0',
            padding: '16px 16px 8px',
            boxShadow: '0 -8px 40px rgba(26,46,26,0.18)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', fontFamily: "'Space Grotesk', sans-serif" }}>More</span>
              <button onClick={() => setMoreOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X size={18} color="var(--muted)" />
              </button>
            </div>

            {([
              { id: 'calculator', icon: Calculator as LucideIcon, label: 'Income Calculator', sub: 'Estimate your earnings' },
              { id: 'bridge', icon: ArrowLeftRight as LucideIcon, label: 'Bridge USDC', sub: 'Move USDC to Arc' },
            ] as { id: Page; icon: LucideIcon; label: string; sub: string }[]).map(({ id, icon: Icon, label, sub }) => (
              <button
                key={id}
                onClick={() => { onNav(id); setMoreOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                  background: page === id ? 'var(--green-dim)' : 'var(--bg-alt)',
                  border: 'none', borderRadius: 14, padding: '14px 16px',
                  cursor: 'pointer', marginBottom: 8, textAlign: 'left',
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: page === id ? 'var(--green)' : 'rgba(45,122,58,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={18} color={page === id ? '#fff' : 'var(--green)'} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: 'var(--ink)', fontFamily: "'DM Sans', sans-serif" }}>{label}</p>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', fontFamily: "'DM Sans', sans-serif" }}>{sub}</p>
                </div>
                <ChevronRight size={16} color="var(--subtle)" />
              </button>
            ))}

            {isAdmin && (
              <>
                <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                {([
                  { id: 'admin', icon: Shield as LucideIcon, label: 'Admin Dashboard', sub: 'Platform management' },
                  { id: 'setup', icon: Settings as LucideIcon, label: 'Contract Setup', sub: 'Wire contracts' },
                ] as { id: Page; icon: LucideIcon; label: string; sub: string }[]).map(({ id, icon: Icon, label, sub }) => (
                  <button
                    key={id}
                    onClick={() => { onNav(id); setMoreOpen(false); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                      background: page === id ? 'rgba(200,146,42,0.10)' : 'var(--bg-alt)',
                      border: 'none', borderRadius: 14, padding: '14px 16px',
                      cursor: 'pointer', marginBottom: 8, textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                      background: 'rgba(200,146,42,0.12)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={18} color="var(--accent)" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: 'var(--ink)', fontFamily: "'DM Sans', sans-serif" }}>{label}</p>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', fontFamily: "'DM Sans', sans-serif" }}>{sub}</p>
                    </div>
                    <ChevronRight size={16} color="var(--subtle)" />
                  </button>
                ))}
              </>
            )}

            {/* Wallet connect inside sheet */}
            <div style={{ marginTop: 8 }}>
              <WalletSheetRow page={page} />
            </div>
          </div>
        </>
      )}

      {/* ─── Responsive helpers ───────────────────────────────────── */}
      <style>{`
        @media (max-width: 720px) {
          .hidden-mobile { display: none !important; }
          .show-mobile   { display: flex !important; }
          /* Push page content above bottom tab bar */
          #root > div > *:not(nav):not(.mobile-bottom-nav) {
            padding-bottom: calc(56px + env(safe-area-inset-bottom));
          }
        }
        @media (min-width: 721px) {
          .show-mobile { display: none !important; }
        }
      `}</style>
    </>
  );
}

function NavBtn({ active, icon, label, onClick, admin }: {
  active: boolean; icon: React.ReactNode; label: string; onClick: () => void; admin?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 14px', borderRadius: 20, border: 'none',
        background: active ? (admin ? 'rgba(200,146,42,0.12)' : 'var(--green-dim)') : 'none',
        color: active
          ? (admin ? 'var(--accent)' : 'var(--green)')
          : (admin ? 'var(--accent-light)' : 'var(--muted)'),
        fontFamily: "'DM Sans', sans-serif",
        fontWeight: active ? 600 : 500, fontSize: 14,
        cursor: 'pointer', transition: 'all 0.12s', minHeight: 44,
      }}
    >
      {icon}{label}
    </button>
  );
}
