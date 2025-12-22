"use client";

import { useState } from "react";
import { parseEther } from "viem";
import { baseSepolia } from "viem/chains";
import { useAccount, useChainId, useSignTypedData, useWriteContract } from "wagmi";
import { LUMO_CONTRACT_ABI, LUMO_CONTRACT_ADDRESS } from "~~/utils/contracts/lumoContract";

interface SIPPlan {
  goal: string;
  monthlyAmount: string;
  riskLevel: "low" | "medium" | "high";
  aiSpendLimit: string;
  rebalancing: boolean;
  strategy: {
    aave: number;
    compound: number;
    uniswap: number;
  };
}

interface ConfirmationModalProps {
  plan: SIPPlan;
  onConfirm: () => void;
  onCancel: () => void;
}

// Spend Permission Manager contract address (deployed on Base Sepolia)
const SPEND_PERMISSION_MANAGER = "0xf85210B21cC50302F477BA56686d2019dC9b67Ad";

// Server wallet address that will execute SIP transactions
const SPENDER_ADDRESS = process.env.NEXT_PUBLIC_SPENDER_ADDRESS || "0x0000000000000000000000000000000000000000";

// Native ETH address constant
const NATIVE_ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

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

export const ConfirmationModal = ({ plan, onConfirm, onCancel }: ConfirmationModalProps) => {
  const [step, setStep] = useState<"review" | "signing" | "creating" | "submitting" | "success">("review");
  const [error, setError] = useState<string | null>(null);

  const { address } = useAccount();
  const chainId = useChainId();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();

  // Generate a random salt for uniqueness
  const generateSalt = () => {
    return BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
  };

  const handleGrantPermission = async () => {
    if (!address) {
      setError("Please connect your wallet first");
      return;
    }

    setStep("signing");
    setError(null);

    try {
      const sipAmount = parseEther(plan.monthlyAmount || "0.01");
      const now = Math.floor(Date.now() / 1000);

      const spendPermission: SpendPermission = {
        account: address as `0x${string}`,
        spender: SPENDER_ADDRESS as `0x${string}`,
        token: NATIVE_ETH, // Native ETH
        allowance: sipAmount,
        period: 60, // 60 seconds for testing (should be 2592000 for monthly in production)
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
      console.log("Requesting signature for spend permission...");
      const signature = await signTypedDataAsync({
        domain,
        types,
        primaryType: "SpendPermission",
        message: spendPermission as unknown as Record<string, unknown>,
      });

      console.log("Spend permission signed:", signature);

      // Now create the SIP plan on-chain
      setStep("creating");
      console.log("Creating SIP plan on-chain...");

      // First, save to database to get the plan ID
      const dbResponse = await fetch("/api/sip/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: address,
          plan: {
            goal: plan.goal,
            monthlyAmount: plan.monthlyAmount,
            riskLevel: plan.riskLevel,
            strategy: plan.strategy,
            rebalancing: plan.rebalancing,
            aiSpendLimit: plan.aiSpendLimit,
          },
          spendPermission: {
            ...spendPermission,
            allowance: spendPermission.allowance.toString(),
            salt: spendPermission.salt.toString(),
            signature,
          },
        }),
      });

      if (!dbResponse.ok) {
        const data = await dbResponse.json();
        throw new Error(data.error || "Failed to save SIP plan to database");
      }

      const dbData = await dbResponse.json();
      const planId = dbData.plan?.id;

      if (!planId) {
        throw new Error("Failed to get plan ID from database");
      }

      console.log("Plan saved to database with ID:", planId);

      // Now call the smart contract to create the plan on-chain
      setStep("submitting");
      console.log("Calling createSIPPlan on contract...");

      const txHash = await writeContractAsync({
        address: LUMO_CONTRACT_ADDRESS,
        abi: LUMO_CONTRACT_ABI as readonly unknown[],
        functionName: "createSIPPlan",
        args: [BigInt(planId), sipAmount, plan.strategy.aave, plan.strategy.compound, plan.strategy.uniswap],
      });

      console.log("Contract transaction hash:", txHash);

      setStep("success");

      // Schedule automatic SIP execution after 60 seconds to test spend permission
      console.log(`Scheduling automatic SIP execution for plan #${planId} in 60 seconds...`);
      setTimeout(async () => {
        try {
          console.log(`Triggering automatic SIP execution for plan #${planId}...`);
          const executeResponse = await fetch(`/api/sip/execute/${planId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });

          const executeData = await executeResponse.json();

          if (executeResponse.ok) {
            console.log("✅ SIP execution successful:", executeData);
          } else {
            console.error("❌ SIP execution failed:", executeData);
          }
        } catch (execError) {
          console.error("❌ Error executing SIP:", execError);
        }
      }, 60000); // 60 seconds

      // Wait a moment then redirect
      setTimeout(() => {
        onConfirm();
      }, 2000);
    } catch (err: any) {
      console.error("Failed to create SIP plan:", err);
      setError(err.message || "Failed to create SIP plan");
      setStep("review");
    }
  };

  // Calculate strategy allocation labels
  const getRiskLabel = (level: string) => {
    switch (level) {
      case "low":
        return "Conservative";
      case "medium":
        return "Balanced";
      case "high":
        return "Aggressive";
      default:
        return level;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg">
        <div className="card-lumo overflow-hidden">
          {/* Header */}
          <div className="border-b border-white/5 px-6 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">
                {step === "review" && "Confirm Your SIP Plan"}
                {step === "signing" && "Sign Permission"}
                {step === "creating" && "Creating Plan..."}
                {step === "submitting" && "Finalizing..."}
                {step === "success" && "Success!"}
              </h2>
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
                {/* Plan Summary */}
                <div className="space-y-4 mb-6">
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-gray-400">Investment Goal</span>
                    <span className="font-medium text-white">{plan.goal}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-gray-400">Monthly SIP Amount</span>
                    <span className="font-medium text-white">{plan.monthlyAmount} ETH</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-gray-400">Risk Level</span>
                    <span
                      className={`font-medium ${
                        plan.riskLevel === "low"
                          ? "text-green-400"
                          : plan.riskLevel === "medium"
                            ? "text-yellow-400"
                            : "text-red-400"
                      }`}
                    >
                      {getRiskLabel(plan.riskLevel)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-gray-400">AI Rebalancing</span>
                    <span className={`font-medium ${plan.rebalancing ? "text-green-400" : "text-gray-500"}`}>
                      {plan.rebalancing ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                </div>

                {/* Strategy Allocation */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Protocol Allocation</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white/5 rounded-xl p-3 text-center">
                      <div className="text-2xl mb-1">🏦</div>
                      <div className="text-lg font-bold text-white">{plan.strategy.aave}%</div>
                      <div className="text-xs text-gray-400">Aave</div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 text-center">
                      <div className="text-2xl mb-1">📊</div>
                      <div className="text-lg font-bold text-white">{plan.strategy.compound}%</div>
                      <div className="text-xs text-gray-400">Compound</div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 text-center">
                      <div className="text-2xl mb-1">🦄</div>
                      <div className="text-lg font-bold text-white">{plan.strategy.uniswap}%</div>
                      <div className="text-xs text-gray-400">Uniswap</div>
                    </div>
                  </div>
                </div>

                {/* Permission Notice */}
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div>
                      <h4 className="text-sm font-medium text-purple-300 mb-1">Spend Permission Required</h4>
                      <p className="text-xs text-gray-400">
                        You&apos;ll sign a spend permission allowing Lumo to invest up to {plan.monthlyAmount} ETH every
                        minute (for testing). This permission is limited and can be revoked anytime.
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
                  <button onClick={handleGrantPermission} className="flex-1 btn btn-lumo-primary">
                    Sign & Confirm
                  </button>
                </div>
              </>
            )}

            {step === "signing" && (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <div className="loading loading-spinner loading-lg text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Sign Spend Permission</h3>
                <p className="text-gray-400 text-sm">
                  Please sign the message in your wallet to grant the spend permission...
                </p>
              </div>
            )}

            {step === "creating" && (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-indigo-500/20 flex items-center justify-center">
                  <div className="loading loading-spinner loading-lg text-indigo-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Saving to Database</h3>
                <p className="text-gray-400 text-sm">Storing your plan details...</p>
              </div>
            )}

            {step === "submitting" && (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <div className="loading loading-spinner loading-lg text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Creating On-Chain</h3>
                <p className="text-gray-400 text-sm">Submitting transaction to blockchain...</p>
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
                <p className="text-gray-400 text-sm">Your SIP plan is now active. Redirecting to dashboard...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
