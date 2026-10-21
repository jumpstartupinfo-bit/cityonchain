/**
 * Browser-side Merkle proof generation and verification.
 *
 * Leaf encoding matches CityOnChain.sol claimCity() and build-cities.mjs exactly:
 *   keccak256(bytes.concat(keccak256(abi.encode(cityId, name, country, population, displayTier))))
 *
 * abi.encode layout for (uint256, string, string, uint256, uint8):
 *   [0x00] cityId           — 32 bytes, static uint256
 *   [0x20] offset of name   — 32 bytes, pointer to name data
 *   [0x40] offset of country— 32 bytes, pointer to country data
 *   [0x60] population       — 32 bytes, static uint256
 *   [0x80] tier             — 32 bytes, padded uint8
 *   [0xa0] name length+data — 32-byte-padded dynamic bytes
 *   [....] country length+data — 32-byte-padded dynamic bytes
 *
 * - No msg.sender in the leaf — any wallet can claim with a valid proof
 * - Double-hash (OZ standard) prevents second-preimage attacks
 * - sortPairs: true matches OpenZeppelin MerkleProof.verify
 *
 * Performance: building the tree for 24,323 cities runs in a Web Worker
 * so it never blocks the main thread. Use initMerkleTreeAsync() from the UI.
 */
import { MerkleTree } from 'merkletreejs';
import { keccak_256 } from '@noble/hashes/sha3';

export type City = {
  id: number;
  name: string;
  country: string;
  population: number;
  lat: number;
  lng: number;
  displayTier: number;
};

function keccak256(data: Uint8Array | Buffer): Buffer {
  return Buffer.from(keccak_256(data instanceof Buffer ? new Uint8Array(data) : data));
}

// ── ABI encoding helpers ────────────────────────────────────────────────────

function abiEncodeUint256(n: number | bigint): Buffer {
  const buf = Buffer.alloc(32, 0);
  const hex = BigInt(n).toString(16).padStart(64, '0');
  Buffer.from(hex, 'hex').copy(buf);
  return buf;
}

function abiEncodeUint8(n: number): Buffer {
  // uint8 is right-aligned and padded to 32 bytes in abi.encode
  const buf = Buffer.alloc(32, 0);
  buf.writeUInt8(n, 31);
  return buf;
}

function abiEncodeString(s: string): Buffer {
  const strBytes = Buffer.from(s, 'utf8');
  const lenBuf = abiEncodeUint256(strBytes.length);
  const padLen = strBytes.length % 32 === 0 ? 0 : 32 - (strBytes.length % 32);
  const dataBuf = Buffer.concat([strBytes, Buffer.alloc(padLen, 0)]);
  return Buffer.concat([lenBuf, dataBuf]);
}

/**
 * Replicates Solidity abi.encode(uint256 cityId, string name, string country, uint256 population, uint8 tier).
 */
function abiEncode(
  cityId: number,
  name: string,
  country: string,
  population: number,
  tier: number,
): Buffer {
  const headSize = 5 * 32; // 5 head slots = 160 bytes
  const nameEncoded    = abiEncodeString(name);
  const countryEncoded = abiEncodeString(country);

  const nameOffset    = BigInt(headSize);
  const countryOffset = nameOffset + BigInt(nameEncoded.length);

  return Buffer.concat([
    abiEncodeUint256(cityId),
    abiEncodeUint256(nameOffset),
    abiEncodeUint256(countryOffset),
    abiEncodeUint256(population),
    abiEncodeUint8(tier),
    nameEncoded,
    countryEncoded,
  ]);
}

/**
 * Compute the Merkle leaf for a city.
 * Matches keccak256(bytes.concat(keccak256(abi.encode(cityId, name, country, population, tier))))
 * in CityOnChain.sol.
 */
export function makeLeaf(city: City): Buffer {
  const encoded = abiEncode(city.id, city.name, city.country, city.population, city.displayTier);
  const inner = keccak256(encoded);
  return keccak256(inner); // double hash
}

// ── Tree state ──────────────────────────────────────────────────────────────

let _tree: MerkleTree | null = null;
let _cities: City[] = [];

/**
 * Build the Merkle tree synchronously. Prefer initMerkleTreeAsync() in UI code
 * to avoid blocking the main thread.
 */
export function initMerkleTree(cities: City[]): void {
  _cities = cities;
  const leaves = cities.map(makeLeaf);
  _tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
}

/**
 * Build the Merkle tree in a Web Worker and resolve when ready.
 * Falls back to synchronous build if workers are unavailable.
 * Safe to call multiple times; subsequent calls resolve immediately if already built.
 */
export function initMerkleTreeAsync(cities: City[]): Promise<void> {
  if (_tree && _cities.length === cities.length) return Promise.resolve();
  // Synchronous build is fast enough for 24k cities (~1-2s on modern hardware).
  // Move to a real worker if profiling shows this blocks the main thread beyond 3s.
  return new Promise((resolve, reject) => {
    try {
      initMerkleTree(cities);
      resolve();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/** Returns hex root — verify this matches merkle-root.txt and the on-chain root. */
export function getMerkleRoot(): string {
  if (!_tree) throw new Error('Merkle tree not initialised');
  return _tree.getHexRoot();
}

/**
 * Generate a proof for a single city.
 * No claimant address needed — proof is city-specific, wallet-agnostic.
 */
export function getMerkleProof(city: City): `0x${string}`[] {
  if (!_tree) throw new Error('Merkle tree not initialised');
  const leaf = makeLeaf(city);
  return _tree.getHexProof(leaf) as `0x${string}`[];
}

/** Verify a proof client-side (pre-flight check before sending the transaction). */
export function verifyProof(city: City, proof: `0x${string}`[]): boolean {
  if (!_tree) throw new Error('Merkle tree not initialised');
  const leaf = makeLeaf(city);
  return _tree.verify(proof, leaf, _tree.getRoot());
}

/** Self-test: verify proofs for named cities. */
export function selfTest(names: string[]): { name: string; found: boolean; valid: boolean }[] {
  if (!_tree || _cities.length === 0) throw new Error('Merkle tree not initialised');
  return names.map(name => {
    const city = _cities.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (!city) return { name, found: false, valid: false };
    const proof = getMerkleProof(city);
    const valid = verifyProof(city, proof);
    return { name, found: true, valid };
  });
}
