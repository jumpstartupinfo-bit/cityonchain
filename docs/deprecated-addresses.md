# Deprecated Contract Addresses

These contracts have been superseded and must not be used.
No active listings or leases existed on them at the time of deprecation (verified on-chain).

| Contract | Old Address (deprecated) | New Address | Reason | Deprecated |
|---|---|---|---|---|
| CityMarketplace | `0x17eb8b1ea3898f2da3feae7f31d94b4823da522e` | `0x09ea7584863b69895bd726ce37115b890e47c585` | Added `buy(listingId, expectedPrice)` price-mismatch guard | 2026-10-03 |
| LeaseManager | `0x55efab4083185668dfb84fcf3f3760ba77e78720` | `0x5936eb002a88548c57349cb1ed5158ab41ba3ff8` | Replaced hardcoded 500 bps constant with FeeConfig read; fee now routed to Treasury contract via `deposit(3, fee)` | 2026-10-03 |

## Verification that no state was lost

- `CityMarketplace.nextListingId()` on old address = `1` (no listings ever created) — on-chain read, 2026-10-03
- `LeaseManager.nextLeaseId()` on old address = `1` (no leases ever created) — on-chain read, 2026-10-03

## Previous deprecations

| Contract | Old Address | New Address | Reason | Deprecated |
|---|---|---|---|---|
| CityRegistry | `0xa7316316684007a6d4fd99e0e490157078c5c892` | `0xa050c3766fb586f0e9ad9a4ce1b73966ea895cb3` | Added `setDistrictRegistry` + `notifyCityMinted` call | 2026-10-02 |
