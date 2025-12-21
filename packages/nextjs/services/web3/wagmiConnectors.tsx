import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { baseAccount } from "@rainbow-me/rainbowkit/wallets";
import scaffoldConfig from "~~/scaffold.config";

/**
 * wagmi connectors for the wagmi context
 *
 * Using only baseAccount for Base Smart Wallet support which enables:
 * - Passkey authentication
 * - Spend permissions
 * - Gasless transactions via paymaster
 * - Batched transactions
 */
export const wagmiConnectors = () => {
  // Only create connectors on client-side to avoid SSR issues
  if (typeof window === "undefined") {
    return [];
  }

  return connectorsForWallets(
    [
      {
        groupName: "Connect Wallet",
        wallets: [baseAccount],
      },
    ],
    {
      appName: "Lumo AI",
      projectId: scaffoldConfig.walletConnectProjectId,
    },
  );
};
