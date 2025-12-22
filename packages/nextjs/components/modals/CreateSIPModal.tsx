"use client";

import { useEffect, useState } from "react";
import { parseEther } from "viem";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { LUMO_CONTRACT_ABI, LUMO_CONTRACT_ADDRESS } from "~~/utils/contracts/lumoContract";

// Props for the modal
interface CreateSIPModalProps {
  planId: number;
  monthlyAmount: string;
  strategy: {
    aave: number;
    compound: number;
    uniswap: number;
  };
  onSuccess: (txHash: string) => void;
  onCancel: () => void;
}

export const CreateSIPModal = ({ planId, monthlyAmount, strategy, onSuccess, onCancel }: CreateSIPModalProps) => {
  const [step, setStep] = useState<"review" | "confirming" | "pending" | "success">("review");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const { address } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash as `0x${string}` | undefined,
  });

  // Handle transaction confirmation status
  useEffect(() => {
    if (isConfirming && step === "confirming") {
      setStep("pending");
    }
    if (isConfirmed && txHash) {
      setStep("success");
      setTimeout(() => {
        onSuccess(txHash);
      }, 1500);
    }
  }, [isConfirming, isConfirmed, txHash, step, onSuccess]);

  const handleCreateSIP = async () => {
    if (!address) {
      setError("Please connect your wallet first");
      return;
    }

    if (LUMO_CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
      setError("LumoContract not deployed. Please deploy the contract first.");
      return;
    }

    setStep("confirming");
    setError(null);

    try {
      const sipAmount = parseEther(monthlyAmount || "0.01");

      console.log("Creating SIP plan on-chain...", {
        planId,
        amount: monthlyAmount,
        strategy,
      });

      const hash = await writeContractAsync({
        address: LUMO_CONTRACT_ADDRESS,
        abi: LUMO_CONTRACT_ABI as readonly unknown[],
        functionName: "createSIPPlan",
        args: [BigInt(planId), sipAmount, strategy.aave, strategy.compound, strategy.uniswap],
      });

      console.log("Contract transaction hash:", hash);
      setTxHash(hash);
    } catch (err: any) {
      console.error("Failed to create SIP on-chain:", err);
      setError(err.message || "Failed to create SIP plan");
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
                <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-white">Create SIP On-Chain</h2>
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
                {/* Transaction Details */}
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-6">
                  <p className="text-gray-300 text-sm mb-4">
                    Register your SIP plan on the blockchain. This creates an immutable record of your investment
                    strategy.
                  </p>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Plan ID:</span>
                      <span className="font-medium text-white">#{planId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Monthly Amount:</span>
                      <span className="font-medium text-white">{monthlyAmount} ETH</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Aave:</span>
                      <span className="font-medium text-white">{strategy.aave}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Compound:</span>
                      <span className="font-medium text-white">{strategy.compound}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Uniswap:</span>
                      <span className="font-medium text-white">{strategy.uniswap}%</span>
                    </div>
                  </div>
                </div>

                {/* Info Note */}
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
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div>
                      <h4 className="text-sm font-medium text-gray-300 mb-1">Smart Contract Transaction</h4>
                      <p className="text-xs text-gray-500">
                        This will submit a transaction to create your SIP plan on the LumoContract.
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
                    onClick={handleCreateSIP}
                    disabled={isPending}
                    className="flex-1 btn bg-green-600 hover:bg-green-700 text-white rounded-xl py-3 disabled:opacity-50"
                  >
                    Create SIP
                  </button>
                </div>
              </>
            )}

            {step === "confirming" && (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-yellow-500/20 flex items-center justify-center">
                  <div className="loading loading-spinner loading-lg text-yellow-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Confirm Transaction</h3>
                <p className="text-gray-400 text-sm">Please confirm the transaction in your wallet...</p>
              </div>
            )}

            {step === "pending" && (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <div className="loading loading-spinner loading-lg text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Transaction Pending</h3>
                <p className="text-gray-400 text-sm">
                  Waiting for your transaction to be confirmed on the blockchain...
                </p>
                {txHash && (
                  <a
                    href={`https://sepolia.basescan.org/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 text-sm mt-2 inline-block"
                  >
                    View on BaseScan →
                  </a>
                )}
              </div>
            )}

            {step === "success" && (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">SIP Created Successfully!</h3>
                <p className="text-gray-400 text-sm mb-4">Your SIP plan has been registered on the blockchain.</p>
                {txHash && (
                  <a
                    href={`https://sepolia.basescan.org/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-400 hover:text-green-300 text-sm"
                  >
                    View Transaction →
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
