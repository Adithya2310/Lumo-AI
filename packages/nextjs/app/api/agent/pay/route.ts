/**
 * Agent Payment API Route
 * POST /api/agent/pay
 *
 * Executes ETH payment to the EXPERT_AGENT_ADDRESS using spend permission.
 * Called when AI strategy optimization is requested.
 */
import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, encodeFunctionData, formatEther, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { isDatabaseConfigured, turso } from "~~/utils/db/turso";

// SpendPermissionManager contract address on Base Sepolia
const SPEND_PERMISSION_MANAGER_ADDRESS = "0xf85210B21cC50302F477BA56686d2019dC9b67Ad" as `0x${string}`;

// Native ETH address constant
const NATIVE_ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as `0x${string}`;

// Expert agent address for AI payments
const EXPERT_AGENT_ADDRESS = (process.env.EXPERT_AGENT_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

// SpendPermissionManager ABI (only the functions we need)
const SPEND_PERMISSION_MANAGER_ABI = [
  {
    name: "approveWithSignature",
    type: "function",
    stateMutability: "nonpayable",
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
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "spend",
    type: "function",
    stateMutability: "nonpayable",
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
      { name: "value", type: "uint160" },
    ],
    outputs: [],
  },
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
] as const;

// Create public client for reading
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

// Create wallet client for transactions
const getAgentWalletClient = () => {
  const privateKey = process.env.SERVER_AGENT_WALLET_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("SERVER_AGENT_WALLET_PRIVATE_KEY not configured");
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  return createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(),
  });
};

interface AgentPaymentRequest {
  planId: number;
  userAddress: string;
  amount?: string; // ETH amount to pay (default: 0.001 ETH)
}

export async function POST(request: NextRequest) {
  try {
    const body: AgentPaymentRequest = await request.json();
    const { planId, userAddress, amount = "0.001" } = body;

    console.log(`💸 Processing agent payment for plan #${planId}`);

    // Check if database is configured
    if (!isDatabaseConfigured()) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Fetch the agent spend permission from database
    const permissionResult = await turso.execute({
      sql: `SELECT * FROM spend_permissions WHERE plan_id = ? AND user_address = ? AND revoked = 0 AND permission_type = 'agent'`,
      args: [planId, userAddress],
    });

    if (permissionResult.rows.length === 0) {
      return NextResponse.json({ error: "No active agent spend permission found" }, { status: 400 });
    }

    const permission = permissionResult.rows[0];

    // Prepare spend permission struct
    const spendPermission = {
      account: userAddress as `0x${string}`,
      spender: permission.spender_address as `0x${string}`,
      token: NATIVE_ETH,
      allowance: BigInt(permission.allowance as string),
      period: Number(permission.period),
      start: Number(permission.start_time),
      end: Number(permission.end_time),
      salt: BigInt(permission.salt as string),
      extraData: "0x" as `0x${string}`,
    };

    const signature = permission.signature as `0x${string}`;
    const amountWei = parseEther(amount);

    console.log("Agent payment parameters:", {
      userAddress,
      amount,
      expertAgent: EXPERT_AGENT_ADDRESS,
    });

    // Get the agent wallet client
    const walletClient = getAgentWalletClient();

    // Check if user has enough ETH balance
    const userBalance = await publicClient.getBalance({ address: userAddress as `0x${string}` });
    console.log(`User ETH balance: ${formatEther(userBalance)}`);

    if (userBalance < amountWei) {
      return NextResponse.json(
        {
          error: `Insufficient user balance. Required: ${amount} ETH, Available: ${formatEther(userBalance)} ETH`,
          userBalance: formatEther(userBalance),
          requiredAmount: amount,
        },
        { status: 400 },
      );
    }

    // Check if permission is already approved on-chain
    const isApproved = await publicClient.readContract({
      address: SPEND_PERMISSION_MANAGER_ADDRESS,
      abi: SPEND_PERMISSION_MANAGER_ABI,
      functionName: "isApproved",
      args: [spendPermission],
    });

    console.log("Is agent permission approved:", isApproved);

    let approvalTxHash: string | null = null;

    // If not approved, approve with signature first
    if (!isApproved) {
      console.log("Permission not approved on-chain, approving with signature...");

      const approvalData = encodeFunctionData({
        abi: SPEND_PERMISSION_MANAGER_ABI,
        functionName: "approveWithSignature",
        args: [spendPermission, signature],
      });

      approvalTxHash = await walletClient.sendTransaction({
        to: SPEND_PERMISSION_MANAGER_ADDRESS,
        data: approvalData,
      });

      console.log("Approval tx hash:", approvalTxHash);

      // Wait for approval transaction to be mined
      const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalTxHash as `0x${string}` });
      console.log("Approval receipt status:", approvalReceipt.status);

      if (approvalReceipt.status !== "success") {
        throw new Error("Approval transaction failed");
      }
    }

    // Cap spend value to allowance if needed
    const spendValue = amountWei <= spendPermission.allowance ? amountWei : spendPermission.allowance;
    console.log(`Spend value: ${formatEther(spendValue)} ETH`);

    // Execute the spend
    console.log("Executing agent payment spend...");
    const spendData = encodeFunctionData({
      abi: SPEND_PERMISSION_MANAGER_ABI,
      functionName: "spend",
      args: [spendPermission, spendValue],
    });

    const spendTxHash = await walletClient.sendTransaction({
      to: SPEND_PERMISSION_MANAGER_ADDRESS,
      data: spendData,
    });

    console.log("Agent payment spend tx hash:", spendTxHash);

    // Wait for spend transaction
    const receipt = await publicClient.waitForTransactionReceipt({ hash: spendTxHash as `0x${string}` });

    if (receipt.status !== "success") {
      throw new Error("Agent payment transaction failed");
    }

    return NextResponse.json({
      success: true,
      message: "Agent payment executed successfully",
      payment: {
        planId,
        userAddress,
        amount: formatEther(spendValue),
        recipient: EXPERT_AGENT_ADDRESS,
        transactions: {
          approval: approvalTxHash,
          spend: spendTxHash,
        },
        executedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Error executing agent payment:", error);
    return NextResponse.json({ error: error.message || "Failed to execute agent payment" }, { status: 500 });
  }
}
