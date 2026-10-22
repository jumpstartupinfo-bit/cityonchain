import React, { useEffect, useState } from 'react';
import { X, Share, Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const LS_KEY = 'cityonchain_install_dismissed';
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInStandaloneMode = () =>
  ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true) ||
  window.matchMedia('(display-mode: standalone)').matches;

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if already installed or dismissed
    if (isInStandaloneMode()) return;
    if (sessionStorage.getItem(LS_KEY)) return;

    if (isIOS()) {
      // Show iOS hint after 8 seconds on first visit
      const t = setTimeout(() => setShowIOSHint(true), 8000);
      return () => clearTimeout(t);
    }

    // Android/Chrome: listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  function dismiss() {
    sessionStorage.setItem(LS_KEY, '1');
    setVisible(false);
    setShowIOSHint(false);
    setDeferredPrompt(null);
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') dismiss();
    else setVisible(false);
  }

  // Android Chrome install banner
  if (visible && deferredPrompt) {
    return (
      <div style={{
        position: 'fixed', bottom: 72, left: 12, right: 12, zIndex: 999,
        background: 'var(--surface-strong)',
        border: '1px solid var(--border-strong)',
        borderRadius: 16,
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: '0 8px 32px rgba(26,46,26,0.18)',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: 'var(--green)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Download size={20} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>Add to Home Screen</p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Get the full app experience</p>
        </div>
        <button
          onClick={() => { void install(); }}
          style={{
            background: 'var(--green)', color: '#fff', border: 'none',
            borderRadius: 20, padding: '8px 16px',
            fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13,
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          Install
        </button>
        <button onClick={dismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
          <X size={16} color="var(--muted)" />
        </button>
      </div>
    );
  }

  // iOS Safari hint
  if (showIOSHint) {
    return (
      <div style={{
        position: 'fixed', bottom: 72, left: 12, right: 12, zIndex: 999,
        background: 'var(--surface-strong)',
        border: '1px solid var(--border-strong)',
        borderRadius: 16,
        padding: '14px 16px',
        boxShadow: '0 8px 32px rgba(26,46,26,0.18)',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>Add to Home Screen</p>
          <button onClick={dismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: 8 }}>
            <X size={16} color="var(--muted)" />
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
          Tap <Share size={13} style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }} /> then
          <strong> &quot;Add to Home Screen&quot;</strong> for the full app experience.
        </p>
        {/* Arrow pointing down toward Safari toolbar */}
        <div style={{
          position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderTop: '8px solid var(--surface-strong)',
        }} />
      </div>
    );
  }

  return null;
}
