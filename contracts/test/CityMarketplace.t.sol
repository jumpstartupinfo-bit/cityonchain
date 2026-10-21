// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {CityMarketplace} from "../CityMarketplace.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {MockTreasury} from "../test-helpers/MockTreasury.sol";

/// @dev Minimal ERC-721 mock for marketplace tests.
contract MockNFT is ERC721 {
    uint256 public nextId = 1;

    constructor() ERC721("MockNFT", "MNFT") {}

    function mint(address to) external returns (uint256 id) {
        id = nextId++;
        _mint(to, id);
    }
}

contract CityMarketplaceTest is Test {
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;

    address internal owner    = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal alice    = makeAddr("alice");  // seller
    address internal bob      = makeAddr("bob");    // buyer

    MockERC20        internal usdc;
    MockNFT          internal nft;
    CityMarketplace  internal marketplace;
    MockTreasury     internal mockTreasury;

    uint256 internal constant PRICE        = 100_000_000; // 100 USDC (6 dec)
    uint256 internal constant PLATFORM_FEE = 500;         // 5%
    uint256 internal constant BPS          = 10_000;

    uint256 internal aliceTokenId;

    function setUp() public {
        // ── USDC mock at canonical address ──────────────────────────────────
        MockERC20 impl = new MockERC20("Mock USDC", "mUSDC", 6);
        vm.etch(USDC_ADDR, address(impl).code);
        usdc = MockERC20(USDC_ADDR);

        // ── contracts ────────────────────────────────────────────────────────
        nft          = new MockNFT();
        marketplace  = new CityMarketplace(USDC_ADDR, treasury, owner);
        mockTreasury = new MockTreasury(USDC_ADDR);

        // ── approve NFT on marketplace + wire treasury contract ───────────────
        vm.startPrank(owner);
        marketplace.setApprovedNFT(address(nft), true);
        marketplace.setTreasuryContract(address(mockTreasury));
        vm.stopPrank();

        // ── mint NFT to alice ────────────────────────────────────────────────
        aliceTokenId = nft.mint(alice);

        // ── fund bob with USDC & approve ────────────────────────────────────
        usdc.mint(bob, 500_000_000);
        vm.prank(bob);
        usdc.approve(address(marketplace), type(uint256).max);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helper: alice lists aliceTokenId
    // ─────────────────────────────────────────────────────────────────────────

    function _aliceList(uint256 price) internal returns (uint256 listingId) {
        vm.startPrank(alice);
        nft.approve(address(marketplace), aliceTokenId);
        marketplace.list(address(nft), aliceTokenId, price);
        vm.stopPrank();
        listingId = marketplace.nextListingId() - 1;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // list + buy — happy path
    // ─────────────────────────────────────────────────────────────────────────

    function test_ListAndBuy_HappyPath() public {
        uint256 listingId = _aliceList(PRICE);

        // verify NFT held by marketplace
        assertEq(nft.ownerOf(aliceTokenId), address(marketplace), "marketplace holds NFT");

        uint256 fee = (PRICE * PLATFORM_FEE) / BPS;
        uint256 sellerProceeds = PRICE - fee;

        vm.prank(bob);
        vm.expectEmit(true, true, false, true, address(marketplace));
        emit CityMarketplace.Sold(listingId, bob, PRICE, fee);
        marketplace.buy(listingId, PRICE);

        assertEq(nft.ownerOf(aliceTokenId), bob, "bob owns NFT after buy");
        assertEq(marketplace.pendingWithdrawals(alice), sellerProceeds, "alice proceeds");
        assertEq(mockTreasury.totalDeposited(), fee, "treasury fee");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // platform fee math precision
    // ─────────────────────────────────────────────────────────────────────────

    function test_PlatformFee_Math() public {
        uint256 listingId = _aliceList(PRICE);

        vm.prank(bob);
        marketplace.buy(listingId, PRICE);

        uint256 fee = (PRICE * PLATFORM_FEE) / BPS;
        assertEq(marketplace.pendingWithdrawals(alice), PRICE - fee);
        assertEq(mockTreasury.totalDeposited(), fee);
        assertEq(marketplace.pendingWithdrawals(alice) + mockTreasury.totalDeposited(), PRICE);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // cancel listing returns NFT to seller
    // ─────────────────────────────────────────────────────────────────────────

    function test_Cancel_ReturnsNFTToSeller() public {
        uint256 listingId = _aliceList(PRICE);

        vm.prank(alice);
        vm.expectEmit(true, true, false, false, address(marketplace));
        emit CityMarketplace.ListingCancelled(listingId, alice);
        marketplace.cancel(listingId);

        assertEq(nft.ownerOf(aliceTokenId), alice, "NFT returned to alice");

        // listing is inactive
        (,,,, bool active) = marketplace.listings(listingId);
        assertFalse(active);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // makeOffer + acceptOffer
    // ─────────────────────────────────────────────────────────────────────────

    function test_MakeOffer_And_AcceptOffer() public {
        uint256 listingId = _aliceList(PRICE);
        uint256 offerAmount = 80_000_000;

        vm.prank(bob);
        vm.expectEmit(true, true, true, true, address(marketplace));
        emit CityMarketplace.OfferMade(1, listingId, bob, offerAmount);
        marketplace.makeOffer(listingId, offerAmount);

        uint256 offerId = marketplace.nextOfferId() - 1;
        assertEq(marketplace.pendingOfferFunds(bob), offerAmount, "offer funds locked");

        uint256 fee = (offerAmount * PLATFORM_FEE) / BPS;
        uint256 sellerProceeds = offerAmount - fee;

        vm.prank(alice);
        vm.expectEmit(true, true, true, true, address(marketplace));
        emit CityMarketplace.OfferAccepted(offerId, listingId, alice, bob, offerAmount);
        marketplace.acceptOffer(offerId);

        assertEq(nft.ownerOf(aliceTokenId), bob, "bob owns NFT");
        assertEq(marketplace.pendingWithdrawals(alice), sellerProceeds, "alice proceeds");
        assertEq(mockTreasury.totalDeposited(), fee, "treasury fee");
        assertEq(marketplace.pendingOfferFunds(bob), 0, "offer funds released");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // cancelOffer returns USDC to buyer
    // ─────────────────────────────────────────────────────────────────────────

    function test_CancelOffer_ReturnsUSDC() public {
        uint256 listingId = _aliceList(PRICE);
        uint256 offerAmount = 80_000_000;

        vm.prank(bob);
        marketplace.makeOffer(listingId, offerAmount);
        uint256 offerId = marketplace.nextOfferId() - 1;

        vm.prank(bob);
        vm.expectEmit(true, true, true, true, address(marketplace));
        emit CityMarketplace.OfferCancelled(offerId, listingId, bob, offerAmount);
        marketplace.cancelOffer(offerId);

        // USDC moves to pendingWithdrawals (not directly; needs withdraw)
        assertEq(marketplace.pendingWithdrawals(bob), offerAmount, "bob pending");
        assertEq(marketplace.pendingOfferFunds(bob), 0, "offer funds cleared");

        // actually withdraw
        vm.prank(bob);
        marketplace.withdraw();
        assertEq(usdc.balanceOf(bob), 500_000_000, "bob recovered USDC");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // buy on already-sold listing reverts
    // ─────────────────────────────────────────────────────────────────────────

    function test_Buy_Revert_AlreadySold() public {
        uint256 listingId = _aliceList(PRICE);

        vm.prank(bob);
        marketplace.buy(listingId, PRICE);

        address charlie = makeAddr("charlie");
        usdc.mint(charlie, 500_000_000);
        vm.prank(charlie);
        usdc.approve(address(marketplace), type(uint256).max);

        vm.prank(charlie);
        vm.expectRevert(bytes("listing inactive"));
        marketplace.buy(listingId, PRICE);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // pause blocks list / buy / makeOffer / acceptOffer
    // ─────────────────────────────────────────────────────────────────────────

    function test_Pause_BlocksList() public {
        vm.prank(owner);
        marketplace.pause();

        vm.startPrank(alice);
        nft.approve(address(marketplace), aliceTokenId);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        marketplace.list(address(nft), aliceTokenId, PRICE);
        vm.stopPrank();
    }

    function test_Pause_BlocksBuy() public {
        uint256 listingId = _aliceList(PRICE);

        vm.prank(owner);
        marketplace.pause();

        vm.prank(bob);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        marketplace.buy(listingId, PRICE);
    }

    function test_Pause_BlocksMakeOffer() public {
        uint256 listingId = _aliceList(PRICE);

        vm.prank(owner);
        marketplace.pause();

        vm.prank(bob);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        marketplace.makeOffer(listingId, 50_000_000);
    }

    function test_Pause_BlocksAcceptOffer() public {
        uint256 listingId = _aliceList(PRICE);

        vm.prank(bob);
        marketplace.makeOffer(listingId, 50_000_000);
        uint256 offerId = marketplace.nextOfferId() - 1;

        vm.prank(owner);
        marketplace.pause();

        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        marketplace.acceptOffer(offerId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // List — revert: not owner
    // ─────────────────────────────────────────────────────────────────────────

    function test_List_Revert_NotOwner() public {
        vm.prank(bob);
        vm.expectRevert(bytes("not owner"));
        marketplace.list(address(nft), aliceTokenId, PRICE);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // cancel — revert: not seller
    // ─────────────────────────────────────────────────────────────────────────

    function test_Cancel_Revert_NotSeller() public {
        uint256 listingId = _aliceList(PRICE);

        vm.prank(bob);
        vm.expectRevert(bytes("not seller"));
        marketplace.cancel(listingId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // withdraw seller proceeds
    // ─────────────────────────────────────────────────────────────────────────

    function test_Withdraw_SellerProceeds() public {
        uint256 listingId = _aliceList(PRICE);
        vm.prank(bob);
        marketplace.buy(listingId, PRICE);

        uint256 fee = (PRICE * PLATFORM_FEE) / BPS;
        uint256 expected = PRICE - fee;

        usdc.mint(alice, 0); // ensure alice balance starts at 0 (she had none)
        vm.prank(alice);
        marketplace.withdraw();
        assertEq(usdc.balanceOf(alice), expected);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // buy with wrong expectedPrice reverts with PriceMismatch
    // ─────────────────────────────────────────────────────────────────────────

    function test_Buy_PriceMismatch_Reverts() public {
        uint256 listingId = _aliceList(PRICE);

        uint256 wrongPrice = PRICE + 1;
        usdc.mint(bob, wrongPrice);
        // bob already has max approval from setUp

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(CityMarketplace.PriceMismatch.selector, wrongPrice, PRICE));
        marketplace.buy(listingId, wrongPrice);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // buy with correct expectedPrice succeeds
    // ─────────────────────────────────────────────────────────────────────────

    function test_Buy_CorrectExpectedPrice_Succeeds() public {
        uint256 listingId = _aliceList(PRICE);

        // bob already has 500_000_000 minted in setUp and max approval
        vm.prank(bob);
        marketplace.buy(listingId, PRICE);
        assertEq(nft.ownerOf(aliceTokenId), bob);
    }
}
