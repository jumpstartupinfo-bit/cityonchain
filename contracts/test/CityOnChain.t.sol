// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {CityRegistry} from "../CityOnChain.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {MockTreasury} from "../test-helpers/MockTreasury.sol";

/**
 * CityRegistry tests — 6 display tiers (1–6), wallet-agnostic OZ double-hash leaf.
 *
 * Leaf = keccak256(bytes.concat(keccak256(abi.encode(cityId, name, country, population, tier))))
 *
 * Key properties:
 *  - No msg.sender in the leaf — any wallet can claim from a valid proof
 *  - City uniqueness enforced by the "city already minted" check
 *  - Wrong city data (different ID or tier) produces a different leaf → revert
 */
contract CityRegistryTest is Test {
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;

    address internal owner    = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal alice    = makeAddr("alice");
    address internal bob      = makeAddr("bob");
    address internal charlie  = makeAddr("charlie");

    MockERC20    internal usdc;
    MockTreasury internal mockTreasury;
    CityRegistry internal registry;

    // ── Tier 6 (Small Town): pop=50,000, displayTier=6, price=$40 USDC ────────
    uint256 internal constant CITY_ID_6    = 42;
    string  internal constant CITY_NAME_6  = "Springfield";
    string  internal constant COUNTRY_6    = "US";
    uint256 internal constant POPULATION_6 = 50_000;
    uint8   internal constant TIER_6       = 6;
    uint256 internal constant PRICE_6      = 40_000_000; // $40

    // ── Tier 1 (Mega City): pop=15,000,000, displayTier=1, price=$7,500 USDC ──
    uint256 internal constant CITY_ID_1    = 1;
    string  internal constant CITY_NAME_1  = "MetroCity";
    string  internal constant COUNTRY_1    = "JP";
    uint256 internal constant POPULATION_1 = 15_000_000;
    uint8   internal constant TIER_1       = 1;
    uint256 internal constant PRICE_1      = 7_500_000_000; // $7,500

    // ── Tier 2 (Major City): pop=4,000,000, displayTier=2, price=$3,000 USDC ──
    uint256 internal constant CITY_ID_2    = 2;
    string  internal constant CITY_NAME_2  = "Majorville";
    string  internal constant COUNTRY_2    = "BR";
    uint256 internal constant POPULATION_2 = 4_000_000;
    uint8   internal constant TIER_2       = 2;
    uint256 internal constant PRICE_2      = 3_000_000_000; // $3,000

    // ── Tier 3 (Large City) ─────────────────────────────────────────────────
    uint256 internal constant CITY_ID_3    = 3;
    string  internal constant CITY_NAME_3  = "Largeton";
    string  internal constant COUNTRY_3    = "DE";
    uint256 internal constant POPULATION_3 = 1_500_000;
    uint8   internal constant TIER_3       = 3;
    uint256 internal constant PRICE_3      = 1_200_000_000; // $1,200

    // ── Tier 4 (City) ───────────────────────────────────────────────────────
    uint256 internal constant CITY_ID_4    = 4;
    string  internal constant CITY_NAME_4  = "Midburg";
    string  internal constant COUNTRY_4    = "FR";
    uint256 internal constant POPULATION_4 = 500_000;
    uint8   internal constant TIER_4       = 4;
    uint256 internal constant PRICE_4      = 400_000_000; // $400

    // ── Tier 5 (Town) ───────────────────────────────────────────────────────
    uint256 internal constant CITY_ID_5    = 5;
    string  internal constant CITY_NAME_5  = "Smallham";
    string  internal constant COUNTRY_5    = "GB";
    uint256 internal constant POPULATION_5 = 150_000;
    uint8   internal constant TIER_5       = 5;
    uint256 internal constant PRICE_5      = 120_000_000; // $120

    bytes32[] internal emptyProof;

    // ── OZ double-hash leaf helper ──────────────────────────────────────────
    function _makeLeaf(
        uint256 cityId,
        string memory name_,
        string memory country_,
        uint256 pop,
        uint8   tier
    ) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(cityId, name_, country_, pop, tier))));
    }

    /// For a single-leaf tree: root == leaf, proof is empty.
    function _buildRoot(
        uint256 cityId,
        string memory name_,
        string memory country_,
        uint256 pop,
        uint8   tier
    ) internal pure returns (bytes32 root) {
        root = _makeLeaf(cityId, name_, country_, pop, tier);
    }

    function _setupLeaf(
        uint256 cityId, string memory name_, string memory country_,
        uint256 pop, uint8 tier
    ) internal returns (bytes32 root) {
        root = _buildRoot(cityId, name_, country_, pop, tier);
        vm.prank(owner);
        registry.setMerkleRoot(root);
    }

    function setUp() public {
        MockERC20 mockImpl = new MockERC20("Mock USDC", "mUSDC", 6);
        vm.etch(USDC_ADDR, address(mockImpl).code);
        usdc = MockERC20(USDC_ADDR);

        mockTreasury = new MockTreasury(USDC_ADDR);
        registry = new CityRegistry(USDC_ADDR, treasury, owner);

        vm.prank(owner);
        registry.setTreasuryContract(address(mockTreasury));

        // Fund all test wallets generously
        usdc.mint(alice,   10_000_000_000); // $10,000
        usdc.mint(bob,     10_000_000_000);
        usdc.mint(charlie, 10_000_000_000);

        vm.prank(alice);   usdc.approve(address(registry), type(uint256).max);
        vm.prank(bob);     usdc.approve(address(registry), type(uint256).max);
        vm.prank(charlie); usdc.approve(address(registry), type(uint256).max);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TIER PRICE TESTS
    // ─────────────────────────────────────────────────────────────────────────

    function test_MegaCity_Costs7500() public {
        _setupLeaf(CITY_ID_1, CITY_NAME_1, COUNTRY_1, POPULATION_1, TIER_1);

        uint256 before_ = usdc.balanceOf(alice);
        vm.prank(alice);
        registry.claimCity(CITY_ID_1, CITY_NAME_1, COUNTRY_1, POPULATION_1, TIER_1, emptyProof);

        assertEq(usdc.balanceOf(alice), before_ - PRICE_1, "mega: debited $7,500");
        assertEq(registry.ownerOf(CITY_ID_1), alice);
        assertEq(registry.cityTier(CITY_ID_1), TIER_1);
        assertEq(mockTreasury.totalDeposited(), PRICE_1);
    }

    function test_MajorCity_Costs3000() public {
        _setupLeaf(CITY_ID_2, CITY_NAME_2, COUNTRY_2, POPULATION_2, TIER_2);

        uint256 before_ = usdc.balanceOf(alice);
        vm.prank(alice);
        registry.claimCity(CITY_ID_2, CITY_NAME_2, COUNTRY_2, POPULATION_2, TIER_2, emptyProof);

        assertEq(usdc.balanceOf(alice), before_ - PRICE_2, "major: debited $3,000");
        assertEq(registry.cityTier(CITY_ID_2), TIER_2);
    }

    function test_LargeCity_Costs1200() public {
        _setupLeaf(CITY_ID_3, CITY_NAME_3, COUNTRY_3, POPULATION_3, TIER_3);

        uint256 before_ = usdc.balanceOf(alice);
        vm.prank(alice);
        registry.claimCity(CITY_ID_3, CITY_NAME_3, COUNTRY_3, POPULATION_3, TIER_3, emptyProof);

        assertEq(usdc.balanceOf(alice), before_ - PRICE_3, "large: debited $1,200");
        assertEq(registry.cityTier(CITY_ID_3), TIER_3);
    }

    function test_City_Costs400() public {
        _setupLeaf(CITY_ID_4, CITY_NAME_4, COUNTRY_4, POPULATION_4, TIER_4);

        uint256 before_ = usdc.balanceOf(alice);
        vm.prank(alice);
        registry.claimCity(CITY_ID_4, CITY_NAME_4, COUNTRY_4, POPULATION_4, TIER_4, emptyProof);

        assertEq(usdc.balanceOf(alice), before_ - PRICE_4, "city: debited $400");
        assertEq(registry.cityTier(CITY_ID_4), TIER_4);
    }

    function test_Town_Costs120() public {
        _setupLeaf(CITY_ID_5, CITY_NAME_5, COUNTRY_5, POPULATION_5, TIER_5);

        uint256 before_ = usdc.balanceOf(alice);
        vm.prank(alice);
        registry.claimCity(CITY_ID_5, CITY_NAME_5, COUNTRY_5, POPULATION_5, TIER_5, emptyProof);

        assertEq(usdc.balanceOf(alice), before_ - PRICE_5, "town: debited $120");
        assertEq(registry.cityTier(CITY_ID_5), TIER_5);
    }

    function test_SmallTown_Costs40() public {
        _setupLeaf(CITY_ID_6, CITY_NAME_6, COUNTRY_6, POPULATION_6, TIER_6);

        uint256 before_ = usdc.balanceOf(alice);
        vm.prank(alice);
        registry.claimCity(CITY_ID_6, CITY_NAME_6, COUNTRY_6, POPULATION_6, TIER_6, emptyProof);

        assertEq(usdc.balanceOf(alice), before_ - PRICE_6, "small: debited $40");
        assertEq(registry.cityTier(CITY_ID_6), TIER_6);
        assertEq(mockTreasury.totalDeposited(), PRICE_6);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ANY WALLET CAN MINT WITH A VALID PROOF
    // ─────────────────────────────────────────────────────────────────────────

    /// Bob and Charlie can both claim *different* cities from the same root.
    /// The proof is city-specific, not wallet-specific.
    function test_AnyWallet_CanMint_WithValidProof() public {
        // Use a two-leaf tree: one leaf for city 6, one for city 1.
        // Since these are single-leaf roots, set root to city-6 leaf and let alice claim,
        // then switch root to city-1 leaf and let bob claim.
        _setupLeaf(CITY_ID_6, CITY_NAME_6, COUNTRY_6, POPULATION_6, TIER_6);

        // Alice claims city 6
        vm.prank(alice);
        registry.claimCity(CITY_ID_6, CITY_NAME_6, COUNTRY_6, POPULATION_6, TIER_6, emptyProof);
        assertEq(registry.ownerOf(CITY_ID_6), alice, "alice owns city 6");

        // Switch root to city 1 leaf
        _setupLeaf(CITY_ID_1, CITY_NAME_1, COUNTRY_1, POPULATION_1, TIER_1);

        // Bob (different wallet) claims city 1 with the same proof structure
        vm.prank(bob);
        registry.claimCity(CITY_ID_1, CITY_NAME_1, COUNTRY_1, POPULATION_1, TIER_1, emptyProof);
        assertEq(registry.ownerOf(CITY_ID_1), bob, "bob owns city 1");

        // Charlie claims city 2 after another root switch
        _setupLeaf(CITY_ID_2, CITY_NAME_2, COUNTRY_2, POPULATION_2, TIER_2);
        vm.prank(charlie);
        registry.claimCity(CITY_ID_2, CITY_NAME_2, COUNTRY_2, POPULATION_2, TIER_2, emptyProof);
        assertEq(registry.ownerOf(CITY_ID_2), charlie, "charlie owns city 2");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DOUBLE-MINT REVERT
    // ─────────────────────────────────────────────────────────────────────────

    /// The same city cannot be minted twice, even by a different wallet.
    function test_Revert_DoubleMint_SameCity() public {
        _setupLeaf(CITY_ID_6, CITY_NAME_6, COUNTRY_6, POPULATION_6, TIER_6);

        // Alice mints first
        vm.prank(alice);
        registry.claimCity(CITY_ID_6, CITY_NAME_6, COUNTRY_6, POPULATION_6, TIER_6, emptyProof);
        assertEq(registry.ownerOf(CITY_ID_6), alice);

        // Bob tries to mint the same city (root hasn't changed, proof is still valid)
        vm.prank(bob);
        vm.expectRevert(bytes("city already minted"));
        registry.claimCity(CITY_ID_6, CITY_NAME_6, COUNTRY_6, POPULATION_6, TIER_6, emptyProof);

        // Charlie also fails
        vm.prank(charlie);
        vm.expectRevert(bytes("city already minted"));
        registry.claimCity(CITY_ID_6, CITY_NAME_6, COUNTRY_6, POPULATION_6, TIER_6, emptyProof);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROOF FOR DIFFERENT CITY FAILS
    // ─────────────────────────────────────────────────────────────────────────

    /// A proof valid for city 6 cannot be used to claim city 1 — different leaf.
    function test_Revert_ProofForDifferentCity() public {
        // Root is built for city 6
        _setupLeaf(CITY_ID_6, CITY_NAME_6, COUNTRY_6, POPULATION_6, TIER_6);

        // Alice tries to claim city 1 — leaf differs from root
        vm.prank(alice);
        vm.expectRevert(bytes("invalid merkle proof"));
        registry.claimCity(CITY_ID_1, CITY_NAME_1, COUNTRY_1, POPULATION_1, TIER_1, emptyProof);

        // Also try with city 6's ID but wrong name — still fails
        vm.prank(alice);
        vm.expectRevert(bytes("invalid merkle proof"));
        registry.claimCity(CITY_ID_6, "WrongName", COUNTRY_6, POPULATION_6, TIER_6, emptyProof);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WRONG TIER FAILS
    // ─────────────────────────────────────────────────────────────────────────

    function test_Revert_WrongTierWithValidCityData() public {
        // Root is built for tier 1
        _setupLeaf(CITY_ID_1, CITY_NAME_1, COUNTRY_1, POPULATION_1, TIER_1);

        // Alice tries to claim with tier=2 (Major) — leaf won't match root
        vm.prank(alice);
        vm.expectRevert(bytes("invalid merkle proof"));
        registry.claimCity(CITY_ID_1, CITY_NAME_1, COUNTRY_1, POPULATION_1, uint8(2), emptyProof);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INVALID TIER RANGE
    // ─────────────────────────────────────────────────────────────────────────

    function test_ClaimCity_Revert_InvalidTier() public {
        vm.prank(alice);
        vm.expectRevert(CityRegistry.InvalidTier.selector);
        registry.claimCity(CITY_ID_6, CITY_NAME_6, COUNTRY_6, POPULATION_6, uint8(0), emptyProof);

        vm.prank(alice);
        vm.expectRevert(CityRegistry.InvalidTier.selector);
        registry.claimCity(CITY_ID_6, CITY_NAME_6, COUNTRY_6, POPULATION_6, uint8(7), emptyProof);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PAUSED
    // ─────────────────────────────────────────────────────────────────────────

    function test_ClaimCity_Revert_WhenPaused() public {
        vm.prank(owner);
        registry.pause();

        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        registry.claimCity(CITY_ID_6, CITY_NAME_6, COUNTRY_6, POPULATION_6, TIER_6, emptyProof);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CITY TIER STORED
    // ─────────────────────────────────────────────────────────────────────────

    function test_CityTier_StoredAfterMint() public {
        _setupLeaf(CITY_ID_1, CITY_NAME_1, COUNTRY_1, POPULATION_1, TIER_1);
        vm.prank(alice);
        registry.claimCity(CITY_ID_1, CITY_NAME_1, COUNTRY_1, POPULATION_1, TIER_1, emptyProof);

        assertEq(registry.getCityTier(CITY_ID_1), TIER_1, "getCityTier returns display tier");
        assertEq(registry.cityTier(CITY_ID_1), TIER_1, "cityTier mapping returns display tier");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ERC-4907
    // ─────────────────────────────────────────────────────────────────────────

    function test_SetUser_ByOwner() public {
        _setupLeaf(CITY_ID_6, CITY_NAME_6, COUNTRY_6, POPULATION_6, TIER_6);
        vm.prank(alice);
        registry.claimCity(CITY_ID_6, CITY_NAME_6, COUNTRY_6, POPULATION_6, TIER_6, emptyProof);

        uint64 expires = uint64(block.timestamp + 30 days);
        vm.prank(alice);
        registry.setUser(CITY_ID_6, bob, expires);

        assertEq(registry.userOf(CITY_ID_6), bob);
        assertEq(registry.userExpires(CITY_ID_6), expires);
    }

    function test_UserOf_ReturnsZeroAfterExpiry() public {
        _setupLeaf(CITY_ID_6, CITY_NAME_6, COUNTRY_6, POPULATION_6, TIER_6);
        vm.prank(alice);
        registry.claimCity(CITY_ID_6, CITY_NAME_6, COUNTRY_6, POPULATION_6, TIER_6, emptyProof);

        uint64 expires = uint64(block.timestamp + 1 days);
        vm.prank(alice);
        registry.setUser(CITY_ID_6, bob, expires);

        assertEq(registry.userOf(CITY_ID_6), bob);
        vm.warp(block.timestamp + 2 days);
        assertEq(registry.userOf(CITY_ID_6), address(0), "expired");
    }

    function test_SetUser_ClearedOnTransfer() public {
        _setupLeaf(CITY_ID_6, CITY_NAME_6, COUNTRY_6, POPULATION_6, TIER_6);
        vm.prank(alice);
        registry.claimCity(CITY_ID_6, CITY_NAME_6, COUNTRY_6, POPULATION_6, TIER_6, emptyProof);

        vm.prank(alice);
        registry.setUser(CITY_ID_6, bob, uint64(block.timestamp + 30 days));
        assertEq(registry.userOf(CITY_ID_6), bob);

        vm.prank(alice);
        registry.transferFrom(alice, bob, CITY_ID_6);
        assertEq(registry.userOf(CITY_ID_6), address(0), "cleared on transfer");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INTERFACE
    // ─────────────────────────────────────────────────────────────────────────

    function test_SupportsInterface_ERC4907() public view {
        assertTrue(registry.supportsInterface(0xad092b5c));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REVENUE
    // ─────────────────────────────────────────────────────────────────────────

    function test_CreditRevenue_OnlyRevenueSplitter() public {
        address splitter = makeAddr("splitter");
        vm.prank(owner);
        registry.setRevenueSplitter(splitter);

        vm.prank(splitter);
        registry.creditRevenue(alice, 1_000);
        assertEq(registry.pendingWithdrawals(alice), 1_000);
    }

    function test_CreditRevenue_Revert_Unauthorized() public {
        vm.prank(alice);
        vm.expectRevert(CityRegistry.UnauthorizedRevenueSplitter.selector);
        registry.creditRevenue(alice, 1_000);
    }
}
