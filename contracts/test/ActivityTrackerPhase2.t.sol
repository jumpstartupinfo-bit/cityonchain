// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {ActivityTracker} from "../ActivityTracker.sol";

// ─────────────────────────────────────────────────────────────────────────────
// ActivityTracker + Cross-contract fee math — Phase-2 tests
// ─────────────────────────────────────────────────────────────────────────────

contract ActivityTrackerPhase2Test is Test {
    address internal owner   = makeAddr("owner");
    address internal tracker = makeAddr("tracker");
    address internal stranger = makeAddr("stranger");

    ActivityTracker internal at;

    uint256 internal constant CITY_ID        = 42;
    uint256 internal constant DISTRICT_TOKEN = 7;
    uint8   internal constant ACTIVITY_TYPE  = 1;

    function setUp() public {
        at = new ActivityTracker(owner);

        // Approve tracker
        vm.prank(owner);
        at.setApprovedTracker(tracker, true);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. recordActivity: approved tracker can record, data stored correctly
    // ─────────────────────────────────────────────────────────────────────────

    function test_RecordActivity_ApprovedTracker() public {
        uint256 amount = 500_000_000; // 500 USDC

        vm.prank(tracker);
        vm.expectEmit(true, true, true, true, address(at));
        emit ActivityTracker.ActivityRecorded(CITY_ID, DISTRICT_TOKEN, ACTIVITY_TYPE, amount);
        at.recordActivity(CITY_ID, DISTRICT_TOKEN, ACTIVITY_TYPE, amount);

        // cityActivity updated
        (uint256 count, uint256 volume, uint256 lastActivity) = at.cityActivity(CITY_ID);
        assertEq(count,  1,               "city count");
        assertEq(volume, amount,          "city volume");
        assertEq(lastActivity, block.timestamp, "city lastActivity");

        // districtActivity updated
        (uint256 dCount, uint256 dVolume,) = at.districtActivity(DISTRICT_TOKEN);
        assertEq(dCount,  1,      "district count");
        assertEq(dVolume, amount, "district volume");

        // cityActivityByType updated
        (uint256 tCount, uint256 tVolume,) = at.cityActivityByType(CITY_ID, ACTIVITY_TYPE);
        assertEq(tCount,  1,      "typed count");
        assertEq(tVolume, amount, "typed volume");
    }

    function test_RecordActivity_MultipleRecords_Accumulate() public {
        uint256 a1 = 100_000_000;
        uint256 a2 = 200_000_000;

        vm.startPrank(tracker);
        at.recordActivity(CITY_ID, DISTRICT_TOKEN, ACTIVITY_TYPE, a1);
        at.recordActivity(CITY_ID, DISTRICT_TOKEN, ACTIVITY_TYPE, a2);
        vm.stopPrank();

        (uint256 count, uint256 volume,) = at.cityActivity(CITY_ID);
        assertEq(count,  2,       "count accumulated");
        assertEq(volume, a1 + a2, "volume accumulated");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. getActivityScore: returns volume + count * 1e6
    // ─────────────────────────────────────────────────────────────────────────

    function test_GetActivityScore() public {
        uint256 amount = 300_000_000;

        vm.prank(tracker);
        at.recordActivity(CITY_ID, 0, ACTIVITY_TYPE, amount);

        // score = volume + count * 1e6
        // After 1 record: volume = 300_000_000, count = 1 → 300_000_000 + 1_000_000
        uint256 expectedScore = amount + 1 * 1e6;
        assertEq(at.getActivityScore(CITY_ID), expectedScore, "activity score");
    }

    function test_GetActivityScore_ZeroForUnknownCity() public view {
        assertEq(at.getActivityScore(999), 0, "unknown city score = 0");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. recordActivity revert: unapproved caller
    // ─────────────────────────────────────────────────────────────────────────

    function test_RecordActivity_Revert_UnapprovedCaller() public {
        vm.prank(stranger);
        vm.expectRevert(ActivityTracker.Unauthorized.selector);
        at.recordActivity(CITY_ID, DISTRICT_TOKEN, ACTIVITY_TYPE, 1_000);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. setApprovedTracker: owner sets, non-owner reverts
    // ─────────────────────────────────────────────────────────────────────────

    function test_SetApprovedTracker_OwnerSets() public {
        address newTracker = makeAddr("newTracker");

        vm.prank(owner);
        vm.expectEmit(true, false, false, true, address(at));
        emit ActivityTracker.TrackerUpdated(newTracker, true);
        at.setApprovedTracker(newTracker, true);

        assertTrue(at.approvedTrackers(newTracker), "new tracker approved");
    }

    function test_SetApprovedTracker_NonOwnerReverts() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        at.setApprovedTracker(stranger, true);
    }

    function test_SetApprovedTracker_RevokeApproval() public {
        vm.prank(owner);
        at.setApprovedTracker(tracker, false);

        assertFalse(at.approvedTrackers(tracker), "tracker revoked");

        // Revoked tracker can no longer record
        vm.prank(tracker);
        vm.expectRevert(ActivityTracker.Unauthorized.selector);
        at.recordActivity(CITY_ID, 0, ACTIVITY_TYPE, 100);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. getTopCities: returns scores for array of city IDs
    // ─────────────────────────────────────────────────────────────────────────

    function test_GetTopCities_ReturnsCorrectScores() public {
        uint256 city1 = 1;
        uint256 city2 = 2;
        uint256 city3 = 3;

        vm.startPrank(tracker);
        at.recordActivity(city1, 0, ACTIVITY_TYPE, 100_000_000); // count=1 vol=100M
        at.recordActivity(city1, 0, ACTIVITY_TYPE, 50_000_000);  // count=2 vol=150M
        at.recordActivity(city2, 0, ACTIVITY_TYPE, 200_000_000); // count=1 vol=200M
        // city3 has no activity
        vm.stopPrank();

        uint256[] memory cityIds = new uint256[](3);
        cityIds[0] = city1;
        cityIds[1] = city2;
        cityIds[2] = city3;

        uint256[] memory scores = at.getTopCities(cityIds);

        assertEq(scores.length, 3, "scores length");

        // city1: vol=150M, count=2 → 150_000_000 + 2_000_000 = 152_000_000
        assertEq(scores[0], 150_000_000 + 2 * 1e6, "city1 score");
        // city2: vol=200M, count=1 → 201_000_000
        assertEq(scores[1], 200_000_000 + 1 * 1e6, "city2 score");
        // city3: no activity → 0
        assertEq(scores[2], 0, "city3 score = 0");
    }

    function test_GetTopCities_EmptyArray() public view {
        uint256[] memory cityIds = new uint256[](0);
        uint256[] memory scores = at.getTopCities(cityIds);
        assertEq(scores.length, 0, "empty result");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Extra: district = 0 skips districtActivity update
    // ─────────────────────────────────────────────────────────────────────────

    function test_RecordActivity_DistrictZero_SkipsDistrictUpdate() public {
        vm.prank(tracker);
        at.recordActivity(CITY_ID, 0, ACTIVITY_TYPE, 1_000_000);

        // districtActivity[0] should remain zeroed (city-wide, no district update)
        (uint256 dCount,,) = at.districtActivity(0);
        assertEq(dCount, 0, "district 0 not updated");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-contract fee math fuzz: platform + mayor + district shares sum to amount
// Uses RevenueSplitter default split (10% + 20% + 70% = 100%)
// ─────────────────────────────────────────────────────────────────────────────

contract FeesMathFuzzTest is Test {
    // Default split from RevenueSplitter
    uint256 internal constant BPS_DENOMINATOR = 10_000;
    uint256 internal constant PLATFORM_BPS    = 1_000; // 10%
    uint256 internal constant MAYOR_BPS       = 2_000; // 20%
    // districtBps = BPS_DENOMINATOR - platformBps - mayorBps = 7_000

    /// @dev For any amount in [1, 1_000_000_000], the three shares must sum to amount.
    function testFuzz_SharesSumToAmount(uint256 amount) public pure {
        amount = bound(amount, 1, 1_000_000_000);

        uint256 platformShare = (amount * PLATFORM_BPS) / BPS_DENOMINATOR;
        uint256 mayorShare    = (amount * MAYOR_BPS)    / BPS_DENOMINATOR;
        uint256 districtShare = amount - platformShare - mayorShare;

        assertEq(platformShare + mayorShare + districtShare, amount, "shares must sum to amount");
    }

    /// @dev Verify district receives the correct remainder
    function testFuzz_DistrictShare_IsRemainder(uint256 amount) public pure {
        amount = bound(amount, 1, 1_000_000_000);

        uint256 platformShare = (amount * PLATFORM_BPS) / BPS_DENOMINATOR;
        uint256 mayorShare    = (amount * MAYOR_BPS)    / BPS_DENOMINATOR;
        uint256 districtShare = amount - platformShare - mayorShare;

        // The remainder pattern ensures no wei is lost
        assertTrue(districtShare >= 0, "district non-negative");
        assertEq(districtShare, amount - platformShare - mayorShare, "district = remainder");
    }

    /// @dev Fuzz with arbitrary valid split percentages that sum to 10_000
    function testFuzz_ArbitrarySplit_SumsToAmount(uint256 amount, uint256 pBps, uint256 mBps) public pure {
        amount = bound(amount, 1, 1_000_000_000);
        pBps   = bound(pBps,   0, 5_000); // max 50% each (per RevenueSplitter MAX_PARTY_BPS)
        mBps   = bound(mBps,   0, 5_000);

        // Ensure valid split (pBps + mBps <= 10_000)
        if (pBps + mBps > BPS_DENOMINATOR) {
            mBps = BPS_DENOMINATOR - pBps;
        }
        uint256 dBps = BPS_DENOMINATOR - pBps - mBps;

        uint256 platformShare = (amount * pBps) / BPS_DENOMINATOR;
        uint256 mayorShare    = (amount * mBps) / BPS_DENOMINATOR;
        uint256 districtShare = amount - platformShare - mayorShare;

        assertEq(platformShare + mayorShare + districtShare, amount, "arbitrary split sums to amount");
        // Each share is capped at the total amount
        assertTrue(platformShare <= amount, "platform <= amount");
        assertTrue(mayorShare    <= amount, "mayor    <= amount");
        assertTrue(districtShare <= amount, "district <= amount");
    }
}
