"use client";

import { useEffect, useState } from "react";
import { AddressInfoDropdown } from "../RainbowKitCustomConnectButton/AddressInfoDropdown";
import { AddressQRCodeModal } from "../RainbowKitCustomConnectButton/AddressQRCodeModal";
import { useEvmAddress, useIsSignedIn, useSignInWithOAuth, useSignOut } from "@coinbase/cdp-hooks";
import { Balance } from "@scaffold-ui/components";
import { Address } from "viem";
import { useNetworkColor } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { getBlockExplorerAddressLink } from "~~/utils/scaffold-eth";

/**
 * Coinbase Embedded Wallet Connect Button with Google OAuth
 * Replaces the RainbowKit connect button for Coinbase embedded wallets
 */
export const CoinbaseConnectButton = () => {
  const networkColor = useNetworkColor();
  const { targetNetwork } = useTargetNetwork();
  const { isSignedIn } = useIsSignedIn();
  const { signInWithOAuth } = useSignInWithOAuth();
  const { signOut } = useSignOut();
  const { evmAddress } = useEvmAddress();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleGoogleSignIn = () => {
    try {
      void signInWithOAuth("google");
    } catch (error) {
      console.error("Failed to sign in with Google:", error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  // Don't render until mounted to avoid hydration issues
  if (!mounted) {
    return (
      <button className="btn btn-primary btn-sm" type="button" disabled>
        Loading...
      </button>
    );
  }

  // Not signed in - show Google login button
  if (!isSignedIn || !evmAddress) {
    return (
      <button className="btn btn-primary btn-sm gap-2" onClick={handleGoogleSignIn} type="button">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Sign in with Google
      </button>
    );
  }

  // User is signed in - show wallet info
  const blockExplorerAddressLink = getBlockExplorerAddressLink(targetNetwork, evmAddress as string);
  const displayName = evmAddress ? `${evmAddress.slice(0, 6)}...${evmAddress.slice(-4)}` : "";

  return (
    <>
      <div className="flex flex-col items-center mr-2">
        <Balance
          address={evmAddress as Address}
          style={{
            minHeight: "0",
            height: "auto",
            fontSize: "0.8em",
          }}
        />
        <span className="text-xs" style={{ color: networkColor }}>
          {targetNetwork.name}
        </span>
      </div>
      <AddressInfoDropdown
        address={evmAddress as Address}
        displayName={displayName}
        ensAvatar={undefined}
        blockExplorerAddressLink={blockExplorerAddressLink}
      />
      <AddressQRCodeModal address={evmAddress as Address} modalId="qrcode-modal" />

      {/* Sign out button */}
      <button className="btn btn-ghost btn-sm text-error ml-2" onClick={handleSignOut} type="button" title="Sign out">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
          />
        </svg>
      </button>
    </>
  );
};
