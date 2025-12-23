"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatEther } from "viem";
import { useAccount, useBalance, useDisconnect, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import deployedContracts from "~~/contracts/deployedContracts";
import { useCopyToClipboard } from "~~/hooks/scaffold-eth";

interface SIPPlan {
  id: number;
  userAddress: string;
  goal: string;
  monthlyAmount: string;
  riskLevel: "low" | "medium" | "high";
  strategy: { aave: number; compound: number; uniswap: number };
  aiSpendLimit: string;
  rebalancing: boolean;
  active: boolean;
  totalDeposited: string;
  createdAt: string;
  lastExecution: string | null;
}

interface SIPExecution {
  id: number;
  planId: number;
  amount: string;
  txHash: string | null;
  status: "pending" | "success" | "failed";
  errorMessage: string | null;
  executedAt: string;
}

// Get contract config for Base Sepolia
const lumoContract = deployedContracts[84532]?.LumoContract;

export default function DashboardPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: balanceData, isLoading: balanceLoading } = useBalance({ address });
  const { copyToClipboard, isCopiedToClipboard: isCopied } = useCopyToClipboard();

  const [mounted, setMounted] = useState(false);
  const [plans, setPlans] = useState<SIPPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<SIPPlan | null>(null);
  const [executions, setExecutions] = useState<SIPExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeUntilNext, setTimeUntilNext] = useState("");
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [actionLoading, setActionLoading] = useState<"pause" | "resume" | "cancel" | "execute" | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Contract write hooks
  const { writeContract: writePausePlan, data: pauseHash, isPending: isPausePending } = useWriteContract();
  const { writeContract: writeResumePlan, data: resumeHash, isPending: isResumePending } = useWriteContract();
  const { writeContract: writeCancelPlan, data: cancelHash, isPending: isCancelPending } = useWriteContract();

  // Transaction receipt watchers
  const { isSuccess: isPauseSuccess, isError: isPauseError } = useWaitForTransactionReceipt({ hash: pauseHash });
  const { isSuccess: isResumeSuccess, isError: isResumeError } = useWaitForTransactionReceipt({ hash: resumeHash });
  const { isSuccess: isCancelSuccess, isError: isCancelError } = useWaitForTransactionReceipt({ hash: cancelHash });

  // Fetch plans from API
  const fetchPlans = useCallback(async () => {
    if (!address) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/sip/create?userAddress=${address}`);
      const data = await response.json();

      if (data.success && data.plans) {
        setPlans(data.plans);
        // Auto-select first plan if none selected
        if (data.plans.length > 0 && !selectedPlan) {
          setSelectedPlan(data.plans[0]);
        }
      } else {
        setPlans([]);
      }
    } catch (err: any) {
      console.error("Failed to fetch plans:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [address, selectedPlan]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && address) {
      fetchPlans();
    }
  }, [mounted, address, fetchPlans]);

  // Countdown timer for next execution
  useEffect(() => {
    if (!selectedPlan) return;

    const updateTimer = () => {
      const lastExecution = selectedPlan.lastExecution
        ? new Date(selectedPlan.lastExecution)
        : new Date(selectedPlan.createdAt);

      // Use the period from the plan's spend permission (default: 30 days = 2592000 seconds)
      // The period is stored in the database when the spend permission is created
      const periodMs = 2592000 * 1000; // 30 days in milliseconds

      const nextExecution = new Date(lastExecution.getTime() + periodMs);
      const now = new Date();
      const diff = nextExecution.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeUntilNext("Ready to execute");
        return;
      }

      // Format the remaining time in days, hours, minutes
      const days = Math.floor(diff / (24 * 60 * 60 * 1000));
      const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));

      let timeStr = "";
      if (days > 0) timeStr += `${days}d `;
      if (hours > 0) timeStr += `${hours}h `;
      timeStr += `${minutes}m`;

      setTimeUntilNext(timeStr.trim());
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [selectedPlan]);

  // Fetch executions for the selected plan
  const fetchExecutions = useCallback(async () => {
    if (!address || !selectedPlan) return;

    try {
      const response = await fetch(`/api/sip/status?userAddress=${address}`);
      const data = await response.json();

      if (data.success && data.status?.executions) {
        // Filter executions for the selected plan
        const planExecutions = data.status.executions.filter(
          (exec: any) => exec.planId === selectedPlan.id || !exec.planId,
        );
        setExecutions(planExecutions);
      }
    } catch (err) {
      console.error("Failed to fetch executions:", err);
    }
  }, [address, selectedPlan]);

  // Fetch executions when selected plan changes
  useEffect(() => {
    if (selectedPlan) {
      fetchExecutions();
    }
  }, [selectedPlan, fetchExecutions]);

  // Handle transaction success/error effects
  useEffect(() => {
    if (isPauseSuccess && pauseHash && selectedPlan && address) {
      setActionSuccess("Plan paused successfully!");
      setActionLoading(null);
      // Sync with database
      fetch("/api/sip/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: selectedPlan.id,
          userAddress: address,
          action: "pause",
          txHash: pauseHash,
        }),
      }).catch(console.error);
      // Update local state
      setSelectedPlan({ ...selectedPlan, active: false });
      setPlans(plans.map(p => (p.id === selectedPlan.id ? { ...p, active: false } : p)));
      fetchPlans();
    }
    if (isPauseError) {
      setActionError("Failed to pause plan");
      setActionLoading(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPauseSuccess, isPauseError, pauseHash]);

  useEffect(() => {
    if (isResumeSuccess && resumeHash && selectedPlan && address) {
      setActionSuccess("Plan resumed successfully!");
      setActionLoading(null);
      // Sync with database
      fetch("/api/sip/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: selectedPlan.id,
          userAddress: address,
          action: "resume",
          txHash: resumeHash,
        }),
      }).catch(console.error);
      // Update local state
      setSelectedPlan({ ...selectedPlan, active: true });
      setPlans(plans.map(p => (p.id === selectedPlan.id ? { ...p, active: true } : p)));
      fetchPlans();
    }
    if (isResumeError) {
      setActionError("Failed to resume plan");
      setActionLoading(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResumeSuccess, isResumeError, resumeHash]);

  useEffect(() => {
    if (isCancelSuccess && cancelHash && selectedPlan && address) {
      setActionSuccess("Plan cancelled successfully!");
      setActionLoading(null);
      // Sync with database
      fetch("/api/sip/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: selectedPlan.id,
          userAddress: address,
          action: "cancel",
          txHash: cancelHash,
        }),
      }).catch(console.error);
      // Update local state
      setSelectedPlan({ ...selectedPlan, active: false });
      setPlans(plans.map(p => (p.id === selectedPlan.id ? { ...p, active: false } : p)));
      fetchPlans();
    }
    if (isCancelError) {
      setActionError("Failed to cancel plan");
      setActionLoading(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCancelSuccess, isCancelError, cancelHash]);

  // Clear success/error messages after 5 seconds
  useEffect(() => {
    if (actionSuccess || actionError) {
      const timer = setTimeout(() => {
        setActionSuccess(null);
        setActionError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [actionSuccess, actionError]);

  // Handle pause plan
  const handlePausePlan = async () => {
    if (!selectedPlan || !lumoContract) return;

    setActionLoading("pause");
    setActionError(null);
    setActionSuccess(null);

    try {
      writePausePlan({
        address: lumoContract.address as `0x${string}`,
        abi: lumoContract.abi,
        functionName: "pausePlan",
        args: [BigInt(selectedPlan.id)],
      });
    } catch (err: any) {
      console.error("Error pausing plan:", err);
      setActionError(err.message || "Failed to pause plan");
      setActionLoading(null);
    }
  };

  // Handle resume plan
  const handleResumePlan = async () => {
    if (!selectedPlan || !lumoContract) return;

    setActionLoading("resume");
    setActionError(null);
    setActionSuccess(null);

    try {
      writeResumePlan({
        address: lumoContract.address as `0x${string}`,
        abi: lumoContract.abi,
        functionName: "resumePlan",
        args: [BigInt(selectedPlan.id)],
      });
    } catch (err: any) {
      console.error("Error resuming plan:", err);
      setActionError(err.message || "Failed to resume plan");
      setActionLoading(null);
    }
  };

  // Handle cancel plan
  const handleCancelPlan = async () => {
    if (!selectedPlan || !lumoContract) return;

    // Confirm cancellation
    if (!confirm("Are you sure you want to cancel this plan? This action cannot be undone.")) {
      return;
    }

    setActionLoading("cancel");
    setActionError(null);
    setActionSuccess(null);

    try {
      writeCancelPlan({
        address: lumoContract.address as `0x${string}`,
        abi: lumoContract.abi,
        functionName: "cancelPlan",
        args: [BigInt(selectedPlan.id)],
      });
    } catch (err: any) {
      console.error("Error cancelling plan:", err);
      setActionError(err.message || "Failed to cancel plan");
      setActionLoading(null);
    }
  };

  // Handle manual SIP execution
  const handleExecuteSIP = async () => {
    if (!selectedPlan) return;

    setActionLoading("execute");
    setActionError(null);
    setActionSuccess(null);

    try {
      const response = await fetch(`/api/sip/execute/${selectedPlan.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        let successMessage = "SIP executed successfully!";

        // Show AI rebalancing info if it was applied
        if (data.execution?.aiRebalancing?.success) {
          successMessage += ` AI optimized allocation: Aave ${data.execution.strategy.aave}%, Compound ${data.execution.strategy.compound}%, Uniswap ${data.execution.strategy.uniswap}%`;
        }

        setActionSuccess(successMessage);

        // Update local state with new values
        setSelectedPlan({
          ...selectedPlan,
          totalDeposited: data.execution.totalDeposited,
          lastExecution: data.execution.executedAt,
          strategy: data.execution.strategy || selectedPlan.strategy,
        });

        // Refresh data
        fetchPlans();
        fetchExecutions();
      } else {
        setActionError(data.error || "Failed to execute SIP");
      }
    } catch (err: any) {
      console.error("Error executing SIP:", err);
      setActionError(err.message || "Failed to execute SIP");
    } finally {
      setActionLoading(null);
    }
  };

  // Risk color helper
  const getRiskColor = (level: string) => {
    switch (level) {
      case "low":
        return "text-green-400";
      case "medium":
        return "text-yellow-400";
      case "high":
        return "text-red-400";
      default:
        return "text-gray-400";
    }
  };

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

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-theme="lumo-dark">
        <div className="loading loading-spinner loading-lg text-purple-500" />
      </div>
    );
  }

  if (!isConnected || !address) {
    router.push("/app");
    return null;
  }

  return (
    <div className="min-h-screen" data-theme="lumo-dark">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/Logo.png" alt="Lumo AI" width={32} height={32} className="w-8 h-8" />
            <span className="text-xl font-bold text-white">Lumo AI</span>
          </Link>

          <nav className="flex items-center gap-6">
            <Link href="/app" className="text-gray-400 hover:text-white transition-colors text-sm">
              New Plan
            </Link>
            <Link href="/dashboard" className="text-white font-medium text-sm">
              Dashboard
            </Link>
          </nav>

          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <div className="text-right">
                <div className="text-sm text-gray-400">Connected</div>
                <div className="text-sm text-white font-mono">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </div>
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {showProfileMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
                <div className="absolute right-0 top-full mt-2 w-48 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
                  <Link
                    href="/app"
                    onClick={() => setShowProfileMenu(false)}
                    className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                      />
                    </svg>
                    New Plan
                  </Link>
                  <div className="border-t border-white/5" />
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      disconnect();
                      router.push("/");
                    }}
                    className="flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors w-full text-left"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                    Disconnect
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="px-6 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Profile Section */}
          <div className="card-lumo p-6 mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 via-indigo-500 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-500/25">
                  <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white mb-1">Your Wallet</h2>
                  <div className="flex items-center gap-2">
                    <code className="text-sm text-gray-400 font-mono bg-white/5 px-3 py-1.5 rounded-lg">{address}</code>
                    <button
                      onClick={() => copyToClipboard(address || "")}
                      className={`p-2 rounded-lg transition-all duration-200 ${
                        isCopied
                          ? "bg-green-500/20 text-green-400"
                          : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                      }`}
                      title={isCopied ? "Copied!" : "Copy address"}
                    >
                      {isCopied ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm text-gray-400 mb-1">ETH Balance</div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">💎</span>
                  {balanceLoading ? (
                    <div className="loading loading-spinner loading-sm text-purple-500" />
                  ) : (
                    <span className="text-2xl font-bold text-white">
                      {balanceData ? parseFloat(formatEther(balanceData.value)).toFixed(4) : "0.0000"} ETH
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Page Title */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white">Your SIP Plans</h1>
              <p className="text-gray-400 mt-1">Manage your automated investment strategies</p>
            </div>
            <Link href="/app" className="btn btn-lumo-primary px-6 py-3 rounded-xl flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Create New Plan
            </Link>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="loading loading-spinner loading-lg text-purple-500" />
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
              <p className="text-red-400">{error}</p>
              <button onClick={fetchPlans} className="btn btn-lumo-secondary mt-4">
                Retry
              </button>
            </div>
          ) : plans.length === 0 ? (
            /* Empty State */
            <div className="card-lumo p-12 text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-purple-500/20 flex items-center justify-center">
                <svg className="w-10 h-10 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">No SIP Plans Yet</h3>
              <p className="text-gray-400 mb-6">Create your first automated investment plan to get started</p>
              <Link href="/app" className="btn btn-lumo-primary px-8 py-3 rounded-xl">
                Create Your First Plan
              </Link>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-6">
              {/* SIP Cards Grid */}
              <div className="lg:col-span-1 space-y-4">
                <h2 className="text-lg font-semibold text-white mb-4">All Plans ({plans.length})</h2>
                {plans.map(plan => (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan)}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                      selectedPlan?.id === plan.id
                        ? "bg-purple-500/20 border-purple-500/50"
                        : "bg-white/5 border-white/10 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-medium text-white">{plan.goal}</h3>
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          plan.active ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"
                        }`}
                      >
                        {plan.active ? "Active" : "Paused"}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-gray-400">{plan.monthlyAmount} ETH/period</span>
                      <span className={getRiskColor(plan.riskLevel)}>{getRiskLabel(plan.riskLevel)}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      Created {new Date(plan.createdAt).toLocaleDateString()}
                    </div>
                  </button>
                ))}
              </div>

              {/* Selected Plan Details */}
              {selectedPlan && (
                <div className="lg:col-span-2 space-y-6">
                  {/* Plan Header */}
                  <div className="card-lumo p-6">
                    <div className="flex items-start justify-between mb-6">
                      <div>
                        <h2 className="text-2xl font-bold text-white">{selectedPlan.goal}</h2>
                        <p className="text-gray-400 mt-1">Plan #{selectedPlan.id}</p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          selectedPlan.active ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"
                        }`}
                      >
                        {selectedPlan.active ? "Active" : "Paused"}
                      </span>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-white/5 rounded-xl p-4">
                        <div className="text-sm text-gray-400 mb-1">Monthly Amount</div>
                        <div className="text-xl font-bold text-white">{selectedPlan.monthlyAmount} ETH</div>
                      </div>
                      <div className="bg-white/5 rounded-xl p-4">
                        <div className="text-sm text-gray-400 mb-1">Total Deposited</div>
                        <div className="text-xl font-bold text-white">{selectedPlan.totalDeposited} ETH</div>
                      </div>
                      <div className="bg-white/5 rounded-xl p-4">
                        <div className="text-sm text-gray-400 mb-1">Next Execution</div>
                        <div className="text-xl font-bold text-purple-400">{timeUntilNext}</div>
                      </div>
                    </div>
                  </div>

                  {/* Strategy Allocation */}
                  <div className="card-lumo p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Protocol Allocation</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center p-4 bg-white/5 rounded-xl">
                        <div className="text-3xl mb-2">🏦</div>
                        <div className="text-2xl font-bold text-white">{selectedPlan.strategy.aave}%</div>
                        <div className="text-sm text-gray-400">Aave</div>
                      </div>
                      <div className="text-center p-4 bg-white/5 rounded-xl">
                        <div className="text-3xl mb-2">📊</div>
                        <div className="text-2xl font-bold text-white">{selectedPlan.strategy.compound}%</div>
                        <div className="text-sm text-gray-400">Compound</div>
                      </div>
                      <div className="text-center p-4 bg-white/5 rounded-xl">
                        <div className="text-3xl mb-2">🦄</div>
                        <div className="text-2xl font-bold text-white">{selectedPlan.strategy.uniswap}%</div>
                        <div className="text-sm text-gray-400">Uniswap</div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-6">
                      <div className="h-3 rounded-full overflow-hidden flex bg-white/10">
                        <div className="bg-blue-500 h-full" style={{ width: `${selectedPlan.strategy.aave}%` }} />
                        <div className="bg-green-500 h-full" style={{ width: `${selectedPlan.strategy.compound}%` }} />
                        <div className="bg-pink-500 h-full" style={{ width: `${selectedPlan.strategy.uniswap}%` }} />
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-blue-500" /> Aave
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-green-500" /> Compound
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-pink-500" /> Uniswap
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Plan Details */}
                  <div className="card-lumo p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Plan Settings</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between py-2 border-b border-white/5">
                        <span className="text-gray-400">Risk Level</span>
                        <span className={`font-medium ${getRiskColor(selectedPlan.riskLevel)}`}>
                          {getRiskLabel(selectedPlan.riskLevel)}
                        </span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-white/5">
                        <span className="text-gray-400">AI Rebalancing</span>
                        <span
                          className={`font-medium ${selectedPlan.rebalancing ? "text-green-400" : "text-gray-500"}`}
                        >
                          {selectedPlan.rebalancing ? "Enabled" : "Disabled"}
                        </span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-white/5">
                        <span className="text-gray-400">AI Spend Limit</span>
                        <span className="font-medium text-white">{selectedPlan.aiSpendLimit} ETH</span>
                      </div>
                      <div className="flex justify-between py-2">
                        <span className="text-gray-400">Created</span>
                        <span className="font-medium text-white">
                          {new Date(selectedPlan.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* SIP Executions History */}
                  <div className="card-lumo p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-white">SIP Executions</h3>
                      <button
                        onClick={fetchExecutions}
                        className="text-sm text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                        Refresh
                      </button>
                    </div>

                    {executions.length === 0 ? (
                      <div className="text-center py-8">
                        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                          <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                            />
                          </svg>
                        </div>
                        <p className="text-gray-400 text-sm">No executions yet</p>
                        <p className="text-gray-500 text-xs mt-1">
                          Your SIP will be executed automatically based on the schedule
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {executions.map(execution => (
                          <div
                            key={execution.id}
                            className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                  execution.status === "success"
                                    ? "bg-green-500/20 text-green-400"
                                    : execution.status === "pending"
                                      ? "bg-yellow-500/20 text-yellow-400"
                                      : "bg-red-500/20 text-red-400"
                                }`}
                              >
                                {execution.status === "success" ? (
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                ) : execution.status === "pending" ? (
                                  <svg
                                    className="w-4 h-4 animate-spin"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                    />
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M6 18L18 6M6 6l12 12"
                                    />
                                  </svg>
                                )}
                              </div>
                              <div>
                                <div className="text-sm text-white font-medium">{execution.amount} ETH</div>
                                <div className="text-xs text-gray-400">
                                  {new Date(execution.executedAt).toLocaleString()}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-xs px-2 py-1 rounded-full ${
                                  execution.status === "success"
                                    ? "bg-green-500/20 text-green-400"
                                    : execution.status === "pending"
                                      ? "bg-yellow-500/20 text-yellow-400"
                                      : "bg-red-500/20 text-red-400"
                                }`}
                              >
                                {execution.status.charAt(0).toUpperCase() + execution.status.slice(1)}
                              </span>
                              {execution.txHash && (
                                <a
                                  href={`https://sepolia.basescan.org/tx/${execution.txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-purple-400 hover:text-purple-300 transition-colors"
                                  title="View on Basescan"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                    />
                                  </svg>
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Action Success/Error Messages */}
                  {(actionSuccess || actionError) && (
                    <div
                      className={`p-4 rounded-xl border ${
                        actionSuccess
                          ? "bg-green-500/10 border-green-500/20 text-green-400"
                          : "bg-red-500/10 border-red-500/20 text-red-400"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {actionSuccess ? (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        )}
                        <span>{actionSuccess || actionError}</span>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-col gap-4">
                    {/* Execute SIP Button - Primary Action */}
                    <button
                      onClick={handleExecuteSIP}
                      disabled={actionLoading === "execute" || !selectedPlan.active}
                      className="w-full btn btn-lumo-primary px-6 py-4 rounded-xl flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed text-lg font-medium"
                    >
                      {actionLoading === "execute" ? (
                        <>
                          <div className="loading loading-spinner loading-sm" />
                          Executing SIP...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 10V3L4 14h7v7l9-11h-7z"
                            />
                          </svg>
                          Execute SIP Now (For Testing)
                          {selectedPlan.rebalancing && (
                            <span className="text-xs bg-purple-500/30 px-2 py-0.5 rounded-full ml-2">
                              🤖 AI Rebalancing
                            </span>
                          )}
                        </>
                      )}
                    </button>

                    {/* AI Rebalancing Note */}
                    {/* {selectedPlan.rebalancing && (
                      <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3">
                        <div className="flex items-center gap-2 text-purple-300 text-sm">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                          <span>
                            AI will optimize strategy allocation based on current market conditions
                          </span>
                        </div>
                      </div>
                    )} */}

                    {/* Secondary Actions Row */}
                    <div className="flex gap-4">
                      {selectedPlan.active ? (
                        <button
                          onClick={handlePausePlan}
                          disabled={actionLoading === "pause" || isPausePending}
                          className="flex-1 btn btn-lumo-secondary px-6 py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {actionLoading === "pause" || isPausePending ? (
                            <div className="loading loading-spinner loading-sm" />
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                          )}
                          Pause Plan
                        </button>
                      ) : (
                        <button
                          onClick={handleResumePlan}
                          disabled={actionLoading === "resume" || isResumePending}
                          className="flex-1 btn btn-lumo-secondary px-6 py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {actionLoading === "resume" || isResumePending ? (
                            <div className="loading loading-spinner loading-sm" />
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                          )}
                          Resume Plan
                        </button>
                      )}
                      <button
                        onClick={handleCancelPlan}
                        disabled={actionLoading === "cancel" || isCancelPending || !selectedPlan.active}
                        className="btn btn-lumo-secondary px-6 py-3 rounded-xl text-red-400 border-red-500/30 hover:bg-red-500/10 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {actionLoading === "cancel" || isCancelPending ? (
                          <div className="loading loading-spinner loading-sm" />
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        )}
                        Cancel Plan
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
