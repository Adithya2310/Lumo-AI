"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount, useDisconnect } from "wagmi";

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

export default function DashboardPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  const [mounted, setMounted] = useState(false);
  const [plans, setPlans] = useState<SIPPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<SIPPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeUntilNext, setTimeUntilNext] = useState("");
  const [showProfileMenu, setShowProfileMenu] = useState(false);

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
      const nextExecution = new Date(lastExecution.getTime() + 60000); // 60 seconds
      const now = new Date();
      const diff = nextExecution.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeUntilNext("Ready to execute");
        return;
      }

      const seconds = Math.floor(diff / 1000);
      setTimeUntilNext(`${seconds}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [selectedPlan]);

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
            <span className="text-2xl">✨</span>
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

                  {/* Actions */}
                  <div className="flex gap-4">
                    <button className="flex-1 btn btn-lumo-secondary px-6 py-3 rounded-xl flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      {selectedPlan.active ? "Pause Plan" : "Resume Plan"}
                    </button>
                    <button className="btn btn-lumo-secondary px-6 py-3 rounded-xl text-red-400 border-red-500/30 hover:bg-red-500/10 flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                      Cancel Plan
                    </button>
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
