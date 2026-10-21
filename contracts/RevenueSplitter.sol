// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ICityRegistry {
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IDistrictRegistry {
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IFeeConfig {
    function getFee(string calldata feeType) external view returns (uint256);
}

interface ITreasury {
    function deposit(uint8 source, uint256 amount) external;
}

contract RevenueSplitter is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_PARTY_BPS = 5_000;

    struct Split {
        uint256 platformBps;
        uint256 mayorBps;
        uint256 districtBps;
    }

    IERC20 public immutable usdc;
    address public treasury;
    address public cityRegistry;
    address public districtRegistry;
    address public feeConfig;
    address public treasuryContract;

    Split public defaultSplit = Split({platformBps: 1_000, mayorBps: 2_000, districtBps: 7_000});
    mapping(uint256 => Split) public citySplits;
    mapping(address => uint256) public pendingWithdrawals;

    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event FeeConfigUpdated(address indexed old, address indexed newConfig);
    event TreasuryContractUpdated(address indexed old, address indexed newT);
    event CityRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event DistrictRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event DefaultSplitUpdated(uint256 platformBps, uint256 mayorBps, uint256 districtBps);
    event CitySplitUpdated(uint256 indexed cityId, uint256 platformBps, uint256 mayorBps, uint256 districtBps);
    event RevenueDistributed(
        uint256 indexed cityId,
        uint256 indexed districtTokenId,
        uint256 amount,
        uint256 platformShare,
        uint256 mayorShare,
        uint256 districtShare,
        string source
    );
    event Withdrawn(address indexed user, uint256 amount);

    error InvalidAddress();
    error InvalidSplit();
    error TreasuryNotConfigured();

    constructor(address _usdc, address _treasury, address _owner) Ownable(_owner) {
        if (_usdc == address(0) || _treasury == address(0) || _owner == address(0)) revert InvalidAddress();
        usdc = IERC20(_usdc);
        treasury = _treasury;
    }

    function setSplit(uint256 cityId, uint256 platformBps, uint256 mayorBps, uint256 districtBps) external onlyOwner {
        _validateSplit(platformBps, mayorBps, districtBps);
        citySplits[cityId] = Split({platformBps: platformBps, mayorBps: mayorBps, districtBps: districtBps});
        emit CitySplitUpdated(cityId, platformBps, mayorBps, districtBps);
    }

    function setDefaultSplit(uint256 platformBps, uint256 mayorBps, uint256 districtBps) external onlyOwner {
        _validateSplit(platformBps, mayorBps, districtBps);
        defaultSplit = Split({platformBps: platformBps, mayorBps: mayorBps, districtBps: districtBps});
        emit DefaultSplitUpdated(platformBps, mayorBps, districtBps);
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

    function setTreasuryContract(address _t) external onlyOwner {
        address old = treasuryContract;
        treasuryContract = _t;
        emit TreasuryContractUpdated(old, _t);
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

    function distributeRevenue(uint256 cityId, uint256 districtTokenId, uint256 amount) external nonReentrant {
        require(amount > 0, "invalid amount");

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        Split memory split = _getSplit(cityId);
        uint256 platformBps = feeConfig != address(0) ? IFeeConfig(feeConfig).getFee("activityFee") : split.platformBps;

        uint256 platformShare = (amount * platformBps) / BPS_DENOMINATOR;
        uint256 mayorShare = (amount * split.mayorBps) / BPS_DENOMINATOR;
        uint256 districtShare = amount - platformShare - mayorShare;

        address mayorRecipient = _mayorRecipient(cityId);
        address districtRecipient = _districtRecipient(districtTokenId);

        if (platformShare > 0) {
            if (treasuryContract == address(0)) revert TreasuryNotConfigured();
            usdc.forceApprove(treasuryContract, platformShare);
            ITreasury(treasuryContract).deposit(1, platformShare);
        }

        pendingWithdrawals[mayorRecipient] += mayorShare;
        pendingWithdrawals[districtRecipient] += districtShare;

        emit RevenueDistributed(cityId, districtTokenId, amount, platformShare, mayorShare, districtShare, "activity");
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "nothing to withdraw");

        pendingWithdrawals[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    function _validateSplit(uint256 platformBps, uint256 mayorBps, uint256 districtBps) internal pure {
        if (platformBps > MAX_PARTY_BPS || mayorBps > MAX_PARTY_BPS || districtBps > MAX_PARTY_BPS) {
            revert InvalidSplit();
        }
        if (platformBps + mayorBps + districtBps != BPS_DENOMINATOR) {
            revert InvalidSplit();
        }
    }

    function _getSplit(uint256 cityId) internal view returns (Split memory) {
        Split memory custom = citySplits[cityId];
        if (custom.platformBps + custom.mayorBps + custom.districtBps == BPS_DENOMINATOR) {
            return custom;
        }
        return defaultSplit;
    }

    function _mayorRecipient(uint256 cityId) internal view returns (address) {
        if (cityRegistry == address(0)) {
            return treasury;
        }

        try ICityRegistry(cityRegistry).ownerOf(cityId) returns (address owner) {
            return owner;
        } catch {
            return treasury;
        }
    }

    function _districtRecipient(uint256 districtTokenId) internal view returns (address) {
        if (districtRegistry == address(0)) {
            return treasury;
        }

        try IDistrictRegistry(districtRegistry).ownerOf(districtTokenId) returns (address owner) {
            return owner;
        } catch {
            return treasury;
        }
    }
}
