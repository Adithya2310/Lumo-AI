/**
 * Lumo Contract utilities for server-side interactions
 * Updated to work with the new LumoContract that supports multiple plans
 * and SpendPermissionManager integration
 */
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";

// SpendPermissionManager contract address on Base Sepolia
export const SPEND_PERMISSION_MANAGER_ADDRESS = "0xf85210B21cC50302F477BA56686d2019dC9b67Ad";

// Native ETH address constant (ERC-7528)
export const NATIVE_ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// Contract addresses - Try to use deployed contracts, fallback to placeholder
let LUMO_CONTRACT_ADDRESS: `0x${string}`;
let LUMO_CONTRACT_ABI: readonly unknown[];

try {
  // Use Base Sepolia (chain ID 84532)
  const contracts = deployedContracts as Record<
    number,
    Record<string, { address: `0x${string}`; abi: readonly unknown[] }>
  >;
  if (contracts[84532]?.LumoContract) {
    LUMO_CONTRACT_ADDRESS = contracts[84532].LumoContract.address;
    LUMO_CONTRACT_ABI = contracts[84532].LumoContract.abi;
  } else {
    // Fallback - you'll need to deploy the contract first
    LUMO_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000";
    LUMO_CONTRACT_ABI = [];
    console.warn("LumoContract not found in deployedContracts. Please deploy first.");
  }
} catch {
  LUMO_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000";
  LUMO_CONTRACT_ABI = [];
}

export { LUMO_CONTRACT_ADDRESS, LUMO_CONTRACT_ABI };

// Public client for reading contract state
export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(
    process.env.NEXT_PUBLIC_ALCHEMY_API_KEY
      ? `https://base-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
      : "https://sepolia.base.org",
  ),
});

// Create wallet client for server-side transactions
// The server needs its own wallet to execute SIP transactions using spend permissions
export const getServerWalletClient = () => {
  const privateKey = process.env.SERVER_WALLET_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("SERVER_WALLET_PRIVATE_KEY not configured");
  }

  const formattedKey = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
  const account = privateKeyToAccount(formattedKey);

  return createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(
      process.env.NEXT_PUBLIC_ALCHEMY_API_KEY
        ? `https://base-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
        : "https://sepolia.base.org",
    ),
  });
};

// Get the server wallet address (for SIP execution)
export const getServerWalletAddress = (): `0x${string}` | null => {
  const privateKey = process.env.SERVER_WALLET_PRIVATE_KEY;
  if (!privateKey) return null;

  try {
    // Ensure the private key starts with 0x
    const formattedKey: `0x${string}` = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
    const account = privateKeyToAccount(formattedKey);
    return account.address as `0x${string}`;
  } catch {
    return null;
  }
};

