/**
 * ProfileDisplay — renders owner profile or generated baseline.
 * All text rendered as PLAIN TEXT via React children (no dangerouslySetInnerHTML).
 * Links open with rel="noopener noreferrer nofollow".
 */
import React from 'react';
import { ExternalLink, Flag, Info, Pencil } from 'lucide-react';
import type { ProfileData } from '../lib/profileUtils';
import { BANNER_PALETTES, DEFAULT_PALETTE } from '../lib/profileUtils';
import type { ProfileHistoryEntry } from '../lib/useCityProfile';

// ── Types ────────────────────────────────────────────────────────────────────
interface GeneratedIdentity {
  headline: string;
  tagline: string;
  welcome: string;
  story: string;
}

interface ProfileDisplayProps {
  // Owner profile from chain (null = not set / cleared / hidden)
  profile: ProfileData | null;
  isHidden: boolean;
  version: number;
  // Generated baseline (always shown if no owner content for that field)
  generated: GeneratedIdentity;
  // Whether the viewing wallet is the owner
  isOwner: boolean;
  history: ProfileHistoryEntry[];
  onEditClick: () => void;
  onReportClick: () => void;
  entityType: 'city' | 'district';
  entityName: string;
}

// ── Safe link component ───────────────────────────────────────────────────────
function SafeLink({ href, label }: { href: string; label: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        color: 'var(--green)', fontSize: 13, fontWeight: 500,
        textDecoration: 'none',
      }}
    >
      {label} <ExternalLink size={11} />
    </a>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function ProfileDisplay({
  profile, isHidden, version, generated,
  isOwner, history, onEditClick, onReportClick,
  entityType, entityName,
}: ProfileDisplayProps) {
  const [showHistory, setShowHistory] = React.useState(false);

  const pal = profile && !isHidden
    ? (BANNER_PALETTES[profile.palette] ?? BANNER_PALETTES[DEFAULT_PALETTE])
    : null;

  // Per-field: use owner value if non-empty and not hidden, else fall back to generated
  const headline = (profile && !isHidden && profile.headline) ? profile.headline : generated.headline;
  const tagline  = (profile && !isHidden && profile.tagline)  ? profile.tagline  : generated.tagline;
  const welcome  = (profile && !isHidden && profile.welcome)  ? profile.welcome  : generated.welcome;
  const story    = (profile && !isHidden && profile.story)    ? profile.story    : generated.story;
  const ownerContent = !!(profile && !isHidden && (profile.headline || profile.tagline || profile.story));

  return (
    <div style={{ marginBottom: 24 }}>

      {/* Banner colour strip */}
      {pal && (
        <div style={{
          background: pal.bg, borderRadius: '12px 12px 0 0',
          padding: '16px 20px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {profile?.logo && (
                <img
                  src={profile.logo}
                  alt=""
                  style={{ height: 36, borderRadius: 6, marginBottom: 8, display: 'block', objectFit: 'contain' }}
                  onError={(e) => { (e.currentTarget).style.display = 'none'; }}
                />
              )}
              <h2 style={{
                color: pal.text, margin: 0,
                fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em',
                fontFamily: "'Space Grotesk', sans-serif",
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {headline}
              </h2>
              {tagline && (
                <p style={{ color: pal.text, opacity: 0.75, margin: '4px 0 0', fontSize: 13 }}>
                  {tagline}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {isOwner && (
                <button
                  onClick={onEditClick}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
                    color: pal.text, borderRadius: 8, padding: '6px 12px',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  <Pencil size={11} /> Edit brand
                </button>
              )}
              <button
                onClick={onReportClick}
                title="Report this content"
                style={{
                  display: 'flex', alignItems: 'center',
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                  color: pal.text, opacity: 0.6, borderRadius: 8, padding: '6px 10px',
                  fontSize: 12, cursor: 'pointer',
                }}
              >
                <Flag size={11} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderTop: pal ? 'none' : undefined,
        borderRadius: pal ? '0 0 12px 12px' : 12,
        padding: '16px 20px',
      }}>

        {/* Edit brand button when no palette set */}
        {!pal && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{
              color: 'var(--ink)', margin: 0, fontSize: 20, fontWeight: 800,
              letterSpacing: '-0.02em', fontFamily: "'Space Grotesk', sans-serif",
            }}>
              {headline}
            </h2>
            <div style={{ display: 'flex', gap: 6 }}>
              {isOwner && (
                <button
                  onClick={onEditClick}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: 'var(--green-dim)', border: '1px solid rgba(45,122,58,0.25)',
                    color: 'var(--green)', borderRadius: 8, padding: '6px 12px',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  <Pencil size={11} /> Edit brand
                </button>
              )}
              <button
                onClick={onReportClick}
                title="Report this content"
                style={{
                  display: 'flex', alignItems: 'center',
                  background: 'var(--surface-strong)', border: '1px solid var(--border)',
                  color: 'var(--muted)', borderRadius: 8, padding: '6px 10px',
                  fontSize: 12, cursor: 'pointer',
                }}
              >
                <Flag size={11} />
              </button>
            </div>
          </div>
        )}

        {tagline && !pal && (
          <p style={{ color: 'var(--muted)', margin: '0 0 12px', fontSize: 13 }}>{tagline}</p>
        )}

        {welcome && (
          <p style={{ color: 'var(--ink)', margin: '0 0 10px', fontSize: 14, lineHeight: 1.6 }}>{welcome}</p>
        )}

        {story && (
          <p style={{
            color: 'var(--ink)', margin: '0 0 12px', fontSize: 13, lineHeight: 1.7,
            maxWidth: '65ch', textWrap: 'pretty' as React.CSSProperties['textWrap'],
          }}>
            {story}
          </p>
        )}

        {/* Links */}
        {profile && !isHidden && (profile.link1 || profile.link2) && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
            {profile.link1 && <SafeLink href={profile.link1} label="Website" />}
            {profile.link2 && <SafeLink href={profile.link2} label="More info" />}
          </div>
        )}

        {/* Owner attribution */}
        {ownerContent && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 10,
            padding: '6px 10px', borderRadius: 6,
            background: 'var(--green-dim)', border: '1px solid rgba(45,122,58,0.15)',
          }}>
            <Info size={11} color="var(--green)" />
            <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 500 }}>
              Written by the owner · v{version}
            </span>
          </div>
        )}

        {/* Disclaimer */}
        <p style={{ color: 'var(--muted)', fontSize: 10, margin: '10px 0 0', fontStyle: 'italic' }}>
          Not affiliated with any real {entityType === 'city' ? 'city' : 'organisation'} or government.
          Content displayed here is owner-submitted and does not represent any official entity.
        </p>

        {/* History toggle (owner only) */}
        {isOwner && history.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => setShowHistory((s) => !s)}
              style={{
                background: 'none', border: 'none', color: 'var(--muted)',
                fontSize: 11, cursor: 'pointer', padding: 0, textDecoration: 'underline',
              }}
            >
              {showHistory ? 'Hide history' : `Show history (${history.length} versions)`}
            </button>
            {showHistory && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[...history].reverse().map((entry, i) => (
                  <div key={i} style={{
                    background: 'var(--surface-strong)', borderRadius: 8,
                    padding: '8px 12px', fontSize: 11, color: 'var(--muted)',
                  }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>
                      {entry.content ? `v${entry.version} — ${entry.profile.headline || entityName}` : 'Cleared'}
                    </div>
                    <div>
                      Block {entry.blockNumber.toString()} ·{' '}
                      {entry.txHash && (
                        <a
                          href={`https://explorer.testnet.arc.io/tx/${entry.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          style={{ color: 'var(--green)', textDecoration: 'none' }}
                        >
                          tx ↗
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Report modal ─────────────────────────────────────────────────────────────
interface ReportModalProps {
  entityType: 'city' | 'district';
  entityName: string;
  nft: string;
  tokenId: bigint;
  onClose: () => void;
}

export function ReportModal({ entityType, entityName, nft, tokenId, onClose }: ReportModalProps) {
  const [reason, setReason] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);

  function handleSubmit() {
    // Store report in localStorage for admin review
    const reports = JSON.parse(localStorage.getItem('cityonchain:reports') ?? '[]') as object[];
    reports.push({
      ts: Date.now(),
      entityType,
      entityName,
      nft,
      tokenId: tokenId.toString(),
      reason: reason.trim().slice(0, 500),
    });
    localStorage.setItem('cityonchain:reports', JSON.stringify(reports.slice(-200)));
    setSubmitted(true);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 16,
        padding: 24, maxWidth: 420, width: '100%',
        boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
        border: '1px solid var(--border)',
      }}>
        <h3 style={{ margin: '0 0 4px', color: 'var(--ink)', fontFamily: "'Space Grotesk', sans-serif", fontSize: 18 }}>
          Report content
        </h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 16px' }}>
          {entityName} · {entityType}
        </p>

        {submitted ? (
          <>
            <p style={{ color: 'var(--green)', fontWeight: 600, margin: '0 0 16px' }}>
              Report submitted. Thank you.
            </p>
            <button onClick={onClose} style={{
              background: 'var(--green)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 20px', cursor: 'pointer',
              fontWeight: 600, fontSize: 14,
            }}>
              Close
            </button>
          </>
        ) : (
          <>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the issue (optional)"
              maxLength={500}
              rows={4}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'var(--surface-strong)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 12px', color: 'var(--ink)',
                fontSize: 13, resize: 'vertical', fontFamily: "'DM Sans', sans-serif",
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={handleSubmit} style={{
                flex: 1, background: '#ef4444', color: '#fff', border: 'none',
                borderRadius: 8, padding: '10px 0', cursor: 'pointer',
                fontWeight: 600, fontSize: 14, minHeight: 44,
              }}>
                Submit report
              </button>
              <button onClick={onClose} style={{
                flex: 1, background: 'var(--surface-strong)', border: '1px solid var(--border)',
                color: 'var(--muted)', borderRadius: 8, padding: '10px 0',
                cursor: 'pointer', fontSize: 14, minHeight: 44,
              }}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
