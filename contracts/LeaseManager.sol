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

interface ICityNFT {
    function setUser(uint256 tokenId, address user, uint64 expires) external;
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

contract LeaseManager is Ownable2Step, ReentrancyGuard, Pausable, IERC721Receiver {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant PLATFORM_FEE_BPS = 500;
    uint256 public constant MAX_PLATFORM_FEE_BPS = 2_000;

    struct Lease {
        address lessor;
        address lessee;
        address nftContract;
        uint256 tokenId;
        uint256 pricePerMonth;
        uint256 startTime;
        uint256 endTime;
        bool active;
        uint256 durationMonths;
    }

    IERC20 public immutable usdc;
    address public treasury;
    address public feeConfig;
    address public treasuryContract;
    address public activityTracker;

    uint256 public nextLeaseId = 1;

    mapping(uint256 => Lease) public leases;
    mapping(address => uint256) public pendingWithdrawals;
    mapping(address => bool) public approvedNFTs;

    event LeaseCreated(
        uint256 indexed leaseId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address lessor,
        uint256 pricePerMonth,
        uint256 endTime
    );
    event LeaseAccepted(uint256 indexed leaseId, address indexed lessee);
    event LeaseCancelled(uint256 indexed leaseId, address indexed lessor);
    event NFTReclaimed(uint256 indexed leaseId, address indexed lessor);
    event Withdrawn(address indexed user, uint256 amount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event FeeConfigUpdated(address indexed old, address indexed newConfig);
    event TreasuryContractUpdated(address indexed old, address indexed newT);
    event ApprovedNFTUpdated(address indexed nftContract, bool approved);
    event ActivityTrackerUpdated(address indexed old, address indexed newTracker);

    error InvalidAddress();
    error TreasuryNotConfigured();

    constructor(address _usdc, address _treasury, address _owner) Ownable(_owner) {
        if (_usdc == address(0) || _treasury == address(0) || _owner == address(0)) revert InvalidAddress();
        usdc = IERC20(_usdc);
        treasury = _treasury;
    }

    function createLease(address nftContract, uint256 tokenId, uint256 pricePerMonth, uint256 durationMonths)
        external
        nonReentrant
        whenNotPaused
    {
        require(approvedNFTs[nftContract], "nft not approved");
        require(pricePerMonth > 0, "invalid price");
        require(durationMonths > 0, "invalid duration");
        require(IERC721(nftContract).ownerOf(tokenId) == msg.sender, "not owner");

        IERC721(nftContract).safeTransferFrom(msg.sender, address(this), tokenId);

        uint256 leaseId = nextLeaseId++;
        uint256 projectedEndTime = block.timestamp + (durationMonths * 30 days);

        leases[leaseId] = Lease({
            lessor: msg.sender,
            lessee: address(0),
            nftContract: nftContract,
            tokenId: tokenId,
            pricePerMonth: pricePerMonth,
            startTime: 0,
            endTime: projectedEndTime,
            active: true,
            durationMonths: durationMonths
        });

        emit LeaseCreated(leaseId, nftContract, tokenId, msg.sender, pricePerMonth, projectedEndTime);
    }

    function acceptLease(uint256 leaseId) external nonReentrant whenNotPaused {
        Lease storage lease = leases[leaseId];
        require(lease.active, "lease inactive");
        require(lease.lessee == address(0), "already accepted");

        uint256 totalCost = lease.pricePerMonth * lease.durationMonths;
        usdc.safeTransferFrom(msg.sender, address(this), totalCost);

        uint256 feeBps = feeConfig != address(0) ? IFeeConfig(feeConfig).getFee("leaseFee") : PLATFORM_FEE_BPS;
        uint256 fee = (totalCost * feeBps) / BPS_DENOMINATOR;
        uint256 lessorShare = totalCost - fee;

        pendingWithdrawals[lease.lessor] += lessorShare;
        if (fee > 0) {
            if (treasuryContract == address(0)) revert TreasuryNotConfigured();
            usdc.forceApprove(treasuryContract, fee);
            ITreasury(treasuryContract).deposit(3, fee);
        }

        lease.lessee = msg.sender;
        lease.startTime = block.timestamp;
        lease.endTime = block.timestamp + (lease.durationMonths * 30 days);

        ICityNFT(lease.nftContract).setUser(lease.tokenId, msg.sender, uint64(lease.endTime));

        emit LeaseAccepted(leaseId, msg.sender);
        _recordActivity(lease.tokenId, 0, 6, totalCost);
    }

    function setUserOnNFT(uint256 leaseId) external {
        Lease storage lease = leases[leaseId];
        require(lease.active, "lease inactive");
        require(lease.lessee != address(0), "lease not accepted");
        require(block.timestamp <= lease.endTime, "lease expired");
        require(msg.sender == lease.lessee || msg.sender == lease.lessor, "not participant");

        ICityNFT(lease.nftContract).setUser(lease.tokenId, lease.lessee, uint64(lease.endTime));
    }

    function cancelLease(uint256 leaseId) external nonReentrant {
        Lease storage lease = leases[leaseId];
        require(lease.active, "lease inactive");
        require(lease.lessor == msg.sender, "not lessor");
        require(lease.lessee == address(0), "already accepted");

        lease.active = false;
        IERC721(lease.nftContract).safeTransferFrom(address(this), lease.lessor, lease.tokenId);

        emit LeaseCancelled(leaseId, msg.sender);
    }

    function reclaimNFT(uint256 leaseId) external nonReentrant {
        Lease storage lease = leases[leaseId];
        require(lease.active, "lease inactive");
        require(lease.lessor == msg.sender, "not lessor");
        require(lease.lessee != address(0), "lease not accepted");
        require(block.timestamp > lease.endTime, "lease not expired");

        lease.active = false;
        // Clear ERC-4907 user rights before returning the NFT
        ICityNFT(lease.nftContract).setUser(lease.tokenId, address(0), 0);
        IERC721(lease.nftContract).safeTransferFrom(address(this), lease.lessor, lease.tokenId);

        emit NFTReclaimed(leaseId, msg.sender);
    }

    function isLeaseActive(uint256 leaseId) public view returns (bool) {
        Lease storage lease = leases[leaseId];
        return lease.active && lease.lessee != address(0) && block.timestamp <= lease.endTime;
    }

    function getActiveLessee(uint256 leaseId) external view returns (address) {
        if (!isLeaseActive(leaseId)) {
            return address(0);
        }
        return leases[leaseId].lessee;
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

    function setTreasuryContract(address _t) external onlyOwner {
        address old = treasuryContract;
        treasuryContract = _t;
        emit TreasuryContractUpdated(old, _t);
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

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _recordActivity(uint256 cityId, uint256 districtTokenId, uint8 activityType, uint256 amount) internal {
        if (activityTracker != address(0)) {
            try IActivityTracker(activityTracker).recordActivity(cityId, districtTokenId, activityType, amount) {} catch {}
        }
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
