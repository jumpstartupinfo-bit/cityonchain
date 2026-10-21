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

contract Storefronts is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    struct Unit {
        uint256 districtTokenId;
        uint256 cityId;
        uint256 monthlyRent; // USDC 6 decimals
        bool active;
        address unitOwner; // district owner
    }

    struct Lease {
        uint256 unitId;
        address tenant;
        uint256 startTime;
        uint256 nextPaymentDue;
        uint256 gracePeriodEnd;
        bool active;
        bool flagged;
        string businessName;
        string category;
        string description;
        string logoHash;
        string externalLink;
    }

    struct Product {
        uint256 leaseId;
        string name;
        string description;
        uint256 price; // USDC
        bool active;
    }

    struct Checkout {
        uint256 productId;
        address buyer;
        uint256 amount;
        uint256 timestamp;
    }

    uint256 public constant GRACE_PERIOD = 7 days;

    IERC20 public immutable usdc;
    address public revenueSplitter;
    address public districtRegistry;
    address public cityRegistry;
    address public activityTracker;

    uint256 public nextUnitId = 1;
    uint256 public nextLeaseId = 1;
    uint256 public nextProductId = 1;
    uint256 public nextCheckoutId = 1;

    mapping(uint256 => Unit) public units;
    mapping(uint256 => Lease) public leases;
    mapping(uint256 => Product) public products;
    mapping(uint256 => Checkout) public checkouts;
    mapping(uint256 => uint256) public latestLeaseForUnit;
    mapping(address => uint256) public pendingWithdrawals;

    event UnitCreated(uint256 indexed unitId, uint256 indexed districtTokenId, uint256 indexed cityId, uint256 monthlyRent, address unitOwner);
    event UnitRented(uint256 indexed leaseId, uint256 indexed unitId, address indexed tenant, uint256 nextPaymentDue, uint256 gracePeriodEnd);
    event RentPaid(uint256 indexed leaseId, address indexed tenant, uint256 nextPaymentDue, uint256 gracePeriodEnd);
    event LeaseExpired(uint256 indexed leaseId);
    event LeaseTerminated(uint256 indexed leaseId);
    event ProductAdded(uint256 indexed productId, uint256 indexed leaseId, uint256 price);
    event ProductRemoved(uint256 indexed productId);
    event ProductPurchased(uint256 indexed checkoutId, uint256 indexed productId, address indexed buyer, uint256 amount);
    event ContentFlagged(uint256 indexed leaseId);
    event ContentRemoved(uint256 indexed leaseId);
    event Withdrawn(address indexed user, uint256 amount);
    event RevenueSplitterUpdated(address indexed oldRevenueSplitter, address indexed newRevenueSplitter);
    event DistrictRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event CityRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event ActivityTrackerUpdated(address indexed old, address indexed newTracker);

    error InvalidAddress();
    error Unauthorized();
    error UnitNotAvailable();
    error LeaseNotActive();
    error InactiveLease();
    error InvalidPrice();

    constructor(address _usdc, address _revenueSplitter, address _districtRegistry, address _cityRegistry, address _owner)
        Ownable(_owner)
    {
        if (
            _usdc == address(0) || _revenueSplitter == address(0) || _districtRegistry == address(0)
                || _cityRegistry == address(0) || _owner == address(0)
        ) {
            revert InvalidAddress();
        }

        usdc = IERC20(_usdc);
        revenueSplitter = _revenueSplitter;
        districtRegistry = _districtRegistry;
        cityRegistry = _cityRegistry;
    }

    function createUnit(uint256 districtTokenId, uint256 cityId, uint256 monthlyRent) external whenNotPaused {
        if (monthlyRent == 0) revert InvalidPrice();
        if (IDistrictRegistry(districtRegistry).ownerOf(districtTokenId) != msg.sender) revert Unauthorized();

        uint256 unitId = nextUnitId++;
        units[unitId] = Unit({
            districtTokenId: districtTokenId,
            cityId: cityId,
            monthlyRent: monthlyRent,
            active: true,
            unitOwner: msg.sender
        });

        emit UnitCreated(unitId, districtTokenId, cityId, monthlyRent, msg.sender);
    }

    function rentUnit(
        uint256 unitId,
        string calldata businessName,
        string calldata category,
        string calldata description,
        string calldata logoHash,
        string calldata externalLink
    ) external nonReentrant whenNotPaused {
        Unit storage unit = units[unitId];
        if (!unit.active) revert UnitNotAvailable();

        uint256 existingLeaseId = latestLeaseForUnit[unitId];
        if (existingLeaseId != 0 && leases[existingLeaseId].active) revert UnitNotAvailable();

        usdc.safeTransferFrom(msg.sender, address(this), unit.monthlyRent);
        usdc.forceApprove(revenueSplitter, 0);
        usdc.forceApprove(revenueSplitter, unit.monthlyRent);
        IRevenueSplitter(revenueSplitter).distributeRevenue(unit.cityId, unit.districtTokenId, unit.monthlyRent);
        usdc.forceApprove(revenueSplitter, 0);

        uint256 leaseId = nextLeaseId++;
        uint256 due = block.timestamp + 30 days;
        uint256 graceEnd = due + GRACE_PERIOD;

        leases[leaseId] = Lease({
            unitId: unitId,
            tenant: msg.sender,
            startTime: block.timestamp,
            nextPaymentDue: due,
            gracePeriodEnd: graceEnd,
            active: true,
            flagged: false,
            businessName: businessName,
            category: category,
            description: description,
            logoHash: logoHash,
            externalLink: externalLink
        });
        latestLeaseForUnit[unitId] = leaseId;

        emit UnitRented(leaseId, unitId, msg.sender, due, graceEnd);
        _recordActivity(unit.cityId, unit.districtTokenId, 3, unit.monthlyRent);
    }

    function payRent(uint256 leaseId) external nonReentrant whenNotPaused {
        Lease storage lease = leases[leaseId];
        if (!lease.active) revert LeaseNotActive();
        if (lease.tenant != msg.sender) revert Unauthorized();
        if (block.timestamp > lease.gracePeriodEnd) revert InactiveLease();

        Unit storage unit = units[lease.unitId];
        usdc.safeTransferFrom(msg.sender, address(this), unit.monthlyRent);
        usdc.forceApprove(revenueSplitter, 0);
        usdc.forceApprove(revenueSplitter, unit.monthlyRent);
        IRevenueSplitter(revenueSplitter).distributeRevenue(unit.cityId, unit.districtTokenId, unit.monthlyRent);
        usdc.forceApprove(revenueSplitter, 0);

        lease.nextPaymentDue += 30 days;
        lease.gracePeriodEnd = lease.nextPaymentDue + GRACE_PERIOD;

        emit RentPaid(leaseId, msg.sender, lease.nextPaymentDue, lease.gracePeriodEnd);
        _recordActivity(unit.cityId, unit.districtTokenId, 3, unit.monthlyRent);
    }

    function expireUnpaidLease(uint256 leaseId) external {
        Lease storage lease = leases[leaseId];
        if (!lease.active) revert LeaseNotActive();
        if (block.timestamp <= lease.gracePeriodEnd) revert InactiveLease();

        uint256 unitId = lease.unitId;
        address currentUnitOwner = _currentUnitOwner(unitId);
        if (!(msg.sender == currentUnitOwner || msg.sender == owner())) revert Unauthorized();

        lease.active = false;

        emit LeaseExpired(leaseId);
    }

    function terminateLease(uint256 leaseId) external {
        Lease storage lease = leases[leaseId];
        if (!lease.active) revert LeaseNotActive();

        uint256 unitId = lease.unitId;
        address currentUnitOwner = _currentUnitOwner(unitId);
        if (!(msg.sender == currentUnitOwner || msg.sender == lease.tenant)) revert Unauthorized();

        lease.active = false;

        emit LeaseTerminated(leaseId);
    }

    function addProduct(uint256 leaseId, string calldata name, string calldata description, uint256 price) external {
        if (price == 0) revert InvalidPrice();

        Lease storage lease = leases[leaseId];
        if (!lease.active) revert LeaseNotActive();
        if (lease.tenant != msg.sender) revert Unauthorized();

        uint256 productId = nextProductId++;
        products[productId] = Product({leaseId: leaseId, name: name, description: description, price: price, active: true});

        emit ProductAdded(productId, leaseId, price);
    }

    function removeProduct(uint256 productId) external {
        Product storage product = products[productId];
        if (!product.active) revert InactiveLease();

        Lease storage lease = leases[product.leaseId];
        uint256 unitId = lease.unitId;
        address currentUnitOwner = _currentUnitOwner(unitId);
        if (!(msg.sender == lease.tenant || msg.sender == currentUnitOwner)) revert Unauthorized();

        product.active = false;

        emit ProductRemoved(productId);
    }

    function buyProduct(uint256 productId) external nonReentrant whenNotPaused {
        Product storage product = products[productId];
        if (!product.active) revert InactiveLease();

        Lease storage lease = leases[product.leaseId];
        if (!lease.active) revert LeaseNotActive();

        Unit storage unit = units[lease.unitId];
        uint256 amount = product.price;

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        usdc.forceApprove(revenueSplitter, 0);
        usdc.forceApprove(revenueSplitter, amount);
        IRevenueSplitter(revenueSplitter).distributeRevenue(unit.cityId, unit.districtTokenId, amount);
        usdc.forceApprove(revenueSplitter, 0);

        uint256 checkoutId = nextCheckoutId++;
        checkouts[checkoutId] = Checkout({productId: productId, buyer: msg.sender, amount: amount, timestamp: block.timestamp});

        emit ProductPurchased(checkoutId, productId, msg.sender, amount);
        _recordActivity(unit.cityId, unit.districtTokenId, 4, amount);
    }

    function flagContent(uint256 leaseId) external {
        Lease storage lease = leases[leaseId];
        if (!lease.active) revert LeaseNotActive();

        uint256 unitId = lease.unitId;
        address currentUnitOwner = _currentUnitOwner(unitId);
        if (!(msg.sender == currentUnitOwner || msg.sender == owner())) revert Unauthorized();

        lease.flagged = true;

        emit ContentFlagged(leaseId);
    }

    function removeContent(uint256 leaseId) external onlyOwner {
        Lease storage lease = leases[leaseId];
        if (!lease.active) revert LeaseNotActive();

        uint256 unitId = lease.unitId;
        address currentUnitOwner = _currentUnitOwner(unitId);
        if (!(msg.sender == currentUnitOwner || msg.sender == owner())) revert Unauthorized();

        lease.active = false;

        emit ContentRemoved(leaseId);
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert InactiveLease();

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

    function setDistrictRegistry(address newDistrictRegistry) external onlyOwner {
        if (newDistrictRegistry == address(0)) revert InvalidAddress();

        address oldRegistry = districtRegistry;
        districtRegistry = newDistrictRegistry;

        emit DistrictRegistryUpdated(oldRegistry, newDistrictRegistry);
    }

    function setCityRegistry(address newCityRegistry) external onlyOwner {
        if (newCityRegistry == address(0)) revert InvalidAddress();

        address oldRegistry = cityRegistry;
        cityRegistry = newCityRegistry;

        emit CityRegistryUpdated(oldRegistry, newCityRegistry);
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

    function _currentUnitOwner(uint256 unitId) internal view returns (address) {
        Unit storage unit = units[unitId];

        if (districtRegistry != address(0)) {
            try IDistrictRegistry(districtRegistry).ownerOf(unit.districtTokenId) returns (address districtOwner) {
                return districtOwner;
            } catch {
                return unit.unitOwner;
            }
        }

        return unit.unitOwner;
    }
}
