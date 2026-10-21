/**
 * Self-test: generate and verify Merkle proofs for Nairobi, Lagos, Tokyo.
 * Uses the same leaf encoding as build-cities.mjs and src/lib/merkle.ts.
 */
import { readFileSync } from 'fs';
import { MerkleTree } from 'merkletreejs';
import keccak256 from 'keccak256';

const cities = JSON.parse(readFileSync('/home/user/app/public/data/cities.json', 'utf8'));
const storedRoot = readFileSync('/home/user/app/public/data/merkle-root.txt', 'utf8').trim();

function makeLeaf(city) {
  const packed = `${city.id}:${city.name}:${city.country}:${city.population}:${city.contractTier}`;
  return keccak256(Buffer.from(packed, 'utf8'));
}

const leaves = cities.map(makeLeaf);
const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
const computedRoot = tree.getHexRoot();

console.log(`Stored root:   ${storedRoot}`);
console.log(`Computed root: ${computedRoot}`);
console.log(`Roots match:   ${storedRoot === computedRoot}\n`);

const targets = ['Nairobi', 'Lagos', 'Tokyo'];
for (const name of targets) {
  const city = cities.find(c => c.name === name);
  if (!city) { console.log(`${name}: NOT FOUND in dataset`); continue; }
  const leaf = makeLeaf(city);
  const proof = tree.getProof(leaf);
  const valid = tree.verify(proof, leaf, tree.getRoot());
  console.log(`${name.padEnd(8)} id=${city.id} pop=${city.population.toLocaleString()} tier=${city.displayTier} contractTier=${city.contractTier}  proof_valid=${valid}`);
}
