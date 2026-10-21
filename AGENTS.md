# CityOnChain

> Built with Arc Studio - money-powered apps in minutes

---

## ⚠️ MAINNET CHECKLIST (do before going live)

### Already done (code is ready) ✓
- [x] All 7 revenue contracts now call `_recordActivity()` (CityRegistry, DistrictRegistry, CityMarketplace, AdSlots, Storefronts, EventTickets, LeaseManager)
- [x] Leaderboards.tsx is chain-aware: uses `useActivityLeaderboard` on mainnet (CHAIN_ID=5042), `useLeaderboard` event-scan on testnet
- [x] `src/config.ts` supports both Arc Testnet and Arc Mainnet — set `VITE_CHAIN=mainnet` to switch
- [x] `useOwnedTokens` derives RPC URLs from onchain-facts (chain-aware)
- [x] `useCityProfile` derives compass chain key from CHAIN_ID
- [x] ReferralVault v2: 20%/10% L1/L2 rates, hard caps 30%/15%

### Still required before mainnet deploy
1. **Get an independent security audit** — contracts hold real USDC. Non-negotiable before user funds.
2. **Replace single-owner wallet** with a Gnosis Safe multisig (2-of-3 minimum) as owner on all contracts
3. **Redeploy all 14 contracts on Arc Mainnet** in dependency order:
   FeeConfig → Treasury → ActivityTracker → CityRegistry → DistrictRegistry → ReferralVault → CityProfile → RevenueSplitter → CityMarketplace → LeaseManager → AdSlots → Storefronts → EventTickets → CityPass
4. **Update `contracts.ts`** — set `CHAIN_ID = 5042`, update all addresses, update `DEPLOY_BLOCK`
5. **Set `VITE_CHAIN=mainnet`** in `.env` for the production frontend build
6. **Run all Setup page wiring calls** (~50 transactions) from the multisig — includes `setActivityTracker` on all 7 contracts
7. **Call `setMerkleRoot(0x74ab93...)`** on the new mainnet CityRegistry — same root carries over
8. **Update `DATABASE_URL`** in `.env` to Railway production Postgres URL
9. **Set `VITE_INDEXER_URL`** to the deployed Railway backend URL
10. **Update CORS** in `server/index.ts` to allow production domain (`cityonchain.app`)
11. **Update `DEPLOY_BLOCK`** in `useAssetHistory.ts` and `useLeaderboard.ts` to actual mainnet deploy block
12. **Purchase `cityonchain.app` domain** and configure DNS
13. **Remove "Get test USDC" sidebar button** or replace with a real onramp for mainnet

---

CityOnChain is an onchain platform where real-world cities are digital territories that users can own, lease, and earn USDC revenue from. Mayor licenses and district licenses are lazy-minted ERC-721 NFTs via Merkle proofs.

---

## Owner / Treasury

**Your wallet:** `0xb3FfE33BB506d316D4995C8FF5E63d5A742B10C1`

All contracts are deployed with this address as both `_owner` and `_treasury`.

---

## Deployed Contracts (Arc Testnet) — Current

> All contracts deployed 2026-10-02. Owner = `0xb3FfE33BB506d316D4995C8FF5E63d5A742B10C1`.

| Contract | Address | Explorer |
|---|---|---|
| Treasury | `0x3e83b5390f65022593cc8f59128bfa61aa062326` | https://explorer.testnet.arc.io/address/0x3e83b5390f65022593cc8f59128bfa61aa062326 |
| FeeConfig | `0xf65bc1c49df763341320aa3ca8ae9bf8cd9723b1` | https://explorer.testnet.arc.io/address/0xf65bc1c49df763341320aa3ca8ae9bf8cd9723b1 |
| RevenueSplitter | `0x3162861d8bb4a5bdf7786070174a5bd6e0f70ef7` | https://explorer.testnet.arc.io/address/0x3162861d8bb4a5bdf7786070174a5bd6e0f70ef7 |
| CityRegistry (v3: mintBatch, allowance reset) | `0x594c5818268be1f61df21688dadd7f5164aa4737` | https://explorer.testnet.arc.io/address/0x594c5818268be1f61df21688dadd7f5164aa4737 |
| DistrictRegistry (v5: mintBatch, mintBatchAdmin, setDistrictSector, on-chain price, allowance reset) | `0x970f9c991e1dceee4d73a9c4d74841a0fc87ca0c` | https://explorer.testnet.arc.io/address/0x970f9c991e1dceee4d73a9c4d74841a0fc87ca0c |
| ReferralVault v2 | `0xf10915f35195fe581dafa6c158647dffad9038fe` | 20%/10% L1/L2 |
| CityProfile | `0xb60800a4eb4ff170c0ebbe38befce38b225dd59f` |
| CityPass | `0x94b2bc62d0ed08f673b2db40b20f145da9f7b026` | https://explorer.testnet.arc.io/address/0x94b2bc62d0ed08f673b2db40b20f145da9f7b026 |
| CityMarketplace (v3: floor price, referral, allowance reset) | `0xbf1892693217a3f64f3f3b67456adb2abbc0ed9e` | https://explorer.testnet.arc.io/address/0xbf1892693217a3f64f3f3b67456adb2abbc0ed9e |
| LeaseManager | `0x5936eb002a88548c57349cb1ed5158ab41ba3ff8` | https://explorer.testnet.arc.io/address/0x5936eb002a88548c57349cb1ed5158ab41ba3ff8 |
| AdSlots | `0x95d75ce64d956817c37c9753074e24836658bfbe` | https://explorer.testnet.arc.io/address/0x95d75ce64d956817c37c9753074e24836658bfbe |

