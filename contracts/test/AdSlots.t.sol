// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AdSlots} from "../AdSlots.sol";
import {RevenueSplitter} from "../RevenueSplitter.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {MockTreasury} from "../test-helpers/MockTreasury.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @dev Minimal NFT registries for RevenueSplitter
contract MockNFTReg is ERC721 {
    constructor(string memory n, string memory s) ERC721(n, s) {}
    function mint(address to, uint256 id) external { _mint(to, id); }
}

contract AdSlotsTest is Test {
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;

    address internal owner      = makeAddr("owner");
    address internal treasury   = makeAddr("treasury");
    address internal alice      = makeAddr("alice");   // advertiser
    address internal mayor      = makeAddr("mayor");
    address internal distOwner  = makeAddr("distOwner");

    MockERC20       internal usdc;
    RevenueSplitter internal revSplitter;
    AdSlots         internal adSlots;
    MockTreasury    internal mockTreasury;

    MockNFTReg internal cityReg;
    MockNFTReg internal districtReg;

    uint256 internal constant CITY_ID        = 1;
    uint256 internal constant DISTRICT_TOKEN = 105;
    uint256 internal constant PRICE_PER_DAY  = 1_000_000; // 1 USDC/day
    uint256 internal constant DURATION_DAYS  = 7;
    uint256 internal constant TOTAL_COST     = PRICE_PER_DAY * DURATION_DAYS;

    uint256 internal slotId;

    function setUp() public {
        // ── USDC mock ──────────────────────────────────────────────────────
        MockERC20 impl = new MockERC20("Mock USDC", "mUSDC", 6);
        vm.etch(USDC_ADDR, address(impl).code);
        usdc = MockERC20(USDC_ADDR);

        // ── NFT registries ─────────────────────────────────────────────────
        cityReg     = new MockNFTReg("CityReg", "CITY");
        districtReg = new MockNFTReg("DistReg", "DIST");
        cityReg.mint(mayor, CITY_ID);
        districtReg.mint(distOwner, DISTRICT_TOKEN);

        // ── RevenueSplitter ────────────────────────────────────────────────
        revSplitter  = new RevenueSplitter(USDC_ADDR, treasury, owner);
        mockTreasury = new MockTreasury(USDC_ADDR);
        vm.startPrank(owner);
        revSplitter.setCityRegistry(address(cityReg));
        revSplitter.setDistrictRegistry(address(districtReg));
        revSplitter.setTreasuryContract(address(mockTreasury));
        vm.stopPrank();

        // ── AdSlots ────────────────────────────────────────────────────────
        adSlots = new AdSlots(USDC_ADDR, treasury, address(revSplitter), address(cityReg), address(districtReg), owner);

        // ── Create a slot ──────────────────────────────────────────────────
        vm.prank(owner);
        adSlots.createSlot(CITY_ID, DISTRICT_TOKEN, PRICE_PER_DAY);
        slotId = adSlots.nextSlotId() - 1;

        // ── Fund alice ─────────────────────────────────────────────────────
        usdc.mint(alice, 100_000_000);
        vm.prank(alice);
        usdc.approve(address(adSlots), type(uint256).max);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // bookAd — happy path
    // ─────────────────────────────────────────────────────────────────────────

    function test_BookAd_HappyPath() public {
        uint256 startTime = block.timestamp;
        uint256 endTime   = startTime + DURATION_DAYS * 1 days;

        vm.prank(alice);
        vm.expectEmit(true, true, true, true, address(adSlots));
        emit AdSlots.AdBooked(1, slotId, alice, "Buy CityOnChain!", "https://example.com", startTime, endTime, PRICE_PER_DAY * DURATION_DAYS);
        adSlots.bookAd(slotId, "Buy CityOnChain!", "https://example.com", DURATION_DAYS);

        uint256 adId = adSlots.nextAdId() - 1;
        (
            uint256 aSlotId,
            address advertiser,
            string memory content,
            ,
            uint256 aStart,
            uint256 aEnd,
            ,
            ,
            bool active,
        ) = adSlots.ads(adId);

        assertEq(aSlotId,    slotId,              "slot id");
        assertEq(advertiser, alice,               "advertiser");
        assertEq(content,    "Buy CityOnChain!",  "ad content");
        assertEq(aStart,     startTime,           "startTime");
        assertEq(aEnd,       endTime,             "endTime");
        assertTrue(active,                        "ad active");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // bookAd — USDC distributed via RevenueSplitter
    // ─────────────────────────────────────────────────────────────────────────

    function test_BookAd_DistributesRevenue() public {
        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        adSlots.bookAd(slotId, "Hello World", "https://example.com", DURATION_DAYS);

        assertEq(usdc.balanceOf(alice), aliceBefore - TOTAL_COST, "alice debited");

        // Revenue is distributed via claimSlotEarnings (not bookAd).
        // Warp to after ad ends so the full amount is earned, then claim.
        uint256 adId = adSlots.nextAdId() - 1;
        (,,,, , uint256 endTime,,,,) = adSlots.ads(adId);
        vm.warp(endTime + 1);

        adSlots.claimSlotEarnings(adId);

        // verify split: default = platform 10%, mayor 20%, district 70%
        uint256 platformShare = (TOTAL_COST * 1_000) / 10_000;
        uint256 mayorShare    = (TOTAL_COST * 2_000) / 10_000;
        uint256 districtShare = TOTAL_COST - platformShare - mayorShare;

        assertEq(mockTreasury.totalDeposited(),              platformShare, "platform");
        assertEq(revSplitter.pendingWithdrawals(mayor),     mayorShare,    "mayor");
        assertEq(revSplitter.pendingWithdrawals(distOwner), districtShare, "district");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // isSlotAvailable returns false while ad active, true after expiry
    // ─────────────────────────────────────────────────────────────────────────

    function test_IsSlotAvailable_FalseWhileActive() public {
        assertTrue(adSlots.isSlotAvailable(slotId), "slot available before booking");

        vm.prank(alice);
        adSlots.bookAd(slotId, "Active Ad", "https://example.com", DURATION_DAYS);

        assertFalse(adSlots.isSlotAvailable(slotId), "slot NOT available while booked");
    }

    function test_IsSlotAvailable_TrueAfterExpiry() public {
        vm.prank(alice);
        adSlots.bookAd(slotId, "Short Ad", "https://example.com", DURATION_DAYS);

        uint256 adId = adSlots.nextAdId() - 1;
        (,,,,,uint256 endTime,,,,) = adSlots.ads(adId);

        // warp past expiry
        vm.warp(endTime + 1);

        assertTrue(adSlots.isSlotAvailable(slotId), "slot available after expiry");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // bookAd — revert: slot already booked (unexpired)
    // ─────────────────────────────────────────────────────────────────────────

    function test_BookAd_Revert_SlotBooked() public {
        vm.prank(alice);
        adSlots.bookAd(slotId, "First Ad", "https://example.com", DURATION_DAYS);

        address charlie = makeAddr("charlie");
        usdc.mint(charlie, 100_000_000);
        vm.prank(charlie);
        usdc.approve(address(adSlots), type(uint256).max);

        vm.prank(charlie);
        vm.expectRevert(AdSlots.SlotNotAvailable.selector);
        adSlots.bookAd(slotId, "Second Ad", "https://example.com", DURATION_DAYS);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // bookAd — revert: slot inactive
    // ─────────────────────────────────────────────────────────────────────────

    function test_BookAd_Revert_SlotInactive() public {
        vm.prank(owner);
        adSlots.deactivateSlot(slotId);

        vm.prank(alice);
        vm.expectRevert(AdSlots.SlotNotAvailable.selector);
        adSlots.bookAd(slotId, "Ad on dead slot", "https://example.com", DURATION_DAYS);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // bookAd — revert: empty content
    // ─────────────────────────────────────────────────────────────────────────

    function test_BookAd_EmptyContent_Succeeds() public {
        // The contract does not validate content — an empty string is accepted.
        vm.prank(alice);
        adSlots.bookAd(slotId, "", "https://example.com", DURATION_DAYS);

        uint256 adId = adSlots.nextAdId() - 1;
        (, address advertiser,,,,,,,,) = adSlots.ads(adId);
        assertEq(advertiser, alice, "empty-content ad booked");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // bookAd — revert: zero duration
    // ─────────────────────────────────────────────────────────────────────────

    function test_BookAd_Revert_ZeroDuration() public {
        vm.prank(alice);
        vm.expectRevert(AdSlots.InvalidDuration.selector);
        adSlots.bookAd(slotId, "Some ad", "https://example.com", 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // bookAd — revert: paused
    // ─────────────────────────────────────────────────────────────────────────

    function test_BookAd_Revert_WhenPaused() public {
        vm.prank(owner);
        adSlots.pause();

        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        adSlots.bookAd(slotId, "Paused Ad", "https://example.com", DURATION_DAYS);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // createSlot — revert: non-owner
    // ─────────────────────────────────────────────────────────────────────────

    function test_CreateSlot_Revert_NonOwner() public {
        // alice is neither the AdSlots admin nor the district owner → Unauthorized
        vm.prank(alice);
        vm.expectRevert(AdSlots.Unauthorized.selector);
        adSlots.createSlot(CITY_ID, DISTRICT_TOKEN, PRICE_PER_DAY);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // deactivateSlot — reverts when already inactive
    // ─────────────────────────────────────────────────────────────────────────

    function test_DeactivateSlot_Idempotent() public {
        // deactivateSlot sets active=false; calling again is idempotent (no revert).
        vm.prank(owner);
        adSlots.deactivateSlot(slotId);

        // Verify slot is inactive
        (,,,bool active,) = adSlots.slots(slotId);
        assertFalse(active, "slot deactivated");

        // Calling again succeeds (no check for already-inactive)
        vm.prank(owner);
        adSlots.deactivateSlot(slotId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // re-booking after expiry succeeds
    // ─────────────────────────────────────────────────────────────────────────

    function test_BookAd_Rebook_AfterExpiry() public {
        vm.prank(alice);
        adSlots.bookAd(slotId, "First booking", "https://example.com", DURATION_DAYS);

        uint256 adId = adSlots.nextAdId() - 1;
        (,,,,,uint256 endTime,,,,) = adSlots.ads(adId);
        vm.warp(endTime + 1);

        // second booking should succeed
        address bob2 = makeAddr("bob2");
        usdc.mint(bob2, 100_000_000);
        vm.prank(bob2);
        usdc.approve(address(adSlots), type(uint256).max);

        vm.prank(bob2);
        adSlots.bookAd(slotId, "Second booking", "https://example.com", DURATION_DAYS);

        assertEq(adSlots.latestAdForSlot(slotId), adSlots.nextAdId() - 1, "latestAd updated");
    }
}
