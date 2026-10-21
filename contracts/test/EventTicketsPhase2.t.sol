// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

import {EventTickets} from "../EventTickets.sol";
import {RevenueSplitter} from "../RevenueSplitter.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {MockTreasury} from "../test-helpers/MockTreasury.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

contract MockNFTRegistryET is ERC721 {
    constructor(string memory n, string memory s) ERC721(n, s) {}
    function mint(address to, uint256 id) external { _mint(to, id); }
    function transferFrom(address from, address to, uint256 id) public override { _transfer(from, to, id); }
}

// ─────────────────────────────────────────────────────────────────────────────
// EventTickets Phase-2 tests
// ─────────────────────────────────────────────────────────────────────────────

contract EventTicketsPhase2Test is Test {
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;

    address internal owner      = makeAddr("owner");
    address internal treasury   = makeAddr("treasury");
    address internal organizer  = makeAddr("organizer");
    address internal alice      = makeAddr("alice");
    address internal bob        = makeAddr("bob");
    address internal stranger   = makeAddr("stranger");

    MockERC20        internal usdc;
    RevenueSplitter  internal revSplitter;
    MockTreasury     internal mockTreasury;
    EventTickets     internal eventTickets;

    MockNFTRegistryET internal cityReg;
    MockNFTRegistryET internal districtReg;

    uint256 internal constant CITY_ID        = 1;
    uint256 internal constant DISTRICT_TOKEN = 20;
    uint256 internal constant TICKET_PRICE   = 10_000_000; // 10 USDC
    uint256 internal constant CAPACITY       = 100;
    uint256 internal constant RESALE_CAP_BPS = 2_000; // 20% markup cap

    uint256 internal eventDate;

    // ─────────────────────────────────────────────────────────────────────────
    // setUp
    // ─────────────────────────────────────────────────────────────────────────

    function setUp() public {
        // USDC
        MockERC20 impl = new MockERC20("Mock USDC", "mUSDC", 6);
        vm.etch(USDC_ADDR, address(impl).code);
        usdc = MockERC20(USDC_ADDR);

        // NFT registries
        cityReg     = new MockNFTRegistryET("CityReg", "CITY");
        districtReg = new MockNFTRegistryET("DistReg", "DIST");
        cityReg.mint(makeAddr("mayor"), CITY_ID);
        districtReg.mint(organizer, DISTRICT_TOKEN);

        // RevenueSplitter + Treasury
        revSplitter  = new RevenueSplitter(USDC_ADDR, treasury, owner);
        mockTreasury = new MockTreasury(USDC_ADDR);
        vm.startPrank(owner);
        revSplitter.setCityRegistry(address(cityReg));
        revSplitter.setDistrictRegistry(address(districtReg));
        revSplitter.setTreasuryContract(address(mockTreasury));
        vm.stopPrank();

        // EventTickets
        eventTickets = new EventTickets(
            USDC_ADDR,
            address(revSplitter),
            address(cityReg),
            address(districtReg),
            owner
        );

        // eventDate = now + 30 days
        eventDate = block.timestamp + 30 days;

        // Fund participants
        usdc.mint(alice,    10_000_000_000);
        usdc.mint(bob,      10_000_000_000);
        usdc.mint(stranger, 10_000_000_000);
        vm.prank(alice);    usdc.approve(address(eventTickets), type(uint256).max);
        vm.prank(bob);      usdc.approve(address(eventTickets), type(uint256).max);
        vm.prank(stranger); usdc.approve(address(eventTickets), type(uint256).max);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _createEvent(bool resaleEnabled) internal returns (uint256 eventId) {
        vm.prank(organizer);
        eventTickets.createEvent(
            CITY_ID,
            DISTRICT_TOKEN,
            "CityFest 2025",
            eventDate,
            CAPACITY,
            TICKET_PRICE,
            resaleEnabled,
            RESALE_CAP_BPS
        );
        eventId = eventTickets.nextEventId() - 1;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. createEvent + buyTicket happy path: tickets minted, USDC escrowed
    // ─────────────────────────────────────────────────────────────────────────

    function test_CreateEvent_BuyTicket_HappyPath() public {
        uint256 eventId = _createEvent(true);

        // Check event stored
        (
            uint256 cityId,
            uint256 distTokenId,
            address org,
            ,
            uint256 eDate,
            uint256 cap,
            uint256 tPrice,
            uint256 tSold,
            bool cancelled,
            ,
            ,

        ) = eventTickets.events(eventId);
        assertEq(cityId,     CITY_ID,        "cityId");
        assertEq(distTokenId, DISTRICT_TOKEN, "districtToken");
        assertEq(org,        organizer,       "organizer");
        assertEq(eDate,      eventDate,       "eventDate");
        assertEq(cap,        CAPACITY,        "capacity");
        assertEq(tPrice,     TICKET_PRICE,    "ticketPrice");
        assertEq(tSold,      0,               "ticketsSold starts 0");
        assertFalse(cancelled,                "not cancelled");

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 qty = 3;

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(eventTickets));
        emit EventTickets.TicketsPurchased(eventId, alice, qty, TICKET_PRICE * qty);
        eventTickets.buyTicket(eventId, qty);

        // Tickets minted (ERC-1155 tokenId == eventId)
        assertEq(eventTickets.balanceOf(alice, eventId), qty, "tickets minted");

        // USDC escrowed
        assertEq(eventTickets.escrowedRevenue(eventId), TICKET_PRICE * qty, "escrowed");
        assertEq(usdc.balanceOf(alice), aliceBefore - TICKET_PRICE * qty, "alice debited");

        // ticketsSold updated
        (,,,,,, , uint256 sold,,,, ) = eventTickets.events(eventId);
        assertEq(sold, qty, "ticketsSold updated");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. buyTicket revert: sold out (capacity exceeded)
    // ─────────────────────────────────────────────────────────────────────────

    function test_BuyTicket_Revert_SoldOut() public {
        uint256 eventId = _createEvent(false);

        // Buy all tickets as alice
        vm.prank(alice);
        eventTickets.buyTicket(eventId, CAPACITY);

        // Bob tries to buy 1 more
        vm.prank(bob);
        vm.expectRevert(EventTickets.SoldOut.selector);
        eventTickets.buyTicket(eventId, 1);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. buyTicket revert: after eventDate
    // ─────────────────────────────────────────────────────────────────────────

    function test_BuyTicket_Revert_AfterEventDate() public {
        uint256 eventId = _createEvent(false);

        vm.warp(eventDate);

        vm.prank(alice);
        vm.expectRevert(EventTickets.EventEnded.selector);
        eventTickets.buyTicket(eventId, 1);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. cancelEvent + claimRefund: full refund by balance, tickets burned,
    //    escrow decremented
    // ─────────────────────────────────────────────────────────────────────────

    function test_CancelEvent_ClaimRefund_FullRefund() public {
        uint256 eventId = _createEvent(false);

        uint256 qty = 5;
        vm.prank(alice);
        eventTickets.buyTicket(eventId, qty);

        uint256 escrowed = eventTickets.escrowedRevenue(eventId);
        assertEq(escrowed, TICKET_PRICE * qty, "escrow before cancel");

        vm.prank(organizer);
        vm.expectEmit(true, false, false, false, address(eventTickets));
        emit EventTickets.EventCancelled(eventId);
        eventTickets.cancelEvent(eventId);

        uint256 alicePendingBefore = eventTickets.pendingWithdrawals(alice);

        vm.prank(alice);
        eventTickets.claimRefund(eventId);

        // Tickets burned
        assertEq(eventTickets.balanceOf(alice, eventId), 0, "tickets burned");

        // Escrow decremented
        assertEq(eventTickets.escrowedRevenue(eventId), 0, "escrow cleared");

        // Pending withdrawal increased by full refund
        uint256 refund = TICKET_PRICE * qty;
        assertEq(eventTickets.pendingWithdrawals(alice) - alicePendingBefore, refund, "refund credited");

        // alice can withdraw
        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        eventTickets.withdraw();
        assertEq(usdc.balanceOf(alice), aliceBefore + refund, "alice refunded");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. claimRefund after secondary transfer: alice sells to bob, bob claims
    // ─────────────────────────────────────────────────────────────────────────

    function test_ClaimRefund_AfterSecondaryTransfer() public {
        uint256 eventId = _createEvent(false);

        // alice buys 3 tickets
        vm.prank(alice);
        eventTickets.buyTicket(eventId, 3);

        // alice transfers all 3 to bob
        vm.prank(alice);
        eventTickets.safeTransferFrom(alice, bob, eventId, 3, "");

        // cancel event
        vm.prank(organizer);
        eventTickets.cancelEvent(eventId);

        // alice has 0 tickets → NothingToClaim
        vm.prank(alice);
        vm.expectRevert(EventTickets.NothingToClaim.selector);
        eventTickets.claimRefund(eventId);

        // bob claims refund for 3 tickets
        vm.prank(bob);
        eventTickets.claimRefund(eventId);

        assertEq(eventTickets.balanceOf(bob, eventId), 0, "bob tickets burned");
        assertEq(eventTickets.pendingWithdrawals(bob), TICKET_PRICE * 3, "bob refund");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. releaseRevenue: after eventDate, forwards escrowed USDC to RevenueSplitter
    // ─────────────────────────────────────────────────────────────────────────

    function test_ReleaseRevenue_AfterEventDate() public {
        uint256 eventId = _createEvent(false);

        uint256 qty = 10;
        vm.prank(alice);
        eventTickets.buyTicket(eventId, qty);

        uint256 escrowed = eventTickets.escrowedRevenue(eventId);

        vm.warp(eventDate + 1);

        uint256 platformBefore = mockTreasury.totalDeposited();

        vm.expectEmit(true, false, false, true, address(eventTickets));
        emit EventTickets.RevenueReleased(eventId, escrowed);
        eventTickets.releaseRevenue(eventId);

        // Escrow cleared
        assertEq(eventTickets.escrowedRevenue(eventId), 0, "escrow cleared");

        // Platform got 10%
        uint256 platformShare = (escrowed * 1_000) / 10_000;
        assertEq(mockTreasury.totalDeposited() - platformBefore, platformShare, "platform share");

        // revenueReleased flag set
        (,,,,,,,, , bool revenueReleased,, ) = eventTickets.events(eventId);
        assertTrue(revenueReleased, "revenueReleased flag");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. releaseRevenue revert before eventDate
    // ─────────────────────────────────────────────────────────────────────────

    function test_ReleaseRevenue_Revert_BeforeEventDate() public {
        uint256 eventId = _createEvent(false);

        vm.prank(alice);
        eventTickets.buyTicket(eventId, 1);

        // Still before eventDate
        vm.expectRevert(EventTickets.EventNotStarted.selector);
        eventTickets.releaseRevenue(eventId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 8. resale listing + buyResaleTicket happy path
    // ─────────────────────────────────────────────────────────────────────────

    function test_Resale_ListAndBuy_HappyPath() public {
        uint256 eventId = _createEvent(true);

        // alice buys 2 tickets
        vm.prank(alice);
        eventTickets.buyTicket(eventId, 2);

        // alice lists 1 ticket at 10% above face value (within 20% cap)
        uint256 resalePrice = (TICKET_PRICE * 11_000) / 10_000; // 10% markup

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(eventTickets));
        emit EventTickets.TicketListed(eventId, alice, 1, resalePrice);
        eventTickets.listTicketForResale(eventId, 1, resalePrice);

        // bob buys from alice
        uint256 bobBefore  = usdc.balanceOf(bob);
        uint256 platformFee = (resalePrice * 500) / 10_000; // 5%
        uint256 sellerProceeds = resalePrice - platformFee;

        vm.prank(bob);
        vm.expectEmit(true, true, true, true, address(eventTickets));
        emit EventTickets.ResaleTicketSold(eventId, alice, bob, 1, resalePrice, platformFee);
        eventTickets.buyResaleTicket(eventId, alice, 1);

        // bob received the ticket
        assertEq(eventTickets.balanceOf(bob, eventId), 1, "bob got ticket");
        assertEq(eventTickets.balanceOf(alice, eventId), 1, "alice still has 1");

        // bob paid
        assertEq(usdc.balanceOf(bob), bobBefore - resalePrice, "bob debited");

        // alice has seller proceeds in pendingWithdrawals
        assertEq(eventTickets.pendingWithdrawals(alice), sellerProceeds, "alice proceeds");

        // Listing deactivated after 0 remaining
        (uint256 remainQty,, bool active) = eventTickets.resaleListings(eventId, alice);
        assertFalse(active, "listing inactive");
        assertEq(remainQty, 0, "qty 0");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 9. resale revert: markup exceeds cap
    // ─────────────────────────────────────────────────────────────────────────

    function test_Resale_Revert_MarkupExceedsCap() public {
        uint256 eventId = _createEvent(true);

        vm.prank(alice);
        eventTickets.buyTicket(eventId, 1);

        // 30% markup, cap is 20%
        uint256 tooHighPrice = (TICKET_PRICE * 13_000) / 10_000;

        vm.prank(alice);
        vm.expectRevert(EventTickets.MarkupExceedsCap.selector);
        eventTickets.listTicketForResale(eventId, 1, tooHighPrice);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 10. Unauthorized cancelEvent (non-organizer, non-admin)
    // ─────────────────────────────────────────────────────────────────────────

    function test_CancelEvent_Revert_Unauthorized() public {
        uint256 eventId = _createEvent(false);

        vm.prank(stranger);
        vm.expectRevert(EventTickets.Unauthorized.selector);
        eventTickets.cancelEvent(eventId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Extra: cancelEvent reverts after eventDate
    // ─────────────────────────────────────────────────────────────────────────

    function test_CancelEvent_Revert_AfterEventDate() public {
        uint256 eventId = _createEvent(false);

        vm.warp(eventDate);

        vm.prank(organizer);
        vm.expectRevert(EventTickets.EventEnded.selector);
        eventTickets.cancelEvent(eventId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Extra: createEvent revert when eventDate in the past
    // ─────────────────────────────────────────────────────────────────────────

    function test_CreateEvent_Revert_DateInPast() public {
        vm.prank(organizer);
        vm.expectRevert(EventTickets.EventEnded.selector);
        eventTickets.createEvent(
            CITY_ID, DISTRICT_TOKEN, "Old Event",
            block.timestamp, // not strictly > block.timestamp
            100, TICKET_PRICE, false, 0
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Extra: releaseRevenue cannot be called twice
    // ─────────────────────────────────────────────────────────────────────────

    function test_ReleaseRevenue_Revert_AlreadyReleased() public {
        uint256 eventId = _createEvent(false);

        vm.prank(alice);
        eventTickets.buyTicket(eventId, 1);

        vm.warp(eventDate + 1);
        eventTickets.releaseRevenue(eventId);

        // Second call should revert as revenueReleased
        vm.expectRevert(EventTickets.Unauthorized.selector);
        eventTickets.releaseRevenue(eventId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Extra: resale disabled reverts listing
    // ─────────────────────────────────────────────────────────────────────────

    function test_Resale_Revert_ResaleDisabled() public {
        uint256 eventId = _createEvent(false); // resaleEnabled = false

        vm.prank(alice);
        eventTickets.buyTicket(eventId, 1);

        vm.prank(alice);
        vm.expectRevert(EventTickets.ResaleDisabled.selector);
        eventTickets.listTicketForResale(eventId, 1, TICKET_PRICE);
    }
}
