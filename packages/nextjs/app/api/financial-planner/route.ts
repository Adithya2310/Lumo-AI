/**
 * Financial Planner API Route
 * POST /api/financial-planner
 *
 * Generates DeFi investment strategies using Gemini AI.
 * Accepts optional agentPayment to pay EXPERT_AGENT_ADDRESS before generating strategy.
 */
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createPublicClient, createWalletClient, encodeFunctionData, formatEther, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// Gemini AI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

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

interface AgentPermission {
  spender: string;
  token: string;
  allowance: string;
  period: number;
  start: number;
  end: number;
  salt: string;
  signature: string;
}

interface StrategyRequest {
  amount: number;
  timeHorizon: string;
  riskTolerance: "low" | "medium" | "high";
  goal?: string;
  // Optional: agent payment info for pay-before-strategy flow
  agentPayment?: {
    userAddress: string;
    permission: AgentPermission;
    paymentAmount: string; // ETH amount
  };
}

interface StrategyResponse {
  success: boolean;
  strategy: {
    aave: number;
    compound: number;
    uniswap: number;
  };
  breakdown?: {
    aave: string;
    compound: string;
    uniswap: string;
  };
  reasoning?: string;
  error?: string;
  paymentInfo?: {
    paid: boolean;
    amount: string;
    txHash?: string;
  };
}

/**
 * POST handler - pays agent (if payment info provided), then generates AI investment strategy
 */
export async function POST(request: NextRequest): Promise<NextResponse<StrategyResponse>> {
  console.log("📊 Financial Planner: Processing request...");

  try {
    const body: StrategyRequest = await request.json();
    const { amount, timeHorizon, riskTolerance, goal, agentPayment } = body;

    console.log("📊 Parameters:");
    console.log(`   Amount: ${amount}`);
    console.log(`   Time: ${timeHorizon}`);
    console.log(`   Risk: ${riskTolerance}`);
    console.log(`   Has Agent Payment: ${!!agentPayment}`);

    // Validate required fields
    if (!amount || !timeHorizon || !riskTolerance) {
      return NextResponse.json(
        { success: false, strategy: { aave: 0, compound: 0, uniswap: 0 }, error: "Missing required fields" },
        { status: 400 },
      );
    }

    let paymentInfo: { paid: boolean; amount: string; txHash?: string } | undefined;

    // Step 1: Execute agent payment if payment info provided
    if (agentPayment) {
      console.log("💰 Executing agent payment before strategy generation...");
      try {
        paymentInfo = await executeAgentPayment(agentPayment);
        console.log("✅ Agent payment successful:", paymentInfo);
      } catch (paymentError: any) {
        console.error("❌ Agent payment failed:", paymentError.message);
        // Continue with strategy generation even if payment fails
        // The user already granted permission, payment can be retried
        paymentInfo = { paid: false, amount: agentPayment.paymentAmount };
      }
    }

    // Step 2: Check if Gemini API key is configured
    if (!process.env.GEMINI_API_KEY) {
      console.warn("GEMINI_API_KEY not configured, using fallback strategy");
      const fallback = generateFallbackStrategy(riskTolerance, amount);
      return NextResponse.json({ ...fallback, paymentInfo });
    }

    // Step 3: Generate strategy using Gemini AI
    try {
      const strategy = await generateAIStrategy(amount, timeHorizon, riskTolerance, goal);
      return NextResponse.json({ ...strategy, paymentInfo });
    } catch (aiError: any) {
      console.error("Gemini AI error:", aiError.message);
      const fallback = generateFallbackStrategy(riskTolerance, amount);
      return NextResponse.json({ ...fallback, paymentInfo });
    }
  } catch (error: any) {
    console.error("❌ Error in Financial Planner:", error.message);
    return NextResponse.json(
      { success: false, strategy: { aave: 0, compound: 0, uniswap: 0 }, error: error.message },
      { status: 500 },
    );
  }
}

/**
 * Execute agent payment using ETH spend permission
 */
