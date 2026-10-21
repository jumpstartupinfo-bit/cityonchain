/**
 * build-cities.mjs
 * Reads all-the-cities, filters by population, computes display tiers (1–6),
 * writes public/data/cities.json and public/data/merkle-root.txt.
 *
 * Leaf encoding (matches CityOnChain.sol claimCity() exactly):
 *   keccak256(bytes.concat(keccak256(abi.encode(cityId, name, country, population, tier))))
 *
 *   - Inner: keccak256 of abi.encode packed output (all fields padded to 32 bytes)
 *   - Outer: double-hash, OpenZeppelin MerkleProof standard
 *   - No msg.sender — any wallet can claim with a valid proof
 *   - sortPairs: true (OZ MerkleProof compatible)
 *
 * Run: node scripts/build-cities.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { MerkleTree } from 'merkletreejs';
import keccak256 from 'keccak256';
import {
  MIN_POPULATION,
  computeDisplayTier,
  TIER_LABELS,
  TIER_PRICES_USDC,
  DISTRICT_COUNT_BY_TIER,
} from './tier-config.mjs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../public/data');

mkdirSync(OUT_DIR, { recursive: true });

// ── 1. Load and filter cities ──────────────────────────────────────────────
console.log('Loading all-the-cities…');
const allCities = require('all-the-cities');
console.log(`${allCities.length.toLocaleString()} total entries`);

const filtered = allCities.filter(c => c.population >= MIN_POPULATION);
console.log(`Filtering population >= ${MIN_POPULATION.toLocaleString()}… ${filtered.length.toLocaleString()} cities kept\n`);

// ── 2. Map to compact objects ──────────────────────────────────────────────
// cityId = 1-based index (stable, matches Merkle leaf)
const cities = filtered.map((c, i) => ({
  id:          i + 1,
  name:        c.name,
  country:     c.country,
  population:  c.population,
  lat:         c.loc.coordinates[1],
  lng:         c.loc.coordinates[0],
  displayTier: computeDisplayTier(c.population),
}));

// ── 3. Count by display tier ───────────────────────────────────────────────
const byTier = {};
for (const city of cities) {
  byTier[city.displayTier] = (byTier[city.displayTier] || 0) + 1;
}

console.log('Cities per display tier (tier is stored on-chain as-is):');
for (let t = 1; t <= 6; t++) {
  const count   = byTier[t] || 0;
  const price   = TIER_PRICES_USDC[t];
  const distCnt = DISTRICT_COUNT_BY_TIER[t];
  console.log(`  Tier ${t} — ${TIER_LABELS[t]}: ${count.toLocaleString()} cities  ($${price.toLocaleString()} USDC, ${distCnt} districts each)`);
}

// ── 4. Write cities.json ───────────────────────────────────────────────────
const citiesPath = join(OUT_DIR, 'cities.json');
writeFileSync(citiesPath, JSON.stringify(cities));
const sizeMB = (Buffer.byteLength(JSON.stringify(cities)) / 1_048_576).toFixed(2);
console.log(`\nWrote ${citiesPath} (${sizeMB} MB)`);

// ── 5. Build Merkle tree ────────────────────────────────────────────────────
//
// Leaf = keccak256(bytes.concat(keccak256(abi.encode(cityId, name, country, population, tier))))
//
// abi.encode rules (all fields padded to 32 bytes each, except dynamic types which
// have an offset+length+data layout — but we keep strings as fixed 32-byte-padded
// for simplicity and match this in merkle.ts):
//
// Actually: abi.encode for (uint256, string, string, uint256, uint8) produces:
//   - offset of cityId:    N/A (static uint256, 32 bytes)
//   - offset of name:      pointer (32 bytes)
//   - offset of country:   pointer (32 bytes)
//   - static population:   32 bytes
//   - static tier (uint8): 32 bytes (padded)
//   - name length + data
//   - country length + data
//
// We replicate this ABI encoding exactly in JS using encodeAbiParameters-style logic.

function abiEncodeUint256(n) {
  const buf = Buffer.alloc(32, 0);
  const bi = BigInt(n);
  const hex = bi.toString(16).padStart(64, '0');
  Buffer.from(hex, 'hex').copy(buf);
  return buf;
}

function abiEncodeUint8(n) {
  // uint8 is padded to 32 bytes in abi.encode
  const buf = Buffer.alloc(32, 0);
  buf.writeUInt8(n, 31);
  return buf;
}

function abiEncodeString(s) {
  const strBytes = Buffer.from(s, 'utf8');
  const lenBuf = abiEncodeUint256(strBytes.length);
  // pad data to 32-byte boundary
  const padLen = strBytes.length % 32 === 0 ? 0 : 32 - (strBytes.length % 32);
  const dataBuf = Buffer.concat([strBytes, Buffer.alloc(padLen, 0)]);
  return Buffer.concat([lenBuf, dataBuf]);
}

/**
 * Replicates abi.encode(uint256 cityId, string name, string country, uint256 population, uint8 tier).
 * Layout:
 *   [0x00] cityId (32 bytes, static)
 *   [0x20] offset of name (32 bytes, pointer)
 *   [0x40] offset of country (32 bytes, pointer)
 *   [0x60] population (32 bytes, static)
 *   [0x80] tier (32 bytes, padded uint8)
 *   [0xa0] name length (32 bytes) + name data (padded to 32 bytes)
 *   [....]  country length (32 bytes) + country data (padded to 32 bytes)
 */
function abiEncode(cityId, name, country, population, tier) {
  const headSize = 5 * 32; // 5 head slots
  const nameEncoded    = abiEncodeString(name);
  const countryEncoded = abiEncodeString(country);

  const nameOffset    = BigInt(headSize);                         // 0xa0
  const countryOffset = nameOffset + BigInt(nameEncoded.length);  // after name

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

function makeLeaf(city) {
  const encoded = abiEncode(city.id, city.name, city.country, city.population, city.displayTier);
  const inner = keccak256(encoded);          // keccak256(abi.encode(...))
  return keccak256(Buffer.concat([inner]));  // keccak256(bytes.concat(inner)) == keccak256(inner)
}

console.log('\nBuilding Merkle tree with OZ double-hash leaf…');
console.log('  Leaf = keccak256(bytes.concat(keccak256(abi.encode(cityId, name, country, population, tier))))');
const leaves = cities.map(makeLeaf);
const tree   = new MerkleTree(leaves, keccak256, { sortPairs: true });
const root   = tree.getHexRoot();

console.log('done');
console.log(`Merkle root: ${root}`);
console.log(`Leaf count:  ${leaves.length.toLocaleString()}`);

writeFileSync(join(OUT_DIR, 'merkle-root.txt'), root, 'utf8');
console.log(`Wrote ${join(OUT_DIR, 'merkle-root.txt')}`);
console.log('\nDone. Any wallet can claim a city using the proof for its cityId.');
