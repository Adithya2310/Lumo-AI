"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { useTheme } from "next-themes";
import { Toaster } from "react-hot-toast";
import { baseSepolia } from "viem/chains";
import { WagmiProvider } from "wagmi";
import { Footer } from "~~/components/Footer";
import { Header } from "~~/components/Header";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

// Routes that use their own layout (no default header/footer)
const FULL_PAGE_ROUTES = ["/", "/app", "/dashboard"];

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const isFullPageRoute = FULL_PAGE_ROUTES.includes(pathname);

  // For landing page, app, and dashboard - render without default header/footer
  if (isFullPageRoute) {
    return (
      <>
        <div className="flex flex-col min-h-screen">{children}</div>
        <Toaster />
      </>
    );
  }

  // Default layout with header and footer for other pages (debug, blockexplorer, etc.)
  return (
    <>
      <div className={`flex flex-col min-h-screen`}>
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

  // Using wagmi/RainbowKit with baseAccount connector for Base Smart Wallet
  // This enables spend permissions, passkey auth, and gasless transactions
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          avatar={BlockieAvatar}
          theme={mounted ? (isDarkMode ? darkTheme() : lightTheme()) : darkTheme()}
          initialChain={baseSepolia}
        >
          <ProgressBar height="3px" color="#8b5cf6" />
          <ScaffoldEthApp>{children}</ScaffoldEthApp>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};
