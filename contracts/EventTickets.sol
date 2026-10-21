// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

interface IRevenueSplitter {
    function distributeRevenue(uint256 cityId, uint256 districtTokenId, uint256 amount) external;
}

interface ICityRegistry {
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IDistrictRegistry {
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IActivityTracker {
    function recordActivity(uint256 cityId, uint256 districtTokenId, uint8 activityType, uint256 amount) external;
}

contract EventTickets is ERC1155, Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    struct CityEvent {
        uint256 cityId;
        uint256 districtTokenId; // 0 = city-wide
        address organizer;
        string title;
        uint256 eventDate;
        uint256 capacity;
        uint256 ticketPrice;
        uint256 ticketsSold;
        bool cancelled;
        bool revenueReleased;
        bool resaleEnabled;
        uint256 resaleMarkupCapBps;
    }

    struct ResaleListing {
        uint256 quantity;
        uint256 askPrice;
        bool active;
    }

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant RESALE_PLATFORM_FEE_BPS = 500;

    IERC20 public immutable usdc;
    address public revenueSplitter;
    address public cityRegistry;
    address public districtRegistry;
    address public activityTracker;

    uint256 public nextEventId = 1;

    mapping(uint256 => CityEvent) public events;
    mapping(uint256 => uint256) public escrowedRevenue;
    mapping(uint256 => uint256) public ticketRefundPrice;
    mapping(uint256 => mapping(address => ResaleListing)) public resaleListings;
    mapping(address => uint256) public pendingWithdrawals;

    event EventCreated(
        uint256 indexed eventId,
        uint256 indexed cityId,
        uint256 indexed districtTokenId,
        address organizer,
        string title,
        uint256 eventDate,
        uint256 capacity,
        uint256 ticketPrice
    );
    event TicketsPurchased(uint256 indexed eventId, address indexed buyer, uint256 quantity, uint256 amount);
    event EventCancelled(uint256 indexed eventId);
    event RefundClaimed(uint256 indexed eventId, address indexed holder, uint256 amount);
    event RevenueReleased(uint256 indexed eventId, uint256 amount);
    event TicketListed(uint256 indexed eventId, address indexed seller, uint256 quantity, uint256 askPrice);
    event ResaleTicketSold(
        uint256 indexed eventId,
        address indexed seller,
        address indexed buyer,
        uint256 quantity,
        uint256 totalAmount,
        uint256 platformCut
    );
    event Withdrawn(address indexed user, uint256 amount);
    event RevenueSplitterUpdated(address indexed oldRevenueSplitter, address indexed newRevenueSplitter);
    event CityRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event DistrictRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event ActivityTrackerUpdated(address indexed old, address indexed newTracker);

    error InvalidAddress();
    error Unauthorized();
    error EventNotFound();
    error EventCancelledStatus();
    error EventEnded();
    error EventNotStarted();
    error SoldOut();
    error ResaleDisabled();
    error MarkupExceedsCap();
    error InvalidQuantity();
    error NothingToClaim();

    constructor(address _usdc, address _revenueSplitter, address _cityRegistry, address _districtRegistry, address _owner)
        ERC1155("")
        Ownable(_owner)
    {
        if (
            _usdc == address(0) || _revenueSplitter == address(0) || _cityRegistry == address(0)
                || _districtRegistry == address(0) || _owner == address(0)
        ) {
            revert InvalidAddress();
        }

        usdc = IERC20(_usdc);
        revenueSplitter = _revenueSplitter;
        cityRegistry = _cityRegistry;
        districtRegistry = _districtRegistry;
    }

    function createEvent(
        uint256 cityId,
        uint256 districtTokenId,
        string calldata title,
        uint256 eventDate,
        uint256 capacity,
        uint256 ticketPrice,
        bool resaleEnabled,
        uint256 resaleMarkupCapBps
    ) external whenNotPaused {
        if (eventDate <= block.timestamp) revert EventEnded();
        if (capacity == 0 || ticketPrice == 0) revert InvalidQuantity();

        bool isAdmin = msg.sender == owner();
        bool authorized;

        if (districtTokenId == 0) {
            authorized = msg.sender == ICityRegistry(cityRegistry).ownerOf(cityId);
        } else {
            authorized = msg.sender == IDistrictRegistry(districtRegistry).ownerOf(districtTokenId);
        }

        if (!(authorized || isAdmin)) revert Unauthorized();

        uint256 eventId = nextEventId++;
        events[eventId] = CityEvent({
            cityId: cityId,
            districtTokenId: districtTokenId,
            organizer: msg.sender,
            title: title,
            eventDate: eventDate,
            capacity: capacity,
            ticketPrice: ticketPrice,
            ticketsSold: 0,
            cancelled: false,
            revenueReleased: false,
            resaleEnabled: resaleEnabled,
            resaleMarkupCapBps: resaleMarkupCapBps
        });

        emit EventCreated(eventId, cityId, districtTokenId, msg.sender, title, eventDate, capacity, ticketPrice);
    }

    function buyTicket(uint256 eventId, uint256 quantity) external nonReentrant whenNotPaused {
        if (quantity == 0) revert InvalidQuantity();

        CityEvent storage cityEvent = events[eventId];
        if (cityEvent.organizer == address(0)) revert EventNotFound();
        if (cityEvent.cancelled) revert EventCancelledStatus();
        if (block.timestamp >= cityEvent.eventDate) revert EventEnded();
        if (cityEvent.ticketsSold + quantity > cityEvent.capacity) revert SoldOut();

        uint256 totalCost = cityEvent.ticketPrice * quantity;

        usdc.safeTransferFrom(msg.sender, address(this), totalCost);

        _mint(msg.sender, eventId, quantity, "");

        if (ticketRefundPrice[eventId] == 0) {
            ticketRefundPrice[eventId] = cityEvent.ticketPrice;
        }
        cityEvent.ticketsSold += quantity;
        escrowedRevenue[eventId] += totalCost;

        emit TicketsPurchased(eventId, msg.sender, quantity, totalCost);
        _recordActivity(cityEvent.cityId, cityEvent.districtTokenId, 5, totalCost);
    }

    function cancelEvent(uint256 eventId) external {
        CityEvent storage cityEvent = events[eventId];
        if (cityEvent.organizer == address(0)) revert EventNotFound();
        if (!(msg.sender == cityEvent.organizer || msg.sender == owner())) revert Unauthorized();
        if (block.timestamp >= cityEvent.eventDate) revert EventEnded();

        cityEvent.cancelled = true;

        emit EventCancelled(eventId);
    }

    function claimRefund(uint256 eventId) external nonReentrant {
        CityEvent storage cityEvent = events[eventId];
        if (cityEvent.organizer == address(0)) revert EventNotFound();
        if (!cityEvent.cancelled) revert EventCancelledStatus();

        uint256 held = balanceOf(msg.sender, eventId);
        if (held == 0) revert NothingToClaim();

        uint256 refundAmount = held * cityEvent.ticketPrice;
        require(escrowedRevenue[eventId] >= refundAmount, "insufficient escrow");

        escrowedRevenue[eventId] -= refundAmount;

        _burn(msg.sender, eventId, held);

        pendingWithdrawals[msg.sender] += refundAmount;

        emit RefundClaimed(eventId, msg.sender, refundAmount);
    }

    function releaseRevenue(uint256 eventId) external nonReentrant {
        CityEvent storage cityEvent = events[eventId];
        if (cityEvent.organizer == address(0)) revert EventNotFound();
        if (cityEvent.cancelled) revert EventCancelledStatus();
        if (block.timestamp < cityEvent.eventDate) revert EventNotStarted();
        if (cityEvent.revenueReleased) revert Unauthorized();

        uint256 amount = escrowedRevenue[eventId];
        if (amount == 0) revert NothingToClaim();

        cityEvent.revenueReleased = true;
        escrowedRevenue[eventId] = 0;

        usdc.forceApprove(revenueSplitter, 0);
        usdc.forceApprove(revenueSplitter, amount);
        IRevenueSplitter(revenueSplitter).distributeRevenue(cityEvent.cityId, cityEvent.districtTokenId, amount);
        usdc.forceApprove(revenueSplitter, 0);

        emit RevenueReleased(eventId, amount);
    }

    function listTicketForResale(uint256 eventId, uint256 quantity, uint256 askPrice) external whenNotPaused {
        if (quantity == 0 || askPrice == 0) revert InvalidQuantity();

        CityEvent storage cityEvent = events[eventId];
        if (cityEvent.organizer == address(0)) revert EventNotFound();
        if (cityEvent.cancelled) revert EventCancelledStatus();
        if (block.timestamp >= cityEvent.eventDate) revert EventEnded();
        if (!cityEvent.resaleEnabled) revert ResaleDisabled();
        if (balanceOf(msg.sender, eventId) < quantity) revert Unauthorized();

        uint256 maxAsk = (cityEvent.ticketPrice * (BPS_DENOMINATOR + cityEvent.resaleMarkupCapBps)) / BPS_DENOMINATOR;
        if (askPrice > maxAsk) revert MarkupExceedsCap();

        resaleListings[eventId][msg.sender] = ResaleListing({quantity: quantity, askPrice: askPrice, active: true});

        emit TicketListed(eventId, msg.sender, quantity, askPrice);
    }

    function buyResaleTicket(uint256 eventId, address seller, uint256 quantity) external nonReentrant whenNotPaused {
        if (quantity == 0) revert InvalidQuantity();

        CityEvent storage cityEvent = events[eventId];
        if (cityEvent.organizer == address(0)) revert EventNotFound();
        if (cityEvent.cancelled) revert EventCancelledStatus();
        if (block.timestamp >= cityEvent.eventDate) revert EventEnded();

        ResaleListing storage listing = resaleListings[eventId][seller];
        if (!listing.active || listing.quantity < quantity) revert ResaleDisabled();
        require(balanceOf(seller, eventId) >= quantity, "insufficient tickets");

        uint256 totalAmount = listing.askPrice * quantity;
        uint256 platformCut = (totalAmount * RESALE_PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 sellerProceeds = totalAmount - platformCut;

        usdc.safeTransferFrom(msg.sender, address(this), totalAmount);

        pendingWithdrawals[seller] += sellerProceeds;

        if (platformCut > 0) {
            usdc.forceApprove(revenueSplitter, 0);
            usdc.forceApprove(revenueSplitter, platformCut);
            IRevenueSplitter(revenueSplitter).distributeRevenue(cityEvent.cityId, cityEvent.districtTokenId, platformCut);
            usdc.forceApprove(revenueSplitter, 0);
        }

        listing.quantity -= quantity;
        if (listing.quantity == 0) {
            listing.active = false;
        }

        _safeTransferFrom(seller, msg.sender, eventId, quantity, "");

        emit ResaleTicketSold(eventId, seller, msg.sender, quantity, totalAmount, platformCut);
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToClaim();

        pendingWithdrawals[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    function setRevenueSplitter(address newRevenueSplitter) external onlyOwner {
        if (newRevenueSplitter == address(0)) revert InvalidAddress();

        address oldRevenueSplitter = revenueSplitter;
        revenueSplitter = newRevenueSplitter;

        emit RevenueSplitterUpdated(oldRevenueSplitter, newRevenueSplitter);
    }

    function setCityRegistry(address newCityRegistry) external onlyOwner {
        if (newCityRegistry == address(0)) revert InvalidAddress();

        address oldRegistry = cityRegistry;
        cityRegistry = newCityRegistry;

        emit CityRegistryUpdated(oldRegistry, newCityRegistry);
    }

    function setDistrictRegistry(address newDistrictRegistry) external onlyOwner {
        if (newDistrictRegistry == address(0)) revert InvalidAddress();

        address oldRegistry = districtRegistry;
        districtRegistry = newDistrictRegistry;

        emit DistrictRegistryUpdated(oldRegistry, newDistrictRegistry);
    }

    function setActivityTracker(address _activityTracker) external onlyOwner {
        address old = activityTracker;
        activityTracker = _activityTracker;
        emit ActivityTrackerUpdated(old, _activityTracker);
    }

    function _recordActivity(uint256 cityId, uint256 districtTokenId, uint8 activityType, uint256 amount) internal {
        if (activityTracker != address(0)) {
            try IActivityTracker(activityTracker).recordActivity(cityId, districtTokenId, activityType, amount) {} catch {}
        }
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