// Phase 2: Create wallet client for agent transactions (x402 payments)
// This is a separate wallet specifically for AI agent operations
export const getAgentWalletClient = () => {
  const privateKey = process.env.SERVER_AGENT_WALLET_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("SERVER_AGENT_WALLET_PRIVATE_KEY not configured");
  }

  const formattedKey = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
  const account = privateKeyToAccount(formattedKey);

  return createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(
      process.env.NEXT_PUBLIC_ALCHEMY_API_KEY
        ? `https://base-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
        : "https://sepolia.base.org",
    ),
  });
};

// Phase 2: Get the agent wallet address (for x402 AI agent payments)
export const getAgentWalletAddress = (): `0x${string}` | null => {
  const privateKey = process.env.SERVER_AGENT_WALLET_PRIVATE_KEY;
  if (!privateKey) return null;

  try {
    const formattedKey: `0x${string}` = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
    const account = privateKeyToAccount(formattedKey);
    return account.address as `0x${string}`;
  } catch {
    return null;
  }
};

// Get user's SIP plan from the contract
export const getUserPlan = async (userAddress: `0x${string}`, planId: bigint) => {
  try {
    if (LUMO_CONTRACT_ADDRESS === ("0x0000000000000000000000000000000000000000" as `0x${string}`)) {
      throw new Error("LumoContract not deployed");
    }

    const plan = await publicClient.readContract({
      address: LUMO_CONTRACT_ADDRESS,
      abi: LUMO_CONTRACT_ABI as readonly unknown[],
      functionName: "getPlan",
      args: [userAddress, planId],
    });

    return plan;
  } catch (error) {
    console.error("Error fetching user plan:", error);
    throw error;
  }
};

// Get all plan IDs for a user
export const getUserPlanIds = async (userAddress: `0x${string}`) => {
  try {
    if (LUMO_CONTRACT_ADDRESS === ("0x0000000000000000000000000000000000000000" as `0x${string}`)) {
      throw new Error("LumoContract not deployed");
    }

    const planIds = await publicClient.readContract({
      address: LUMO_CONTRACT_ADDRESS,
      abi: LUMO_CONTRACT_ABI as readonly unknown[],
      functionName: "getUserPlanIds",
      args: [userAddress],
    });

    return planIds;
  } catch (error) {
    console.error("Error fetching user plan IDs:", error);
    throw error;
  }
};

// SIP Plan interface matching the contract structure
export interface SIPPlanInput {
  planId: number; // Database plan ID
  monthlyAmount: string; // in ETH
  aavePercent: number;
  compoundPercent: number;
  uniswapPercent: number;
}

// Create parameters for calling createSIPPlan on the contract
export const createSIPPlanParams = (plan: SIPPlanInput) => {
  const monthlyAmountWei = parseEther(plan.monthlyAmount);

  return {
    address: LUMO_CONTRACT_ADDRESS,
    abi: LUMO_CONTRACT_ABI,
    functionName: "createSIPPlan" as const,
    args: [BigInt(plan.planId), monthlyAmountWei, plan.aavePercent, plan.compoundPercent, plan.uniswapPercent] as const,
  };
};

// SpendPermission struct matching the SpendPermissionManager contract
export interface SpendPermission {
  account: `0x${string}`;
  spender: `0x${string}`;
  token: `0x${string}`;
  allowance: bigint;
  period: number;
  start: number;
  end: number;
  salt: bigint;
  extraData: `0x${string}`;
}

// Create a spend permission object from database values
export const createSpendPermissionFromDB = (permission: {
  user_address: string;
  spender_address: string;
  token: string;
  allowance: string;
  period: number;
  start_time: number;
  end_time: number;
  salt: string;
}): SpendPermission => {
  return {
    account: permission.user_address as `0x${string}`,
    spender: permission.spender_address as `0x${string}`,
    token: (permission.token || NATIVE_ETH) as `0x${string}`,
    allowance: BigInt(permission.allowance),
    period: permission.period,
    start: permission.start_time,
    end: permission.end_time,
    salt: BigInt(permission.salt),
    extraData: "0x" as `0x${string}`,
  };
};

// SpendPermissionManager ABI (for read operations)
export const SPEND_PERMISSION_MANAGER_ABI = [
  {
    name: "isApproved",
    type: "function",
    stateMutability: "view",
    inputs: [
      {
        name: "spendPermission",
        type: "tuple",
        components: [
          { name: "account", type: "address" },
          { name: "spender", type: "address" },
          { name: "token", type: "address" },
          { name: "allowance", type: "uint160" },
          { name: "period", type: "uint48" },
          { name: "start", type: "uint48" },
          { name: "end", type: "uint48" },
          { name: "salt", type: "uint256" },
          { name: "extraData", type: "bytes" },
        ],
      },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "getLastUpdatedPeriod",
    type: "function",
    stateMutability: "view",
    inputs: [
      {
        name: "spendPermission",
        type: "tuple",
        components: [
          { name: "account", type: "address" },
          { name: "spender", type: "address" },
          { name: "token", type: "address" },
          { name: "allowance", type: "uint160" },
          { name: "period", type: "uint48" },
          { name: "start", type: "uint48" },
          { name: "end", type: "uint48" },
          { name: "salt", type: "uint256" },
          { name: "extraData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "start", type: "uint48" },
          { name: "end", type: "uint48" },
          { name: "spend", type: "uint160" },
        ],
      },
    ],
  },
] as const;

// Check if a spend permission is approved on-chain
export const isSpendPermissionApproved = async (spendPermission: SpendPermission): Promise<boolean> => {
  try {
    const result = await publicClient.readContract({
      address: SPEND_PERMISSION_MANAGER_ADDRESS as `0x${string}`,
      abi: SPEND_PERMISSION_MANAGER_ABI,
      functionName: "isApproved",

      args: [spendPermission] as any,
    });

    return result as boolean;
  } catch (error) {
    console.error("Error checking spend permission approval:", error);
    return false;
  }
};
