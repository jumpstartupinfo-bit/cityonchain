/**
 * MobileWalletConnect — smart wallet button for mobile browsers.
 *
 * On desktop or inside MetaMask's in-app browser (window.ethereum present):
 *   → calls ConnectKit's show() as normal.
 *
 * On mobile with no injected wallet:
 *   → shows a MetaMask deep link that opens the MetaMask app with the site
 *     pre-loaded, where window.ethereum IS injected and connection works.
 */

import React from 'react';
import { ConnectKitButton } from 'connectkit';
import { useAccount } from 'wagmi';

// Deep link: opens MetaMask mobile and loads cityonchain.app inside its browser
const METAMASK_DEEP_LINK = 'https://metamask.app.link/dapp/cityonchain.app';

function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
}

function hasInjectedWallet(): boolean {
  return typeof window !== 'undefined' && !!(window as { ethereum?: unknown }).ethereum;
}

// ── Pill variant (desktop nav) ─────────────────────────────────────────────
export function WalletPill() {
  const { isConnected } = useAccount();
  const showDeepLink = isMobileBrowser() && !hasInjectedWallet() && !isConnected;

  if (showDeepLink) {
    return (
      <a
        href={METAMASK_DEEP_LINK}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'var(--green)',
          border: 'none', borderRadius: 24,
          padding: '8px 18px',
          color: '#fff',
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 600, fontSize: 14,
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 12px var(--green-glow)',
          textDecoration: 'none',
          minHeight: 44,
        }}
      >
        Open in MetaMask
      </a>
    );
  }

  return (
    <ConnectKitButton.Custom>
      {({ isConnected: ck, show, truncatedAddress }) => (
        <button
          onClick={show}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: ck ? 'rgba(255,255,255,0.9)' : 'var(--green)',
            border: ck ? '1.5px solid rgba(45,122,58,0.35)' : 'none',
            borderRadius: 24,
            padding: '8px 18px',
            cursor: 'pointer',
            color: ck ? 'var(--green-dark)' : '#fff',
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 600, fontSize: 14,
            whiteSpace: 'nowrap',
            boxShadow: ck ? 'none' : '0 2px 12px var(--green-glow)',
            transition: 'all 0.15s',
            minHeight: 44,
          }}
        >
          {ck ? (
            <>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
              {truncatedAddress}
            </>
          ) : 'Connect Wallet'}
        </button>
      )}
    </ConnectKitButton.Custom>
  );
}

// ── Sheet row variant (mobile More sheet) ─────────────────────────────────
interface SheetRowProps {
  page: string; // current page — used to close sheet on tap
}

export function WalletSheetRow(_: SheetRowProps) {
  const { isConnected, address } = useAccount();
  const showDeepLink = isMobileBrowser() && !hasInjectedWallet() && !isConnected;
  const truncated = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';

  const rowStyle: React.CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 14,
    background: 'var(--bg-alt)', border: 'none', borderRadius: 14,
    padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
    textDecoration: 'none',
  };

  const iconBox = (
    <div style={{
      width: 40, height: 40, borderRadius: 12, flexShrink: 0,
      background: isConnected ? 'rgba(34,197,94,0.12)' : 'var(--green)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{
        width: 10, height: 10, borderRadius: '50%',
        background: isConnected ? 'var(--success)' : '#fff',
        display: 'inline-block',
      }} />
    </div>
  );

  const label = isConnected ? truncated : (showDeepLink ? 'Open MetaMask' : 'Connect Wallet');
  const sub   = isConnected ? 'Wallet connected' : (showDeepLink ? 'Tap to open MetaMask app' : 'Tap to connect');

  if (showDeepLink) {
    return (
      <a href={METAMASK_DEEP_LINK} style={rowStyle}>
        {iconBox}
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: 'var(--ink)', fontFamily: "'DM Sans', sans-serif" }}>{label}</p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', fontFamily: "'DM Sans', sans-serif" }}>{sub}</p>
        </div>
      </a>
    );
  }

  return (
    <ConnectKitButton.Custom>
      {({ show }) => (
        <button onClick={show} style={rowStyle}>
          {iconBox}
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: 'var(--ink)', fontFamily: "'DM Sans', sans-serif" }}>{label}</p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', fontFamily: "'DM Sans', sans-serif" }}>{sub}</p>
          </div>
        </button>
      )}
    </ConnectKitButton.Custom>
  );
}
