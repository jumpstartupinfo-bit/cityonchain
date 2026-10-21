/**
 * add-cities.ts — batch-adds global cities to the CityOnChain contract.
 * Run: bun run scripts/add-cities.ts
 *
 * Reads CIRCLE_DEVELOPER_CONTROLLED_API_KEY and CIRCLE_ENTITY_SECRET from .env
 * Uses the deployer wallet that owns the contract.
 */

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { waitForSuccessfulTransaction } from '@/onchain-wait';

const CONTRACT_ADDRESS = '0x94663840f04444a149387d243c47dabd007388ed';
const DEPLOYER_WALLET_ID = '3c2464b2-8369-52e2-a782-800bbeca5396';
const BLOCKCHAIN = 'ARC-TESTNET';

// Mint price: 10 USDC = 10_000_000 (6 decimals)
const MINT_PRICE = '10000000';

// 200 global cities across all continents
const CITIES: string[] = [
  // East Asia
  'Tokyo', 'Osaka', 'Kyoto', 'Seoul', 'Busan', 'Shanghai', 'Beijing', 'Guangzhou',
  'Shenzhen', 'Chengdu', 'Hong Kong', 'Taipei', 'Kaohsiung', 'Singapore',
  // Southeast Asia
  'Bangkok', 'Ho Chi Minh City', 'Hanoi', 'Jakarta', 'Surabaya', 'Kuala Lumpur',
  'Manila', 'Cebu', 'Yangon', 'Phnom Penh', 'Vientiane',
  // South Asia
  'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Karachi',
  'Lahore', 'Dhaka', 'Colombo', 'Kathmandu',
  // Middle East & Central Asia
  'Dubai', 'Abu Dhabi', 'Riyadh', 'Jeddah', 'Doha', 'Kuwait City', 'Muscat',
  'Beirut', 'Amman', 'Baghdad', 'Tehran', 'Istanbul', 'Ankara', 'Baku',
  'Tashkent', 'Almaty',
  // Eastern Europe
  'Moscow', 'Saint Petersburg', 'Kyiv', 'Warsaw', 'Krakow', 'Prague', 'Budapest',
  'Bucharest', 'Sofia', 'Belgrade', 'Zagreb', 'Vilnius', 'Riga', 'Tallinn',
  'Minsk',
  // Western Europe
  'London', 'Paris', 'Berlin', 'Madrid', 'Barcelona', 'Rome', 'Milan', 'Amsterdam',
  'Brussels', 'Vienna', 'Zurich', 'Geneva', 'Stockholm', 'Copenhagen', 'Oslo',
  'Helsinki', 'Lisbon', 'Porto', 'Dublin', 'Athens', 'Warsaw', 'Munich',
  'Hamburg', 'Frankfurt', 'Cologne', 'Lyon', 'Marseille',
  // Africa
  'Lagos', 'Abuja', 'Accra', 'Nairobi', 'Dar es Salaam', 'Addis Ababa',
  'Johannesburg', 'Cape Town', 'Durban', 'Casablanca', 'Rabat', 'Tunis',
  'Algiers', 'Cairo', 'Khartoum', 'Kinshasa', 'Luanda', 'Dakar',
  'Kampala', 'Lusaka',
  // North America
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia',
  'San Antonio', 'San Diego', 'Dallas', 'San Jose', 'Austin', 'Seattle',
  'Denver', 'Boston', 'Portland', 'Las Vegas', 'Miami', 'Atlanta', 'Detroit',
  'Minneapolis', 'San Francisco', 'Washington DC', 'Toronto', 'Montreal',
  'Vancouver', 'Calgary', 'Ottawa', 'Edmonton', 'Quebec City',
  'Mexico City', 'Guadalajara', 'Monterrey', 'Havana', 'Panama City',
  // Central America & Caribbean
  'San Jose', 'Guatemala City', 'Tegucigalpa', 'Managua', 'San Salvador',
  'Santo Domingo', 'Port-au-Prince', 'Kingston', 'Nassau',
  // South America
  'São Paulo', 'Rio de Janeiro', 'Brasilia', 'Belo Horizonte', 'Buenos Aires',
  'Córdoba', 'Bogotá', 'Medellín', 'Lima', 'Santiago', 'Caracas',
  'Montevideo', 'Asunción', 'La Paz', 'Quito', 'Guayaquil',
  'Montevideo', 'Georgetown', 'Paramaribo',
  // Oceania
  'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Auckland',
  'Wellington', 'Christchurch', 'Suva', 'Port Moresby',
];

// Deduplicate
const UNIQUE_CITIES = [...new Set(CITIES)];

async function main() {
  const apiKey = process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

  if (!apiKey || !entitySecret) {
    console.error('Missing CIRCLE_DEVELOPER_CONTROLLED_API_KEY or CIRCLE_ENTITY_SECRET in .env');
    process.exit(1);
  }

  const walletsClient = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

  console.log(`Adding ${UNIQUE_CITIES.length} cities to CityOnChain...`);

  let added = 0;
  let skipped = 0;

  for (let i = 0; i < UNIQUE_CITIES.length; i++) {
    const cityName = UNIQUE_CITIES[i];
    process.stdout.write(`[${i + 1}/${UNIQUE_CITIES.length}] ${cityName}... `);

    try {
      const res = await walletsClient.createContractExecutionTransaction({
        walletId: DEPLOYER_WALLET_ID,
        contractAddress: CONTRACT_ADDRESS,
        blockchain: BLOCKCHAIN,
        abiFunctionSignature: 'addCity(string,uint256)',
        abiParameters: [cityName, MINT_PRICE],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
        idempotencyKey: crypto.randomUUID(),
      });

      const txId = res.data?.id;
      if (!txId) throw new Error('No txId returned');

      await waitForSuccessfulTransaction(() => walletsClient.getTransaction({ id: txId }), { timeoutMs: 60_000 });
      console.log('OK');
      added++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('CityAlreadyExists') || msg.includes('already exists')) {
        console.log('(already exists, skipped)');
        skipped++;
      } else {
        console.log(`FAILED: ${msg}`);
        skipped++;
      }
    }

    // Small pause to avoid rate limits
    if (i < UNIQUE_CITIES.length - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  console.log(`\nDone. Added: ${added}, Skipped/Failed: ${skipped}`);
}

main();
