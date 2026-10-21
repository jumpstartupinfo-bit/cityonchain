// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
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

contract AdSlots is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    struct Slot {
        uint256 cityId;
        uint256 districtTokenId; // 0 means city-wide slot
        uint256 pricePerDay;
        bool active;
        address slotOwner; // district owner or city mayor
    }

    struct Ad {
        uint256 slotId;
        address advertiser;
        string adContentHash;
        string adLink;
        uint256 startTime;
        uint256 endTime;
        uint256 totalCost;
        uint256 lastClaimedTime;
        bool active;
        bool flagged;
    }

    IERC20 public immutable usdc;
    address public treasury;
    address public revenueSplitter;
    address public cityRegistry;
    address public districtRegistry;
    address public activityTracker;

    uint256 public nextSlotId = 1;
    uint256 public nextAdId = 1;

    mapping(uint256 => Slot) public slots;
    mapping(uint256 => Ad) public ads;
    mapping(uint256 => uint256) public latestAdForSlot;
    mapping(address => uint256) public pendingWithdrawals;
    mapping(uint256 => uint256) public adTotalClaimed;

    event SlotCreated(
        uint256 indexed slotId,
        uint256 indexed cityId,
        uint256 indexed districtTokenId,
        address slotOwner,
        uint256 pricePerDay
    );
    event SlotPriceUpdated(uint256 indexed slotId, uint256 oldPrice, uint256 newPrice);
    event SlotDeactivated(uint256 indexed slotId);
    event AdBooked(
        uint256 indexed adId,
        uint256 indexed slotId,
        address indexed advertiser,
        string adContentHash,
        string adLink,
        uint256 startTime,
        uint256 endTime,
        uint256 totalCost
    );
    event EarningsClaimed(uint256 indexed adId, address indexed slotOwner, uint256 earned);
    event AdFlagged(uint256 indexed adId);
    event AdRemoved(uint256 indexed adId, uint256 refundAmount);
    event Withdrawn(address indexed user, uint256 amount);
    event RevenueSplitterUpdated(address indexed oldRevenueSplitter, address indexed newRevenueSplitter);
    event CityRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event DistrictRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event ActivityTrackerUpdated(address indexed old, address indexed newTracker);

    error InvalidAddress();
    error Unauthorized();
    error SlotNotAvailable();
    error NothingToClaim();
    error InvalidDuration();
    error InvalidPrice();
    error InvalidAd();

    constructor(
        address _usdc,
        address _treasury,
        address _revenueSplitter,
        address _cityRegistry,
        address _districtRegistry,
        address _owner
    ) Ownable(_owner) {
        if (
            _usdc == address(0) || _treasury == address(0) || _revenueSplitter == address(0)
                || _cityRegistry == address(0) || _districtRegistry == address(0) || _owner == address(0)
        ) {
            revert InvalidAddress();
        }

        usdc = IERC20(_usdc);
        treasury = _treasury;
        revenueSplitter = _revenueSplitter;
        cityRegistry = _cityRegistry;
        districtRegistry = _districtRegistry;
    }

    function createSlot(uint256 cityId, uint256 districtTokenId, uint256 pricePerDay) external whenNotPaused {
        if (pricePerDay == 0) revert InvalidPrice();

        bool isAdmin = msg.sender == owner();
        address resolvedSlotOwner;

        if (districtTokenId == 0) {
            resolvedSlotOwner = ICityRegistry(cityRegistry).ownerOf(cityId);
            if (!isAdmin && msg.sender != resolvedSlotOwner) revert Unauthorized();
        } else {
            resolvedSlotOwner = IDistrictRegistry(districtRegistry).ownerOf(districtTokenId);
            if (!isAdmin && msg.sender != resolvedSlotOwner) revert Unauthorized();
        }

        uint256 slotId = nextSlotId++;
        slots[slotId] = Slot({
            cityId: cityId,
            districtTokenId: districtTokenId,
            pricePerDay: pricePerDay,
            active: true,
            slotOwner: resolvedSlotOwner
        });

        emit SlotCreated(slotId, cityId, districtTokenId, resolvedSlotOwner, pricePerDay);
    }

    function updateSlotPrice(uint256 slotId, uint256 newPrice) external {
        if (newPrice == 0) revert InvalidPrice();

        Slot storage slot = slots[slotId];
        if (slot.slotOwner == address(0)) revert Unauthorized();
        address currentSlotOwner = _currentSlotOwner(slotId);
        if (!(msg.sender == currentSlotOwner || msg.sender == owner())) revert Unauthorized();
        if (!_isSlotAvailable(slotId)) revert SlotNotAvailable();

        uint256 oldPrice = slot.pricePerDay;
        slot.pricePerDay = newPrice;

        emit SlotPriceUpdated(slotId, oldPrice, newPrice);
    }

    function deactivateSlot(uint256 slotId) external {
        Slot storage slot = slots[slotId];
        if (slot.slotOwner == address(0)) revert Unauthorized();
        address currentSlotOwner = _currentSlotOwner(slotId);
        if (!(msg.sender == currentSlotOwner || msg.sender == owner())) revert Unauthorized();

        slot.active = false;

        emit SlotDeactivated(slotId);
    }

    function bookAd(uint256 slotId, string calldata adContentHash, string calldata adLink, uint256 durationDays)
        external
        nonReentrant
        whenNotPaused
    {
        if (durationDays == 0) revert InvalidDuration();

        Slot storage slot = slots[slotId];
        if (!slot.active || !_isSlotAvailable(slotId)) revert SlotNotAvailable();

        uint256 totalCost = slot.pricePerDay * durationDays;
        if (totalCost == 0) revert InvalidPrice();

        usdc.safeTransferFrom(msg.sender, address(this), totalCost);

        uint256 adId = nextAdId++;
        uint256 startTime = block.timestamp;
        uint256 endTime = block.timestamp + (durationDays * 1 days);

        ads[adId] = Ad({
            slotId: slotId,
            advertiser: msg.sender,
            adContentHash: adContentHash,
            adLink: adLink,
            startTime: startTime,
            endTime: endTime,
            totalCost: totalCost,
            lastClaimedTime: startTime,
            active: true,
            flagged: false
        });
        latestAdForSlot[slotId] = adId;

        emit AdBooked(adId, slotId, msg.sender, adContentHash, adLink, startTime, endTime, totalCost);
        _recordActivity(slot.cityId, slot.districtTokenId, 2, totalCost);
    }

    function claimSlotEarnings(uint256 adId) external nonReentrant {
        _claimSlotEarnings(adId, true);
    }

    function flagAd(uint256 adId) external {
        Ad storage ad = ads[adId];
        if (ad.advertiser == address(0)) revert InvalidAd();

        Slot storage slot = slots[ad.slotId];
        address currentSlotOwner = _currentSlotOwner(ad.slotId);
        if (!(msg.sender == currentSlotOwner || msg.sender == owner())) revert Unauthorized();

        ad.flagged = true;

        emit AdFlagged(adId);
    }

    function removeAd(uint256 adId) external onlyOwner nonReentrant {
        Ad storage ad = ads[adId];
        if (ad.advertiser == address(0)) revert InvalidAd();
        if (!ad.active) revert SlotNotAvailable();
        if (!ad.flagged) revert Unauthorized(); // admin may only remove flagged ads

        _claimSlotEarnings(adId, false);

        uint256 refundAmount = ad.totalCost - adTotalClaimed[adId];

        if (refundAmount > 0) {
            pendingWithdrawals[ad.advertiser] += refundAmount;
        }

        ad.active = false;

        emit AdRemoved(adId, refundAmount);
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

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function isSlotAvailable(uint256 slotId) external view returns (bool) {
        return _isSlotAvailable(slotId);
    }

    function _claimSlotEarnings(uint256 adId, bool revertIfNothing) internal returns (uint256 earned) {
        Ad storage ad = ads[adId];
        if (ad.advertiser == address(0)) revert InvalidAd();
        if (!ad.active) {
            if (revertIfNothing) revert NothingToClaim();
            return 0;
        }

        uint256 effectiveNow = block.timestamp < ad.endTime ? block.timestamp : ad.endTime;
        if (effectiveNow <= ad.lastClaimedTime) {
            if (block.timestamp >= ad.endTime) {
                ad.active = false;
            }
            if (revertIfNothing) revert NothingToClaim();
            return 0;
        }

        uint256 elapsed = effectiveNow - ad.lastClaimedTime;
        uint256 duration = ad.endTime - ad.startTime;
        earned = (ad.totalCost * elapsed) / duration;

        if (earned == 0) {
            if (block.timestamp >= ad.endTime) {
                ad.active = false;
            }
            if (revertIfNothing) revert NothingToClaim();
            return 0;
        }

        ad.lastClaimedTime = effectiveNow;
        adTotalClaimed[adId] += earned;

        if (ad.lastClaimedTime >= ad.endTime) {
            ad.active = false;
        }

        Slot storage slot = slots[ad.slotId];
        address currentSlotOwner = _currentSlotOwner(ad.slotId);

        usdc.forceApprove(revenueSplitter, 0);
        usdc.forceApprove(revenueSplitter, earned);
        IRevenueSplitter(revenueSplitter).distributeRevenue(slot.cityId, slot.districtTokenId, earned);
        usdc.forceApprove(revenueSplitter, 0);

        emit EarningsClaimed(adId, currentSlotOwner, earned);
    }

    function _recordActivity(uint256 cityId, uint256 districtTokenId, uint8 activityType, uint256 amount) internal {
        if (activityTracker != address(0)) {
            try IActivityTracker(activityTracker).recordActivity(cityId, districtTokenId, activityType, amount) {} catch {}
        }
    }

    function _isSlotAvailable(uint256 slotId) internal view returns (bool) {
        Slot storage slot = slots[slotId];
        if (!slot.active) {
            return false;
        }

        uint256 adId = latestAdForSlot[slotId];
        if (adId == 0) {
            return true;
        }

        Ad storage ad = ads[adId];
        if (!ad.active) {
            return true;
        }

        return block.timestamp >= ad.endTime;
    }

    function _currentSlotOwner(uint256 slotId) internal view returns (address) {
        Slot storage slot = slots[slotId];

        if (slot.districtTokenId != 0 && districtRegistry != address(0)) {
            try IDistrictRegistry(districtRegistry).ownerOf(slot.districtTokenId) returns (address districtOwner) {
                return districtOwner;
            } catch {
                return slot.slotOwner;
            }
        } else if (cityRegistry != address(0)) {
            try ICityRegistry(cityRegistry).ownerOf(slot.cityId) returns (address cityOwner) {
                return cityOwner;
            } catch {
                return slot.slotOwner;
            }
        }

        return slot.slotOwner;
    }
}
