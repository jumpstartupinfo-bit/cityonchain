// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

contract FeeConfig is Ownable2Step {
    uint256 public constant TIMELOCK_DELAY = 48 hours;

    uint256 public constant PRIMARY_SALE_FEE_CAP = 1_000;
    uint256 public constant ACTIVITY_FEE_CAP = 3_000;
    uint256 public constant MARKETPLACE_FEE_CAP = 2_000;
    uint256 public constant LEASE_FEE_CAP = 2_000;
    uint256 public constant AD_FEE_CAP = 3_000;

    uint256 public constant MIN_PRICE = 1_000_000;
    uint256 public constant MAX_PRICE = 10_000_000_000;

    uint256 public primarySaleFee;
    uint256 public activityFee;
    uint256 public marketplaceFee;
    uint256 public leaseFee;
    uint256 public adFee;

    mapping(uint8 => uint256) private _tierPrices;

    struct PendingChange {
        uint256 value;
        uint256 effectiveAt;
        bool pending;
    }

    mapping(bytes32 => PendingChange) public pendingChanges;

    bytes32 private constant _PRIMARY_SALE_FEE_KEY = keccak256("primarySaleFee");
    bytes32 private constant _ACTIVITY_FEE_KEY = keccak256("activityFee");
    bytes32 private constant _MARKETPLACE_FEE_KEY = keccak256("marketplaceFee");
    bytes32 private constant _LEASE_FEE_KEY = keccak256("leaseFee");
    bytes32 private constant _AD_FEE_KEY = keccak256("adFee");

    bytes32 private constant _TIER_PRICE_1_KEY = keccak256("tierPrice_1");
    bytes32 private constant _TIER_PRICE_2_KEY = keccak256("tierPrice_2");
    bytes32 private constant _TIER_PRICE_3_KEY = keccak256("tierPrice_3");
    bytes32 private constant _TIER_PRICE_4_KEY = keccak256("tierPrice_4");
    bytes32 private constant _TIER_PRICE_5_KEY = keccak256("tierPrice_5");
    bytes32 private constant _TIER_PRICE_6_KEY = keccak256("tierPrice_6");

    event FeeChangeProposed(string feeType, uint256 newValue, uint256 effectiveAt);
    event FeeChangeExecuted(string feeType, uint256 oldValue, uint256 newValue);
    event FeeChangeCancelled(string feeType);
    event TierPriceUpdated(uint8 tier, uint256 price);

    error InvalidTier();
    error InvalidPrice();
    error TimelockNotElapsed();
    error NoPendingChange();
    error ExceedsHardCap();

    constructor(address _owner) Ownable(_owner) {
        primarySaleFee = 0;
        activityFee = 1_000;
        marketplaceFee = 500;
        leaseFee = 500;
        adFee = 1_000;

        _tierPrices[1] = 7_500_000_000; // Mega     $7,500
        _tierPrices[2] = 3_000_000_000; // Major    $3,000
        _tierPrices[3] = 1_200_000_000; // Large    $1,200
        _tierPrices[4] = 400_000_000; // City     $400
        _tierPrices[5] = 120_000_000; // Town     $120
        _tierPrices[6] = 40_000_000; // Small    $40
    }

    function proposeFeeChange(string calldata feeType, uint256 newValue) external onlyOwner {
        bytes32 key = keccak256(abi.encodePacked(feeType));
        _validateProposedValue(key, newValue);

        uint256 effectiveAt = block.timestamp + TIMELOCK_DELAY;
        pendingChanges[key] = PendingChange({value: newValue, effectiveAt: effectiveAt, pending: true});

        emit FeeChangeProposed(feeType, newValue, effectiveAt);
    }

    function executeFeeChange(string calldata feeType) external {
        bytes32 key = keccak256(abi.encodePacked(feeType));
        PendingChange memory change = pendingChanges[key];

        if (!change.pending) revert NoPendingChange();
        if (block.timestamp < change.effectiveAt) revert TimelockNotElapsed();

        uint256 oldValue = _getValueByKey(key);
        _setValueByKey(key, change.value);

        delete pendingChanges[key];

        emit FeeChangeExecuted(feeType, oldValue, change.value);

        if (key == _TIER_PRICE_1_KEY) {
            emit TierPriceUpdated(1, change.value);
            return;
        }
        if (key == _TIER_PRICE_2_KEY) {
            emit TierPriceUpdated(2, change.value);
            return;
        }
        if (key == _TIER_PRICE_3_KEY) {
            emit TierPriceUpdated(3, change.value);
            return;
        }
        if (key == _TIER_PRICE_4_KEY) {
            emit TierPriceUpdated(4, change.value);
            return;
        }
        if (key == _TIER_PRICE_5_KEY) {
            emit TierPriceUpdated(5, change.value);
            return;
        }
        if (key == _TIER_PRICE_6_KEY) {
            emit TierPriceUpdated(6, change.value);
            return;
        }
    }

    function cancelFeeChange(string calldata feeType) external onlyOwner {
        bytes32 key = keccak256(abi.encodePacked(feeType));
        if (!pendingChanges[key].pending) revert NoPendingChange();

        delete pendingChanges[key];
        emit FeeChangeCancelled(feeType);
    }

    function getFee(string calldata feeType) external view returns (uint256) {
        bytes32 key = keccak256(abi.encodePacked(feeType));

        if (key == _PRIMARY_SALE_FEE_KEY) return primarySaleFee;
        if (key == _ACTIVITY_FEE_KEY) return activityFee;
        if (key == _MARKETPLACE_FEE_KEY) return marketplaceFee;
        if (key == _LEASE_FEE_KEY) return leaseFee;
        if (key == _AD_FEE_KEY) return adFee;

        revert InvalidTier();
    }

    function getTierPrice(uint8 tier) external view returns (uint256) {
        if (tier < 1 || tier > 6) revert InvalidTier();
        return _tierPrices[tier];
    }

    function _validateProposedValue(bytes32 key, uint256 value) internal pure {
        if (key == _PRIMARY_SALE_FEE_KEY) {
            if (value > PRIMARY_SALE_FEE_CAP) revert ExceedsHardCap();
            return;
        }
        if (key == _ACTIVITY_FEE_KEY) {
            if (value > ACTIVITY_FEE_CAP) revert ExceedsHardCap();
            return;
        }
        if (key == _MARKETPLACE_FEE_KEY) {
            if (value > MARKETPLACE_FEE_CAP) revert ExceedsHardCap();
            return;
        }
        if (key == _LEASE_FEE_KEY) {
            if (value > LEASE_FEE_CAP) revert ExceedsHardCap();
            return;
        }
        if (key == _AD_FEE_KEY) {
            if (value > AD_FEE_CAP) revert ExceedsHardCap();
            return;
        }

        if (
            key == _TIER_PRICE_1_KEY || key == _TIER_PRICE_2_KEY || key == _TIER_PRICE_3_KEY || key == _TIER_PRICE_4_KEY
                || key == _TIER_PRICE_5_KEY || key == _TIER_PRICE_6_KEY
        ) {
            _validatePrice(value);
            return;
        }

        revert InvalidTier();
    }

    function _setValueByKey(bytes32 key, uint256 value) internal {
        if (key == _PRIMARY_SALE_FEE_KEY) {
            primarySaleFee = value;
            return;
        }
        if (key == _ACTIVITY_FEE_KEY) {
            activityFee = value;
            return;
        }
        if (key == _MARKETPLACE_FEE_KEY) {
            marketplaceFee = value;
            return;
        }
        if (key == _LEASE_FEE_KEY) {
            leaseFee = value;
            return;
        }
        if (key == _AD_FEE_KEY) {
            adFee = value;
            return;
        }

        if (key == _TIER_PRICE_1_KEY) {
            _tierPrices[1] = value;
            return;
        }
        if (key == _TIER_PRICE_2_KEY) {
            _tierPrices[2] = value;
            return;
        }
        if (key == _TIER_PRICE_3_KEY) {
            _tierPrices[3] = value;
            return;
        }
        if (key == _TIER_PRICE_4_KEY) {
            _tierPrices[4] = value;
            return;
        }
        if (key == _TIER_PRICE_5_KEY) {
            _tierPrices[5] = value;
            return;
        }
        if (key == _TIER_PRICE_6_KEY) {
            _tierPrices[6] = value;
            return;
        }

        revert InvalidTier();
    }

    function _getValueByKey(bytes32 key) internal view returns (uint256) {
        if (key == _PRIMARY_SALE_FEE_KEY) return primarySaleFee;
        if (key == _ACTIVITY_FEE_KEY) return activityFee;
        if (key == _MARKETPLACE_FEE_KEY) return marketplaceFee;
        if (key == _LEASE_FEE_KEY) return leaseFee;
        if (key == _AD_FEE_KEY) return adFee;

        if (key == _TIER_PRICE_1_KEY) return _tierPrices[1];
        if (key == _TIER_PRICE_2_KEY) return _tierPrices[2];
        if (key == _TIER_PRICE_3_KEY) return _tierPrices[3];
        if (key == _TIER_PRICE_4_KEY) return _tierPrices[4];
        if (key == _TIER_PRICE_5_KEY) return _tierPrices[5];
        if (key == _TIER_PRICE_6_KEY) return _tierPrices[6];

        revert InvalidTier();
    }

    function _validatePrice(uint256 price) internal pure {
        if (price < MIN_PRICE || price > MAX_PRICE) revert InvalidPrice();
    }
}
