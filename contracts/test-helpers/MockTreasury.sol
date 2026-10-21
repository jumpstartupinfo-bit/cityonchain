// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev Minimal Treasury mock that accepts deposit() calls from RevenueSplitter.
contract MockTreasury {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    uint256 public totalDeposited;

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    function deposit(uint8 /*source*/, uint256 amount) external {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        totalDeposited += amount;
    }
}
