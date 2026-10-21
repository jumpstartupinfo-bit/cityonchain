/**
 * profileUtils — sanitize, blocklist, HTTPS validator, JSON codec for CityProfile.
 * All output must be rendered as plain text — no HTML, no markdown interpretation.
 */

// ── Approved banner colour palettes ──────────────────────────────────────────
export const BANNER_PALETTES: Record<string, { bg: string; text: string; label: string }> = {
  forest:   { bg: '#1a3a2a', text: '#d4edda', label: 'Forest' },
  ocean:    { bg: '#0d2137', text: '#cce7f5', label: 'Ocean' },
  sand:     { bg: '#3d2e1e', text: '#f5e6cc', label: 'Sand' },
  slate:    { bg: '#1e2533', text: '#dce3f0', label: 'Slate' },
  terracotta: { bg: '#3a1a0d', text: '#f5d4c0', label: 'Terracotta' },
  sage:     { bg: '#1e2e20', text: '#d0e8d4', label: 'Sage' },
};
export const DEFAULT_PALETTE = 'forest';

// ── Blocklist ────────────────────────────────────────────────────────────────
// Offensive terms, hate terms, major brands, government/religious institutions.
// Lowercase match; do not log matched terms.
const BLOCKED_PATTERNS: RegExp[] = [
  // Slurs and hate terms (abbreviated — extend as needed)
  /\bn[i1]gg[ae3]r/i, /\bfagg[o0]t/i, /\bch[i1]nk/i, /\bsp[i1]c/i, /\bk[i1]ke/i,
  // Major brands (do not imply endorsement)
  /\bapple\b/i, /\bgoogle\b/i, /\bmicrosoft\b/i, /\bamazon\b/i, /\bmeta\b/i,
  /\bfacebook\b/i, /\binstagram\b/i, /\btiktok\b/i, /\btwitter\b/i, /\bx\.com/i,
  /\bvisa\b/i, /\bmastercard\b/i, /\bpaypal\b/i, /\bcoca.?cola\b/i, /\bpepsi\b/i,
  // Government/political institutions
  /\bwhite\s+house\b/i, /\b(un|united\s+nations)\b/i, /\bnato\b/i,
  /\bcentral\s+(intelligence|bank)\b/i, /\b(fbi|cia|nsa|dhs)\b/i,
  // Religious institutions
  /\bvat[i1]can\b/i, /\bpope\b/i, /\balqaeda\b/i, /\bisil\b/i, /\bis[i1]s\b/i,
  // Explicit/adult
  /\bp[o0]rn/i, /\bxxx/i, /\bes[c]ort\b/i,
];

export function isBlocked(text: string): boolean {
  return BLOCKED_PATTERNS.some((p) => p.test(text));
}

// ── Plain-text sanitiser ─────────────────────────────────────────────────────
// Strips all HTML tags and control chars. Output is safe for React {text} interpolation.
export function sanitizeText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')           // strip HTML tags
    .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '') // strip control chars
    .trim();
}

// ── HTTPS-only link validator ────────────────────────────────────────────────
export function validateHttpsLink(raw: string): string | null {
  if (!raw.trim()) return null; // empty is allowed (optional field)
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:') return null;
    if (url.hostname.length < 3) return null;
    return url.href;
  } catch {
    return null;
  }
}

// ── Profile JSON shape ───────────────────────────────────────────────────────
export interface ProfileData {
  headline: string;       // max 80 chars
  tagline: string;        // max 100 chars
  welcome: string;        // max 200 chars
  story: string;          // max 600 chars (city) / 300 chars (district)
  palette: string;        // key from BANNER_PALETTES
  link1: string;          // https only
  link2: string;          // https only
  logo: string;           // https or ipfs:// reference only
  banner: string;         // https or ipfs:// reference only
}

export const EMPTY_PROFILE: ProfileData = {
  headline: '', tagline: '', welcome: '', story: '',
  palette: DEFAULT_PALETTE, link1: '', link2: '', logo: '', banner: '',
};

// ── IPFS or HTTPS media reference validator ───────────────────────────────────
export function validateMediaRef(raw: string): string | null {
  if (!raw.trim()) return null;
  const s = raw.trim();
  if (s.startsWith('ipfs://') && s.length > 12) return s;
  return validateHttpsLink(s);
}

