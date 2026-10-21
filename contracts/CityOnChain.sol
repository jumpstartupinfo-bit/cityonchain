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
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

interface IFeeConfig {
    function getTierPrice(uint8 tier) external view returns (uint256);
}

interface ITreasury {
    function deposit(uint8 source, uint256 amount) external;
}

interface IDistrictRegistry {
    function mintBatch(uint256 cityId, uint8 displayTier, address to) external;
}

interface IReferralVault {
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

contract CityRegistry is ERC721Enumerable, Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes4 private constant _INTERFACE_ID_ERC4907 = 0xad092b5c;

    struct UserInfo {
        address user;
        uint64 expires;
    }

    IERC20 public immutable usdc;
    address public treasury;
    address public revenueSplitter;
    address public leaseManager;
    address public feeConfig;
    address public treasuryContract;
    address public districtRegistry;
    address public referralVault;
    address public activityTracker;
    bytes32 public merkleRoot;

    mapping(address => uint256) public pendingWithdrawals;
    mapping(uint256 => UserInfo) internal _users;
    mapping(uint256 => uint8) public cityTier;

    event CityClaimed(uint256 indexed cityId, address indexed claimer, uint256 price, uint256 commission);
    event RevenueCredited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event FeeConfigUpdated(address indexed old, address indexed newConfig);
    event TreasuryContractUpdated(address indexed old, address indexed newContract);
    event MerkleRootUpdated(bytes32 indexed oldRoot, bytes32 indexed newRoot);
    event RevenueSplitterUpdated(address indexed oldRevenueSplitter, address indexed newRevenueSplitter);
    event DistrictRegistryUpdated(address indexed dr);
    event ListingCleared(uint256 indexed tokenId);
    event UpdateUser(uint256 indexed tokenId, address indexed user, uint64 expires);
    event LeaseManagerUpdated(address indexed oldLeaseManager, address indexed newLeaseManager);
    event ReferralVaultUpdated(address indexed oldVault, address indexed newVault);
    event ActivityTrackerUpdated(address indexed old, address indexed newTracker);

    error InvalidAddress();
    error InvalidTier();
    error UnauthorizedRevenueSplitter();
    error TreasuryNotConfigured();

    constructor(address _usdc, address _treasury, address _owner)
        ERC721("CityRegistry", "CITY")
        Ownable(_owner)
    {
        if (_usdc == address(0) || _treasury == address(0) || _owner == address(0)) revert InvalidAddress();
        usdc     = IERC20(_usdc);
        treasury = _treasury;
    }

    function claimCity(
        uint256 cityId,
        string  calldata name,
        string  calldata country,
        uint256 population,
        uint8   tier,
        bytes32[] calldata proof
    ) external nonReentrant whenNotPaused {
        require(_ownerOf(cityId) == address(0), "city already minted");
        if (tier < 1 || tier > 6) revert InvalidTier();

        // OZ double-hash leaf — no caller address, any wallet can use a valid proof
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(cityId, name, country, population, tier))));
        require(MerkleProof.verify(proof, merkleRoot, leaf), "invalid merkle proof");

        uint256 price = feeConfig != address(0) ? IFeeConfig(feeConfig).getTierPrice(tier) : _priceForTier(tier);

        // Pull full price from buyer
        usdc.safeTransferFrom(msg.sender, address(this), price);

        // --- Referral commission (optional) ---
        uint256 commission = 0;
        if (referralVault != address(0)) {
            uint256 vaultAllowance = price; // vault may take up to price
            usdc.forceApprove(referralVault, vaultAllowance);
            try IReferralVault(referralVault).creditCommission(msg.sender, price, true, country)
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

        _safeMint(msg.sender, cityId);
        cityTier[cityId] = tier;

        if (districtRegistry != address(0)) {
            try IDistrictRegistry(districtRegistry).mintBatch(cityId, tier, msg.sender) {} catch {}
        }

        emit CityClaimed(cityId, msg.sender, price, commission);
        _recordActivity(cityId, 0, 0, price);
    }

    function creditRevenue(address user, uint256 amount) external {
        if (msg.sender != revenueSplitter) revert UnauthorizedRevenueSplitter();
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
    function setMerkleRoot(bytes32 newRoot) external onlyOwner {
        bytes32 oldRoot = merkleRoot;
        merkleRoot = newRoot;
        emit MerkleRootUpdated(oldRoot, newRoot);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidAddress();
        address old = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(old, newTreasury);
    }

    function setFeeConfig(address _feeConfig) external onlyOwner {
        if (_feeConfig == address(0)) revert InvalidAddress();
        address old = feeConfig;
        feeConfig = _feeConfig;
        emit FeeConfigUpdated(old, _feeConfig);
    }

    function setTreasuryContract(address _treasuryContract) external onlyOwner {
        address old = treasuryContract;
        treasuryContract = _treasuryContract;
        emit TreasuryContractUpdated(old, _treasuryContract);
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

    function setDistrictRegistry(address dr) external onlyOwner {
        if (dr == address(0)) revert InvalidAddress();
        districtRegistry = dr;
        emit DistrictRegistryUpdated(dr);
    }

    function setReferralVault(address vault) external onlyOwner {
        address old = referralVault;
        referralVault = vault; // zero allowed (disables referral)
        emit ReferralVaultUpdated(old, vault);
    }

    function setActivityTracker(address _activityTracker) external onlyOwner {
        address old = activityTracker;
        activityTracker = _activityTracker;
        emit ActivityTrackerUpdated(old, _activityTracker);
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

    function getCityTier(uint256 cityId) external view returns (uint8) {
        return cityTier[cityId];
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ── Internal overrides ────────────────────────────────────────────────────
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721Enumerable)
        returns (address)
    {
        address from = super._update(to, tokenId, auth);
        if (from != address(0) && from != to) {
            _users[tokenId] = UserInfo(address(0), 0);
            emit ListingCleared(tokenId);
        }
        return from;
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721Enumerable)
    {
        super._increaseBalance(account, value);
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

    function _recordActivity(uint256 cityId, uint256 districtTokenId, uint8 activityType, uint256 amount) internal {
        if (activityTracker != address(0)) {
            try IActivityTracker(activityTracker).recordActivity(cityId, districtTokenId, activityType, amount) {} catch {}
        }
    }

    // ── Fallback price (if feeConfig unset) ───────────────────────────────────
    function _priceForTier(uint8 tier) internal pure returns (uint256) {
        if (tier == 1) return 7_500_000_000;
        if (tier == 2) return 3_000_000_000;
        if (tier == 3) return 1_200_000_000;
        if (tier == 4) return 400_000_000;
        if (tier == 5) return 120_000_000;
        if (tier == 6) return 40_000_000;
        revert InvalidTier();
    }
}