### Wiring calls — exact order for owner wallet (2026-10-03 redeploy)

Run these in order from `0xb3FfE33BB506d316D4995C8FF5E63d5A742B10C1`. The Setup page in the app handles this automatically.

```
 1. CityRegistry.setTreasuryContract(0x3e83b5390f65022593cc8f59128bfa61aa062326)
 2. CityRegistry.setFeeConfig(0xf65bc1c49df763341320aa3ca8ae9bf8cd9723b1)
 3. CityRegistry.setRevenueSplitter(0x3162861d8bb4a5bdf7786070174a5bd6e0f70ef7)
 4. CityRegistry.setLeaseManager(0x5936eb002a88548c57349cb1ed5158ab41ba3ff8)   ← new LeaseManager
 5. CityRegistry.setDistrictRegistry(0x2b5ec5ce07a6fb81de824a9007ca867f03e5585d)
 6. CityRegistry.setMerkleRoot(0x74ab9348cd97bd13f535237f7fb64a06cc2e7416eb5eb68a0eb36242914bf21b)
 7. DistrictRegistry.setCityRegistry(0xa050c3766fb586f0e9ad9a4ce1b73966ea895cb3)
 8. DistrictRegistry.setTreasury(0x3e83b5390f65022593cc8f59128bfa61aa062326)
 9. DistrictRegistry.setRevenueSplitter(0x3162861d8bb4a5bdf7786070174a5bd6e0f70ef7)
10. DistrictRegistry.setLeaseManager(0x5936eb002a88548c57349cb1ed5158ab41ba3ff8)  ← new LeaseManager
11. RevenueSplitter.setTreasuryContract(0x3e83b5390f65022593cc8f59128bfa61aa062326)
12. RevenueSplitter.setFeeConfig(0xf65bc1c49df763341320aa3ca8ae9bf8cd9723b1)
13. RevenueSplitter.setCityRegistry(0xa050c3766fb586f0e9ad9a4ce1b73966ea895cb3)
14. RevenueSplitter.setDistrictRegistry(0x2b5ec5ce07a6fb81de824a9007ca867f03e5585d)
15. Treasury.setDepositor(0xa050c3766fb586f0e9ad9a4ce1b73966ea895cb3, true)   [CityRegistry]
16. Treasury.setDepositor(0x2b5ec5ce07a6fb81de824a9007ca867f03e5585d, true)   [DistrictRegistry]
17. Treasury.setDepositor(0x3162861d8bb4a5bdf7786070174a5bd6e0f70ef7, true)   [RevenueSplitter]
18. Treasury.setDepositor(0x09ea7584863b69895bd726ce37115b890e47c585, true)   [CityMarketplace] ← new
19. Treasury.setDepositor(0x5936eb002a88548c57349cb1ed5158ab41ba3ff8, true)   [LeaseManager]    ← new
20. CityMarketplace.setTreasuryContract(0x3e83b5390f65022593cc8f59128bfa61aa062326)
21. CityMarketplace.setFeeConfig(0xf65bc1c49df763341320aa3ca8ae9bf8cd9723b1)
22. CityMarketplace.setApprovedNFT(0xa050c3766fb586f0e9ad9a4ce1b73966ea895cb3, true)   [CityRegistry]
23. CityMarketplace.setApprovedNFT(0x2b5ec5ce07a6fb81de824a9007ca867f03e5585d, true)   [DistrictRegistry]
24. LeaseManager.setFeeConfig(0xf65bc1c49df763341320aa3ca8ae9bf8cd9723b1)
25. LeaseManager.setTreasuryContract(0x3e83b5390f65022593cc8f59128bfa61aa062326)
26. LeaseManager.setApprovedNFT(0xa050c3766fb586f0e9ad9a4ce1b73966ea895cb3, true)   [CityRegistry]
27. LeaseManager.setApprovedNFT(0x2b5ec5ce07a6fb81de824a9007ca867f03e5585d, true)   [DistrictRegistry]
28. AdSlots.setCityRegistry(0xa050c3766fb586f0e9ad9a4ce1b73966ea895cb3)
29. AdSlots.setDistrictRegistry(0x2b5ec5ce07a6fb81de824a9007ca867f03e5585d)
30. AdSlots.setRevenueSplitter(0x3162861d8bb4a5bdf7786070174a5bd6e0f70ef7)
```

