// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IRevenueSplitter {
    function receiveRevenue(uint256 amount) external;
}

contract CityPass is ERC1155, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 public constant PASS_KIND_PERMANENT = 0;
    uint8 public constant PASS_KIND_TEMPORARY = 1;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    struct PassType {
        uint256 cityId;
        uint256 districtId;
        uint8 passKind;
        uint256 priceUsdc;
        uint256 maxSupply;
        uint256 totalMinted;
        uint256 durationDays;
        bool active;
        address creator;
    }

    IERC20 public immutable usdc;
    address public cityRegistry;
    address public districtRegistry;
    address public treasury;
    address public revenueSplitter;

    mapping(uint256 => PassType) public passTypes;
    mapping(address => mapping(uint256 => uint256)) public firstMintTime;
    mapping(address => uint256) public pendingWithdrawals;

    error InvalidPassKind();
    error NotUnique();
    error ExceedsSupply();
    error NotCreator();
    error InvalidPrice();
    error InvalidSupply();
    error ZeroAddress();
    error NotAuthorized();
    error PassTypeNotActive();

    event PassTypeCreated(
        uint256 indexed passTypeId,
        uint256 indexed cityId,
        uint256 indexed districtId,
        uint8 passKind,
        uint256 priceUsdc,
        uint256 maxSupply,
        uint256 durationDays,
        address creator
    );
    event PassMinted(uint256 indexed passTypeId, address indexed buyer, uint256 quantity, uint256 totalPaid);
    event PassTypeActiveChanged(uint256 indexed passTypeId, bool active);
    event CityRegistryUpdated(address indexed previousRegistry, address indexed newRegistry);
    event DistrictRegistryUpdated(address indexed previousRegistry, address indexed newRegistry);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event RevenueSplitterUpdated(address indexed previousSplitter, address indexed newSplitter);
    event Withdrawn(address indexed account, uint256 amount);

    /// @notice Initializes the CityPass contract.
    /// @param usdc_ The USDC ERC20 token address used for payments.
    /// @param cityRegistry_ The ERC721 registry address for city ownership checks.
    /// @param districtRegistry_ The ERC721 registry address for district ownership checks.
    /// @param treasury_ The treasury address that receives treasury share and fallback platform fee.
    /// @param admin The admin address granted DEFAULT_ADMIN_ROLE and ADMIN_ROLE.
    constructor(address usdc_, address cityRegistry_, address districtRegistry_, address treasury_, address admin)
        ERC1155("")
    {
        if (usdc_ == address(0) || cityRegistry_ == address(0) || districtRegistry_ == address(0) || treasury_ == address(0)
            || admin == address(0)) {
            revert ZeroAddress();
        }

        usdc = IERC20(usdc_);
        cityRegistry = cityRegistry_;
        districtRegistry = districtRegistry_;
        treasury = treasury_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    /// @notice Creates a pass type for a city or district.
    /// @param cityId The city identifier (used directly only for city-level passes).
    /// @param districtId The district identifier (0 for city-level pass).
    /// @param passKind 0 for permanent pass, 1 for temporary pass.
    /// @param priceUsdc Price per pass in USDC smallest units.
    /// @param maxSupply Maximum mintable supply for this pass type.
    /// @param durationDays Duration in days for temporary passes (ignored for permanent passes).
    function createPassType(
        uint256 cityId,
        uint256 districtId,
        uint8 passKind,
        uint256 priceUsdc,
        uint256 maxSupply,
        uint256 durationDays
    ) external {
        if (passKind > PASS_KIND_TEMPORARY) revert InvalidPassKind();
        if (priceUsdc == 0) revert InvalidPrice();
        if (maxSupply == 0) revert InvalidSupply();

        uint256 resolvedCityId = cityId;

        if (districtId == 0) {
            if (IERC721(cityRegistry).ownerOf(cityId) != msg.sender) revert NotAuthorized();
        } else {
            if (IERC721(districtRegistry).ownerOf(districtId) != msg.sender) revert NotAuthorized();
            resolvedCityId = districtId / 100;
        }

        uint256 passTypeId = _computePassTypeId(resolvedCityId, districtId, passKind);
        if (passTypes[passTypeId].creator != address(0)) revert NotUnique();

        uint256 normalizedDurationDays = passKind == PASS_KIND_PERMANENT ? 0 : durationDays;

        passTypes[passTypeId] = PassType({
            cityId: resolvedCityId,
            districtId: districtId,
            passKind: passKind,
            priceUsdc: priceUsdc,
            maxSupply: maxSupply,
            totalMinted: 0,
            durationDays: normalizedDurationDays,
            active: true,
            creator: msg.sender
        });

        emit PassTypeCreated(
            passTypeId, resolvedCityId, districtId, passKind, priceUsdc, maxSupply, normalizedDurationDays, msg.sender
        );
    }

    /// @notice Mints one or more passes for an active pass type.
    /// @param passTypeId The encoded pass type identifier.
    /// @param quantity Number of passes to mint.
    function mintPass(uint256 passTypeId, uint256 quantity) external whenNotPaused nonReentrant {
        PassType storage passType = passTypes[passTypeId];
        if (!passType.active) revert PassTypeNotActive();
        if (passType.totalMinted + quantity > passType.maxSupply) revert ExceedsSupply();

        address currentOwner = passType.districtId == 0
            ? IERC721(cityRegistry).ownerOf(passType.cityId)
            : IERC721(districtRegistry).ownerOf(passType.districtId);
        address feeRecipient = revenueSplitter == address(0) ? treasury : revenueSplitter;

        uint256 totalCost = passType.priceUsdc * quantity;
        uint256 creatorShare = (totalCost * 80) / 100;
        uint256 treasuryShare = (totalCost * 15) / 100;
        uint256 platformFee = totalCost - creatorShare - treasuryShare;

        usdc.safeTransferFrom(msg.sender, address(this), totalCost);

        pendingWithdrawals[currentOwner] += creatorShare;
        pendingWithdrawals[treasury] += treasuryShare;
        pendingWithdrawals[feeRecipient] += platformFee;

        uint256 mintedAt = firstMintTime[msg.sender][passTypeId];
        if (passType.passKind == PASS_KIND_PERMANENT) {
            if (mintedAt == 0) {
                firstMintTime[msg.sender][passTypeId] = block.timestamp;
            }
        } else {
            if (mintedAt == 0) {
                firstMintTime[msg.sender][passTypeId] = block.timestamp;
            } else {
                uint256 expiry = mintedAt + (passType.durationDays * 1 days);
                if (block.timestamp >= expiry) {
                    firstMintTime[msg.sender][passTypeId] = block.timestamp;
                }
            }
        }

        passType.totalMinted += quantity;
        _mint(msg.sender, passTypeId, quantity, "");

        emit PassMinted(passTypeId, msg.sender, quantity, totalCost);
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        pendingWithdrawals[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Enables or disables an existing pass type.
    /// @param passTypeId The encoded pass type identifier.
    /// @param active The desired active state.
    function setPassTypeActive(uint256 passTypeId, bool active) external {
        PassType storage passType = passTypes[passTypeId];
        if (passType.creator != msg.sender) revert NotCreator();

        passType.active = active;
        emit PassTypeActiveChanged(passTypeId, active);
    }

    /// @notice Returns the expiry timestamp for a holder's pass type.
    /// @param holder The address holding the pass.
    /// @param passTypeId The encoded pass type identifier.
    /// @return Expiry timestamp, type(uint256).max for permanent passes, or 0 if holder has no balance.
    function passExpiry(address holder, uint256 passTypeId) public view returns (uint256) {
        if (balanceOf(holder, passTypeId) == 0) return 0;

        PassType memory passType = passTypes[passTypeId];
        if (passType.passKind == PASS_KIND_PERMANENT) {
            return type(uint256).max;
        }

        uint256 mintedAt = firstMintTime[holder][passTypeId];
        if (mintedAt == 0) return 0;

        return mintedAt + (passType.durationDays * 1 days);
    }

    /// @notice Checks whether a holder currently has a valid pass.
    /// @param holder The address holding the pass.
    /// @param passTypeId The encoded pass type identifier.
    /// @return True if holder has balance and pass is permanent or unexpired.
    function hasValidPass(address holder, uint256 passTypeId) external view returns (bool) {
        if (balanceOf(holder, passTypeId) == 0) return false;

        PassType memory passType = passTypes[passTypeId];
        if (passType.passKind == PASS_KIND_PERMANENT) return true;

        return block.timestamp < passExpiry(holder, passTypeId);
    }

    /// @notice Sets the city registry contract used for city ownership authorization.
    /// @param newCityRegistry The new city registry address.
    function setCityRegistry(address newCityRegistry) external onlyRole(ADMIN_ROLE) {
        if (newCityRegistry == address(0)) revert ZeroAddress();
        address previous = cityRegistry;
        cityRegistry = newCityRegistry;
        emit CityRegistryUpdated(previous, newCityRegistry);
    }

    /// @notice Sets the district registry contract used for district ownership authorization.
    /// @param newDistrictRegistry The new district registry address.
    function setDistrictRegistry(address newDistrictRegistry) external onlyRole(ADMIN_ROLE) {
        if (newDistrictRegistry == address(0)) revert ZeroAddress();
        address previous = districtRegistry;
        districtRegistry = newDistrictRegistry;
        emit DistrictRegistryUpdated(previous, newDistrictRegistry);
    }

    /// @notice Sets the treasury address.
    /// @param newTreasury The new treasury address.
    function setTreasury(address newTreasury) external onlyRole(ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        address previous = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(previous, newTreasury);
    }

    /// @notice Sets the revenue splitter address used for platform fee handling.
    /// @param newRevenueSplitter The new revenue splitter address (zero address disables splitter and sends fee to treasury).
    function setRevenueSplitter(address newRevenueSplitter) external onlyRole(ADMIN_ROLE) {
        address previous = revenueSplitter;
        revenueSplitter = newRevenueSplitter;
        emit RevenueSplitterUpdated(previous, newRevenueSplitter);
    }

    /// @notice Pauses pass minting.
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpauses pass minting.
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal virtual override {
        super._update(from, to, ids, values);

        if (to == address(0)) {
            return;
        }

        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            if (firstMintTime[to][id] == 0) {
                firstMintTime[to][id] = firstMintTime[from][id];
            }
        }
    }

    /// @notice Returns whether an interface is supported.
    /// @param interfaceId The interface identifier.
    /// @return True if supported.
    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _computePassTypeId(uint256 cityId, uint256 districtId, uint8 passKind) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(cityId, districtId, uint8(passKind))));
    }
}
