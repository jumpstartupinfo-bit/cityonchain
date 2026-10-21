// USDC money helpers for CityOnChain
// USDC ERC-20 uses 6 decimals on all chains

import { CHAIN_ID, ARC_MAINNET_ID } from './onchain-facts';

/** ERC-20 USDC decimals (6) */
export const USDC_DECIMALS = 6;

/** Native gas token decimals on Arc (18) */
export const NATIVE_DECIMALS = 18;

export function usdcDecimalsFor(_chainId?: number): number {
  return USDC_DECIMALS;
}

/** Format a raw USDC bigint (6 decimals) to a human-readable string */
export function formatUsdc(raw: bigint, decimals = USDC_DECIMALS): string {
  if (raw === 0n) return '0.00';
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 2);
  return `${whole}.${fracStr}`;
}

/** Parse a human-readable USDC string to raw bigint (6 decimals) */
export function parseUsdc(human: string, decimals = USDC_DECIMALS): bigint {
  const [whole = '0', frac = ''] = human.replace(/,/g, '').split('.');
  const fracPadded = frac.slice(0, decimals).padEnd(decimals, '0');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded);
}

/** Amount — carries raw bigint and supports display helpers */
export class Amount {
  readonly raw: bigint;
  readonly decimals: number;

  constructor(raw: bigint, decimals: number) {
    this.raw = raw;
    this.decimals = decimals;
  }

  static fromRaw(raw: bigint, decimals = USDC_DECIMALS): Amount {
    return new Amount(raw, decimals);
  }

  toFixed(dp = 2): string {
    const divisor = 10n ** BigInt(this.decimals);
    const whole = this.raw / divisor;
    const frac = this.raw % divisor;
    const fracStr = frac.toString().padStart(this.decimals, '0').slice(0, dp);
    return `${whole}.${fracStr}`;
  }

  toString(): string {
    return this.toFixed(2);
  }
}

/** Convert native Arc gas token (18 dec) to ERC-20 USDC (6 dec) */
export function gasTokenToUsdc(gasRaw: bigint): bigint {
  return gasRaw / 10n ** 12n;
}

/** Convert ERC-20 USDC (6 dec) to native Arc gas token (18 dec) */
export function usdcToGasToken(usdcRaw: bigint): bigint {
  return usdcRaw * 10n ** 12n;
}

// Active chain check
export const IS_MAINNET = CHAIN_ID === ARC_MAINNET_ID;
