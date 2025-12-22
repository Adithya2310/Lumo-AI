// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ISpendPermissionManager
 * @notice Interface for Coinbase's SpendPermissionManager contract
 * @dev Deployed on Base Sepolia at 0xf85210B21cC50302F477BA56686d2019dC9b67Ad
 */
interface ISpendPermissionManager {
    /// @notice A spend permission for an external entity to spend an account's tokens.
    struct SpendPermission {
        address account;      // Smart account this permission is valid for
        address spender;      // Entity that can spend account's tokens
        address token;        // Token address (ERC-7528 native token or ERC-20)
        uint160 allowance;    // Maximum allowed value to spend within each period
        uint48 period;        // Time duration for resetting allowance (seconds)
        uint48 start;         // Start timestamp (inclusive, unix seconds)
        uint48 end;           // End timestamp (exclusive, unix seconds)
        uint256 salt;         // Arbitrary data for uniqueness
        bytes extraData;      // Arbitrary data for the spender
    }

    /// @notice Period parameters and spend usage.
    struct PeriodSpend {
        uint48 start;    // Period start timestamp
        uint48 end;      // Period end timestamp
        uint160 spend;   // Accumulated spend for the period
    }

    /// @notice Approve a spend permission via a signature from the account.
    /// @param spendPermission Details of the spend permission.
    /// @param signature Signed approval from the user.
    /// @return approved True if spend permission is approved and not revoked.
    function approveWithSignature(
        SpendPermission calldata spendPermission,
        bytes calldata signature
    ) external returns (bool);

    /// @notice Spend tokens using a spend permission.
    /// @dev Reverts if not called by the spender of the spend permission.
    /// @param spendPermission Details of the spend permission.
    /// @param value Amount of token attempting to spend.
    function spend(SpendPermission memory spendPermission, uint160 value) external;

    /// @notice Get if a spend permission is approved.
    /// @param spendPermission Details of the spend permission.
    /// @return approved True if spend permission is approved.
    function isApproved(SpendPermission memory spendPermission) external view returns (bool);

    /// @notice Get the unique hash for a spend permission.
    /// @param spendPermission Details of the spend permission.
    /// @return hash Unique hash.
    function getHash(SpendPermission memory spendPermission) external view returns (bytes32);

    /// @notice Get the last updated period for a spend permission.
    /// @param spendPermission Details of the spend permission.
    /// @return lastUpdatedPeriod The last updated period with spend usage.
    function getLastUpdatedPeriod(SpendPermission memory spendPermission) external view returns (PeriodSpend memory);
}
