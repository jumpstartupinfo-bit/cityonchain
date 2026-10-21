#!/bin/bash
# Wire all CityOnChain contracts after deployment.
# Run this from your own machine with your private key.
# Usage: PRIVATE_KEY=0x... bash scripts/wire-contracts.sh
#
# Requires: cast (from foundry) + an Arc Testnet RPC endpoint
#
# All contracts are owned by 0xb3FfE33BB506d316D4995C8FF5E63d5A742B10C1

set -e

if [ -z "$PRIVATE_KEY" ]; then
  echo "Error: set PRIVATE_KEY=0x... before running"
  exit 1
fi

RPC="https://rpc.testnet.arc.io"

TREASURY="0x3e83b5390f65022593cc8f59128bfa61aa062326"
FEECONFIG="0xf65bc1c49df763341320aa3ca8ae9bf8cd9723b1"
REVENUE="0x3162861d8bb4a5bdf7786070174a5bd6e0f70ef7"
CITY="0xa7316316684007a6d4fd99e0e490157078c5c892"
DISTRICT="0x2b5ec5ce07a6fb81de824a9007ca867f03e5585d"
MARKETPLACE="0x17eb8b1ea3898f2da3feae7f31d94b4823da522e"
LEASE="0x55efab4083185668dfb84fcf3f3760ba77e78720"
ADSLOTS="0x95d75ce64d956817c37c9753074e24836658bfbe"
MERKLE="0x74ab9348cd97bd13f535237f7fb64a06cc2e7416eb5eb68a0eb36242914bf21b"

c() {
  echo ">>> $1.$2($3)"
  cast send --rpc-url "$RPC" --private-key "$PRIVATE_KEY" "$1" "$2(address)" "$3"
}

echo "=== Wiring CityRegistry ==="
c $CITY "setTreasuryContract" $TREASURY
c $CITY "setFeeConfig"        $FEECONFIG
c $CITY "setRevenueSplitter"  $REVENUE
c $CITY "setLeaseManager"     $LEASE
echo ">>> CityRegistry.setMerkleRoot"
cast send --rpc-url "$RPC" --private-key "$PRIVATE_KEY" $CITY "setMerkleRoot(bytes32)" $MERKLE

echo "=== Wiring DistrictRegistry ==="
c $DISTRICT "setCityRegistry"   $CITY
c $DISTRICT "setTreasury"       $TREASURY
c $DISTRICT "setRevenueSplitter" $REVENUE
c $DISTRICT "setLeaseManager"   $LEASE

echo "=== Wiring RevenueSplitter ==="
c $REVENUE "setTreasuryContract" $TREASURY
c $REVENUE "setCityRegistry"     $CITY
c $REVENUE "setDistrictRegistry" $DISTRICT

echo "=== Wiring Treasury: allow CityRegistry + DistrictRegistry to deposit ==="
cast send --rpc-url "$RPC" --private-key "$PRIVATE_KEY" $TREASURY "setDepositor(address,bool)" $CITY true
cast send --rpc-url "$RPC" --private-key "$PRIVATE_KEY" $TREASURY "setDepositor(address,bool)" $DISTRICT true
cast send --rpc-url "$RPC" --private-key "$PRIVATE_KEY" $TREASURY "setDepositor(address,bool)" $REVENUE true

echo "=== Wiring CityMarketplace ==="
c $MARKETPLACE "setTreasuryContract" $TREASURY
c $MARKETPLACE "setFeeConfig"        $FEECONFIG
cast send --rpc-url "$RPC" --private-key "$PRIVATE_KEY" $MARKETPLACE "setApprovedNFT(address,bool)" $CITY true

echo "=== Wiring LeaseManager ==="
cast send --rpc-url "$RPC" --private-key "$PRIVATE_KEY" $LEASE "setApprovedNFT(address,bool)" $CITY true

echo ""
echo "All done. Verify with: bash scripts/verify-wiring.sh"
