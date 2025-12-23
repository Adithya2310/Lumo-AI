"use client";

import { useState } from "react";
import { parseEther } from "viem";
import { baseSepolia } from "viem/chains";
import { useAccount, useChainId, useSignTypedData } from "wagmi";

// Spend Permission Manager contract address (deployed on Base Sepolia)
const SPEND_PERMISSION_MANAGER = "0xf85210B21cC50302F477BA56686d2019dC9b67Ad";

// Native ETH address constant (for agent payments)
const NATIVE_ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// USDC token address on Base Sepolia (for SIP investments)
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// Server wallet addresses for SIP and Agent
const SIP_SPENDER_ADDRESS = process.env.NEXT_PUBLIC_SPENDER_ADDRESS || "0x0000000000000000000000000000000000000000";
const AGENT_SPENDER_ADDRESS =
  process.env.NEXT_PUBLIC_AGENT_SPENDER_ADDRESS || "0x0000000000000000000000000000000000000000";

// Permission types
export type PermissionType = "sip" | "agent";

// Spend Permission struct
interface SpendPermission {
  account: `0x${string}`;
  spender: `0x${string}`;
  token: `0x${string}`;
  allowance: bigint;
  period: number;
  start: number;
  end: number;
  salt: bigint;
  extraData: `0x${string}`;
}

// Modal props
interface SpendPermissionModalProps {
  type: PermissionType;
  amount: string; // in ETH
  onSuccess: (permission: SpendPermission, signature: string) => void;
  onCancel: () => void;
}

