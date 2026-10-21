// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

import {Storefronts} from "../Storefronts.sol";
import {RevenueSplitter} from "../RevenueSplitter.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {MockTreasury} from "../test-helpers/MockTreasury.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

contract MockNFTRegistrySF is ERC721 {
    constructor(string memory n, string memory s) ERC721(n, s) {}
    function mint(address to, uint256 id) external { _mint(to, id); }
    function transferFrom(address from, address to, uint256 id) public override { _transfer(from, to, id); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Storefronts Phase-2 tests
// ─────────────────────────────────────────────────────────────────────────────

contract StorefrontsPhase2Test is Test {
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;

    address internal owner     = makeAddr("owner");
    address internal treasury  = makeAddr("treasury");
    address internal distOwner = makeAddr("distOwner");
    address internal tenant    = makeAddr("tenant");
    address internal alice     = makeAddr("alice");

    MockERC20       internal usdc;
    RevenueSplitter internal revSplitter;
    MockTreasury    internal mockTreasury;
    Storefronts     internal storefronts;

    MockNFTRegistrySF internal cityReg;
    MockNFTRegistrySF internal districtReg;

    uint256 internal constant CITY_ID        = 1;
    uint256 internal constant DISTRICT_TOKEN = 10;
    uint256 internal constant MONTHLY_RENT   = 100_000_000; // 100 USDC

    uint256 internal unitId;

    // ─────────────────────────────────────────────────────────────────────────
    // setUp
    // ─────────────────────────────────────────────────────────────────────────

    function setUp() public {
        // USDC mock
        MockERC20 impl = new MockERC20("Mock USDC", "mUSDC", 6);
        vm.etch(USDC_ADDR, address(impl).code);
        usdc = MockERC20(USDC_ADDR);

        // NFT registries
        cityReg     = new MockNFTRegistrySF("CityReg", "CITY");
        districtReg = new MockNFTRegistrySF("DistReg", "DIST");
        cityReg.mint(makeAddr("mayor"), CITY_ID);
        districtReg.mint(distOwner, DISTRICT_TOKEN);

        // RevenueSplitter + Treasury
        revSplitter  = new RevenueSplitter(USDC_ADDR, treasury, owner);
        mockTreasury = new MockTreasury(USDC_ADDR);
        vm.startPrank(owner);
        revSplitter.setCityRegistry(address(cityReg));
        revSplitter.setDistrictRegistry(address(districtReg));
        revSplitter.setTreasuryContract(address(mockTreasury));
        vm.stopPrank();

        // Storefronts
        storefronts = new Storefronts(
            USDC_ADDR,
            address(revSplitter),
            address(districtReg),
            address(cityReg),
            owner
        );

        // Create a unit as distOwner
        vm.prank(distOwner);
        storefronts.createUnit(DISTRICT_TOKEN, CITY_ID, MONTHLY_RENT);
        unitId = storefronts.nextUnitId() - 1;

        // Fund tenant
        usdc.mint(tenant, 10_000_000_000);
        vm.prank(tenant);
        usdc.approve(address(storefronts), type(uint256).max);

        // Fund alice
        usdc.mint(alice, 10_000_000_000);
        vm.prank(alice);
        usdc.approve(address(storefronts), type(uint256).max);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _rentUnit(address t) internal returns (uint256 leaseId) {
        vm.prank(t);
        storefronts.rentUnit(unitId, "My Shop", "Retail", "Best shop", "logo.png", "https://shop.com");
        leaseId = storefronts.nextLeaseId() - 1;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. createUnit + rentUnit happy path: USDC forwarded via RevenueSplitter,
    //    lease created
    // ─────────────────────────────────────────────────────────────────────────

    function test_CreateUnit_RentUnit_HappyPath() public {
        uint256 tenantBefore = usdc.balanceOf(tenant);

        uint256 leaseId = _rentUnit(tenant);

        // USDC deducted
        assertEq(usdc.balanceOf(tenant), tenantBefore - MONTHLY_RENT, "tenant debited");

        // Lease stored
        (
            uint256 lUnitId,
            address lTenant,
            ,
            uint256 nextPaymentDue,
            ,
            bool active,
            ,
            string memory biz,
            ,
            ,
            ,

        ) = storefronts.leases(leaseId);
        assertEq(lUnitId,  unitId,    "lease unitId");
        assertEq(lTenant,  tenant,    "lease tenant");
        assertTrue(active,            "lease active");
        assertEq(biz,      "My Shop", "business name");
        assertEq(nextPaymentDue, block.timestamp + 30 days, "nextPaymentDue");

        // RevenueSplitter received USDC and distributed
        // platform 10% → mockTreasury, mayor 20% → pendingWithdrawals[mayor],
        // district 70% → pendingWithdrawals[distOwner]
        uint256 platformShare = (MONTHLY_RENT * 1_000) / 10_000;
        uint256 districtShare = (MONTHLY_RENT * 7_000) / 10_000;
        assertEq(mockTreasury.totalDeposited(), platformShare, "platform deposit");
        assertEq(revSplitter.pendingWithdrawals(distOwner), districtShare, "district share");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. payRent: second payment extends nextPaymentDue
    // ─────────────────────────────────────────────────────────────────────────

    function test_PayRent_ExtendsNextDue() public {
        uint256 leaseId = _rentUnit(tenant);
        (,,, uint256 dueBefore,,,,,,,,) = storefronts.leases(leaseId);

        vm.prank(tenant);
        storefronts.payRent(leaseId);

        (,,, uint256 dueAfter,,,,,,,,) = storefronts.leases(leaseId);
        assertEq(dueAfter, dueBefore + 30 days, "nextPaymentDue extended by 30 days");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. expireUnpaidLease: reverts before gracePeriodEnd, succeeds after
    // ─────────────────────────────────────────────────────────────────────────

    function test_ExpireUnpaidLease_RevertBeforeGrace() public {
        uint256 leaseId = _rentUnit(tenant);
        (,,,, uint256 gracePeriodEnd,,,,,,,) = storefronts.leases(leaseId);

        // Just before grace period ends
        vm.warp(gracePeriodEnd);

        vm.prank(distOwner);
        vm.expectRevert(Storefronts.InactiveLease.selector);
        storefronts.expireUnpaidLease(leaseId);
    }

    function test_ExpireUnpaidLease_SucceedsAfterGrace() public {
        uint256 leaseId = _rentUnit(tenant);
        (,,,, uint256 gracePeriodEnd,,,,,,,) = storefronts.leases(leaseId);

        vm.warp(gracePeriodEnd + 1);

        vm.prank(distOwner);
        vm.expectEmit(true, false, false, false, address(storefronts));
        emit Storefronts.LeaseExpired(leaseId);
        storefronts.expireUnpaidLease(leaseId);

        (,,,,, bool active,,,,,, ) = storefronts.leases(leaseId);
        assertFalse(active, "lease expired");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. addProduct + buyProduct: checkout forwards USDC to RevenueSplitter
    // ─────────────────────────────────────────────────────────────────────────

    function test_AddProduct_BuyProduct() public {
        uint256 leaseId = _rentUnit(tenant);

        uint256 PRODUCT_PRICE = 5_000_000; // 5 USDC

        vm.prank(tenant);
        storefronts.addProduct(leaseId, "Widget", "A nice widget", PRODUCT_PRICE);
        uint256 productId = storefronts.nextProductId() - 1;

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 treasuryBefore = mockTreasury.totalDeposited();

        vm.prank(alice);
        vm.expectEmit(true, true, true, true, address(storefronts));
        emit Storefronts.ProductPurchased(1, productId, alice, PRODUCT_PRICE);
        storefronts.buyProduct(productId);

        assertEq(usdc.balanceOf(alice), aliceBefore - PRODUCT_PRICE, "alice paid");

        // Platform 10% went to treasury
        uint256 platformShare = (PRODUCT_PRICE * 1_000) / 10_000;
        assertEq(mockTreasury.totalDeposited() - treasuryBefore, platformShare, "platform deposit");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. terminateLease by tenant and by unit owner
    // ─────────────────────────────────────────────────────────────────────────

    function test_TerminateLease_ByTenant() public {
        uint256 leaseId = _rentUnit(tenant);

        vm.prank(tenant);
        vm.expectEmit(true, false, false, false, address(storefronts));
        emit Storefronts.LeaseTerminated(leaseId);
        storefronts.terminateLease(leaseId);

        (,,,,, bool active,,,,,, ) = storefronts.leases(leaseId);
        assertFalse(active, "lease terminated by tenant");
    }

    function test_TerminateLease_ByUnitOwner() public {
        uint256 leaseId = _rentUnit(tenant);

        vm.prank(distOwner);
        storefronts.terminateLease(leaseId);

        (,,,,, bool active,,,,,, ) = storefronts.leases(leaseId);
        assertFalse(active, "lease terminated by unit owner");
    }

    function test_TerminateLease_UnauthorizedReverts() public {
        uint256 leaseId = _rentUnit(tenant);
        address stranger = makeAddr("stranger");

        vm.prank(stranger);
        vm.expectRevert(Storefronts.Unauthorized.selector);
        storefronts.terminateLease(leaseId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. flagContent + removeContent (admin only)
    // ─────────────────────────────────────────────────────────────────────────

    function test_FlagContent_ByUnitOwner() public {
        uint256 leaseId = _rentUnit(tenant);

        vm.prank(distOwner);
        vm.expectEmit(true, false, false, false, address(storefronts));
        emit Storefronts.ContentFlagged(leaseId);
        storefronts.flagContent(leaseId);

        (,,,,,, bool flagged,,,,, ) = storefronts.leases(leaseId);
        assertTrue(flagged, "content flagged");
    }

    function test_FlagContent_NonOwnerReverts() public {
        uint256 leaseId = _rentUnit(tenant);

        vm.prank(alice); // not the unit owner
        vm.expectRevert(Storefronts.Unauthorized.selector);
        storefronts.flagContent(leaseId);
    }

    function test_RemoveContent_AdminOnly() public {
        uint256 leaseId = _rentUnit(tenant);

        vm.prank(owner);
        vm.expectEmit(true, false, false, false, address(storefronts));
        emit Storefronts.ContentRemoved(leaseId);
        storefronts.removeContent(leaseId);

        (,,,,, bool active,,,,,, ) = storefronts.leases(leaseId);
        assertFalse(active, "lease removed by admin");
    }

    function test_RemoveContent_NonAdminReverts() public {
        uint256 leaseId = _rentUnit(tenant);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        storefronts.removeContent(leaseId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. Unauthorized createUnit (caller not district owner) reverts
    // ─────────────────────────────────────────────────────────────────────────

    function test_CreateUnit_Revert_NotDistrictOwner() public {
        vm.prank(alice); // alice doesn't own DISTRICT_TOKEN
        vm.expectRevert(Storefronts.Unauthorized.selector);
        storefronts.createUnit(DISTRICT_TOKEN, CITY_ID, MONTHLY_RENT);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 8. Dynamic unit owner via districtRegistry: transfer NFT → new owner
    //    is recognized for expireUnpaidLease
    // ─────────────────────────────────────────────────────────────────────────

    function test_DynamicUnitOwner_NewOwnerRecognized() public {
        uint256 leaseId = _rentUnit(tenant);
        address newOwner = makeAddr("newDistOwner");

        // Transfer district NFT
        vm.prank(distOwner);
        districtReg.transferFrom(distOwner, newOwner, DISTRICT_TOKEN);

        // Warp past grace period
        (,,,, uint256 gracePeriodEnd,,,,,,,) = storefronts.leases(leaseId);
        vm.warp(gracePeriodEnd + 1);

        // New owner can expire
        vm.prank(newOwner);
        storefronts.expireUnpaidLease(leaseId);

        (,,,,, bool active,,,,,, ) = storefronts.leases(leaseId);
        assertFalse(active, "new owner expired lease");
    }

    function test_DynamicUnitOwner_OldOwnerUnauthorized() public {
        uint256 leaseId = _rentUnit(tenant);
        address newOwner = makeAddr("newDistOwner2");

        // Transfer
        vm.prank(distOwner);
        districtReg.transferFrom(distOwner, newOwner, DISTRICT_TOKEN);

        // Warp past grace
        (,,,, uint256 gracePeriodEnd,,,,,,,) = storefronts.leases(leaseId);
        vm.warp(gracePeriodEnd + 1);

        // Old owner can no longer call expireUnpaidLease
        vm.prank(distOwner);
        vm.expectRevert(Storefronts.Unauthorized.selector);
        storefronts.expireUnpaidLease(leaseId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Extra: rentUnit revert when unit already has an active lease
    // ─────────────────────────────────────────────────────────────────────────

    function test_RentUnit_Revert_AlreadyRented() public {
        _rentUnit(tenant);

        vm.prank(alice);
        vm.expectRevert(Storefronts.UnitNotAvailable.selector);
        storefronts.rentUnit(unitId, "Another Shop", "Food", "Desc", "logo2.png", "");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Extra: payRent revert after grace period ended
    // ─────────────────────────────────────────────────────────────────────────

    function test_PayRent_Revert_AfterGracePeriod() public {
        uint256 leaseId = _rentUnit(tenant);
        (,,,, uint256 gracePeriodEnd,,,,,,,) = storefronts.leases(leaseId);
        vm.warp(gracePeriodEnd + 1);

        vm.prank(tenant);
        vm.expectRevert(Storefronts.InactiveLease.selector);
        storefronts.payRent(leaseId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Extra: buyProduct revert if lease not active
    // ─────────────────────────────────────────────────────────────────────────

    function test_BuyProduct_Revert_LeaseNotActive() public {
        uint256 leaseId = _rentUnit(tenant);

        vm.prank(tenant);
        storefronts.addProduct(leaseId, "Widget", "A widget", 5_000_000);
        uint256 productId = storefronts.nextProductId() - 1;

        // Terminate lease
        vm.prank(tenant);
        storefronts.terminateLease(leaseId);

        vm.prank(alice);
        vm.expectRevert(Storefronts.LeaseNotActive.selector);
        storefronts.buyProduct(productId);
    }
}