// ── Field limits ─────────────────────────────────────────────────────────────
export const FIELD_LIMITS = {
  headline: 80,
  tagline: 100,
  welcome: 200,
  storyCity: 600,
  storyDistrict: 300,
  link: 200,
  media: 200,
};

// ── Encode to JSON (returns null if >1000 bytes or blocked or invalid) ────────
export type EncodeResult = { ok: true; json: string } | { ok: false; error: string };
export function encodeProfile(p: ProfileData, isDistrict: boolean): EncodeResult {
  // Sanitise all text fields
  const clean: ProfileData = {
    headline: sanitizeText(p.headline).slice(0, FIELD_LIMITS.headline),
    tagline:  sanitizeText(p.tagline).slice(0, FIELD_LIMITS.tagline),
    welcome:  sanitizeText(p.welcome).slice(0, FIELD_LIMITS.welcome),
    story:    sanitizeText(p.story).slice(0, isDistrict ? FIELD_LIMITS.storyDistrict : FIELD_LIMITS.storyCity),
    palette:  BANNER_PALETTES[p.palette] ? p.palette : DEFAULT_PALETTE,
    link1: '', link2: '', logo: '', banner: '',
  };

  // Blocklist check on all text fields
  const textFields: (keyof ProfileData)[] = ['headline', 'tagline', 'welcome', 'story'];
  for (const f of textFields) {
    if (isBlocked(clean[f])) return { ok: false, error: `Field "${f}" contains disallowed content.` };
  }

  // Link validation
  const l1 = validateHttpsLink(p.link1);
  if (p.link1.trim() && l1 === null) return { ok: false, error: 'link1 must be a valid https URL.' };
  clean.link1 = l1 ?? '';

  const l2 = validateHttpsLink(p.link2);
  if (p.link2.trim() && l2 === null) return { ok: false, error: 'link2 must be a valid https URL.' };
  clean.link2 = l2 ?? '';

  // Media reference validation
  const logo = validateMediaRef(p.logo);
  if (p.logo.trim() && logo === null) return { ok: false, error: 'Logo must be an https or ipfs:// reference.' };
  clean.logo = logo ?? '';

  const banner = validateMediaRef(p.banner);
  if (p.banner.trim() && banner === null) return { ok: false, error: 'Banner must be an https or ipfs:// reference.' };
  clean.banner = banner ?? '';

  // Drop empty fields to save bytes
  const compact: Partial<ProfileData> = {};
  for (const [k, v] of Object.entries(clean) as [keyof ProfileData, string][]) {
    if (v && v !== DEFAULT_PALETTE) (compact as Record<string, string>)[k] = v;
    if (k === 'palette' && v !== DEFAULT_PALETTE) (compact as Record<string, string>)[k] = v;
  }

  const json = JSON.stringify(compact);
  const byteLen = new TextEncoder().encode(json).length;
  if (byteLen > 1000) return { ok: false, error: `Profile is ${byteLen} bytes; must be under 1,000.` };

  return { ok: true, json };
}

// ── Decode from JSON string (safe — returns EMPTY_PROFILE on failure) ─────────
export function decodeProfile(json: string): ProfileData {
  try {
    const raw = JSON.parse(json) as Partial<ProfileData>;
    return {
      headline: sanitizeText(raw.headline ?? '').slice(0, FIELD_LIMITS.headline),
      tagline:  sanitizeText(raw.tagline ?? '').slice(0, FIELD_LIMITS.tagline),
      welcome:  sanitizeText(raw.welcome ?? '').slice(0, FIELD_LIMITS.welcome),
      story:    sanitizeText(raw.story ?? '').slice(0, FIELD_LIMITS.storyCity),
      palette:  BANNER_PALETTES[raw.palette ?? ''] ? (raw.palette ?? DEFAULT_PALETTE) : DEFAULT_PALETTE,
      link1:    validateHttpsLink(raw.link1 ?? '') ?? '',
      link2:    validateHttpsLink(raw.link2 ?? '') ?? '',
      logo:     validateMediaRef(raw.logo ?? '') ?? '',
      banner:   validateMediaRef(raw.banner ?? '') ?? '',
    };
  } catch {
    return { ...EMPTY_PROFILE };
  }
}
