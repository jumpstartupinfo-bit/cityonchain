// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

interface IDistrictRegistryFloor {
    function districtFloorPrice(uint256 cityPrice) external view returns (uint256);
    function cityRegistry() external view returns (address);
}

interface ICityRegistryTier {
    function getCityTier(uint256 cityId) external view returns (uint8);
    function getTierPrice(uint8 tier) external view returns (uint256);
}

interface IFeeConfigTier {
    function getTierPrice(uint8 tier) external view returns (uint256);
}

interface IReferralVaultMarket {
    function creditCommission(address buyer, uint256 price, bool isCityPurchase, string calldata country)
        external
        returns (uint256);
}

interface IFeeConfig {
    function getFee(string calldata feeType) external view returns (uint256);
}

interface ITreasury {
    function deposit(uint8 source, uint256 amount) external;
}

interface IActivityTracker {
    function recordActivity(uint256 cityId, uint256 districtTokenId, uint8 activityType, uint256 amount) external;
}

contract CityMarketplace is Ownable2Step, ReentrancyGuard, Pausable, IERC721Receiver {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_PLATFORM_FEE_BPS = 2_000;

    struct Listing {
        address seller;
        address nftContract;
        uint256 tokenId;
        uint256 price;
        bool active;
    }

    struct Offer {
        address buyer;
        uint256 listingId;
        uint256 amount;
        bool active;
    }

    IERC20 public immutable usdc;
    address public treasury;
    address public feeConfig;
    address public districtRegistry;
    address public treasuryContract;
    address public referralVault;
    address public activityTracker;
    uint256 public platformFeeBps = 500;

    uint256 public nextListingId = 1;
    uint256 public nextOfferId = 1;

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Offer) public offers;

    mapping(address => uint256) public pendingWithdrawals;
    mapping(address => uint256) public pendingOfferFunds;
    mapping(address => bool) public approvedNFTs;
    mapping(address => mapping(uint256 => uint256)) public activeListingByToken;

    event Listed(
        uint256 indexed listingId,
        address indexed seller,
        address indexed nftContract,
        uint256 tokenId,
        uint256 price
    );
    event Sold(uint256 indexed listingId, address indexed buyer, uint256 price, uint256 fee);
    event ListingCancelled(uint256 indexed listingId, address indexed seller);
    event OfferMade(uint256 indexed offerId, uint256 indexed listingId, address indexed buyer, uint256 amount);
    event OfferAccepted(uint256 indexed offerId, uint256 indexed listingId, address indexed seller, address buyer, uint256 amount);
    event OfferCancelled(uint256 indexed offerId, uint256 indexed listingId, address indexed buyer, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event FeeConfigUpdated(address indexed old, address indexed newConfig);
    event DistrictRegistryUpdated(address indexed dr);
    event TreasuryContractUpdated(address indexed old, address indexed newT);
    event ReferralVaultUpdated(address indexed oldVault, address indexed newVault);
    event PlatformFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event ApprovedNFTUpdated(address indexed nftContract, bool approved);
    event ActivityTrackerUpdated(address indexed old, address indexed newTracker);

    error InvalidAddress();
    error InvalidFee();
    error TreasuryNotConfigured();
    error PriceMismatch(uint256 expected, uint256 actual);

    constructor(address _usdc, address _treasury, address _owner) Ownable(_owner) {
        if (_usdc == address(0) || _treasury == address(0) || _owner == address(0)) revert InvalidAddress();
        usdc = IERC20(_usdc);
        treasury = _treasury;
    }

    function list(address nftContract, uint256 tokenId, uint256 price) external whenNotPaused nonReentrant {
        require(approvedNFTs[nftContract], "nft not approved");
        require(price > 0, "invalid price");
        if (districtRegistry != address(0) && nftContract == districtRegistry) {
            uint256 cityId = tokenId / 100;
            address cr = IDistrictRegistryFloor(districtRegistry).cityRegistry();
            if (cr != address(0)) {
                uint8 tier = ICityRegistryTier(cr).getCityTier(cityId); // revert on failure
                if (tier >= 1 && tier <= 6) {
                    uint256 cityPrice = _cityPriceForTier(tier);
                    uint256 floorPrice = IDistrictRegistryFloor(districtRegistry).districtFloorPrice(cityPrice);
                    require(price >= floorPrice, "below district floor price");
                }
            }
        }
        require(IERC721(nftContract).ownerOf(tokenId) == msg.sender, "not owner");
        require(activeListingByToken[nftContract][tokenId] == 0, "already listed");

        IERC721(nftContract).safeTransferFrom(msg.sender, address(this), tokenId);

        uint256 listingId = nextListingId++;
        listings[listingId] = Listing({
            seller: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            price: price,
            active: true
        });
        activeListingByToken[nftContract][tokenId] = listingId;

        emit Listed(listingId, msg.sender, nftContract, tokenId, price);
    }

    function buy(uint256 listingId, uint256 expectedPrice) external whenNotPaused nonReentrant {
        Listing storage listing = listings[listingId];
        require(listing.active, "listing inactive");

        uint256 price = listing.price;
        if (price != expectedPrice) revert PriceMismatch(expectedPrice, price);
        uint256 feeBps = feeConfig != address(0) ? IFeeConfig(feeConfig).getFee("marketplaceFee") : platformFeeBps;
        uint256 fee = (price * feeBps) / BPS_DENOMINATOR;
        uint256 sellerProceeds = price - fee;

        listing.active = false;
        activeListingByToken[listing.nftContract][listing.tokenId] = 0;

        usdc.safeTransferFrom(msg.sender, address(this), price);

        uint256 referralCommission = 0;
        if (referralVault != address(0)) {
            uint256 maxCommission = fee;
            usdc.forceApprove(referralVault, maxCommission);
            try IReferralVaultMarket(referralVault).creditCommission(msg.sender, price, false, "") returns (uint256 pulled) {
                referralCommission = pulled > maxCommission ? maxCommission : pulled;
            } catch {}
            usdc.forceApprove(referralVault, 0);
        }
        uint256 toTreasury = fee - referralCommission;

        pendingWithdrawals[listing.seller] += sellerProceeds;
        if (toTreasury > 0) {
            if (treasuryContract == address(0)) revert TreasuryNotConfigured();
            usdc.forceApprove(treasuryContract, toTreasury);
            ITreasury(treasuryContract).deposit(2, toTreasury);
            usdc.forceApprove(treasuryContract, 0);
        }

        IERC721(listing.nftContract).safeTransferFrom(address(this), msg.sender, listing.tokenId);

        emit Sold(listingId, msg.sender, price, fee);
        _recordActivity(listing.tokenId, 0, 7, price);
    }

    function cancel(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];
        require(listing.active, "listing inactive");
        require(listing.seller == msg.sender, "not seller");

        listing.active = false;
        activeListingByToken[listing.nftContract][listing.tokenId] = 0;

        IERC721(listing.nftContract).safeTransferFrom(address(this), listing.seller, listing.tokenId);

        emit ListingCancelled(listingId, msg.sender);
    }

    function makeOffer(uint256 listingId, uint256 amount) external whenNotPaused nonReentrant {
        Listing storage listing = listings[listingId];
        require(listing.active, "listing inactive");
        require(amount > 0, "invalid amount");

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        pendingOfferFunds[msg.sender] += amount;

        uint256 offerId = nextOfferId++;
        offers[offerId] = Offer({buyer: msg.sender, listingId: listingId, amount: amount, active: true});

        emit OfferMade(offerId, listingId, msg.sender, amount);
    }

    function acceptOffer(uint256 offerId) external whenNotPaused nonReentrant {
        Offer storage offer = offers[offerId];
        require(offer.active, "offer inactive");

        Listing storage listing = listings[offer.listingId];
        require(listing.active, "listing inactive");
        require(listing.seller == msg.sender, "not seller");

        uint256 amount = offer.amount;
        uint256 feeBps = feeConfig != address(0) ? IFeeConfig(feeConfig).getFee("marketplaceFee") : platformFeeBps;
        uint256 fee = (amount * feeBps) / BPS_DENOMINATOR;
        uint256 sellerProceeds = amount - fee;

        offer.active = false;
        listing.active = false;
        activeListingByToken[listing.nftContract][listing.tokenId] = 0;

        pendingOfferFunds[offer.buyer] -= amount;

        uint256 referralCommission = 0;
        if (referralVault != address(0)) {
            uint256 maxCommission = fee;
            usdc.forceApprove(referralVault, maxCommission);
            try IReferralVaultMarket(referralVault).creditCommission(offer.buyer, amount, false, "") returns (uint256 pulled) {
                referralCommission = pulled > maxCommission ? maxCommission : pulled;
            } catch {}
            usdc.forceApprove(referralVault, 0);
        }
        uint256 toTreasury = fee - referralCommission;

        pendingWithdrawals[listing.seller] += sellerProceeds;
        if (toTreasury > 0) {
            if (treasuryContract == address(0)) revert TreasuryNotConfigured();
            usdc.forceApprove(treasuryContract, toTreasury);
            ITreasury(treasuryContract).deposit(2, toTreasury);
            usdc.forceApprove(treasuryContract, 0);
        }

        IERC721(listing.nftContract).safeTransferFrom(address(this), offer.buyer, listing.tokenId);

        emit OfferAccepted(offerId, offer.listingId, listing.seller, offer.buyer, amount);
        _recordActivity(listing.tokenId, 0, 7, amount);
    }

    function cancelOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        require(offer.active, "offer inactive");
        require(offer.buyer == msg.sender, "not buyer");

        offer.active = false;
        pendingOfferFunds[msg.sender] -= offer.amount;
        pendingWithdrawals[msg.sender] += offer.amount;

        emit OfferCancelled(offerId, offer.listingId, msg.sender, offer.amount);
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "nothing to withdraw");

        pendingWithdrawals[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidAddress();

        address oldTreasury = treasury;
        treasury = newTreasury;

        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    function setFeeConfig(address _feeConfig) external onlyOwner {
        if (_feeConfig == address(0)) revert InvalidAddress();
        address old = feeConfig;
        feeConfig = _feeConfig;
        emit FeeConfigUpdated(old, _feeConfig);
    }

    function setDistrictRegistry(address dr) external onlyOwner {
        districtRegistry = dr;
        emit DistrictRegistryUpdated(dr);
    }

    function setTreasuryContract(address _t) external onlyOwner {
        address old = treasuryContract;
        treasuryContract = _t;
        emit TreasuryContractUpdated(old, _t);
    }

    function setReferralVault(address vault) external onlyOwner {
        address old = referralVault;
        referralVault = vault;
        emit ReferralVaultUpdated(old, vault);
    }

    function setPlatformFee(uint256 newPlatformFeeBps) external onlyOwner {
        if (newPlatformFeeBps > MAX_PLATFORM_FEE_BPS) revert InvalidFee();

        uint256 oldFee = platformFeeBps;
        platformFeeBps = newPlatformFeeBps;

        emit PlatformFeeUpdated(oldFee, newPlatformFeeBps);
    }

    function setApprovedNFT(address nftContract, bool approved) external onlyOwner {
        if (nftContract == address(0)) revert InvalidAddress();
        approvedNFTs[nftContract] = approved;
        emit ApprovedNFTUpdated(nftContract, approved);
    }

    function setActivityTracker(address _activityTracker) external onlyOwner {
        address old = activityTracker;
        activityTracker = _activityTracker;
        emit ActivityTrackerUpdated(old, _activityTracker);
    }

    function _cityPriceForTier(uint8 tier) internal pure returns (uint256) {
        if (tier == 1) return 7_500_000_000;
        if (tier == 2) return 3_000_000_000;
        if (tier == 3) return 1_200_000_000;
        if (tier == 4) return 400_000_000;
        if (tier == 5) return 120_000_000;
        if (tier == 6) return 40_000_000;
        return 0;
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

    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
