// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Treasury is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum RevenueSource {
        PrimarySale,
        ActivityFee,
        MarketplaceFee,
        LeaseFee,
        AdFee
    }

    IERC20 public immutable usdc;
    mapping(RevenueSource => uint256) public revenueBySource;
    uint256 public totalRevenue;
    mapping(address => bool) public isDepositor;
    mapping(address => bool) public isWithdrawer;

    event RevenueDeposited(RevenueSource indexed source, address indexed from, uint256 amount, uint256 sourceTotal);
    event RevenueWithdrawn(address indexed to, uint256 amount, address indexed by);
    event DepositorUpdated(address indexed addr, bool allowed);
    event WithdrawerUpdated(address indexed addr, bool allowed);

    error InvalidAddress();
    error Unauthorized();
    error InsufficientBalance();

    constructor(address _usdc, address _owner) Ownable(_owner) {
        if (_usdc == address(0) || _owner == address(0)) revert InvalidAddress();
        usdc = IERC20(_usdc);
    }

    function deposit(RevenueSource source, uint256 amount) external {
        if (!isDepositor[msg.sender]) revert Unauthorized();
        require(amount > 0, "invalid amount");

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        revenueBySource[source] += amount;
        totalRevenue += amount;

        emit RevenueDeposited(source, msg.sender, amount, revenueBySource[source]);
    }

    function withdraw(address to, uint256 amount) external nonReentrant {
        if (!(isWithdrawer[msg.sender] || msg.sender == owner())) revert Unauthorized();
        if (to == address(0)) revert InvalidAddress();

        uint256 balance = usdc.balanceOf(address(this));
        if (amount > balance) revert InsufficientBalance();

        usdc.safeTransfer(to, amount);

        emit RevenueWithdrawn(to, amount, msg.sender);
    }

    function setDepositor(address addr, bool allowed) external onlyOwner {
        if (addr == address(0)) revert InvalidAddress();
        isDepositor[addr] = allowed;
        emit DepositorUpdated(addr, allowed);
    }

    function setWithdrawer(address addr, bool allowed) external onlyOwner {
        if (addr == address(0)) revert InvalidAddress();
        isWithdrawer[addr] = allowed;
        emit WithdrawerUpdated(addr, allowed);
    }

    function getBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
}
