"use client";

import { useEffect, useState } from "react";
import { CDPReactProvider } from "@coinbase/cdp-react";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { useTheme } from "next-themes";
import { Toaster } from "react-hot-toast";
import { WagmiProvider } from "wagmi";
import { Footer } from "~~/components/Footer";
import { Header } from "~~/components/Header";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import scaffoldConfig from "~~/scaffold.config";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <>
      <div className={`flex flex-col min-h-screen `}>
        <Header />
        <main className="relative flex flex-col flex-1">{children}</main>
        <Footer />
      </div>
      <Toaster />
    </>
  );
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export const ScaffoldEthAppWithProviders = ({ children }: { children: React.ReactNode }) => {
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Check if CDP is configured
  const isCDPConfigured = Boolean(scaffoldConfig.cdpProjectId);

  // Content wrapped in wagmi and RainbowKit providers
  const wagmiWrappedContent = (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          avatar={BlockieAvatar}
          theme={mounted ? (isDarkMode ? darkTheme() : lightTheme()) : lightTheme()}
        >
          <ProgressBar height="3px" color="#2299dd" />
          <ScaffoldEthApp>{children}</ScaffoldEthApp>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );

  // If CDP is configured, wrap with CDPReactProvider for embedded wallet support
  if (isCDPConfigured) {
    return (
      <CDPReactProvider
        config={{
          projectId: scaffoldConfig.cdpProjectId,
          ethereum: {
            // Create an EOA (Externally Owned Account) on login
            // Use "smart" for smart contract accounts with gas sponsorship
            createOnLogin: "eoa",
          },
          appName: "Lumo AI",
        }}
      >
        {wagmiWrappedContent}
      </CDPReactProvider>
    );
  }

  // Fallback to just wagmi/RainbowKit if CDP is not configured
  return wagmiWrappedContent;
};
