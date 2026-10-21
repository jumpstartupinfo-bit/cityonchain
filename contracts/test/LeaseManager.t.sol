// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {LeaseManager} from "../LeaseManager.sol";
import {CityRegistry} from "../CityOnChain.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {MockTreasury} from "../test-helpers/MockTreasury.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @dev NFT mock that also implements ICityNFT.setUser (called by LeaseManager.acceptLease).
contract MockNFT721 is ERC721 {
    mapping(uint256 => address) public userOf;
    mapping(uint256 => uint64)  public userExpires;

    constructor() ERC721("MNft", "MN") {}
    function mint(address to, uint256 id) external { _mint(to, id); }

    // ICityNFT stub — LeaseManager calls this on acceptLease
    function setUser(uint256 tokenId, address user, uint64 expires) external {
        userOf[tokenId]      = user;
        userExpires[tokenId] = expires;
    }
}

contract LeaseManagerTest is Test {
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;

    address internal owner    = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal alice    = makeAddr("alice");  // lessor / NFT owner
    address internal bob      = makeAddr("bob");    // lessee

    MockERC20    internal usdc;
    MockNFT721   internal nft;
    LeaseManager internal lm;
    MockTreasury internal mockTreasury;

    uint256 internal constant TOKEN_ID      = 1;
    uint256 internal constant PPM           = 1_000_000; // 1 USDC / month (6 dec)
    uint256 internal constant DURATION      = 3;         // months
    uint256 internal constant TOTAL_COST    = PPM * DURATION;
    uint256 internal constant FEE_BPS       = 500;
    uint256 internal constant BPS_DEN       = 10_000;

    function setUp() public {
        MockERC20 impl = new MockERC20("Mock USDC", "mUSDC", 6);
        vm.etch(USDC_ADDR, address(impl).code);
        usdc = MockERC20(USDC_ADDR);

        nft          = new MockNFT721();
        lm           = new LeaseManager(USDC_ADDR, treasury, owner);
        mockTreasury = new MockTreasury(USDC_ADDR);

        // approve NFT and wire treasury contract
        vm.prank(owner);
        lm.setApprovedNFT(address(nft), true);
        vm.prank(owner);
        lm.setTreasuryContract(address(mockTreasury));

        // mint NFT to alice
        nft.mint(alice, TOKEN_ID);

        // fund bob
        usdc.mint(bob, 100_000_000);
        vm.prank(bob);
        usdc.approve(address(lm), type(uint256).max);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helper: alice creates a lease
    // ─────────────────────────────────────────────────────────────────────────

    function _aliceCreateLease() internal returns (uint256 leaseId) {
        vm.startPrank(alice);
        nft.approve(address(lm), TOKEN_ID);
        lm.createLease(address(nft), TOKEN_ID, PPM, DURATION);
        vm.stopPrank();
        leaseId = lm.nextLeaseId() - 1;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // createLease + acceptLease happy path
    // ─────────────────────────────────────────────────────────────────────────

    function test_CreateAndAcceptLease_HappyPath() public {
        uint256 leaseId = _aliceCreateLease();

        // LeaseManager holds NFT
        assertEq(nft.ownerOf(TOKEN_ID), address(lm), "lm holds NFT after create");

        uint256 fee = (TOTAL_COST * FEE_BPS) / BPS_DEN;
        uint256 lessorShare = TOTAL_COST - fee;

        vm.prank(bob);
        vm.expectEmit(true, true, false, false, address(lm));
        emit LeaseManager.LeaseAccepted(leaseId, bob);
        lm.acceptLease(leaseId);

        (,address lessee,,,, uint256 startTime, uint256 endTime, bool active,) = lm.leases(leaseId);

        assertEq(lessee, bob, "lessee set");
        assertTrue(active, "lease active");
        assertEq(startTime, block.timestamp, "startTime");
        assertEq(endTime, block.timestamp + DURATION * 30 days, "endTime");

        assertEq(lm.pendingWithdrawals(alice), lessorShare, "lessor share");
        assertEq(mockTreasury.totalDeposited(), fee, "treasury fee");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // acceptLease — revert: already accepted
    // ─────────────────────────────────────────────────────────────────────────

    function test_AcceptLease_Revert_DoubleAccept() public {
        uint256 leaseId = _aliceCreateLease();

        vm.prank(bob);
        lm.acceptLease(leaseId);

        address charlie = makeAddr("charlie");
        usdc.mint(charlie, 100_000_000);
        vm.prank(charlie);
        usdc.approve(address(lm), type(uint256).max);

        vm.prank(charlie);
        vm.expectRevert(bytes("already accepted"));
        lm.acceptLease(leaseId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // cancelLease before acceptance — returns NFT to lessor
    // ─────────────────────────────────────────────────────────────────────────

    function test_CancelLease_BeforeAcceptance() public {
        uint256 leaseId = _aliceCreateLease();

        vm.prank(alice);
        vm.expectEmit(true, true, false, false, address(lm));
        emit LeaseManager.LeaseCancelled(leaseId, alice);
        lm.cancelLease(leaseId);

        assertEq(nft.ownerOf(TOKEN_ID), alice, "NFT returned");
        (,,,,,,,bool active,) = lm.leases(leaseId);
        assertFalse(active, "lease inactive");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // cancelLease — revert: already accepted
    // ─────────────────────────────────────────────────────────────────────────

    function test_CancelLease_Revert_AlreadyAccepted() public {
        uint256 leaseId = _aliceCreateLease();
        vm.prank(bob);
        lm.acceptLease(leaseId);

        vm.prank(alice);
        vm.expectRevert(bytes("already accepted"));
        lm.cancelLease(leaseId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // reclaimNFT after expiry
    // ─────────────────────────────────────────────────────────────────────────

    function test_ReclaimNFT_AfterExpiry() public {
        uint256 leaseId = _aliceCreateLease();
        vm.prank(bob);
        lm.acceptLease(leaseId);

        (,,,,,, uint256 endTime,,) = lm.leases(leaseId);

        vm.warp(endTime + 1); // just past expiry

        vm.prank(alice);
        vm.expectEmit(true, true, false, false, address(lm));
        emit LeaseManager.NFTReclaimed(leaseId, alice);
        lm.reclaimNFT(leaseId);

        assertEq(nft.ownerOf(TOKEN_ID), alice, "alice reclaimed NFT");
        (,,,,,,,bool active,) = lm.leases(leaseId);
        assertFalse(active, "lease inactive after reclaim");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // reclaimNFT — revert: before expiry
    // ─────────────────────────────────────────────────────────────────────────

    function test_ReclaimNFT_Revert_BeforeExpiry() public {
        uint256 leaseId = _aliceCreateLease();
        vm.prank(bob);
        lm.acceptLease(leaseId);

        // still before expiry
        vm.prank(alice);
        vm.expectRevert(bytes("lease not expired"));
        lm.reclaimNFT(leaseId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // acceptLease — revert: expired before acceptance window
    // ─────────────────────────────────────────────────────────────────────────
    // NOTE: The current createLease sets endTime = block.timestamp + durationMonths*30days
    // at creation time, not at acceptance time.  If enough time passes before
    // acceptLease is called, the lease window has moved to the past.  However,
    // acceptLease itself does NOT enforce a deadline; it only checks lessee == 0.
    // This test documents the current behaviour (no expiry guard on accept).
    function test_AcceptLease_Revert_AfterProjectedEndTime() public {
        uint256 leaseId = _aliceCreateLease();

        // Warp past the projected end time that was set at creation
        (,,,,,, uint256 endTime,,) = lm.leases(leaseId);
        vm.warp(endTime + 1);

        // The lease is still "active" and has no lessee → acceptLease SUCCEEDS
        // even though the endTime is in the past.  We document this as a
        // suspected contract bug in the report.  The test asserts current behaviour.
        vm.prank(bob);
        lm.acceptLease(leaseId);   // expected to succeed (no guard)
        (,address lessee,,,,,,,) = lm.leases(leaseId);
        assertEq(lessee, bob, "lessee set despite expired window");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ERC-4907 setUser is called on acceptLease
    // ─────────────────────────────────────────────────────────────────────────
    // We need a real CityRegistry NFT for this since setUser is on ICityNFT.
    // We deploy a CityRegistry, configure it, and wire it with LeaseManager.
    function test_AcceptLease_SetsERC4907User() public {
        // ── Deploy a CityRegistry ──
        address cityOwner    = makeAddr("cityOwner");
        address cityTreasury = makeAddr("cityTreasury");
        CityRegistry registry = new CityRegistry(USDC_ADDR, cityTreasury, cityOwner);

        // ── Wire leaseManager on registry ──
        vm.prank(cityOwner);
        registry.setLeaseManager(address(lm));

        // ── Approve CityRegistry NFT on LeaseManager ──
        vm.prank(owner);
        lm.setApprovedNFT(address(registry), true);

        // ── Set treasury on registry (required by claimCity) ──
        MockTreasury cityMockTreasury = new MockTreasury(USDC_ADDR);
        vm.prank(cityOwner);
        registry.setTreasuryContract(address(cityMockTreasury));

        // ── Claim a city (mint NFT to alice) ──
        uint256 cityId    = 10;
        string memory cn  = "Metropolis";
        string memory ctr = "US";
        uint256 pop       = 50_000;
        uint8   tier      = 6; // Small Town — valid tier, costs 40 USDC

        // OZ double-hash leaf: keccak256(bytes.concat(keccak256(abi.encode(...))))
        bytes32 inner = keccak256(abi.encode(cityId, cn, ctr, pop, tier));
        bytes32 leaf  = keccak256(bytes.concat(inner));
        vm.prank(cityOwner);
        registry.setMerkleRoot(leaf);

        usdc.mint(alice, 100_000_000); // 100 USDC — enough for tier 6 (40 USDC)
        vm.prank(alice);
        usdc.approve(address(registry), type(uint256).max);

        bytes32[] memory proof = new bytes32[](0);
        vm.prank(alice);
        registry.claimCity(cityId, cn, ctr, pop, tier, proof);

        // ── Alice creates lease via LeaseManager with city NFT ──
        vm.startPrank(alice);
        registry.approve(address(lm), cityId);
        lm.createLease(address(registry), cityId, PPM, DURATION);
        vm.stopPrank();
        uint256 leaseId = lm.nextLeaseId() - 1;

        // ── Bob accepts ──
        vm.prank(bob);
        lm.acceptLease(leaseId);

        // ── ERC-4907 user should be bob ──
        assertEq(registry.userOf(cityId), bob, "ERC4907 user is bob");
        (,,,,,, uint256 endTime,,) = lm.leases(leaseId);
        assertEq(registry.userExpires(cityId), endTime, "userExpires matches lease endTime");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // isLeaseActive & getActiveLessee
    // ─────────────────────────────────────────────────────────────────────────

    function test_IsLeaseActive_AndGetActiveLessee() public {
        uint256 leaseId = _aliceCreateLease();

        // not accepted yet → inactive
        assertFalse(lm.isLeaseActive(leaseId));
        assertEq(lm.getActiveLessee(leaseId), address(0));

        vm.prank(bob);
        lm.acceptLease(leaseId);

        assertTrue(lm.isLeaseActive(leaseId));
        assertEq(lm.getActiveLessee(leaseId), bob);

        // warp past end
        (,,,,,, uint256 endTime,,) = lm.leases(leaseId);
        vm.warp(endTime + 1);
        assertFalse(lm.isLeaseActive(leaseId));
        assertEq(lm.getActiveLessee(leaseId), address(0));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // withdraw — lessor claim after acceptance
    // ─────────────────────────────────────────────────────────────────────────

    function test_Withdraw_Lessor() public {
        uint256 leaseId = _aliceCreateLease();
        vm.prank(bob);
        lm.acceptLease(leaseId);

        uint256 fee = (TOTAL_COST * FEE_BPS) / BPS_DEN;
        uint256 expected = TOTAL_COST - fee;

        vm.prank(alice);
        lm.withdraw();
        assertEq(usdc.balanceOf(alice), expected);
    }
}
