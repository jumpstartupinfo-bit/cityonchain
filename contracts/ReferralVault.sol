// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IFeeConfigReferral {
    function getReferralBps(uint8 level) external view returns (uint256);
}

interface ITreasuryReferral {
    function deposit(uint8 source, uint256 amount) external;
}

/**
 * @title ReferralVault
 * @notice Pull-based 2-level referral commissions for city and district license purchases.
 *
 * Rules:
 * - registerReferrer(referrer) once per wallet, permanent, before first purchase.
 *   Self-referral allowed; loop-safe because we only walk 2 levels.
 * - Level 1 default 2000 bps (20%), level 2 default 1000 bps (10%) (via FeeConfig, 48h timelock,
 *   hard caps 3000 / 1500).
 * - Commission is paid from the platform receipt; buyer price never changes.
 * - In the same tx the registry calls creditCommission(buyer, price, isCityPurchase).
 *   Vault computes level1/level2 shares, credits unclaimed[], transfers the sum from
 *   msg.sender (the registry must have approved the vault for the amount before calling).
 * - Total commission never exceeds price (enforced).
 * - A missing level's share goes to Treasury.
 * - No hold: referrers call claim() (nonReentrant pull).
 * - Vault balance must cover all unclaimed at all times (invariant: checked in creditCommission).
 * - Switches: globalEnabled, citiesEnabled, districtsEnabled (all default ON).
 *   countryOff[] and claimCountryBlocklist[] are owner-managed sets (default empty = none off).
 *   kycRequired defaults OFF.
 * - If vault is not set on a registry, purchase still succeeds (registry guards externally).
 */
