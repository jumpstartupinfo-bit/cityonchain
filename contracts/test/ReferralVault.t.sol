// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {ReferralVault} from "../ReferralVault.sol";
import {Treasury}      from "../Treasury.sol";
import {IERC20}        from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// ─── Minimal ERC20 for testing ────────────────────────────────────────────────
contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from]             -= amount;
        balanceOf[to]               += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

// ─── Minimal Treasury stub ────────────────────────────────────────────────────
contract MockTreasury {
    IERC20 public usdc;
    uint256 public totalDeposited;

    constructor(address _usdc) { usdc = IERC20(_usdc); }

    function deposit(uint8, uint256 amount) external {
        usdc.transferFrom(msg.sender, address(this), amount);
        totalDeposited += amount;
    }
}

// ─── Minimal Registry stub (calls creditCommission) ──────────────────────────
contract MockRegistry {
    ReferralVault public vault;
    MockUSDC      public usdc;

    constructor(address _vault, address _usdc) {
        vault = ReferralVault(_vault);
        usdc  = MockUSDC(_usdc);
    }

    /// Simulates a purchase: pulls price from buyer, approves vault, calls creditCommission.
    function purchase(address buyer, uint256 price, bool isCity, string calldata country)
        external returns (uint256)
    {
        usdc.transferFrom(buyer, address(this), price);
        usdc.approve(address(vault), price);
        return vault.creditCommission(buyer, price, isCity, country);
    }
}

