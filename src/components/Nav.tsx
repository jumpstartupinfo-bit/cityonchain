import React, { useState } from 'react';
import { ConnectKitButton } from 'connectkit';
import { useAccount } from 'wagmi';
import { Globe, ShoppingBag, LayoutDashboard, Trophy, Shield, Settings, Menu, X, Zap, Calculator, ArrowLeftRight } from 'lucide-react';
import { ADMIN_ADDRESS } from '../contracts';

type Page = 'world' | 'marketplace' | 'myassets' | 'city' | 'admin' | 'leaderboards' | 'about-data' | 'setup' | 'calculator' | 'bridge';

interface NavProps { page: Page; onNav: (p: Page) => void; }

const NAV_LINKS = [
  { id: 'world'        as Page, icon: Globe,          label: 'World'       },
  { id: 'marketplace'  as Page, icon: ShoppingBag,     label: 'Marketplace' },
  { id: 'myassets'     as Page, icon: LayoutDashboard, label: 'My Assets'   },
  { id: 'leaderboards' as Page, icon: Trophy,          label: 'Leaderboard' },
  { id: 'bridge'       as Page, icon: ArrowLeftRight,  label: 'Bridge'      },
  { id: 'calculator'   as Page, icon: Calculator,      label: 'Calculator'  },
];

export function Nav({ page, onNav }: NavProps) {
  const { address } = useAccount();
  const isAdmin = address?.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {/* Desktop + tablet nav */}
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
            onClick={() => onNav('world')}
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

          {/* Nav links — desktop */}
          <div style={{ display: 'flex', gap: 2, flex: 1 }} className="hidden-mobile">
            {NAV_LINKS.map(({ id, icon: Icon, label }) => (
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
            {/* Activity ticker */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--green-dim)', borderRadius: 20,
              padding: '4px 12px', border: '1px solid rgba(45,122,58,0.2)',
            }} className="hidden-mobile">
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
              <span style={{ color: 'var(--green)', fontSize: 12, fontWeight: 600 }}>Live</span>
            </div>

            {/* Wallet button */}
            <ConnectKitButton.Custom>
              {({ isConnected, show, truncatedAddress }) => (
                <button
                  onClick={show}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: isConnected ? 'rgba(255,255,255,0.9)' : 'var(--green)',
                    border: isConnected ? '1.5px solid rgba(45,122,58,0.35)' : 'none',
                    borderRadius: 24,
                    padding: '8px 18px',
                    cursor: 'pointer',
                    color: isConnected ? 'var(--green-dark)' : '#fff',
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 600, fontSize: 14,
                    whiteSpace: 'nowrap',
                    boxShadow: isConnected ? 'none' : '0 2px 12px var(--green-glow)',
                    transition: 'all 0.15s',
                  }}
                >
                  {isConnected ? (
                    <>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
                      {truncatedAddress}
                    </>
                  ) : 'Connect Wallet'}
                </button>
              )}
            </ConnectKitButton.Custom>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMenuOpen(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'none' }}
              className="show-mobile"
            >
              {menuOpen ? <X size={22} color="var(--ink)" /> : <Menu size={22} color="var(--ink)" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div style={{
            borderTop: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.97)',
            padding: '12px 20px 16px',
          }}>
            {NAV_LINKS.map(({ id, icon: Icon, label }) => (
              <button key={id} onClick={() => { onNav(id); setMenuOpen(false); }} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', background: page === id ? 'var(--green-dim)' : 'none',
                border: 'none', borderRadius: 10, padding: '12px 14px',
                color: page === id ? 'var(--green)' : 'var(--ink-2)',
                fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 15,
                cursor: 'pointer', marginBottom: 2,
              }}>
                <Icon size={17} /> {label}
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* Responsive helpers */}
      <style>{`
        @media (max-width: 720px) {
          .hidden-mobile { display: none !important; }
          .show-mobile { display: flex !important; }
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
        cursor: 'pointer', transition: 'all 0.12s', minHeight: 36,
      }}
    >
      {icon}{label}
    </button>
  );
}