export const SpendPermissionModal = ({ type, amount, onSuccess, onCancel }: SpendPermissionModalProps) => {
  const [step, setStep] = useState<"review" | "signing" | "success">("review");
  const [error, setError] = useState<string | null>(null);

  const { address } = useAccount();
  const chainId = useChainId();
  const { signTypedDataAsync } = useSignTypedData();

  // Generate a random salt for uniqueness
  const generateSalt = () => {
    return BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
  };

  // Get spender address based on permission type
  const getSpenderAddress = () => {
    return type === "sip" ? SIP_SPENDER_ADDRESS : AGENT_SPENDER_ADDRESS;
  };

  // Get display title based on permission type
  const getTitle = () => {
    return type === "sip" ? "SIP Spend Permission" : "AI Agent Spend Permission";
  };

  // Get display description based on permission type
  const getDescription = () => {
    if (type === "sip") {
      return `Allow Lumo to automatically invest up to ${amount} USDC per period for your SIP.`;
    }
    return `Allow Lumo AI Agent to spend up to ${amount} ETH for strategy optimization.`;
  };

  // Get token address based on permission type
  // SIP uses USDC, Agent uses ETH
  const getTokenAddress = () => {
    return type === "sip" ? USDC_BASE_SEPOLIA : NATIVE_ETH;
  };

  // Get token symbol for display
  const getTokenSymbol = () => {
    return type === "sip" ? "USDC" : "ETH";
  };

  const handleGrantPermission = async () => {
    if (!address) {
      setError("Please connect your wallet first");
      return;
    }

    setStep("signing");
    setError(null);

    try {
      const now = Math.floor(Date.now() / 1000);

      // For SIP permissions, use USDC amounts (6 decimals)
      // For agent permissions, use ETH amounts (18 decimals)
      const decimals = type === "sip" ? 6 : 18;
      const parsedAmount =
        type === "sip" ? BigInt(Math.floor(parseFloat(amount || "1") * 10 ** decimals)) : parseEther(amount || "0.01");

      const spendPermission: SpendPermission = {
        account: address as `0x${string}`,
        spender: getSpenderAddress() as `0x${string}`,
        token: getTokenAddress() as `0x${string}`,
        allowance: parsedAmount,
        period: 2592000, // 30 days in seconds for monthly SIP
        start: now,
        end: now + 31536000, // Valid for 1 year
        salt: generateSalt(),
        extraData: "0x" as `0x${string}`,
      };

      // EIP-712 typed data for spend permission signature
      const domain = {
        name: "Spend Permission Manager",
        version: "1",
        chainId: chainId || baseSepolia.id,
        verifyingContract: SPEND_PERMISSION_MANAGER as `0x${string}`,
      };

      const types = {
        SpendPermission: [
          { name: "account", type: "address" },
          { name: "spender", type: "address" },
          { name: "token", type: "address" },
          { name: "allowance", type: "uint160" },
          { name: "period", type: "uint48" },
          { name: "start", type: "uint48" },
          { name: "end", type: "uint48" },
          { name: "salt", type: "uint256" },
          { name: "extraData", type: "bytes" },
        ],
      };

      // Sign the spend permission
      console.log(`Requesting signature for ${type} spend permission...`);
      const signature = await signTypedDataAsync({
        domain,
        types,
        primaryType: "SpendPermission",
        message: spendPermission as unknown as Record<string, unknown>,
      });

      console.log(`${type} spend permission signed:`, signature);

      setStep("success");

      // Wait a moment then call success callback
      setTimeout(() => {
        onSuccess(spendPermission, signature);
      }, 1500);
    } catch (err: any) {
      console.error("Failed to sign permission:", err);
      setError(err.message || "Failed to sign permission");
      setStep("review");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md">
        <div className="card-lumo overflow-hidden">
          {/* Header */}
          <div className="border-b border-white/5 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    type === "sip" ? "bg-purple-500/20" : "bg-blue-500/20"
                  }`}
                >
                  {type === "sip" ? (
                    <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  )}
                </div>
                <h2 className="text-xl font-bold text-white">{getTitle()}</h2>
              </div>
              <button onClick={onCancel} className="text-gray-400 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {step === "review" && (
              <>
                {/* Permission Details */}
                <div
                  className={`rounded-xl p-4 mb-6 ${
                    type === "sip"
                      ? "bg-purple-500/10 border border-purple-500/20"
                      : "bg-blue-500/10 border border-blue-500/20"
                  }`}
                >
                  <p className="text-gray-300 text-sm mb-4">{getDescription()}</p>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Amount per period:</span>
                      <span className="font-medium text-white">
                        {amount} {getTokenSymbol()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Period:</span>
                      <span className="font-medium text-white">Monthly (30 days)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Valid for:</span>
                      <span className="font-medium text-white">1 year</span>
                    </div>
                  </div>
                </div>

                {/* Security Note */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                    <div>
                      <h4 className="text-sm font-medium text-gray-300 mb-1">Secure & Revocable</h4>
                      <p className="text-xs text-gray-500">
                        This permission is limited to the specified amount and can be revoked anytime from your
                        dashboard.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
                    <p className="text-red-400 text-sm">{error}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <button onClick={onCancel} className="flex-1 btn btn-lumo-secondary">
                    Cancel
                  </button>
                  <button
                    onClick={handleGrantPermission}
                    className={`flex-1 btn ${
                      type === "sip" ? "btn-lumo-primary" : "bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3"
                    }`}
                  >
                    Grant Permission
                  </button>
                </div>
              </>
            )}

            {step === "signing" && (
              <div className="text-center py-8">
                <div
                  className={`w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center ${
                    type === "sip" ? "bg-purple-500/20" : "bg-blue-500/20"
                  }`}
                >
                  <div
                    className={`loading loading-spinner loading-lg ${
                      type === "sip" ? "text-purple-400" : "text-blue-400"
                    }`}
                  />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Waiting for Signature</h3>
                <p className="text-gray-400 text-sm">
                  Please sign the message in your wallet to grant the spend permission...
                </p>
              </div>
            )}

            {step === "success" && (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Permission Granted!</h3>
                <p className="text-gray-400 text-sm">
                  {type === "sip"
                    ? "SIP spend permission has been granted. Your automated investments are now enabled."
                    : "AI Agent spend permission has been granted. The agent can now optimize your strategy."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Export the helper function to create serializable permission data
export const serializeSpendPermission = (permission: SpendPermission, signature: string) => {
  return {
    account: permission.account, // User's smart account address
    spender: permission.spender,
    token: permission.token,
    allowance: permission.allowance.toString(),
    period: permission.period,
    start: permission.start,
    end: permission.end,
    salt: permission.salt.toString(),
    extraData: permission.extraData || "0x", // Default to empty bytes
    signature,
  };
};
