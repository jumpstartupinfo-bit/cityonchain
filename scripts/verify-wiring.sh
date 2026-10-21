#!/bin/bash
# Read all wiring state back from the chain and confirm nothing is zero.
# Usage: bash scripts/verify-wiring.sh  (no key needed — read-only)

RPC="https://rpc.testnet.arc.io"

TREASURY="0x3e83b5390f65022593cc8f59128bfa61aa062326"
FEECONFIG="0xf65bc1c49df763341320aa3ca8ae9bf8cd9723b1"
REVENUE="0x3162861d8bb4a5bdf7786070174a5bd6e0f70ef7"
CITY="0xa7316316684007a6d4fd99e0e490157078c5c892"
DISTRICT="0x2b5ec5ce07a6fb81de824a9007ca867f03e5585d"
MARKETPLACE="0x17eb8b1ea3898f2da3feae7f31d94b4823da522e"
LEASE="0x55efab4083185668dfb84fcf3f3760ba77e78720"

r() {
  val=$(cast call --rpc-url "$RPC" "$1" "$2()(address)" 2>/dev/null || echo "ERROR")
  echo "  $3: $val"
}

rb() {
  val=$(cast call --rpc-url "$RPC" "$1" "$2(bytes32)(bool)" "$3" 2>/dev/null || echo "ERROR")
  echo "  $4: $val"
}

echo "=== CityRegistry ==="
r $CITY "treasuryContract" "treasuryContract"
r $CITY "feeConfig"        "feeConfig"
r $CITY "revenueSplitter"  "revenueSplitter"
r $CITY "leaseManager"     "leaseManager"
root=$(cast call --rpc-url "$RPC" $CITY "merkleRoot()(bytes32)" 2>/dev/null || echo "ERROR")
echo "  merkleRoot: $root"

echo "=== DistrictRegistry ==="
r $DISTRICT "cityRegistry"    "cityRegistry"
r $DISTRICT "treasuryContract" "treasuryContract"
r $DISTRICT "revenueSplitter" "revenueSplitter"

echo "=== RevenueSplitter ==="
r $REVENUE "treasuryContract" "treasuryContract"
r $REVENUE "cityRegistry"     "cityRegistry"
r $REVENUE "districtRegistry" "districtRegistry"

echo "=== Treasury depositors ==="
for addr in $CITY $DISTRICT $REVENUE; do
  val=$(cast call --rpc-url "$RPC" $TREASURY "depositors(address)(bool)" $addr 2>/dev/null || echo "ERROR")
  echo "  $addr: $val"
done

echo "=== CityMarketplace ==="
r $MARKETPLACE "treasuryContract" "treasuryContract"
r $MARKETPLACE "feeConfig"        "feeConfig"
approved=$(cast call --rpc-url "$RPC" $MARKETPLACE "approvedNFTs(address)(bool)" $CITY 2>/dev/null || echo "ERROR")
echo "  CityRegistry approved: $approved"

echo "=== LeaseManager ==="
approved=$(cast call --rpc-url "$RPC" $LEASE "approvedNFTs(address)(bool)" $CITY 2>/dev/null || echo "ERROR")
echo "  CityRegistry approved: $approved"