async function executeAgentPayment(agentPayment: {
  userAddress: string;
  permission: AgentPermission;
  paymentAmount: string;
}): Promise<{ paid: boolean; amount: string; txHash?: string }> {
  const { userAddress, permission, paymentAmount } = agentPayment;

  // Prepare spend permission struct
  const spendPermission = {
    account: userAddress as `0x${string}`,
    spender: permission.spender as `0x${string}`,
    token: NATIVE_ETH,
    allowance: BigInt(permission.allowance),
    period: permission.period,
    start: permission.start,
    end: permission.end,
    salt: BigInt(permission.salt),
    extraData: "0x" as `0x${string}`,
  };

  const signature = permission.signature as `0x${string}`;
  const amountWei = parseEther(paymentAmount);

  console.log("Agent payment parameters:", {
    userAddress,
    paymentAmount,
    expertAgent: EXPERT_AGENT_ADDRESS,
  });

  // Get the agent wallet client
  const walletClient = getAgentWalletClient();

  // Check if permission is already approved on-chain
  const isApproved = await publicClient.readContract({
    address: SPEND_PERMISSION_MANAGER_ADDRESS,
    abi: SPEND_PERMISSION_MANAGER_ABI,
    functionName: "isApproved",
    args: [spendPermission],
  });

  console.log("Is agent permission approved:", isApproved);

  // If not approved, approve with signature first
  if (!isApproved) {
    console.log("Permission not approved on-chain, approving with signature...");

    const approvalData = encodeFunctionData({
      abi: SPEND_PERMISSION_MANAGER_ABI,
      functionName: "approveWithSignature",
      args: [spendPermission, signature],
    });

    const approvalTxHash = await walletClient.sendTransaction({
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

  console.log("✅ Spend successful, now forwarding to EXPERT_AGENT_ADDRESS...");

  // Step 3: Forward the ETH to EXPERT_AGENT_ADDRESS
  // The spend sent ETH to our server wallet, now we forward it to the actual expert agent
  const forwardTxHash = await walletClient.sendTransaction({
    to: EXPERT_AGENT_ADDRESS,
    value: spendValue,
  });

  console.log("Forward tx hash:", forwardTxHash);

  // Wait for forward transaction
  const forwardReceipt = await publicClient.waitForTransactionReceipt({ hash: forwardTxHash as `0x${string}` });

  if (forwardReceipt.status !== "success") {
    console.error("⚠️ Forward transaction failed - ETH stuck in server wallet");
    throw new Error("Failed to forward payment to expert agent");
  }

  console.log(`✅ Successfully forwarded ${formatEther(spendValue)} ETH to ${EXPERT_AGENT_ADDRESS}`);

  return {
    paid: true,
    amount: formatEther(spendValue),
    txHash: forwardTxHash, // Return the forward tx hash as the final payment proof
  };
}

/**
 * Generate AI strategy using Gemini
 */
async function generateAIStrategy(
  amount: number,
  timeHorizon: string,
  riskTolerance: string,
  goal?: string,
): Promise<StrategyResponse> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = `You are a DeFi investment expert. A user wants to invest ${amount} USDC for ${timeHorizon} with ${riskTolerance} risk tolerance.
${goal ? `Goal: ${goal}` : ""}

Allocate this investment across these three DeFi protocols:
- Aave (lending, stable 4-6% APY)
- Compound (lending, stable 4-5% APY)  
- Uniswap (liquidity provision, higher risk 10-15% APY)

For LOW risk: prioritize Aave and Compound (80%+ combined)
For MEDIUM risk: balanced allocation
For HIGH risk: prioritize Uniswap for higher yields

Respond ONLY with valid JSON in this exact format, no extra text:
{"aave": <number>, "compound": <number>, "uniswap": <number>, "reasoning": "<brief explanation>"}

Percentages MUST sum to exactly 100.`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();

  // Parse the JSON response
  let parsedResponse;
  try {
    const cleanedResponse = response
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    parsedResponse = JSON.parse(cleanedResponse);
  } catch {
    console.error("Failed to parse AI response:", response);
    throw new Error("Invalid AI response format");
  }
  // Validate percentages sum to 100
  const total = parsedResponse.aave + parsedResponse.compound + parsedResponse.uniswap;
  if (Math.abs(total - 100) > 1) {
    console.warn(`Strategy percentages sum to ${total}, normalizing...`);
    const factor = 100 / total;
    parsedResponse.aave = Math.round(parsedResponse.aave * factor);
    parsedResponse.compound = Math.round(parsedResponse.compound * factor);
    parsedResponse.uniswap = 100 - parsedResponse.aave - parsedResponse.compound;
  }

  console.log("✅ AI Generated Strategy:", parsedResponse);

  return {
    success: true,
    strategy: {
      aave: parsedResponse.aave,
      compound: parsedResponse.compound,
      uniswap: parsedResponse.uniswap,
    },
    breakdown: {
      aave: `${((amount * parsedResponse.aave) / 100).toFixed(2)} USDC`,
      compound: `${((amount * parsedResponse.compound) / 100).toFixed(2)} USDC`,
      uniswap: `${((amount * parsedResponse.uniswap) / 100).toFixed(2)} USDC`,
    },
    reasoning: parsedResponse.reasoning,
  };
}

/**
 * Fallback strategy when AI is unavailable
 */
function generateFallbackStrategy(riskTolerance: string, amount: number): StrategyResponse {
  let strategy: { aave: number; compound: number; uniswap: number };
  let reasoning: string;

  switch (riskTolerance) {
    case "low":
      strategy = { aave: 50, compound: 40, uniswap: 10 };
      reasoning = "Conservative allocation prioritizing stable lending protocols.";
      break;
    case "medium":
      strategy = { aave: 35, compound: 35, uniswap: 30 };
      reasoning = "Balanced allocation across all protocols for moderate growth.";
      break;
    case "high":
      strategy = { aave: 20, compound: 25, uniswap: 55 };
      reasoning = "Aggressive allocation favoring Uniswap LP for higher yields.";
      break;
    default:
      strategy = { aave: 35, compound: 35, uniswap: 30 };
      reasoning = "Default balanced allocation.";
  }

  console.log("📊 Using fallback strategy:", strategy);

  return {
    success: true,
    strategy,
    breakdown: {
      aave: `${((amount * strategy.aave) / 100).toFixed(2)} USDC`,
      compound: `${((amount * strategy.compound) / 100).toFixed(2)} USDC`,
      uniswap: `${((amount * strategy.uniswap) / 100).toFixed(2)} USDC`,
    },
    reasoning,
  };
}
