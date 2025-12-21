/**
 * Lumo Contract utilities for server-side interactions
 */
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";

// Contract addresses on Sepolia
export const LUMO_CONTRACT_ADDRESS = deployedContracts[11155111].LumoContract.address;
export const LUMO_CONTRACT_ABI = deployedContracts[11155111].LumoContract.abi;

// Public client for reading contract state
export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(
    process.env.NEXT_PUBLIC_ALCHEMY_API_KEY
      ? `https://eth-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
      : "https://rpc.sepolia.org",
  ),
});

// Create wallet client for server-side transactions
// The server needs its own wallet to execute SIP transactions using spend permissions
export const getServerWalletClient = () => {
  const privateKey = process.env.SERVER_WALLET_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("SERVER_WALLET_PRIVATE_KEY not configured");
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  return createWalletClient({
    account,
    chain: sepolia,
    transport: http(
      process.env.NEXT_PUBLIC_ALCHEMY_API_KEY
        ? `https://eth-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
        : "https://rpc.sepolia.org",
    ),
  });
};

// Get user's SIP plan from the contract
export const getUserPlan = async (userAddress: `0x${string}`) => {
  try {
    const plan = await publicClient.readContract({
      address: LUMO_CONTRACT_ADDRESS,
      abi: LUMO_CONTRACT_ABI,
      functionName: "getPlan",
      args: [userAddress],
    });

    return plan;
  } catch (error) {
    console.error("Error fetching user plan:", error);
    throw error;
  }
};

// SIP Plan interface matching the contract structure
export interface SIPPlanInput {
  totalAmount: string; // in ETH
  monthlyAmount: string; // in ETH
  duration: number; // in months
  aavePercent: number;
  compoundPercent: number;
  uniswapPercent: number;
}

// Create a SIP plan (called from the user's wallet, not server)
// This is for reference - the actual call should come from the client
export const createSIPPlanParams = (plan: SIPPlanInput) => {
  const totalAmountWei = parseEther(plan.totalAmount);
  const monthlyAmountWei = parseEther(plan.monthlyAmount);

  return {
    address: LUMO_CONTRACT_ADDRESS,
    abi: LUMO_CONTRACT_ABI,
    functionName: "createSIPPlan" as const,
    args: [
      totalAmountWei,
      monthlyAmountWei,
      BigInt(plan.duration),
      plan.aavePercent,
      plan.compoundPercent,
      plan.uniswapPercent,
    ] as const,
    value: totalAmountWei,
  };
};

// Execute SIP deposit using spend permission
// This uses the server wallet to spend from the user's wallet via spend permission
export const executeSIPDeposit = async (userAddress: `0x${string}`, amount: string) => {
  // Note: This is a placeholder for the actual spend permission execution
  // The actual implementation would use the CDP SDK to spend from the user's wallet
  // using the granted spend permission

  console.log(`Executing SIP deposit for ${userAddress}: ${amount} ETH`);

  // TODO: Implement actual spend permission execution using CDP SDK
  // This would involve:
  // 1. Calling the spend permission manager to transfer funds from user to server
  // 2. Server then calls the LumoContract to create/fund the SIP

  return {
    success: true,
    message: "SIP deposit execution placeholder",
    userAddress,
    amount,
  };
};
