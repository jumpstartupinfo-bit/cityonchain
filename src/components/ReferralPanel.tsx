/**
 * ReferralPanel — shown in MyAssets.
 *
 * States:
 *  1. Not registered + ?ref= present in URL  → "You were referred by 0x…" + Register button
 *  2. Not registered + no ?ref=              → "Share your link to earn commissions" + copy link
 *  3. Registered + pending == 0              → summary card (referrer, share link)
 *  4. Registered + pending > 0              → green banner + Claim button
 */
import React, { useEffect, useState } from 'react';
import { Gift, Copy, CheckCircle, ExternalLink, Loader2, Users } from 'lucide-react';
import { useReferral } from '../lib/useReferral';
import { Amount, usdcDecimalsFor } from '@/onchain-money';
import { buildTxExplorerUrl } from '@/onchain-facts';
import { CHAIN_ID } from '../contracts';
import { toast } from 'sonner';

function shortAddr(addr: string) {
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

const ZERO = '0x0000000000000000000000000000000000000000';

export function ReferralPanel({ walletAddress }: { walletAddress: string }) {
  const decimals = usdcDecimalsFor(CHAIN_ID);
  const {
    isRegistered,
    myReferrer,
    pendingAmount,
    refetchPending,
    refetchReg,
    register,
    registerHash,
    registerPending,
    registerConfirming,
    registerSuccess,
    claim,
    claimHash,
    claimPending,
    claimConfirming,
    claimSuccess,
  } = useReferral();

  // Read ?ref= from URL or localStorage (persisted on first visit)
  const urlRef = new URLSearchParams(window.location.search).get('ref');
  const storedRef = localStorage.getItem('cityonchain:ref');
  const rawRef = urlRef ?? storedRef;
  const validRef = rawRef && /^0x[0-9a-fA-F]{40}$/.test(rawRef) ? rawRef as `0x${string}` : null;

  const [copied, setCopied] = useState(false);

  // Referral share link for this wallet
  const shareLink = `${window.location.origin}${window.location.pathname}?ref=${walletAddress}`;

  function copyLink() {
    void navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Toast on success
  useEffect(() => {
    if (registerSuccess) {
      toast.success('Referrer registered! You are now in the referral program.');
      void refetchReg();
    }
  }, [registerSuccess, refetchReg]);

  useEffect(() => {
    if (claimSuccess) {
      toast.success('Commission claimed!');
      void refetchPending();
    }
  }, [claimSuccess, refetchPending]);

  const hasReferrer = myReferrer && myReferrer !== ZERO;
  const hasPending  = pendingAmount > 0n;

  // ── Claim banner (registered + pending > 0) ────────────────────────────────
  if (isRegistered && hasPending) {
    return (
      <div style={{
        background: 'var(--surface)',
        border: '1.5px solid var(--green)',
        borderRadius: 16, padding: 20, marginBottom: 28,
        boxShadow: '0 4px 20px var(--green-glow)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Gift size={18} color="var(--green)" />
          <span className="display" style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 16 }}>Referral Commission</span>
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
          You have earned referral commissions from purchases made by wallets you referred.
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div className="display" style={{ color: 'var(--green)', fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', flex: 1 }}>
            ${Amount.fromRaw(pendingAmount, decimals).toFixed(2)}
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)', marginLeft: 6 }}>USDC</span>
          </div>
          <button
            onClick={claim}
            disabled={claimPending || claimConfirming}
            style={{
              padding: '10px 24px', borderRadius: 10, border: 'none',
              background: 'var(--green)', color: '#fff',
              fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14,
              cursor: claimPending || claimConfirming ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: claimPending || claimConfirming ? 0.7 : 1,
              boxShadow: '0 2px 12px var(--green-glow)',
            }}
          >
            {(claimPending || claimConfirming) && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
            {claimPending ? 'Waiting…' : claimConfirming ? 'Confirming…' : 'Claim Commission'}
          </button>
        </div>

        {claimHash && (
          <a href={buildTxExplorerUrl(CHAIN_ID, claimHash)} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--green)', fontSize: 11, textDecoration: 'none', marginTop: 10 }}>
            <ExternalLink size={11} /> View tx
          </a>
        )}

        <ShareRow link={shareLink} copied={copied} onCopy={copyLink} />
      </div>
    );
  }

  // ── Registered, no pending ─────────────────────────────────────────────────
  if (isRegistered) {
    return (
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 20, marginBottom: 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Users size={16} color="var(--green)" />
          <span className="display" style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 15 }}>Referral Program</span>
          <span style={{ marginLeft: 'auto', background: 'rgba(34,197,94,0.12)', color: 'var(--green)', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>Active</span>
        </div>
        {hasReferrer && (
          <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>
            Referred by <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--ink)', fontSize: 12 }}>{shortAddr(myReferrer)}</span>
          </div>
        )}
        <div style={{ color: 'var(--subtle)', fontSize: 13, marginBottom: 14 }}>
          You earn 20% commission on L1 purchases and 10% on L2. Commission accumulates and can be claimed any time.
        </div>
        <ShareRow link={shareLink} copied={copied} onCopy={copyLink} />
      </div>
    );
  }

  // ── Not registered + ?ref= present → prompt to register ───────────────────
  if (!isRegistered && validRef && validRef.toLowerCase() !== walletAddress.toLowerCase()) {
    return (
      <div style={{
        background: 'var(--surface)', border: '1.5px solid var(--accent)',
        borderRadius: 16, padding: 20, marginBottom: 28,
        boxShadow: '0 4px 20px rgba(246,195,71,0.12)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Gift size={18} color="var(--accent)" />
          <span className="display" style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 15 }}>You were referred</span>
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
          Referred by <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--ink)', fontSize: 12 }}>{shortAddr(validRef)}</span>.
          Register now to activate the referral link — one-time, permanent, and free (gas only).
        </div>

        <button
          onClick={() => register(validRef)}
          disabled={registerPending || registerConfirming}
          style={{
            padding: '10px 24px', borderRadius: 10, border: 'none',
            background: 'var(--accent)', color: '#080f1c',
            fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14,
            cursor: registerPending || registerConfirming ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            opacity: registerPending || registerConfirming ? 0.7 : 1,
          }}
        >
          {(registerPending || registerConfirming) && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
          {registerPending ? 'Waiting for wallet…' : registerConfirming ? 'Confirming…' : 'Activate Referral Link'}
        </button>

        {registerHash && (
          <a href={buildTxExplorerUrl(CHAIN_ID, registerHash)} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent)', fontSize: 11, textDecoration: 'none', marginTop: 10 }}>
            <ExternalLink size={11} /> View tx
          </a>
        )}
      </div>
    );
  }

  // ── Not registered, no ref param → share link to start earning ────────────
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 16, padding: 20, marginBottom: 28,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Users size={16} color="var(--muted)" />
        <span className="display" style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 15 }}>Referral Program</span>
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 14 }}>
        Share your referral link. Earn 20% when someone you referred buys a city or district, and 10% on their referrals.
        No registration needed — just share and start earning.
      </div>
      <ShareRow link={shareLink} copied={copied} onCopy={copyLink} />
    </div>
  );
}

// ── Shared share-link row ──────────────────────────────────────────────────────
function ShareRow({ link, copied, onCopy }: { link: string; copied: boolean; onCopy: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
      <div style={{
        flex: 1, minWidth: 0,
        background: 'var(--surface-strong)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '8px 12px',
        fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
        color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {link}
      </div>
      <button
        onClick={onCopy}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)',
          background: copied ? 'rgba(34,197,94,0.1)' : 'var(--surface-strong)',
          color: copied ? 'var(--green)' : 'var(--ink)',
          fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13,
          cursor: 'pointer', flexShrink: 0,
          transition: 'background 0.15s, color 0.15s',
        }}
      >
        {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
        {copied ? 'Copied!' : 'Copy link'}
      </button>
    </div>
  );
}
