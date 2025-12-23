"use client";

import Image from "next/image";
import Link from "next/link";
import type { NextPage } from "next";

const Home: NextPage = () => {
  return (
    <div className="min-h-screen" data-theme="lumo-dark">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center justify-center px-6 overflow-hidden">
        {/* Background gradient effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-600/20 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet-600/10 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto text-center">
          {/* Badge */}
          {/* <div className="inline-flex items-center gap-2 px-4 py-2 mb-8 rounded-full bg-purple-500/10 border border-purple-500/20">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm text-purple-300">Powered by Coinbase CDP</span>
          </div> */}

          {/* Main Headline */}
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            {/* <span className="text-white">AI-Powered DeFi Investing</span> */}
            {/* <br /> */}
            <span className="text-gradient-lumo">Lumo AI</span>
          </h1>

          {/* Subheadline */}
          <p className="text-xl md:text-2xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            Automate long-term wealth building with intelligent strategies. Set your goals, and let AI manage your DeFi
            portfolio.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href="/app" className="btn btn-lg btn-lumo-primary px-8 py-4 text-lg font-semibold rounded-xl">
              Launch App
              <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <a href="#features" className="btn btn-lg btn-lumo-secondary px-8 py-4 text-lg font-semibold rounded-xl">
              Learn More
            </a>
          </div>

          {/* Trust indicators */}
          <div className="mt-16 flex flex-wrap justify-center items-center gap-8 text-gray-500">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              <span className="text-sm">Non-Custodial</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-sm">Automated Execution</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
              <span className="text-sm">AI-Optimized</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">How Lumo AI Works</h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">A simple, intelligent approach to DeFi investing</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="card-lumo p-8 text-center hover:border-purple-500/30 transition-all duration-300">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">1. Chat with AI</h3>
              <p className="text-gray-400 leading-relaxed">
                Tell Lumo your investment goals, monthly budget, and risk preference through a simple chat interface.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="card-lumo p-8 text-center hover:border-purple-500/30 transition-all duration-300">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">2. Review Strategy</h3>
              <p className="text-gray-400 leading-relaxed">
                AI generates an optimized allocation across DeFi protocols. Review and approve with one click.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="card-lumo p-8 text-center hover:border-purple-500/30 transition-all duration-300">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">3. Auto-Invest</h3>
              <p className="text-gray-400 leading-relaxed">
                Your SIP runs automatically. Funds are distributed across protocols on your schedule.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Protocol Section */}
      <section className="py-24 px-6 bg-gradient-to-b from-transparent to-purple-900/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">DeFi Protocols</h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Your investments are distributed across battle-tested protocols
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Aave */}
            <div className="card-lumo p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center">
                <span className="text-2xl">🏦</span>
              </div>
              <div>
                <h4 className="font-semibold text-white">Aave</h4>
                <p className="text-sm text-gray-400">Lending & Borrowing</p>
              </div>
            </div>

            {/* Compound */}
            <div className="card-lumo p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/20 to-teal-500/20 flex items-center justify-center">
                <span className="text-2xl">📊</span>
              </div>
              <div>
                <h4 className="font-semibold text-white">Compound</h4>
                <p className="text-sm text-gray-400">Interest Protocol</p>
              </div>
            </div>

            {/* Uniswap */}
            <div className="card-lumo p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center">
                <span className="text-2xl">🦄</span>
              </div>
              <div>
                <h4 className="font-semibold text-white">Uniswap</h4>
                <p className="text-sm text-gray-400">Liquidity Provision</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Metrics Section */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="card-lumo p-12 glow-purple-sm">
            <div className="grid md:grid-cols-3 gap-8 text-center">
              <div>
                <div className="text-4xl font-bold text-gradient-lumo mb-2">$0</div>
                <div className="text-gray-400">Total Value Locked</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-gradient-lumo mb-2">0</div>
                <div className="text-gray-400">Active SIP Plans</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-gradient-lumo mb-2">0</div>
                <div className="text-gray-400">Transactions Executed</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">Ready to Automate Your DeFi Strategy?</h2>
          <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
            Connect your wallet and start building wealth with AI-powered investing.
          </p>
          <Link href="/app" className="btn btn-lg btn-lumo-primary px-10 py-4 text-lg font-semibold rounded-xl">
            Get Started
            <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <Image src="/Logo.png" alt="Lumo AI" width={32} height={32} className="w-8 h-8" />
            <span className="text-xl font-bold text-white">Lumo AI</span>
          </div>
          <div className="flex gap-8 text-gray-400 text-sm">
            <a href="#" className="hover:text-white transition-colors">
              Documentation
            </a>
            <a href="#" className="hover:text-white transition-colors">
              GitHub
            </a>
            <a href="#" className="hover:text-white transition-colors">
              Discord
            </a>
          </div>
          <div className="text-gray-500 text-sm">Built for APP LAYER FTW Hackathon</div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
