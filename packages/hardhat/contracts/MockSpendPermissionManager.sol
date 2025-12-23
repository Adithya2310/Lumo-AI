// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/ISpendPermissionManager.sol";

/**
 * @title IERC20
 * @notice Minimal ERC20 interface for token transfers
 */
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/**
 * @title MockSpendPermissionManager
 * @notice Mock implementation of SpendPermissionManager for testing
 */
contract MockSpendPermissionManager is ISpendPermissionManager {
    mapping(bytes32 => bool) private _approved;
    address public usdcToken;

    function setUSDCToken(address _usdcToken) external {
        usdcToken = _usdcToken;
    }

    function approveWithSignature(
        SpendPermission calldata spendPermission,
        bytes calldata /* signature */
    ) external override returns (bool) {
        bytes32 hash = getHash(spendPermission);
        _approved[hash] = true;
        return true;
    }

    function spend(SpendPermission memory spendPermission, uint160 value) external override {
        require(_approved[getHash(spendPermission)], "Not approved");
        require(msg.sender == spendPermission.spender, "Not spender");
        require(block.timestamp >= spendPermission.start, "Not started");
        require(block.timestamp < spendPermission.end, "Expired");

        // Transfer tokens from account to spender (msg.sender)
        if (spendPermission.token == address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE)) {
            // Handle native ETH - for backwards compatibility testing
            // In real scenario, this would transfer ETH from account to msg.sender
            // For testing, we just send to msg.sender from this contract
            (bool success, ) = msg.sender.call{value: value}("");
            require(success, "ETH transfer failed");
        } else {
            // Handle ERC20 tokens (USDC)
            IERC20(spendPermission.token).transferFrom(
                spendPermission.account,
                msg.sender,
                value
            );
        }
    }

    function isApproved(SpendPermission memory spendPermission) external view override returns (bool) {
        return _approved[getHash(spendPermission)];
    }

    function getHash(SpendPermission memory spendPermission) public pure override returns (bytes32) {
        return keccak256(
            abi.encode(
                spendPermission.account,
                spendPermission.spender,
                spendPermission.token,
                spendPermission.allowance,
                spendPermission.period,
                spendPermission.start,
                spendPermission.end,
                spendPermission.salt,
                keccak256(spendPermission.extraData)
            )
        );
    }

    function getLastUpdatedPeriod(SpendPermission memory /* spendPermission */) external pure override returns (PeriodSpend memory) {
        return PeriodSpend({
            start: 0,
            end: 0,
            spend: 0
        });
    }

    // Receive function to handle ETH for testing
    receive() external payable {}
}