---

## Merkle Tree

- **Root:** `0x74ab9348cd97bd13f535237f7fb64a06cc2e7416eb5eb68a0eb36242914bf21b`
- **Leaf count:** 24,323 cities (population ≥ 15,000)
- **Leaf formula:** `keccak256(bytes.concat(keccak256(abi.encode(cityId, name, country, population, displayTier))))`
- **No `msg.sender` in leaf** — any wallet can use a valid proof
- Root file: `public/data/merkle-root.txt`
- Build script: `scripts/build-cities.mjs`
- Browser proof generator: `src/lib/merkle.ts`

---

## Price Tiers (6 display tiers, 1–6)

| Tier | Population | Mayor License | Districts | District Price |
|---|---|---|---|---|
| 1 Mega City | ≥ 10M | $7,500 | 24 | $375 |
| 2 Major City | 3M–10M | $3,000 | 16 | $150 |
| 3 Large City | 1M–3M | $1,200 | 12 | $60 |
| 4 City | 300k–1M | $400 | 8 | $20 |
| 5 Town | 100k–300k | $120 | 6 | $6 |
| 6 Small Town | 15k–100k | $40 | 4 | $5 (floor) |

District price = city price × 5%, floor $5 USDC.

---

## Common Info

- **USDC on Arc Testnet:** `0x3600000000000000000000000000000000000000` (6 decimals)
- **Arc Testnet Chain ID:** 5042002
- Lazy minting via Merkle proof — owner must call `setMerkleRoot(root)` before any cities can be claimed
- Districts: tokenId = cityId × 1000 + districtIndex
- No Merkle tree for districts — derived from cityId, validated against tier count

## Contract Source Files

- `contracts/CityOnChain.sol` — CityRegistry (ERC-721, Merkle mint, ERC-4907)
- `contracts/DistrictRegistry.sol` — District ERC-721, first-refusal window, BPS pricing
- `contracts/CityMarketplace.sol` — Fixed-price listings + offers, escrow
- `contracts/LeaseManager.sol` — ERC-4907-style leases
- `contracts/RevenueSplitter.sol` — Automatic USDC splits
- `contracts/AdSlots.sol` — Streaming ad escrow, pro-rata refunds
- `contracts/FeeConfig.sol` — Timelocked fee rates + tier prices (48h delay, hard caps)
- `contracts/Treasury.sol` — Revenue by source, depositor/withdrawer roles
- `contracts/Storefronts.sol` — District units, monthly rent (Phase 2)
- `contracts/EventTickets.sol` — ERC-1155 tickets, escrowed revenue (Phase 2)
- `contracts/ActivityTracker.sol` — Paid activity scoring (Phase 2)
- `contracts/test/*.t.sol` — 68 unit tests (19 CityRegistry + 49 DistrictRegistry, all passing)

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry + OpenZeppelin 5.1
- Chain: Arc Testnet (Chain ID: 5042002)
- Token: USDC `0x3600000000000000000000000000000000000000`

## Key Frontend Files

- `src/App.tsx` — router / app shell
- `src/contracts.ts` — contract addresses + ABIs
- `src/lib/merkle.ts` — browser Merkle proof generation
- `src/lib/districts.ts` — district ID derivation and price helpers
- `src/components/` — WorldMap, CityPage, Marketplace, MyAssets, Nav, AdminDashboard
