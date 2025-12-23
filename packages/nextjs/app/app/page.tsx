"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount, useDisconnect } from "wagmi";
import { ChatContainer } from "~~/components/chat/ChatContainer";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";

export default function AppPage() {
  const router = useRouter();

  // Wallet connection via wagmi (baseAccount connector for smart wallet)
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  const [mounted, setMounted] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle when chat completes the entire flow including permissions and contract creation
  const handlePlanComplete = (planId: number) => {
    console.log(`SIP Plan #${planId} completed successfully!`);
    // SIP execution will be handled by the cron job based on the permission period
    // stored in the database (default: monthly)
    router.push("/dashboard");
  };

  // Loading state
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-theme="lumo-dark">
        <div className="loading loading-spinner loading-lg text-purple-500" />
      </div>
    );
  }

  // Show connect prompt if not connected
  if (!isConnected || !address) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" data-theme="lumo-dark">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>

          <h1 className="text-3xl font-bold text-white mb-4">Connect Your Wallet</h1>
          <p className="text-gray-400 mb-8">
            Connect with your Base Smart Wallet to start building your automated investment plan with spend permissions.
          </p>

          {/* Base Smart Wallet Connection */}
          <div className="mb-8">
            <div className="flex justify-center">
              <RainbowKitCustomConnectButton />
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 mb-6 text-left">
            <h4 className="text-sm font-medium text-purple-300 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Base Smart Wallet Features
            </h4>
            <ul className="text-xs text-gray-400 space-y-1">
              <li>• Passkey authentication (no seed phrases)</li>
              <li>• Spend permissions for automated SIP</li>
              <li>• Gasless transactions via paymaster</li>
              <li>• Batched transactions</li>
            </ul>
          </div>

          <Link href="/" className="text-gray-500 hover:text-white text-sm transition-colors">
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" data-theme="lumo-dark">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">✨</span>
            <span className="text-xl font-bold text-white">Lumo AI</span>
          </Link>

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

            {/* Profile Dropdown */}
            {showProfileMenu && (
              <>
                {/* Backdrop */}
                <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
                {/* Dropdown Menu */}
                <div className="absolute right-0 top-full mt-2 w-48 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
                  <Link
                    href="/dashboard"
                    onClick={() => setShowProfileMenu(false)}
                    className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                      />
                    </svg>
                    Dashboard
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

      {/* Main Content */}
      <main className="pt-24 pb-8 px-6 min-h-screen">
        <div className="max-w-3xl mx-auto">
          <ChatContainer onPlanComplete={handlePlanComplete} />
        </div>
      </main>
    </div>
  );
}
