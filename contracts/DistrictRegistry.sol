// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

interface ICityRegistry {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getCityTier(uint256 cityId) external view returns (uint8);
}

interface IFeeConfigPrice {
    function getTierPrice(uint8 tier) external view returns (uint256);
}

interface ITreasury {
    function deposit(uint8 source, uint256 amount) external;
}

interface IReferralVaultDistrict {
    function creditCommission(
        address buyer,
        uint256 price,
        bool    isCityPurchase,
        string  calldata country
    ) external returns (uint256 commissionPulled);
}

interface IActivityTracker {
    function recordActivity(uint256 cityId, uint256 districtTokenId, uint8 activityType, uint256 amount) external;
}

contract DistrictRegistry is ERC721Enumerable, Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes4 private constant _INTERFACE_ID_ERC4907 = 0xad092b5c;

    uint256 public constant PRICE_FLOOR = 5_000_000;
    uint256 public constant MAX_BPS     = 10_000;

    struct UserInfo {
        address user;
        uint64 expires;
    }

    IERC20  public immutable usdc;
    address public cityRegistry;
    address public treasuryContract;
    address public revenueSplitter;
    address public leaseManager;
    address public referralVault;
    address public feeConfig;
    address public activityTracker;

    uint256 public districtPriceBps = 500;
    uint256 public firstRefusalDays = 7;

    mapping(uint8 => uint8)   public districtCountByTier;
    mapping(uint256 => uint256) public cityMintedAt;
    mapping(uint256 => uint8) public districtSector;
    mapping(uint256 => mapping(address => bool)) public districtAllowlist;
    mapping(uint256 => UserInfo) internal _users;
    mapping(address => uint256) public pendingWithdrawals;

    event DistrictBought(
        uint256 indexed tokenId,
        uint256 indexed cityId,
        uint8 indexed districtIndex,
        uint8   displayTier,
        address buyer,
        uint256 price,
        uint256 commission
    );
    event DistrictPriceBpsUpdated(uint256 oldBps, uint256 newBps);
    event DistrictCountUpdated(uint8 indexed displayTier, uint8 count);
    event FirstRefusalDaysUpdated(uint256 oldDays, uint256 newDays);
    event CityMintNotified(uint256 indexed cityId, uint256 timestamp);
    event DistrictsBatchMinted(uint256 indexed cityId, uint8 displayTier, uint8 count, address indexed to);
    event CityRegistryUpdated(address indexed oldCityRegistry, address indexed newCityRegistry);
    event WalletAllowlisted(uint256 indexed cityId, address indexed wallet);
    event WalletRemovedFromAllowlist(uint256 indexed cityId, address indexed wallet);
    event DistrictsOpened(uint256 indexed cityId, address indexed opener);
    event RevenueCredited(address indexed user, uint256 amount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event RevenueSplitterUpdated(address indexed oldRevenueSplitter, address indexed newRevenueSplitter);
    event LeaseManagerUpdated(address indexed oldLeaseManager, address indexed newLeaseManager);
    event ReferralVaultUpdated(address indexed oldVault, address indexed newVault);
    event FeeConfigUpdated(address indexed fc);
    event Withdrawn(address indexed user, uint256 amount);
    event UpdateUser(uint256 indexed tokenId, address indexed user, uint64 expires);
    event DistrictSectorSet(uint256 indexed tokenId, uint8 sectorIndex);
    event ActivityTrackerUpdated(address indexed old, address indexed newTracker);

    error InvalidAddress();
    error InvalidDistrictIndex();
    error InvalidTier();
    error CityNotMinted();
    error AlreadyMinted();
    error FirstRefusalWindowActive();
    error TreasuryNotConfigured();
    error InvalidBps();
    error Unauthorized();
    error InvalidSector();

    constructor(address _usdc, address _cityRegistry, address _treasuryContract, address _owner)
        ERC721("DistrictRegistry", "DSTR")
        Ownable(_owner)
    {
        if (_usdc == address(0) || _cityRegistry == address(0) || _treasuryContract == address(0) || _owner == address(0)) {
            revert InvalidAddress();
        }
        usdc              = IERC20(_usdc);
        cityRegistry      = _cityRegistry;
        treasuryContract  = _treasuryContract;

        districtCountByTier[1] = 24;
        districtCountByTier[2] = 16;
        districtCountByTier[3] = 12;
        districtCountByTier[4] = 8;
        districtCountByTier[5] = 6;
        districtCountByTier[6] = 4;
    }

    function buyDistrict(
        uint256 cityId,
        uint8   districtIndex,
        string  calldata country
    ) external nonReentrant whenNotPaused {
        if (cityRegistry == address(0)) revert InvalidAddress();

        address cityOwner = _cityOwnerOrRevert(cityId);
        uint8 displayTier = ICityRegistry(cityRegistry).getCityTier(cityId);
        if (displayTier < 1 || displayTier > 6) revert InvalidTier();

        uint8 districtCount = districtCountByTier[displayTier];
        if (districtIndex >= districtCount) revert InvalidDistrictIndex();

        uint256 tokenId = _tokenIdFor(cityId, districtIndex);
        if (_ownerOf(tokenId) != address(0)) revert AlreadyMinted();

        uint256 mintedAt = cityMintedAt[cityId];
        if (mintedAt > 1 && block.timestamp < mintedAt + (firstRefusalDays * 1 days)) {
            if (msg.sender != cityOwner && !districtAllowlist[cityId][msg.sender]) {
                revert FirstRefusalWindowActive();
            }
        }

        uint256 cityPrice = feeConfig != address(0)
            ? IFeeConfigPrice(feeConfig).getTierPrice(displayTier)
            : _cityPriceForTier(displayTier);
        uint256 price = (cityPrice * districtPriceBps) / MAX_BPS;
        if (price < PRICE_FLOOR) price = PRICE_FLOOR;

        // Pull full price from buyer
        usdc.safeTransferFrom(msg.sender, address(this), price);

        // --- Referral commission (optional) ---
        uint256 commission = 0;
        if (referralVault != address(0)) {
            usdc.forceApprove(referralVault, price);
            try IReferralVaultDistrict(referralVault).creditCommission(msg.sender, price, false, country)
                returns (uint256 pulled)
            {
                commission = pulled;
            } catch {}
            usdc.forceApprove(referralVault, 0);
        }

        // --- Treasury receives remainder ---
        if (treasuryContract == address(0)) revert TreasuryNotConfigured();
        uint256 toTreasury = price - commission;
        usdc.forceApprove(treasuryContract, toTreasury);
        ITreasury(treasuryContract).deposit(0, toTreasury);
        usdc.forceApprove(treasuryContract, 0);

        _safeMint(msg.sender, tokenId);

        emit DistrictBought(tokenId, cityId, districtIndex, displayTier, msg.sender, price, commission);
        _recordActivity(cityId, tokenId, 1, price);
    }

    // Legacy overload without country (defaults to empty string — no country filter)
    function buyDistrict(uint256 cityId, uint8 districtIndex)
        external
        nonReentrant
        whenNotPaused
    {
        // Forward to main implementation via internal call
        // Re-implement inline to avoid msg.sender confusion
        if (cityRegistry == address(0)) revert InvalidAddress();

        address cityOwner = _cityOwnerOrRevert(cityId);
        uint8 displayTier = ICityRegistry(cityRegistry).getCityTier(cityId);
        if (displayTier < 1 || displayTier > 6) revert InvalidTier();

        uint8 districtCount = districtCountByTier[displayTier];
        if (districtIndex >= districtCount) revert InvalidDistrictIndex();

        uint256 tokenId = _tokenIdFor(cityId, districtIndex);
        if (_ownerOf(tokenId) != address(0)) revert AlreadyMinted();

        uint256 mintedAt = cityMintedAt[cityId];
        if (mintedAt > 1 && block.timestamp < mintedAt + (firstRefusalDays * 1 days)) {
            if (msg.sender != cityOwner && !districtAllowlist[cityId][msg.sender]) {
                revert FirstRefusalWindowActive();
            }
        }

        uint256 cityPrice = feeConfig != address(0)
            ? IFeeConfigPrice(feeConfig).getTierPrice(displayTier)
            : _cityPriceForTier(displayTier);
        uint256 price = (cityPrice * districtPriceBps) / MAX_BPS;
        if (price < PRICE_FLOOR) price = PRICE_FLOOR;

        usdc.safeTransferFrom(msg.sender, address(this), price);

        uint256 commission = 0;
        if (referralVault != address(0)) {
            usdc.forceApprove(referralVault, price);
            try IReferralVaultDistrict(referralVault).creditCommission(msg.sender, price, false, "")
                returns (uint256 pulled)
            {
                commission = pulled;
            } catch {}
            usdc.forceApprove(referralVault, 0);
        }

        if (treasuryContract == address(0)) revert TreasuryNotConfigured();
        uint256 toTreasury = price - commission;
        usdc.forceApprove(treasuryContract, toTreasury);
        ITreasury(treasuryContract).deposit(0, toTreasury);
        usdc.forceApprove(treasuryContract, 0);

        _safeMint(msg.sender, tokenId);

        emit DistrictBought(tokenId, cityId, districtIndex, displayTier, msg.sender, price, commission);
        _recordActivity(cityId, tokenId, 1, price);
    }

    function mintBatch(uint256 cityId, uint8 displayTier, address to) external {
        if (msg.sender != cityRegistry) revert Unauthorized();
        if (displayTier < 1 || displayTier > 6) revert InvalidTier();

        uint8 count = districtCountByTier[displayTier];
        for (uint8 i = 0; i < count; ++i) {
            if (_ownerOf(_tokenIdFor(cityId, i)) != address(0)) revert AlreadyMinted();
        }

        for (uint8 i = 0; i < count; ++i) {
            _safeMint(to, _tokenIdFor(cityId, i));
        }

        cityMintedAt[cityId] = block.timestamp;
        emit CityMintNotified(cityId, block.timestamp);
        emit DistrictsBatchMinted(cityId, displayTier, count, to);
    }

    /// @notice Owner-only: mint all districts for a legacy city (pre-v3 claims) to a given address.
    ///         Use to backfill cities that were claimed before mintBatch was added.
    function mintBatchAdmin(uint256 cityId, uint8 displayTier, address to) external onlyOwner {
        if (displayTier < 1 || displayTier > 6) revert InvalidTier();
        if (to == address(0)) revert InvalidAddress();

        uint8 count = districtCountByTier[displayTier];
        for (uint8 i = 0; i < count; ++i) {
            if (_ownerOf(_tokenIdFor(cityId, i)) != address(0)) revert AlreadyMinted();
        }
        for (uint8 i = 0; i < count; ++i) {
            _safeMint(to, _tokenIdFor(cityId, i));
        }
        if (cityMintedAt[cityId] == 0) cityMintedAt[cityId] = block.timestamp;
        emit DistrictsBatchMinted(cityId, displayTier, count, to);
    }

    function creditRevenue(address user, uint256 amount) external {
        if (msg.sender != revenueSplitter) revert Unauthorized();
        require(user != address(0), "invalid user");
        require(amount > 0, "invalid amount");
        pendingWithdrawals[user] += amount;
        emit RevenueCredited(user, amount);
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ── Setters ───────────────────────────────────────────────────────────────
    function setCityRegistry(address newCityRegistry) external onlyOwner {
        if (newCityRegistry == address(0)) revert InvalidAddress();
        address old = cityRegistry;
        cityRegistry = newCityRegistry;
        emit CityRegistryUpdated(old, newCityRegistry);
    }

    function setReferralVault(address vault) external onlyOwner {
        address old = referralVault;
        referralVault = vault;
        emit ReferralVaultUpdated(old, vault);
    }

    function setFeeConfig(address _fc) external onlyOwner {
        feeConfig = _fc;
        emit FeeConfigUpdated(_fc);
    }

    function allowlistWallet(uint256 cityId, address wallet) external {
        if (wallet == address(0)) revert InvalidAddress();
        address cityOwner = _cityOwnerOrRevert(cityId);
        if (msg.sender != cityOwner) revert Unauthorized();
        districtAllowlist[cityId][wallet] = true;
        emit WalletAllowlisted(cityId, wallet);
    }

    function removeFromAllowlist(uint256 cityId, address wallet) external {
        address cityOwner = _cityOwnerOrRevert(cityId);
        if (msg.sender != cityOwner) revert Unauthorized();
        districtAllowlist[cityId][wallet] = false;
        emit WalletRemovedFromAllowlist(cityId, wallet);
    }

    function openDistricts(uint256 cityId) external {
        address cityOwner = _cityOwnerOrRevert(cityId);
        if (msg.sender != cityOwner) revert Unauthorized();
        cityMintedAt[cityId] = 1;
        emit DistrictsOpened(cityId, msg.sender);
    }

    function setDistrictSector(uint256 tokenId, uint8 sectorIndex) external {
        if (ownerOf(tokenId) != msg.sender) revert Unauthorized();
        if (sectorIndex > 30) revert InvalidSector();
        districtSector[tokenId] = sectorIndex;
        emit DistrictSectorSet(tokenId, sectorIndex);
    }

    function setDistrictPriceBps(uint256 bps) external onlyOwner {
        if (bps > MAX_BPS) revert InvalidBps();
        uint256 old = districtPriceBps;
        districtPriceBps = bps;
        emit DistrictPriceBpsUpdated(old, bps);
    }

    function setFirstRefusalDays(uint256 days_) external onlyOwner {
        require(days_ <= 14, "days too high");
        uint256 old = firstRefusalDays;
        firstRefusalDays = days_;
        emit FirstRefusalDaysUpdated(old, days_);
    }

    function setDistrictCount(uint8 displayTier, uint8 count) external onlyOwner {
        districtCountByTier[displayTier] = count;
        emit DistrictCountUpdated(displayTier, count);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidAddress();
        address old = treasuryContract;
        treasuryContract = newTreasury;
        emit TreasuryUpdated(old, newTreasury);
    }

    function setRevenueSplitter(address newRevenueSplitter) external onlyOwner {
        if (newRevenueSplitter == address(0)) revert InvalidAddress();
        address old = revenueSplitter;
        revenueSplitter = newRevenueSplitter;
        emit RevenueSplitterUpdated(old, newRevenueSplitter);
    }

    function setLeaseManager(address _leaseManager) external onlyOwner {
        if (_leaseManager == address(0)) revert InvalidAddress();
        address old = leaseManager;
        leaseManager = _leaseManager;
        emit LeaseManagerUpdated(old, _leaseManager);
    }

    function setActivityTracker(address _activityTracker) external onlyOwner {
        address old = activityTracker;
        activityTracker = _activityTracker;
        emit ActivityTrackerUpdated(old, _activityTracker);
    }

    // ── Views ─────────────────────────────────────────────────────────────────
    function districtCountFor(uint8 displayTier) external view returns (uint8) {
        return districtCountByTier[displayTier];
    }

    function districtFloorPrice(uint256 cityPrice) public view returns (uint256) {
        uint256 price = (cityPrice * districtPriceBps) / MAX_BPS;
        return price < PRICE_FLOOR ? PRICE_FLOOR : price;
    }

    function _cityPriceForTier(uint8 tier) internal pure returns (uint256) {
        if (tier == 1) return 7_500_000_000;
        if (tier == 2) return 3_000_000_000;
        if (tier == 3) return 1_200_000_000;
        if (tier == 4) return 400_000_000;
        if (tier == 5) return 120_000_000;
        if (tier == 6) return 40_000_000;
        revert InvalidTier();
    }

    function districtPrice(uint256 cityPrice, uint8 displayTier) external view returns (uint256) {
        if (displayTier < 1 || displayTier > 6) revert InvalidTier();
        uint256 price = (cityPrice * districtPriceBps) / MAX_BPS;
        return price < PRICE_FLOOR ? PRICE_FLOOR : price;
    }

    function tokenIdFor(uint256 cityId, uint8 districtIndex) external pure returns (uint256) {
        return _tokenIdFor(cityId, districtIndex);
    }

    function firstRefusalWindowEnd(uint256 cityId) external view returns (uint256) {
        uint256 mintedAt = cityMintedAt[cityId];
        if (mintedAt <= 1) return 0;
        return mintedAt + (firstRefusalDays * 1 days);
    }

    // ── ERC4907 ───────────────────────────────────────────────────────────────
    function setUser(uint256 tokenId, address user, uint64 expires) public {
        address tokenOwner = ownerOf(tokenId);
        require(
            msg.sender == tokenOwner
                || getApproved(tokenId) == msg.sender
                || isApprovedForAll(tokenOwner, msg.sender)
                || msg.sender == leaseManager,
            "not authorized"
        );
        _users[tokenId] = UserInfo(user, expires);
        emit UpdateUser(tokenId, user, expires);
    }

    function userOf(uint256 tokenId) public view returns (address) {
        if (_users[tokenId].expires >= block.timestamp) return _users[tokenId].user;
        return address(0);
    }

    function userExpires(uint256 tokenId) public view returns (uint256) {
        return _users[tokenId].expires;
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ── Internal overrides ────────────────────────────────────────────────────
    function _tokenIdFor(uint256 cityId, uint8 districtIndex) internal pure returns (uint256) {
        return (cityId * 100) + districtIndex;
    }

    function _cityOwnerOrRevert(uint256 cityId) internal view returns (address cityOwner) {
        try ICityRegistry(cityRegistry).ownerOf(cityId) returns (address owner_) {
            if (owner_ == address(0)) revert CityNotMinted();
            cityOwner = owner_;
        } catch {
            revert CityNotMinted();
        }
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721Enumerable)
        returns (address)
    {
        address from = super._update(to, tokenId, auth);
        if (from != address(0) && from != to) {
            _users[tokenId] = UserInfo(address(0), 0);
        }
        return from;
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function _recordActivity(uint256 cityId, uint256 districtTokenId, uint8 activityType, uint256 amount) internal {
        if (activityTracker != address(0)) {
            try IActivityTracker(activityTracker).recordActivity(cityId, districtTokenId, activityType, amount) {} catch {}
        }
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721Enumerable)
        returns (bool)
    {
        return interfaceId == _INTERFACE_ID_ERC4907 || super.supportsInterface(interfaceId);
    }
}
