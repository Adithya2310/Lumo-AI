"use client";

import { useEffect, useState } from "react";
import { useCreateEvmSmartAccount, useCurrentUser } from "@coinbase/cdp-hooks";

/**
 * This component checks if the user has a spend-permission-enabled smart account
 * and offers to create one if not.
 *
 * The issue: Smart accounts created with just `createOnLogin: "smart"` may not have
 * spend permissions enabled. The `enableSpendPermissions` option needs to be passed
 * when creating the smart account.
 */
export const SpendPermissionCheck = () => {
  const { currentUser } = useCurrentUser();
  const { createEvmSmartAccount } = useCreateEvmSmartAccount();
  const [status, setStatus] = useState<"checking" | "ready" | "creating" | "error">("checking");
  const [error, setError] = useState<string | null>(null);

  // Check if user has a smart account
  const hasSmartAccount =
    (currentUser?.evmSmartAccounts?.length ?? 0) > 0 || (currentUser?.evmSmartAccountObjects?.length ?? 0) > 0;

  // Get EOA address for potential smart account creation
  const eoaAddress = currentUser?.evmAccountObjects?.[0]?.address || currentUser?.evmAccounts?.[0];

  useEffect(() => {
    if (currentUser) {
      setStatus("ready");
    }
  }, [currentUser]);

  const handleCreateSpendPermissionAccount = async () => {
    if (!eoaAddress) {
      setError("No EOA account found. Please sign in first.");
      return;
    }

    setStatus("creating");
    setError(null);

    try {
      // Create a new smart account with spend permissions enabled
      const result = await createEvmSmartAccount({
        enableSpendPermissions: true,
      });

      console.log("Smart account created with spend permissions:", result);

      setStatus("ready");
    } catch (err: any) {
      console.error("Failed to create smart account:", err);
      setError(err.message || "Failed to create smart account with spend permissions");
      setStatus("error");
    }
  };

  if (status === "checking") {
    return (
      <div className="text-center py-4">
        <div className="loading loading-spinner loading-sm text-purple-400" />
        <p className="text-gray-400 text-sm mt-2">Checking account status...</p>
      </div>
    );
  }

  // User has a smart account - assume it might work
  if (hasSmartAccount) {
    return null; // Don't show anything, let the normal flow proceed
  }

  // User doesn't have a smart account - offer to create one
  return (
    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-6">
      <div className="flex items-start gap-3">
        <svg
          className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div className="flex-1">
          <h4 className="text-sm font-medium text-yellow-300 mb-1">Smart Account Required</h4>
          <p className="text-xs text-gray-400 mb-3">
            Spend permissions require a smart account with permissions enabled. Click below to create one.
          </p>

          {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

          <button
            onClick={handleCreateSpendPermissionAccount}
            disabled={status === "creating"}
            className="btn btn-sm btn-warning"
          >
            {status === "creating" ? (
              <>
                <div className="loading loading-spinner loading-xs" />
                Creating...
              </>
            ) : (
              "Create Smart Account"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