contract ReferralVault is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Hard caps ────────────────────────────────────────────────────────────
    uint256 public constant L1_BPS_CAP = 3_000;  // 30% hard cap
    uint256 public constant L2_BPS_CAP = 1_500;  // 15% hard cap
    uint256 public constant BPS_DENOM  = 10_000;

    // ── State ─────────────────────────────────────────────────────────────────
    IERC20  public immutable usdc;
    address public treasury;
    address public feeConfig;

    // Default BPS (overridden by FeeConfig when set)
    uint256 public defaultL1Bps = 2_000;  // 20%
    uint256 public defaultL2Bps = 1_000;  // 10%

    // Switches
    bool public globalEnabled   = true;
    bool public citiesEnabled   = true;
    bool public districtsEnabled = true;
    bool public kycRequired     = false;

    // Authorized registries that may call creditCommission
    mapping(address => bool) public isRegistry;

    // Referral tree: wallet => direct referrer
    mapping(address => address) public referrerOf;
    mapping(address => bool)    public registered;

    // Claimable balances
    mapping(address => uint256) public unclaimed;
    uint256 public totalUnclaimed;

    // Country controls
    mapping(string => bool) public countryDisabled;        // purchases from this country skipped
    mapping(string => bool) public claimCountryBlocklist;  // claimants from this country blocked
    mapping(address => string) public walletCountry;       // set by owner for KYC/blocklist

    // KYC
    mapping(address => bool) public kycApproved;

    // ── Events ────────────────────────────────────────────────────────────────
    event ReferrerRegistered(address indexed wallet, address indexed referrer);
    event CommissionCredited(
        address indexed buyer,
        address indexed level1,
        address indexed level2,
        uint256 l1Amount,
        uint256 l2Amount,
        uint256 treasuryAmount,
        bool isCityPurchase
    );
    event Claimed(address indexed referrer, uint256 amount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event FeeConfigUpdated(address indexed oldConfig, address indexed newConfig);
    event RegistryUpdated(address indexed registry, bool enabled);
    event SwitchUpdated(string switchName, bool value);
    event CountryDisabledUpdated(string country, bool disabled);
    event ClaimCountryBlocklistUpdated(string country, bool blocked);
    event WalletCountrySet(address indexed wallet, string country);
    event KycApproved(address indexed wallet, bool approved);
    event DefaultBpsUpdated(uint256 l1Bps, uint256 l2Bps);

    // ── Errors ────────────────────────────────────────────────────────────────
    error InvalidAddress();
    error AlreadyRegistered();
    error NotAuthorizedRegistry();
    error ExceedsHardCap();
    error InsufficientVaultBalance();
    error ClaimBlocked();
    error KycRequired();
    error ZeroAmount();

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address _usdc, address _treasury, address _owner) Ownable(_owner) {
        if (_usdc == address(0) || _treasury == address(0) || _owner == address(0)) revert InvalidAddress();
        usdc     = IERC20(_usdc);
        treasury = _treasury;
    }

    // ── Registration ──────────────────────────────────────────────────────────
    /**
     * @notice Register a referrer for msg.sender. One-time, permanent.
     * @param referrer The wallet that referred msg.sender. May be msg.sender (self) or zero
     *                 (no referrer — goes to Treasury at both levels).
     */
    function registerReferrer(address referrer) external {
        if (registered[msg.sender]) revert AlreadyRegistered();
        registered[msg.sender] = true;
        referrerOf[msg.sender] = referrer; // address(0) means no referrer
        emit ReferrerRegistered(msg.sender, referrer);
    }

    // ── Commission crediting (called by registries) ────────────────────────────
    /**
     * @notice Credit commissions for a license purchase.
     *         The calling registry must have already transferred `price` USDC to itself
     *         and must approve this vault for `commissionTotal` before calling.
     *         Returns the total commission pulled (may be 0 if disabled).
     */
    function creditCommission(
        address buyer,
        uint256 price,
        bool    isCityPurchase,
        string  calldata country
    ) external nonReentrant returns (uint256 commissionPulled) {
        if (!isRegistry[msg.sender]) revert NotAuthorizedRegistry();

        // Global and type switches
        if (!globalEnabled) return 0;
        if (isCityPurchase  && !citiesEnabled)    return 0;
        if (!isCityPurchase && !districtsEnabled) return 0;
        if (bytes(country).length > 0 && countryDisabled[country]) return 0;

        (uint256 l1Bps, uint256 l2Bps) = _effectiveBps();

        address l1 = registered[buyer] ? referrerOf[buyer] : address(0);
        address l2 = (l1 != address(0) && registered[l1]) ? referrerOf[l1] : address(0);

        uint256 l1Amount = (price * l1Bps) / BPS_DENOM;
        uint256 l2Amount = (price * l2Bps) / BPS_DENOM;
        uint256 total    = l1Amount + l2Amount;

        // Hard invariant: total can never exceed price
        if (total > price) revert InsufficientVaultBalance();
        if (total == 0) return 0;

        // Pull USDC from the registry (registry approved this amount)
        usdc.safeTransferFrom(msg.sender, address(this), total);

        uint256 treasuryAmount = 0;

        // Level 1
        if (l1 != address(0)) {
            unclaimed[l1] += l1Amount;
        } else {
            treasuryAmount += l1Amount;
        }

        // Level 2
        if (l2 != address(0)) {
            unclaimed[l2] += l2Amount;
        } else {
            treasuryAmount += l2Amount;
        }

        // Flush Treasury share immediately
        if (treasuryAmount > 0 && treasury != address(0)) {
            usdc.forceApprove(treasury, treasuryAmount);
            ITreasuryReferral(treasury).deposit(0, treasuryAmount);
        }

        totalUnclaimed += (total - treasuryAmount);

        // Invariant check: vault holds at least totalUnclaimed
        if (usdc.balanceOf(address(this)) < totalUnclaimed) revert InsufficientVaultBalance();

        emit CommissionCredited(buyer, l1, l2, l1Amount, l2Amount, treasuryAmount, isCityPurchase);
        return total;
    }

    // ── Claim ─────────────────────────────────────────────────────────────────
    function claim() external nonReentrant {
        if (kycRequired && !kycApproved[msg.sender]) revert KycRequired();

        string memory country = walletCountry[msg.sender];
        if (bytes(country).length > 0 && claimCountryBlocklist[country]) revert ClaimBlocked();

        uint256 amount = unclaimed[msg.sender];
        if (amount == 0) revert ZeroAmount();

        unclaimed[msg.sender] = 0;
        totalUnclaimed -= amount;

        usdc.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    // ── Internal BPS resolution ───────────────────────────────────────────────
    function _effectiveBps() internal view returns (uint256 l1Bps, uint256 l2Bps) {
        if (feeConfig != address(0)) {
            try IFeeConfigReferral(feeConfig).getReferralBps(1) returns (uint256 v1) {
                l1Bps = v1 > L1_BPS_CAP ? L1_BPS_CAP : v1;
            } catch {
                l1Bps = defaultL1Bps;
            }
            try IFeeConfigReferral(feeConfig).getReferralBps(2) returns (uint256 v2) {
                l2Bps = v2 > L2_BPS_CAP ? L2_BPS_CAP : v2;
            } catch {
                l2Bps = defaultL2Bps;
            }
        } else {
            l1Bps = defaultL1Bps;
            l2Bps = defaultL2Bps;
        }
    }

    // ── Owner setters ─────────────────────────────────────────────────────────
    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert InvalidAddress();
        address old = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(old, _treasury);
    }

    function setFeeConfig(address _feeConfig) external onlyOwner {
        address old = feeConfig;
        feeConfig = _feeConfig;
        emit FeeConfigUpdated(old, _feeConfig);
    }

    function setRegistry(address registry, bool enabled) external onlyOwner {
        if (registry == address(0)) revert InvalidAddress();
        isRegistry[registry] = enabled;
        emit RegistryUpdated(registry, enabled);
    }

    function setDefaultBps(uint256 l1Bps, uint256 l2Bps) external onlyOwner {
        if (l1Bps > L1_BPS_CAP) revert ExceedsHardCap();
        if (l2Bps > L2_BPS_CAP) revert ExceedsHardCap();
        defaultL1Bps = l1Bps;
        defaultL2Bps = l2Bps;
        emit DefaultBpsUpdated(l1Bps, l2Bps);
    }

    function setGlobalEnabled(bool enabled) external onlyOwner {
        globalEnabled = enabled;
        emit SwitchUpdated("global", enabled);
    }

    function setCitiesEnabled(bool enabled) external onlyOwner {
        citiesEnabled = enabled;
        emit SwitchUpdated("cities", enabled);
    }

    function setDistrictsEnabled(bool enabled) external onlyOwner {
        districtsEnabled = enabled;
        emit SwitchUpdated("districts", enabled);
    }

    function setKycRequired(bool required) external onlyOwner {
        kycRequired = required;
        emit SwitchUpdated("kycRequired", required);
    }

    function setCountryDisabled(string calldata country, bool disabled) external onlyOwner {
        countryDisabled[country] = disabled;
        emit CountryDisabledUpdated(country, disabled);
    }

    function setClaimCountryBlocklist(string calldata country, bool blocked) external onlyOwner {
        claimCountryBlocklist[country] = blocked;
        emit ClaimCountryBlocklistUpdated(country, blocked);
    }

    function setWalletCountry(address wallet, string calldata country) external onlyOwner {
        walletCountry[wallet] = country;
        emit WalletCountrySet(wallet, country);
    }

    function setKycApproved(address wallet, bool approved) external onlyOwner {
        kycApproved[wallet] = approved;
        emit KycApproved(wallet, approved);
    }

    // ── Views ─────────────────────────────────────────────────────────────────
    function pendingFor(address wallet) external view returns (uint256) {
        return unclaimed[wallet];
    }

    function effectiveBps() external view returns (uint256 l1Bps, uint256 l2Bps) {
        return _effectiveBps();
    }
}
