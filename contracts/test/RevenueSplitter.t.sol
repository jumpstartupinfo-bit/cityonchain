// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {RevenueSplitter} from "../RevenueSplitter.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {MockTreasury} from "../test-helpers/MockTreasury.sol";

/// @dev Minimal ERC-721 used as a stand-in for CityRegistry / DistrictRegistry
///      so RevenueSplitter can call ownerOf().
contract MockNFTRegistry is ERC721 {
    constructor(string memory n, string memory s) ERC721(n, s) {}
    function mint(address to, uint256 id) external { _mint(to, id); }
}

contract RevenueSplitterTest is Test {
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;

    address internal owner    = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal alice    = makeAddr("alice");   // distributor / payer
    address internal mayor    = makeAddr("mayor");   // city NFT owner
    address internal district = makeAddr("district"); // district NFT owner

    MockERC20        internal usdc;
    MockNFTRegistry  internal cityReg;
    MockNFTRegistry  internal districtReg;
    RevenueSplitter  internal splitter;
    MockTreasury     internal mockTreasury;

    uint256 internal constant CITY_ID         = 1;
    uint256 internal constant DISTRICT_TOKEN  = 105; // cityId*100 + districtIndex

    // default split: platform=1000, mayor=2000, district=7000
    uint256 internal constant PLATFORM_BPS = 1_000;
    uint256 internal constant MAYOR_BPS    = 2_000;
    uint256 internal constant DISTRICT_BPS = 7_000;

    uint256 internal constant AMOUNT = 10_000_000; // 10 USDC

    function setUp() public {
        MockERC20 impl = new MockERC20("Mock USDC", "mUSDC", 6);
        vm.etch(USDC_ADDR, address(impl).code);
        usdc = MockERC20(USDC_ADDR);

        cityReg     = new MockNFTRegistry("CityReg", "CITY");
        districtReg = new MockNFTRegistry("DistReg", "DIST");

        splitter     = new RevenueSplitter(USDC_ADDR, treasury, owner);
        mockTreasury = new MockTreasury(USDC_ADDR);

        // wire registries + treasury
        vm.startPrank(owner);
        splitter.setCityRegistry(address(cityReg));
        splitter.setDistrictRegistry(address(districtReg));
        splitter.setTreasuryContract(address(mockTreasury));
        vm.stopPrank();

        // mint city & district NFTs to their owners
        cityReg.mint(mayor, CITY_ID);
        districtReg.mint(district, DISTRICT_TOKEN);

        // fund alice
        usdc.mint(alice, 100_000_000);
        vm.prank(alice);
        usdc.approve(address(splitter), type(uint256).max);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // distributeRevenue — default split math
    // ─────────────────────────────────────────────────────────────────────────

    function test_DistributeRevenue_DefaultSplit() public {
        uint256 platformShare = (AMOUNT * PLATFORM_BPS) / 10_000;
        uint256 mayorShare    = (AMOUNT * MAYOR_BPS)    / 10_000;
        uint256 districtShare = AMOUNT - platformShare - mayorShare;

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(splitter));
        emit RevenueSplitter.RevenueDistributed(
            CITY_ID, DISTRICT_TOKEN, AMOUNT, platformShare, mayorShare, districtShare, "activity"
        );
        splitter.distributeRevenue(CITY_ID, DISTRICT_TOKEN, AMOUNT);

        assertEq(mockTreasury.totalDeposited(),          platformShare, "platform share");
        assertEq(splitter.pendingWithdrawals(mayor),     mayorShare,    "mayor share");
        assertEq(splitter.pendingWithdrawals(district),  districtShare, "district share");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // distributeRevenue — custom split
    // ─────────────────────────────────────────────────────────────────────────

    function test_DistributeRevenue_CustomSplit() public {
        uint256 pBps = 2_000;
        uint256 mBps = 3_000;
        uint256 dBps = 5_000;

        vm.prank(owner);
        splitter.setSplit(CITY_ID, pBps, mBps, dBps);

        uint256 pShare = (AMOUNT * pBps) / 10_000;
        uint256 mShare = (AMOUNT * mBps) / 10_000;
        uint256 dShare = AMOUNT - pShare - mShare;

        vm.prank(alice);
        splitter.distributeRevenue(CITY_ID, DISTRICT_TOKEN, AMOUNT);

        assertEq(mockTreasury.totalDeposited(),          pShare,  "platform");
        assertEq(splitter.pendingWithdrawals(mayor),    mShare,  "mayor");
        assertEq(splitter.pendingWithdrawals(district), dShare,  "district");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // fuzz: platformShare + mayorShare + districtShare == amount
    // ─────────────────────────────────────────────────────────────────────────

    function testFuzz_SplitConservation(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000_000);

        usdc.mint(alice, amount);
        vm.prank(alice);
        usdc.approve(address(splitter), type(uint256).max);

        vm.prank(alice);
        splitter.distributeRevenue(CITY_ID, DISTRICT_TOKEN, amount);

        uint256 pShare = mockTreasury.totalDeposited();
        uint256 mShare = splitter.pendingWithdrawals(mayor);
        uint256 dShare = splitter.pendingWithdrawals(district);

        assertEq(pShare + mShare + dShare, amount, "conservation: shares must sum to amount");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // fuzz: custom split BPS conservation
    // ─────────────────────────────────────────────────────────────────────────

    function testFuzz_CustomSplitConservation(
        uint256 pBps,
        uint256 mBps,
        uint256 amount
    ) public {
        // constrain BPS so they are valid (each ≤ 5000, sum = 10000)
        pBps = bound(pBps, 0, 5_000);
        mBps = bound(mBps, 0, 5_000);
        uint256 dBps = 10_000 - pBps - mBps;
        vm.assume(dBps <= 5_000);

        vm.prank(owner);
        splitter.setSplit(CITY_ID, pBps, mBps, dBps);

        amount = bound(amount, 1, 1_000_000_000);
        usdc.mint(alice, amount);
        vm.prank(alice);
        usdc.approve(address(splitter), type(uint256).max);

        vm.prank(alice);
        splitter.distributeRevenue(CITY_ID, DISTRICT_TOKEN, amount);

        uint256 total = mockTreasury.totalDeposited()
                      + splitter.pendingWithdrawals(mayor)
                      + splitter.pendingWithdrawals(district);

        assertEq(total, amount, "conservation: custom split must sum to amount");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // revert: BPS don't sum to 10000
    // ─────────────────────────────────────────────────────────────────────────

    function test_SetSplit_Revert_BPSNotSumTo10000() public {
        vm.prank(owner);
        vm.expectRevert(RevenueSplitter.InvalidSplit.selector);
        splitter.setSplit(CITY_ID, 1_000, 2_000, 6_000); // sum = 9000
    }

    function test_SetDefaultSplit_Revert_BPSNotSumTo10000() public {
        vm.prank(owner);
        vm.expectRevert(RevenueSplitter.InvalidSplit.selector);
        splitter.setDefaultSplit(1_000, 1_000, 1_000); // sum = 3000
    }

    // ─────────────────────────────────────────────────────────────────────────
    // revert: party BPS exceeds MAX_PARTY_BPS (5000)
    // ─────────────────────────────────────────────────────────────────────────

    function test_SetSplit_Revert_PartyBPSExceedsMax() public {
        vm.prank(owner);
        vm.expectRevert(RevenueSplitter.InvalidSplit.selector);
        splitter.setSplit(CITY_ID, 6_000, 2_000, 2_000); // platform > 5000
    }

    // ─────────────────────────────────────────────────────────────────────────
    // unauthorized setSplit reverts
    // ─────────────────────────────────────────────────────────────────────────

    function test_SetSplit_Revert_Unauthorized() public {
        vm.prank(alice); // non-owner
        bytes memory err = abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice);
        vm.expectRevert(err);
        splitter.setSplit(CITY_ID, 1_000, 2_000, 7_000);
    }

    function test_SetDefaultSplit_Revert_Unauthorized() public {
        vm.prank(alice);
        bytes memory err = abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice);
        vm.expectRevert(err);
        splitter.setDefaultSplit(1_000, 2_000, 7_000);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // withdraw
    // ─────────────────────────────────────────────────────────────────────────

    function test_Withdraw_Mayor() public {
        vm.prank(alice);
        splitter.distributeRevenue(CITY_ID, DISTRICT_TOKEN, AMOUNT);

        uint256 mayorShare = (AMOUNT * MAYOR_BPS) / 10_000;

        vm.prank(mayor);
        splitter.withdraw();
        assertEq(usdc.balanceOf(mayor), mayorShare);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // fallback: no registry → treasury as recipient
    // ─────────────────────────────────────────────────────────────────────────

    function test_DistributeRevenue_NoRegistry_TreasuryFallback() public {
        // deploy splitter without registries
        RevenueSplitter bare = new RevenueSplitter(USDC_ADDR, treasury, owner);
        MockTreasury bareTreasury = new MockTreasury(USDC_ADDR);

        // wire treasury contract so distributeRevenue can route the platform share
        vm.prank(owner);
        bare.setTreasuryContract(address(bareTreasury));

        usdc.mint(alice, AMOUNT);
        vm.prank(alice);
        usdc.approve(address(bare), type(uint256).max);

        vm.prank(alice);
        bare.distributeRevenue(99, 9999, AMOUNT);

        // platform share goes to bareTreasury via deposit()
        // mayor and district shares fall back to treasury EOA (no registry set)
        uint256 platformShare = (AMOUNT * PLATFORM_BPS) / 10_000;
        uint256 mayorShare    = (AMOUNT * MAYOR_BPS)    / 10_000;
        uint256 districtShare = AMOUNT - platformShare - mayorShare;

        assertEq(bareTreasury.totalDeposited(),          platformShare,               "platform to treasury contract");
        assertEq(bare.pendingWithdrawals(treasury),      mayorShare + districtShare,  "mayor+district fallback to treasury");
    }
}