contract ReferralVaultTest is Test {
    MockUSDC      usdc;
    MockTreasury  treasury;
    ReferralVault vault;
    MockRegistry  registry;

    address owner   = address(0x1);
    address alice   = address(0x2);  // buyer
    address bob     = address(0x3);  // level-1 referrer of alice
    address carol   = address(0x4);  // level-2 referrer (bob's referrer)
    address dave    = address(0x5);  // unregistered buyer

    uint256 constant L1_BPS = 2_000;
    uint256 constant L2_BPS = 1_000;

    function setUp() public {
        usdc     = new MockUSDC();
        treasury = new MockTreasury(address(usdc));
        vault    = new ReferralVault(address(usdc), address(treasury), owner);
        registry = new MockRegistry(address(vault), address(usdc));

        vm.prank(owner);
        vault.setRegistry(address(registry), true);

        // Give alice 10M USDC (enough for all tier tests)
        usdc.mint(alice, 10_000_000_000);
        vm.prank(alice);
        usdc.approve(address(registry), type(uint256).max);

        usdc.mint(dave, 10_000_000_000);
        vm.prank(dave);
        usdc.approve(address(registry), type(uint256).max);
    }

    // ─── Registration ──────────────────────────────────────────────────────────

    function test_RegisterReferrer_Success() public {
        vm.prank(alice);
        vault.registerReferrer(bob);
        assertEq(vault.referrerOf(alice), bob);
        assertTrue(vault.registered(alice));
    }

    function test_RegisterReferrer_SelfAllowed() public {
        vm.prank(alice);
        vault.registerReferrer(alice);
        assertEq(vault.referrerOf(alice), alice);
    }

    function test_RegisterReferrer_ZeroAddress() public {
        vm.prank(alice);
        vault.registerReferrer(address(0));
        assertEq(vault.referrerOf(alice), address(0));
    }

    function test_RegisterReferrer_CannotChangeAfterRegistered() public {
        vm.prank(alice);
        vault.registerReferrer(bob);

        vm.prank(alice);
        vm.expectRevert(ReferralVault.AlreadyRegistered.selector);
        vault.registerReferrer(carol);
    }

    // ─── 2-level commission math — exact USDC units for every tier ────────────

    // tier 1 city: $7,500 = 7_500_000_000 units (6 decimals)
    // L1 = 7_500_000_000 * 2000/10000 = 1_500_000_000
    // L2 = 7_500_000_000 * 1000/10000 =   750_000_000
    function test_Commission_Tier1_City() public {
        _setupChain(alice, bob, carol);
        uint256 price = 7_500_000_000;
        uint256 commission = registry.purchase(alice, price, true, "");
        assertEq(commission, 1_500_000_000 + 750_000_000, "tier1 total");
        assertEq(vault.unclaimed(bob),   1_500_000_000, "tier1 L1");
        assertEq(vault.unclaimed(carol),   750_000_000, "tier1 L2");
    }

    // tier 2: $3,000 = 3_000_000_000
    function test_Commission_Tier2_City() public {
        _setupChain(alice, bob, carol);
        uint256 price = 3_000_000_000;
        registry.purchase(alice, price, true, "");
        assertEq(vault.unclaimed(bob),   600_000_000, "tier2 L1");
        assertEq(vault.unclaimed(carol), 300_000_000, "tier2 L2");
    }

    // tier 3: $1,200 = 1_200_000_000
    function test_Commission_Tier3_City() public {
        _setupChain(alice, bob, carol);
        uint256 price = 1_200_000_000;
        registry.purchase(alice, price, true, "");
        assertEq(vault.unclaimed(bob),   240_000_000, "tier3 L1");
        assertEq(vault.unclaimed(carol), 120_000_000, "tier3 L2");
    }

    // tier 4: $400 = 400_000_000
    function test_Commission_Tier4_City() public {
        _setupChain(alice, bob, carol);
        uint256 price = 400_000_000;
        registry.purchase(alice, price, true, "");
        assertEq(vault.unclaimed(bob),   80_000_000, "tier4 L1");
        assertEq(vault.unclaimed(carol), 40_000_000, "tier4 L2");
    }

    // tier 5: $120 = 120_000_000
    function test_Commission_Tier5_City() public {
        _setupChain(alice, bob, carol);
        uint256 price = 120_000_000;
        registry.purchase(alice, price, true, "");
        assertEq(vault.unclaimed(bob),   24_000_000, "tier5 L1");
        assertEq(vault.unclaimed(carol), 12_000_000, "tier5 L2");
    }

    // tier 6: $40 = 40_000_000
    function test_Commission_Tier6_City() public {
        _setupChain(alice, bob, carol);
        uint256 price = 40_000_000;
        registry.purchase(alice, price, true, "");
        assertEq(vault.unclaimed(bob),   8_000_000, "tier6 L1");
        assertEq(vault.unclaimed(carol), 4_000_000, "tier6 L2");
    }

    // district floor: $5 = 5_000_000
    function test_Commission_DistrictFloor() public {
        _setupChain(alice, bob, carol);
        uint256 price = 5_000_000;
        registry.purchase(alice, price, false, "");
        assertEq(vault.unclaimed(bob),   1_000_000, "floor L1");
        assertEq(vault.unclaimed(carol),   500_000, "floor L2");
    }

    // ─── L1 missing → goes to Treasury ────────────────────────────────────────
    function test_Commission_L1Missing_GoesToTreasury() public {
        // alice has no referrer registered; bob is level-2 (unreachable — no L1)
        // → both shares go to treasury
        uint256 price = 100_000_000;
        uint256 before = treasury.totalDeposited();
        registry.purchase(alice, price, true, "");
        uint256 totalComm = (price * L1_BPS / 10_000) + (price * L2_BPS / 10_000);
        assertEq(treasury.totalDeposited() - before, totalComm, "all to treasury");
        assertEq(vault.unclaimed(bob),   0);
        assertEq(vault.unclaimed(carol), 0);
    }

    // ─── L2 missing → L2 share goes to Treasury ───────────────────────────────
    function test_Commission_L2Missing_GoesToTreasury() public {
        // alice → bob, bob has no referrer
        vm.prank(alice); vault.registerReferrer(bob);
        // bob registered but with address(0)
        vm.prank(bob); vault.registerReferrer(address(0));

        uint256 price = 100_000_000;
        uint256 before = treasury.totalDeposited();
        registry.purchase(alice, price, true, "");

        uint256 l1 = price * L1_BPS / 10_000; // 10_000_000
        uint256 l2 = price * L2_BPS / 10_000; //  5_000_000
        assertEq(vault.unclaimed(bob), l1, "bob L1");
        assertEq(treasury.totalDeposited() - before, l2, "L2 to treasury");
    }

    // ─── Invariant: total commission never exceeds price ──────────────────────
    function test_Commission_NeverExceedsPrice() public {
        _setupChain(alice, bob, carol);
        // Set BPS to maximum caps
        vm.prank(owner);
        vault.setDefaultBps(3_000, 1_500);
        // total = 4500/10000 = 45% — within price
        uint256 price = 100_000_000;
        uint256 comm = registry.purchase(alice, price, true, "");
        assertLe(comm, price, "commission <= price");
    }

    function test_Commission_HardCapEnforced_L1() public {
        vm.prank(owner);
        vm.expectRevert(ReferralVault.ExceedsHardCap.selector);
        vault.setDefaultBps(3_001, 500);
    }

    function test_Commission_HardCapEnforced_L2() public {
        vm.prank(owner);
        vm.expectRevert(ReferralVault.ExceedsHardCap.selector);
        vault.setDefaultBps(1_000, 1_501);
    }

    // ─── Claim ────────────────────────────────────────────────────────────────
    function test_Claim_Success() public {
        _setupChain(alice, bob, carol);
        uint256 price = 100_000_000;
        registry.purchase(alice, price, true, "");

        uint256 bobExpected = price * L1_BPS / 10_000;
        uint256 before = usdc.balanceOf(bob);

        vm.prank(bob);
        vault.claim();

        assertEq(usdc.balanceOf(bob) - before, bobExpected, "bob received");
        assertEq(vault.unclaimed(bob), 0, "bob unclaimed cleared");
    }

    function test_Claim_Zero_Reverts() public {
        vm.prank(bob);
        vm.expectRevert(ReferralVault.ZeroAmount.selector);
        vault.claim();
    }

    function test_Claim_MultiplePurchases_Accumulate() public {
        _setupChain(alice, bob, carol);
        uint256 price = 40_000_000;
        registry.purchase(alice, price, true, "");
        registry.purchase(alice, price, true, "");
        // 2 purchases: 2 * (8_000_000) = 16_000_000 for bob
        assertEq(vault.unclaimed(bob), 16_000_000, "accumulated");
    }

    // ─── Vault balance invariant ──────────────────────────────────────────────
    function test_VaultBalance_CoversUnclaimed() public {
        _setupChain(alice, bob, carol);
        uint256 price = 1_200_000_000;
        registry.purchase(alice, price, true, "");
        assertGe(
            usdc.balanceOf(address(vault)),
            vault.totalUnclaimed(),
            "vault balance >= totalUnclaimed"
        );
    }

    // ─── Switches ─────────────────────────────────────────────────────────────
    function test_Switch_GlobalOff_NoCommission() public {
        _setupChain(alice, bob, carol);
        vm.prank(owner); vault.setGlobalEnabled(false);

        uint256 price = 100_000_000;
        uint256 comm = registry.purchase(alice, price, true, "");
        assertEq(comm, 0, "no commission when global off");
        assertEq(vault.unclaimed(bob), 0);
    }

    function test_Switch_CitiesOff_NoCommissionOnCity() public {
        _setupChain(alice, bob, carol);
        vm.prank(owner); vault.setCitiesEnabled(false);

        uint256 price = 100_000_000;
        uint256 comm = registry.purchase(alice, price, true, "");
        assertEq(comm, 0, "no commission for city when citiesEnabled=false");
    }

    function test_Switch_DistrictsOff_NoCommissionOnDistrict() public {
        _setupChain(alice, bob, carol);
        vm.prank(owner); vault.setDistrictsEnabled(false);

        uint256 price = 100_000_000;
        uint256 comm = registry.purchase(alice, price, false, "");
        assertEq(comm, 0, "no commission for district when districtsEnabled=false");
    }

    function test_Switch_CountryOff_NoCommission() public {
        _setupChain(alice, bob, carol);
        vm.prank(owner); vault.setCountryDisabled("US", true);

        uint256 price = 100_000_000;
        uint256 comm = registry.purchase(alice, price, true, "US");
        assertEq(comm, 0, "no commission for disabled country");
    }

    function test_Switch_CountryOff_OtherCountryStillWorks() public {
        _setupChain(alice, bob, carol);
        vm.prank(owner); vault.setCountryDisabled("US", true);

        uint256 price = 100_000_000;
        uint256 comm = registry.purchase(alice, price, true, "GB");
        assertGt(comm, 0, "GB still gets commission");
    }

    // ─── Claim blocklist ──────────────────────────────────────────────────────
    function test_ClaimCountryBlocklist_BlocksClaim() public {
        _setupChain(alice, bob, carol);
        registry.purchase(alice, 100_000_000, true, "");

        vm.prank(owner); vault.setWalletCountry(bob, "XX");
        vm.prank(owner); vault.setClaimCountryBlocklist("XX", true);

        vm.prank(bob);
        vm.expectRevert(ReferralVault.ClaimBlocked.selector);
        vault.claim();
    }

    // ─── KYC ─────────────────────────────────────────────────────────────────
    function test_KycRequired_BlocksUnknownClaim() public {
        _setupChain(alice, bob, carol);
        registry.purchase(alice, 100_000_000, true, "");

        vm.prank(owner); vault.setKycRequired(true);

        vm.prank(bob);
        vm.expectRevert(ReferralVault.KycRequired.selector);
        vault.claim();
    }

    function test_KycRequired_AllowsApprovedClaim() public {
        _setupChain(alice, bob, carol);
        registry.purchase(alice, 100_000_000, true, "");

        vm.prank(owner); vault.setKycRequired(true);
        vm.prank(owner); vault.setKycApproved(bob, true);

        vm.prank(bob);
        vault.claim(); // should not revert
    }

    // ─── Unauthorized registry ────────────────────────────────────────────────
    function test_CreditCommission_UnauthorizedRegistryReverts() public {
        vm.expectRevert(ReferralVault.NotAuthorizedRegistry.selector);
        vault.creditCommission(alice, 100_000_000, true, "");
    }

    // ─── Non-license activity (no commission) ─────────────────────────────────
    // Demonstrated by: a contract NOT in isRegistry[] cannot call creditCommission.
    // The vault only pays commission when called by an approved registry (city/district purchase).
    function test_NonRegistry_CannotCreditCommission() public {
        vm.prank(alice); // alice is not a registry
        vm.expectRevert(ReferralVault.NotAuthorizedRegistry.selector);
        vault.creditCommission(alice, 100_000_000, false, "");
    }

    // ─── Loop safety (self-referral at both levels) ────────────────────────────
    // alice → alice (self-referral), alice's L2 referrer = alice again
    // Should not infinite loop — we only walk 2 levels.
    function test_SelfReferralLoop_Safe() public {
        vm.prank(alice); vault.registerReferrer(alice);
        // alice is registered, alice's referrer is alice → L1=alice, L2=alice
        uint256 price = 100_000_000;
        uint256 comm = registry.purchase(alice, price, true, "");
        // Both levels credit alice
        uint256 l1 = price * L1_BPS / 10_000;
        uint256 l2 = price * L2_BPS / 10_000;
        assertEq(vault.unclaimed(alice), l1 + l2, "self-ref both levels");
        assertEq(comm, l1 + l2);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────
    function _setupChain(address buyer, address l1, address l2) internal {
        vm.prank(l2);   vault.registerReferrer(address(0)); // carol has no referrer
        vm.prank(l1);   vault.registerReferrer(l2);         // bob → carol
        vm.prank(buyer); vault.registerReferrer(l1);        // alice → bob
    }
}
