// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {CityPass} from "../CityPass.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {MockERC721} from "../test-helpers/MockERC721.sol";

/// @dev Thin helper so we can assert a specific address was called with receiveRevenue.
contract MockRevenueSplitter {
    address public immutable usdc;
    uint256 public received;

    constructor(address usdc_) {
        usdc = usdc_;
    }

    function receiveRevenue(uint256 /*amount*/) external {
        // no-op — tests only check pendingWithdrawals, not the splitter behaviour
    }
}

contract CityPassTest is Test {
    // ── addresses ──────────────────────────────────────────────────────────────
    address internal admin    = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal mayor    = makeAddr("mayor");        // city-token owner
    address internal distOwner = makeAddr("distOwner");   // district-token owner
    address internal alice    = makeAddr("alice");         // buyer
    address internal bob      = makeAddr("bob");

    // ── contracts ──────────────────────────────────────────────────────────────
    MockERC20   internal usdc;
    MockERC721  internal cityReg;
    MockERC721  internal distReg;
    CityPass    internal cp;

    // ── constants ──────────────────────────────────────────────────────────────
    uint256 internal constant CITY_ID      = 7;
    uint256 internal constant DISTRICT_ID  = 750;   // cityId derived = 7 (750/100)
    uint256 internal constant PRICE        = 10_000_000; // 10 USDC (6 dec)
    uint256 internal constant MAX_SUPPLY   = 100;
    uint256 internal constant DURATION     = 30;    // days

    uint8 internal constant KIND_PERM = 0;
    uint8 internal constant KIND_TEMP = 1;

    // pre-computed pass-type IDs
    uint256 internal permPassTypeId;
    uint256 internal tempPassTypeId;
    uint256 internal distPermPassTypeId;
    uint256 internal distTempPassTypeId;

    // ── setUp ──────────────────────────────────────────────────────────────────
    function setUp() public {
        // Deploy mock infrastructure
        usdc    = new MockERC20("Mock USDC", "mUSDC", 6);
        cityReg = new MockERC721("CityReg", "CREG");
        distReg = new MockERC721("DistReg", "DREG");

        // Mint registry tokens
        cityReg.mint(mayor,     CITY_ID);
        distReg.mint(distOwner, DISTRICT_ID);

        // Deploy CityPass
        cp = new CityPass(
            address(usdc),
            address(cityReg),
            address(distReg),
            treasury,
            admin
        );

        // Fund alice and bob with USDC and give CityPass an allowance
        usdc.mint(alice, 1_000_000_000); // 1,000 USDC
        usdc.mint(bob,   1_000_000_000);
        vm.prank(alice);
        usdc.approve(address(cp), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(cp), type(uint256).max);

        // Pre-compute pass-type IDs using the same hash the contract uses
        permPassTypeId    = _passTypeId(CITY_ID,     0,           KIND_PERM);
        tempPassTypeId    = _passTypeId(CITY_ID,     0,           KIND_TEMP);
        distPermPassTypeId = _passTypeId(DISTRICT_ID / 100, DISTRICT_ID, KIND_PERM);
        distTempPassTypeId = _passTypeId(DISTRICT_ID / 100, DISTRICT_ID, KIND_TEMP);
    }

    // ── helpers ────────────────────────────────────────────────────────────────

    function _passTypeId(uint256 cityId, uint256 districtId, uint8 passKind) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(cityId, districtId, uint8(passKind))));
    }

    /// Create a city permanent pass as mayor.
    function _createPermPass() internal returns (uint256 id) {
        vm.prank(mayor);
        cp.createPassType(CITY_ID, 0, KIND_PERM, PRICE, MAX_SUPPLY, 0);
        id = permPassTypeId;
    }

    /// Create a city temporary pass as mayor.
    function _createTempPass() internal returns (uint256 id) {
        vm.prank(mayor);
        cp.createPassType(CITY_ID, 0, KIND_TEMP, PRICE, MAX_SUPPLY, DURATION);
        id = tempPassTypeId;
    }

    /// Create a district temporary pass as distOwner.
    function _createDistTempPass() internal returns (uint256 id) {
        vm.prank(distOwner);
        cp.createPassType(0, DISTRICT_ID, KIND_TEMP, PRICE, MAX_SUPPLY, DURATION);
        id = distTempPassTypeId;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 1. createPassType
    // ══════════════════════════════════════════════════════════════════════════

    function test_createPassType_CityMayorCreatesPermanentPass() public {
        vm.expectEmit(true, true, true, true, address(cp));
        emit CityPass.PassTypeCreated(permPassTypeId, CITY_ID, 0, KIND_PERM, PRICE, MAX_SUPPLY, 0, mayor);
        _createPermPass();

        (
            uint256 cityId,
            uint256 districtId,
            uint8 passKind,
            uint256 priceUsdc,
            uint256 maxSupply,
            uint256 totalMinted,
            uint256 durationDays,
            bool active,
            address creator
        ) = cp.passTypes(permPassTypeId);

        assertEq(cityId,       CITY_ID);
        assertEq(districtId,   0);
        assertEq(passKind,     KIND_PERM);
        assertEq(priceUsdc,    PRICE);
        assertEq(maxSupply,    MAX_SUPPLY);
        assertEq(totalMinted,  0);
        assertEq(durationDays, 0);      // permanent → duration normalised to 0
        assertTrue(active);
        assertEq(creator, mayor);
    }

    function test_createPassType_DistrictOwnerCreatesTemporaryPass() public {
        vm.expectEmit(true, true, true, true, address(cp));
        emit CityPass.PassTypeCreated(distTempPassTypeId, DISTRICT_ID / 100, DISTRICT_ID, KIND_TEMP, PRICE, MAX_SUPPLY, DURATION, distOwner);
        _createDistTempPass();

        (
            uint256 cityId,
            uint256 districtId,
            ,
            ,
            ,
            ,
            uint256 durationDays,
            ,
            address creator
        ) = cp.passTypes(distTempPassTypeId);

        assertEq(cityId,      DISTRICT_ID / 100);  // 7
        assertEq(districtId,  DISTRICT_ID);         // 750
        assertEq(durationDays, DURATION);
        assertEq(creator, distOwner);
    }

    function test_createPassType_NonOwnerRevertsNotAuthorized() public {
        vm.prank(alice);
        vm.expectRevert(CityPass.NotAuthorized.selector);
        cp.createPassType(CITY_ID, 0, KIND_PERM, PRICE, MAX_SUPPLY, 0);
    }

    function test_createPassType_NonDistrictOwnerRevertsNotAuthorized() public {
        vm.prank(alice);
        vm.expectRevert(CityPass.NotAuthorized.selector);
        cp.createPassType(0, DISTRICT_ID, KIND_TEMP, PRICE, MAX_SUPPLY, DURATION);
    }

    function test_createPassType_DuplicateRevertsNotUnique() public {
        _createPermPass();
        vm.prank(mayor);
        vm.expectRevert(CityPass.NotUnique.selector);
        cp.createPassType(CITY_ID, 0, KIND_PERM, PRICE, MAX_SUPPLY, 0);
    }

    function test_createPassType_ZeroPriceRevertsInvalidPrice() public {
        vm.prank(mayor);
        vm.expectRevert(CityPass.InvalidPrice.selector);
        cp.createPassType(CITY_ID, 0, KIND_PERM, 0, MAX_SUPPLY, 0);
    }

    function test_createPassType_ZeroSupplyRevertsInvalidSupply() public {
        vm.prank(mayor);
        vm.expectRevert(CityPass.InvalidSupply.selector);
        cp.createPassType(CITY_ID, 0, KIND_PERM, PRICE, 0, 0);
    }

    function test_createPassType_InvalidPassKindReverts() public {
        vm.prank(mayor);
        vm.expectRevert(CityPass.InvalidPassKind.selector);
        cp.createPassType(CITY_ID, 0, 2, PRICE, MAX_SUPPLY, 0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 2. mintPass
    // ══════════════════════════════════════════════════════════════════════════

    function test_mintPass_HappyPathPermanent_CorrectUSDCPull() public {
        uint256 id = _createPermPass();
        uint256 balBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        cp.mintPass(id, 1);

        assertEq(usdc.balanceOf(alice), balBefore - PRICE);
        assertEq(usdc.balanceOf(address(cp)), PRICE);
        assertEq(cp.balanceOf(alice, id), 1);
    }

    function test_mintPass_HappyPathPermanent_RevenueAccountingCorrect() public {
        uint256 id = _createPermPass();

        uint256 expectedCreator  = (PRICE * 80) / 100;  // 8_000_000
        uint256 expectedTreasury = (PRICE * 15) / 100;  // 1_500_000
        uint256 expectedFee      = PRICE - expectedCreator - expectedTreasury; // 500_000

        vm.prank(alice);
        cp.mintPass(id, 1);

        // creator = mayor (owns cityId token)
        assertEq(cp.pendingWithdrawals(mayor),    expectedCreator,  "creator share");
        assertEq(cp.pendingWithdrawals(treasury), expectedTreasury + expectedFee, "treasury+fee (no splitter)");
    }

    function test_mintPass_HappyPathPermanent_EventEmitted() public {
        uint256 id = _createPermPass();

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(cp));
        emit CityPass.PassMinted(id, alice, 1, PRICE);
        cp.mintPass(id, 1);
    }

    function test_mintPass_HappyPathPermanent_MultiQuantity() public {
        uint256 id = _createPermPass();
        uint256 qty = 3;
        uint256 totalCost = PRICE * qty;
        uint256 balBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        cp.mintPass(id, qty);

        assertEq(usdc.balanceOf(alice), balBefore - totalCost);
        assertEq(cp.balanceOf(alice, id), qty);
    }

    function test_mintPass_HappyPathTemporary() public {
        uint256 id = _createTempPass();
        uint256 balBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        cp.mintPass(id, 1);

        assertEq(usdc.balanceOf(alice), balBefore - PRICE);
        assertEq(cp.balanceOf(alice, id), 1);
        // firstMintTime must be set
        assertGt(cp.firstMintTime(alice, id), 0);
    }

    function test_mintPass_RevertsExceedsSupply() public {
        // Create a pass type with maxSupply=1
        vm.prank(mayor);
        cp.createPassType(CITY_ID, 0, KIND_PERM, PRICE, 1, 0);

        vm.prank(alice);
        cp.mintPass(permPassTypeId, 1);

        vm.prank(alice);
        vm.expectRevert(CityPass.ExceedsSupply.selector);
        cp.mintPass(permPassTypeId, 1);
    }

    function test_mintPass_RevertsExceedsSupply_QuantityOverflow() public {
        vm.prank(mayor);
        cp.createPassType(CITY_ID, 0, KIND_PERM, PRICE, 2, 0);

        vm.prank(alice);
        vm.expectRevert(CityPass.ExceedsSupply.selector);
        cp.mintPass(permPassTypeId, 3);
    }

    function test_mintPass_RevertsWhenPassTypeInactive() public {
        uint256 id = _createPermPass();

        vm.prank(mayor);
        cp.setPassTypeActive(id, false);

        vm.prank(alice);
        vm.expectRevert(CityPass.PassTypeNotActive.selector);
        cp.mintPass(id, 1);
    }

    function test_mintPass_RevertsWhenPaused() public {
        uint256 id = _createPermPass();

        vm.prank(admin);
        cp.pause();

        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        cp.mintPass(id, 1);
    }

    function test_mintPass_DistrictPassCorrectCreatorPays() public {
        uint256 id = _createDistTempPass();

        uint256 expectedCreator = (PRICE * 80) / 100;

        vm.prank(alice);
        cp.mintPass(id, 1);

        // distOwner holds the district NFT → gets creator share
        assertEq(cp.pendingWithdrawals(distOwner), expectedCreator, "district creator share");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 3. Revenue split: 80 / 15 / 5
    // ══════════════════════════════════════════════════════════════════════════

    function test_revenueSplit_80_15_5_NoSplitter() public {
        uint256 id = _createPermPass();
        uint256 qty = 2;
        uint256 total = PRICE * qty;

        uint256 creatorShare  = (total * 80) / 100;
        uint256 treasuryShare = (total * 15) / 100;
        uint256 platformFee   = total - creatorShare - treasuryShare;

        vm.prank(alice);
        cp.mintPass(id, qty);

        // No revenueSplitter → platformFee goes to treasury
        assertEq(cp.pendingWithdrawals(mayor),    creatorShare,               "80% creator");
        assertEq(cp.pendingWithdrawals(treasury), treasuryShare + platformFee, "15%+5% treasury");
    }

    function test_revenueSplit_WithSplitter_FeeGoesToSplitter() public {
        // Deploy and register a splitter
        MockRevenueSplitter splitter = new MockRevenueSplitter(address(usdc));
        vm.prank(admin);
        cp.setRevenueSplitter(address(splitter));

        uint256 id = _createPermPass();
        uint256 total = PRICE;
        uint256 creatorShare  = (total * 80) / 100;
        uint256 treasuryShare = (total * 15) / 100;
        uint256 platformFee   = total - creatorShare - treasuryShare;

        vm.prank(alice);
        cp.mintPass(id, 1);

        assertEq(cp.pendingWithdrawals(mayor),           creatorShare,  "80% creator");
        assertEq(cp.pendingWithdrawals(treasury),        treasuryShare, "15% treasury");
        assertEq(cp.pendingWithdrawals(address(splitter)), platformFee, "5% splitter");
    }

    function test_revenueSplit_MultiMint_Accumulates() public {
        uint256 id = _createPermPass();

        vm.prank(alice);
        cp.mintPass(id, 1);
        vm.prank(bob);
        usdc.approve(address(cp), type(uint256).max);
        vm.prank(bob);
        cp.mintPass(id, 1);

        uint256 total2        = PRICE * 2;
        uint256 creatorShare  = (total2 * 80) / 100;
        uint256 treasuryShare = (total2 * 15) / 100;
        uint256 platformFee   = total2 - creatorShare - treasuryShare;

        assertEq(cp.pendingWithdrawals(mayor),    creatorShare,               "creator accumulation");
        assertEq(cp.pendingWithdrawals(treasury), treasuryShare + platformFee, "treasury accumulation");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 4. passExpiry + hasValidPass
    // ══════════════════════════════════════════════════════════════════════════

    function test_passExpiry_PermanentPassIsMaxUint() public {
        uint256 id = _createPermPass();
        vm.prank(alice);
        cp.mintPass(id, 1);

        assertEq(cp.passExpiry(alice, id), type(uint256).max);
    }

    function test_hasValidPass_PermanentAlwaysTrue() public {
        uint256 id = _createPermPass();
        vm.prank(alice);
        cp.mintPass(id, 1);

        assertTrue(cp.hasValidPass(alice, id));
        // Still true after many days
        vm.warp(block.timestamp + 365 days);
        assertTrue(cp.hasValidPass(alice, id));
    }

    function test_hasValidPass_TemporaryValidBeforeExpiry() public {
        uint256 id = _createTempPass();
        vm.prank(alice);
        cp.mintPass(id, 1);

        // 1 second before expiry
        vm.warp(block.timestamp + (DURATION * 1 days) - 1);
        assertTrue(cp.hasValidPass(alice, id));
    }

    function test_hasValidPass_TemporaryInvalidAfterExpiry() public {
        uint256 id = _createTempPass();
        vm.prank(alice);
        cp.mintPass(id, 1);

        // Warp past expiry
        vm.warp(block.timestamp + (DURATION * 1 days) + 1);
        assertFalse(cp.hasValidPass(alice, id));
    }

    function test_passExpiry_ZeroForNoBalance() public {
        uint256 id = _createPermPass();
        // alice never minted → balance == 0
        assertEq(cp.passExpiry(alice, id), 0);
    }

    function test_mintPass_ExpiredRebuyResetsExpiryAndRestoresValidity() public {
        uint256 id = _createTempPass();

        vm.prank(alice);
        cp.mintPass(id, 1);

        uint256 firstMint = cp.firstMintTime(alice, id);

        // Warp past expiry
        vm.warp(firstMint + (DURATION * 1 days) + 1 seconds);
        assertFalse(cp.hasValidPass(alice, id), "should be expired");

        // Re-buy
        vm.prank(alice);
        cp.mintPass(id, 1);

        uint256 newMint = cp.firstMintTime(alice, id);
        assertGt(newMint, firstMint, "firstMintTime should be reset");
        assertTrue(cp.hasValidPass(alice, id), "should be valid after rebuy");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 5. Transfer: recipient gets valid pass (firstMintTime copied)
    // ══════════════════════════════════════════════════════════════════════════

    function test_transfer_RecipientHasValidPassAfterTransfer() public {
        uint256 id = _createTempPass();

        vm.prank(alice);
        cp.mintPass(id, 1);

        uint256 aliceMintTime = cp.firstMintTime(alice, id);
        assertTrue(aliceMintTime > 0, "alice firstMintTime must be set");

        // Transfer from alice → bob
        vm.prank(alice);
        cp.safeTransferFrom(alice, bob, id, 1, "");

        // Bob now has the balance
        assertEq(cp.balanceOf(bob, id), 1);

        // Bob's firstMintTime copied from alice
        assertEq(cp.firstMintTime(bob, id), aliceMintTime, "firstMintTime must be copied on transfer");

        // Bob has a valid pass
        assertTrue(cp.hasValidPass(bob, id), "recipient should have valid pass");
    }

    function test_transfer_RecipientAlreadyHasPass_MintTimeNotOverwritten() public {
        uint256 id = _createTempPass();

        // Both alice and bob mint
        vm.prank(alice);
        cp.mintPass(id, 1);
        vm.warp(block.timestamp + 1 days); // shift time so bob's mint is later
        vm.prank(bob);
        usdc.approve(address(cp), type(uint256).max);
        vm.prank(bob);
        cp.mintPass(id, 1);
        uint256 bobOriginalMint = cp.firstMintTime(bob, id);

        // alice transfers to bob (bob already has a pass → firstMintTime NOT overwritten)
        vm.prank(alice);
        cp.safeTransferFrom(alice, bob, id, 1, "");

        assertEq(cp.firstMintTime(bob, id), bobOriginalMint, "existing holder's firstMintTime must not be overwritten");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 6. setPassTypeActive
    // ══════════════════════════════════════════════════════════════════════════

    function test_setPassTypeActive_CreatorCanDeactivate() public {
        uint256 id = _createPermPass();

        vm.prank(mayor);
        vm.expectEmit(true, false, false, true, address(cp));
        emit CityPass.PassTypeActiveChanged(id, false);
        cp.setPassTypeActive(id, false);

        (,,,,,,, bool active,) = cp.passTypes(id);
        assertFalse(active);
    }

    function test_setPassTypeActive_CreatorCanReactivate() public {
        uint256 id = _createPermPass();

        vm.prank(mayor);
        cp.setPassTypeActive(id, false);

        vm.prank(mayor);
        cp.setPassTypeActive(id, true);

        (,,,,,,, bool active,) = cp.passTypes(id);
        assertTrue(active);
    }

    function test_setPassTypeActive_NonCreatorRevertsNotCreator() public {
        uint256 id = _createPermPass();

        vm.prank(alice);
        vm.expectRevert(CityPass.NotCreator.selector);
        cp.setPassTypeActive(id, false);
    }

    function test_setPassTypeActive_AdminNotCreatorReverts() public {
        uint256 id = _createPermPass();

        // admin is not the creator of this pass type
        vm.prank(admin);
        vm.expectRevert(CityPass.NotCreator.selector);
        cp.setPassTypeActive(id, false);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 7. withdraw()
    // ══════════════════════════════════════════════════════════════════════════

    function test_withdraw_CreatorCanWithdrawPendingAmount() public {
        uint256 id = _createPermPass();
        vm.prank(alice);
        cp.mintPass(id, 1);

        uint256 creatorPending = cp.pendingWithdrawals(mayor);
        assertGt(creatorPending, 0);

        uint256 balBefore = usdc.balanceOf(mayor);
        vm.prank(mayor);
        cp.withdraw();

        assertEq(usdc.balanceOf(mayor), balBefore + creatorPending);
        assertEq(cp.pendingWithdrawals(mayor), 0);
    }

    function test_withdraw_TreasuryCanWithdrawPendingAmount() public {
        uint256 id = _createPermPass();
        vm.prank(alice);
        cp.mintPass(id, 1);

        uint256 treasuryPending = cp.pendingWithdrawals(treasury);
        assertGt(treasuryPending, 0);

        uint256 balBefore = usdc.balanceOf(treasury);
        vm.prank(treasury);
        cp.withdraw();

        assertEq(usdc.balanceOf(treasury), balBefore + treasuryPending);
        assertEq(cp.pendingWithdrawals(treasury), 0);
    }

    function test_withdraw_EmitsWithdrawnEvent() public {
        uint256 id = _createPermPass();
        vm.prank(alice);
        cp.mintPass(id, 1);

        uint256 amount = cp.pendingWithdrawals(mayor);

        vm.prank(mayor);
        vm.expectEmit(true, false, false, true, address(cp));
        emit CityPass.Withdrawn(mayor, amount);
        cp.withdraw();
    }

    function test_withdraw_DoubleWithdrawReturnsZero() public {
        uint256 id = _createPermPass();
        vm.prank(alice);
        cp.mintPass(id, 1);

        vm.prank(mayor);
        cp.withdraw();

        // Second withdraw: pending is 0, transfer of 0 — should not revert
        uint256 balBefore = usdc.balanceOf(mayor);
        vm.prank(mayor);
        cp.withdraw();

        assertEq(usdc.balanceOf(mayor), balBefore); // nothing extra
        assertEq(cp.pendingWithdrawals(mayor), 0);
    }

    function test_withdraw_ZeroBalanceNoRevert() public {
        // alice has never been credited — should succeed with 0 transfer
        vm.prank(alice);
        cp.withdraw(); // must not revert
        assertEq(cp.pendingWithdrawals(alice), 0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 8. District cityId derivation
    // ══════════════════════════════════════════════════════════════════════════

    function test_districtCityIdDerivation_150DividedBy100Is1() public {
        uint256 specDistrictId = 150;
        // distOwner must own token 150
        distReg.mint(distOwner, specDistrictId);

        vm.prank(distOwner);
        cp.createPassType(0, specDistrictId, KIND_PERM, PRICE, MAX_SUPPLY, 0);

        uint256 expectedCityId = specDistrictId / 100; // = 1
        uint256 expectedPassTypeId = _passTypeId(expectedCityId, specDistrictId, KIND_PERM);

        (uint256 cityId, uint256 districtId,,,,,,, ) = cp.passTypes(expectedPassTypeId);
        assertEq(cityId,     expectedCityId,  "cityId must be 1 (150/100)");
        assertEq(districtId, specDistrictId,  "districtId must be 150");
    }

    function test_districtCityIdDerivation_750DividedBy100Is7() public {
        _createDistTempPass();

        (uint256 cityId, uint256 districtId,,,,,,, ) = cp.passTypes(distTempPassTypeId);
        assertEq(cityId,     DISTRICT_ID / 100, "cityId must be 7 (750/100)");
        assertEq(districtId, DISTRICT_ID,       "districtId must be 750");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 9. Deployment & initialization
    // ══════════════════════════════════════════════════════════════════════════

    function test_deployment_ConstructorStoresConfig() public view {
        assertEq(address(cp.usdc()),          address(usdc));
        assertEq(cp.cityRegistry(),           address(cityReg));
        assertEq(cp.districtRegistry(),       address(distReg));
        assertEq(cp.treasury(),               treasury);
    }

    function test_deployment_AdminHasRoles() public view {
        assertTrue(cp.hasRole(cp.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(cp.hasRole(cp.ADMIN_ROLE(),         admin));
    }

    function test_deployment_ZeroAddressRevertsZeroAddress() public {
        vm.expectRevert(CityPass.ZeroAddress.selector);
        new CityPass(address(0), address(cityReg), address(distReg), treasury, admin);

        vm.expectRevert(CityPass.ZeroAddress.selector);
        new CityPass(address(usdc), address(0), address(distReg), treasury, admin);

        vm.expectRevert(CityPass.ZeroAddress.selector);
        new CityPass(address(usdc), address(cityReg), address(0), treasury, admin);

        vm.expectRevert(CityPass.ZeroAddress.selector);
        new CityPass(address(usdc), address(cityReg), address(distReg), address(0), admin);

        vm.expectRevert(CityPass.ZeroAddress.selector);
        new CityPass(address(usdc), address(cityReg), address(distReg), treasury, address(0));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 10. Admin functions: setCityRegistry, setDistrictRegistry, setTreasury, pause/unpause
    // ══════════════════════════════════════════════════════════════════════════

    function test_setCityRegistry_AdminUpdatesAndEmits() public {
        address newReg = makeAddr("newCityReg");
        vm.prank(admin);
        vm.expectEmit(true, true, false, false, address(cp));
        emit CityPass.CityRegistryUpdated(address(cityReg), newReg);
        cp.setCityRegistry(newReg);
        assertEq(cp.cityRegistry(), newReg);
    }

    function test_setCityRegistry_NonAdminReverts() public {
        vm.prank(alice);
        vm.expectRevert();
        cp.setCityRegistry(makeAddr("x"));
    }

    function test_setCityRegistry_ZeroAddressReverts() public {
        vm.prank(admin);
        vm.expectRevert(CityPass.ZeroAddress.selector);
        cp.setCityRegistry(address(0));
    }

    function test_setDistrictRegistry_AdminUpdatesAndEmits() public {
        address newReg = makeAddr("newDistReg");
        vm.prank(admin);
        vm.expectEmit(true, true, false, false, address(cp));
        emit CityPass.DistrictRegistryUpdated(address(distReg), newReg);
        cp.setDistrictRegistry(newReg);
        assertEq(cp.districtRegistry(), newReg);
    }

    function test_setTreasury_AdminUpdatesAndEmits() public {
        address newTreasury = makeAddr("newTreasury");
        vm.prank(admin);
        vm.expectEmit(true, true, false, false, address(cp));
        emit CityPass.TreasuryUpdated(treasury, newTreasury);
        cp.setTreasury(newTreasury);
        assertEq(cp.treasury(), newTreasury);
    }

    function test_pauseUnpause_AdminCanPauseAndUnpause() public {
        vm.prank(admin);
        cp.pause();

        vm.prank(admin);
        cp.unpause();

        // mintPass must work again after unpause
        uint256 id = _createPermPass();
        vm.prank(alice);
        cp.mintPass(id, 1);
        assertEq(cp.balanceOf(alice, id), 1);
    }

    function test_pause_NonAdminReverts() public {
        vm.prank(alice);
        vm.expectRevert();
        cp.pause();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 11. Fuzz: mintPass quantity stays within bounds
    // ══════════════════════════════════════════════════════════════════════════

    function testFuzz_mintPass_QuantityWithinSupplySucceeds(uint256 qty) public {
        qty = bound(qty, 1, MAX_SUPPLY);
        uint256 id = _createPermPass();

        uint256 totalCost = PRICE * qty;
        usdc.mint(alice, totalCost); // ensure enough balance
        vm.prank(alice);
        usdc.approve(address(cp), type(uint256).max);

        vm.prank(alice);
        cp.mintPass(id, qty);

        assertEq(cp.balanceOf(alice, id), qty);
    }

    function testFuzz_mintPass_QuantityExceedsSupplyReverts(uint256 qty) public {
        qty = bound(qty, MAX_SUPPLY + 1, MAX_SUPPLY * 10);
        uint256 id = _createPermPass();

        usdc.mint(alice, PRICE * qty);
        vm.prank(alice);
        usdc.approve(address(cp), type(uint256).max);

        vm.prank(alice);
        vm.expectRevert(CityPass.ExceedsSupply.selector);
        cp.mintPass(id, qty);
    }

    function testFuzz_revenueSplit_AlwaysSumsToTotal(uint256 qty) public {
        qty = bound(qty, 1, MAX_SUPPLY);
        uint256 id = _createPermPass();

        usdc.mint(alice, PRICE * qty);
        vm.prank(alice);
        usdc.approve(address(cp), type(uint256).max);

        vm.prank(alice);
        cp.mintPass(id, qty);

        uint256 totalCost     = PRICE * qty;
        uint256 creatorShare  = (totalCost * 80) / 100;
        uint256 treasuryShare = (totalCost * 15) / 100;
        uint256 platformFee   = totalCost - creatorShare - treasuryShare;

        // No splitter → fee goes to treasury
        assertEq(
            cp.pendingWithdrawals(mayor) + cp.pendingWithdrawals(treasury),
            creatorShare + treasuryShare + platformFee,
            "revenue must sum to totalCost"
        );
    }
}
