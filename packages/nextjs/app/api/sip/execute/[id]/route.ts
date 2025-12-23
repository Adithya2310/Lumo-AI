/**
 * API Route: Execute SIP by Plan ID
 * POST /api/sip/execute/[id]
 *
 * Executes a specific SIP plan using the user's spend permission
 * This is called by the server to trigger the SpendPermissionManager.spend
 */
import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, encodeFunctionData, formatEther, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { isDatabaseConfigured, turso } from "~~/utils/db/turso";

// SpendPermissionManager contract address on Base Sepolia
const SPEND_PERMISSION_MANAGER_ADDRESS = "0xf85210B21cC50302F477BA56686d2019dC9b67Ad" as `0x${string}`;

// USDC token address on Base Sepolia (for SIP investments)
const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`;

// Native ETH address constant (for backwards compatibility)
const NATIVE_ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as `0x${string}`;

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
const getServerWalletClient = () => {
  const privateKey = process.env.SERVER_WALLET_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("SERVER_WALLET_PRIVATE_KEY not configured");
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  return createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(),
  });
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const planId = parseInt(id);

    if (isNaN(planId)) {
      return NextResponse.json({ error: "Invalid plan ID" }, { status: 400 });
    }

    // Check if database is configured
    if (!isDatabaseConfigured()) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Fetch the plan from database
    const planResult = await turso.execute({
      sql: `SELECT * FROM sip_plans WHERE id = ?`,
      args: [planId],
    });

    if (planResult.rows.length === 0) {
      return NextResponse.json({ error: "SIP plan not found" }, { status: 404 });
    }

    const plan = planResult.rows[0];

    if (!plan.active) {
      return NextResponse.json({ error: "SIP plan is paused" }, { status: 400 });
    }

    const userAddress = plan.user_address as string;

    // Fetch the SIP spend permission from database (Phase 2: specifically query for 'sip' type)
    const permissionResult = await turso.execute({
      sql: `SELECT * FROM spend_permissions WHERE plan_id = ? AND user_address = ? AND revoked = 0 AND (permission_type = 'sip' OR permission_type IS NULL)`,
      args: [planId, userAddress],
    });

    if (permissionResult.rows.length === 0) {
      return NextResponse.json({ error: "No active spend permission found for this plan" }, { status: 400 });
    }

    const permission = permissionResult.rows[0];

    // Check if enough time has passed since last execution
    const now = new Date();

    // Get execution interval from the spend permission period
    const periodSeconds = Number(permission.period);
    const executionIntervalMs = periodSeconds > 0 ? periodSeconds * 1000 : 2592000 * 1000; // Default: 30 days

    if (plan.last_execution) {
      const lastExecution = new Date(plan.last_execution as string);
      const timeSinceLastExecution = now.getTime() - lastExecution.getTime();
      if (timeSinceLastExecution < executionIntervalMs) {
        const remainingMs = executionIntervalMs - timeSinceLastExecution;
        const remainingDays = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
        const remainingHours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const remainingMinutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

        let remainingText = "";
        if (remainingDays > 0) remainingText += `${remainingDays}d `;
        if (remainingHours > 0) remainingText += `${remainingHours}h `;
        remainingText += `${remainingMinutes}m`;

        return NextResponse.json(
          {
            error: `Next execution in ${remainingText.trim()}`,
            nextExecution: new Date(lastExecution.getTime() + executionIntervalMs).toISOString(),
          },
          { status: 429 },
        );
      }
    }

    // Get strategy allocations - either from AI agent rebalancing or from the plan
    let strategyAave = plan.strategy_aave as number;
    let strategyCompound = plan.strategy_compound as number;
    let strategyUniswap = plan.strategy_uniswap as number;
    let aiRebalanceResult: { success: boolean; reasoning?: string } | null = null;

    // If rebalancing is enabled, query the AI agent for optimized allocations
    if (plan.rebalancing) {
      console.log(`🤖 AI Rebalancing enabled for plan #${planId}, querying financial planner...`);

      try {
        // Query the financial planner API for optimized strategy
        const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL
          ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
          : `http://localhost:${process.env.PORT || 3000}`;

        const rebalanceResponse = await fetch(`${baseUrl}/api/financial-planner`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: parseFloat(plan.monthly_amount as string),
            timeHorizon: "1 month", // Current SIP period
            riskTolerance: plan.risk_level as string,
            goal: plan.goal as string,
          }),
        });

        const rebalanceData = await rebalanceResponse.json();

        if (rebalanceData.success && rebalanceData.strategy) {
          console.log(`✅ AI Rebalancing suggestion:`, rebalanceData.strategy);
          console.log(`   Reasoning: ${rebalanceData.reasoning}`);

          // Update strategy with AI recommendations
          strategyAave = rebalanceData.strategy.aave;
          strategyCompound = rebalanceData.strategy.compound;
          strategyUniswap = rebalanceData.strategy.uniswap;

          aiRebalanceResult = {
            success: true,
            reasoning: rebalanceData.reasoning,
          };

          // Update the plan in database with new strategy
          await turso.execute({
            sql: `UPDATE sip_plans SET strategy_aave = ?, strategy_compound = ?, strategy_uniswap = ?, updated_at = ? WHERE id = ?`,
            args: [strategyAave, strategyCompound, strategyUniswap, now.toISOString(), planId],
          });

          console.log(
            `📊 Plan #${planId} strategy updated to: Aave ${strategyAave}%, Compound ${strategyCompound}%, Uniswap ${strategyUniswap}%`,
          );
        } else {
          console.warn(`⚠️ AI Rebalancing returned no strategy, using existing allocations`);
          aiRebalanceResult = { success: false, reasoning: "AI returned no strategy" };
        }
      } catch (rebalanceError: any) {
        console.error(`❌ AI Rebalancing failed:`, rebalanceError.message);
        aiRebalanceResult = { success: false, reasoning: rebalanceError.message };
        // Continue with existing strategy
      }
    }

    // Prepare spend permission struct
    // Determine token based on permission type (USDC for SIP, ETH legacy support)
    const tokenAddress = permission.permission_type === "sip" ? USDC_ADDRESS : NATIVE_ETH;

    const spendPermission = {
      account: userAddress as `0x${string}`,
      spender: permission.spender_address as `0x${string}`,
      token: tokenAddress,
      allowance: BigInt(permission.allowance as string),
      period: Number(permission.period),
      start: Number(permission.start_time),
      end: Number(permission.end_time),
      salt: BigInt(permission.salt as string),
      extraData: "0x" as `0x${string}`,
    };

    const signature = permission.signature as `0x${string}`;
    const monthlyAmount = plan.monthly_amount as string;
    const amountWei = parseEther(monthlyAmount);

    console.log(`Executing SIP for plan #${planId}:`, {
      userAddress,
      amount: monthlyAmount,
      spendPermission,
    });

    // Get the server wallet client
    const walletClient = getServerWalletClient();

    // First, check if the user has enough ETH balance
    const userBalance = await publicClient.getBalance({ address: userAddress as `0x${string}` });
    console.log(`User balance: ${formatEther(userBalance)} ETH`);

    if (userBalance < amountWei) {
      return NextResponse.json(
        {
          error: `Insufficient user balance. Required: ${monthlyAmount} ETH, Available: ${formatEther(userBalance)} ETH`,
          userBalance: formatEther(userBalance),
          requiredAmount: monthlyAmount,
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

    console.log("Is permission approved on-chain:", isApproved);

    let approvalTxHash: string | null = null;

    // If not approved, approve with signature first
    if (!isApproved) {
      console.log("Permission not approved on-chain, approving with signature...");

      const approvalData = encodeFunctionData({
        abi: SPEND_PERMISSION_MANAGER_ABI,
        functionName: "approveWithSignature",
        args: [spendPermission, signature],
      });

      try {
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

        // Wait for blockchain state to propagate across RPC nodes
        console.log("Waiting for approval to propagate...");
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify the approval is now reflected on-chain
        const approvalConfirmed = await publicClient.readContract({
          address: SPEND_PERMISSION_MANAGER_ADDRESS,
          abi: SPEND_PERMISSION_MANAGER_ABI,
          functionName: "isApproved",
          args: [spendPermission],
        });

        if (!approvalConfirmed) {
          console.log("Approval not yet confirmed, waiting additional time...");
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        console.log("Approval confirmed on-chain, proceeding to spend...");
      } catch (approvalError: any) {
        // Handle "already known" error - transaction is already pending from concurrent request
        if (approvalError.message?.includes("already known") || approvalError.details?.includes("already known")) {
          console.log("Approval transaction already pending, waiting for it to be mined...");
          // Wait a bit for the pending transaction to be mined
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Re-check if it's now approved
          const nowApproved = await publicClient.readContract({
            address: SPEND_PERMISSION_MANAGER_ADDRESS,
            abi: SPEND_PERMISSION_MANAGER_ABI,
            functionName: "isApproved",
            args: [spendPermission],
          });

          if (!nowApproved) {
            // Still not approved, wait longer
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
          console.log("Approval likely completed by concurrent request, proceeding...");
        } else {
          throw approvalError;
        }
      }
    }

    // IMPORTANT: The spend value must not exceed the allowance per period
    // The allowance is the maximum amount that can be spent within each period
    const spendValue = amountWei <= spendPermission.allowance ? amountWei : spendPermission.allowance;
    console.log(`Spend value: ${formatEther(spendValue)} ETH (capped to allowance if needed)`);

    // Now execute the spend
    console.log("Executing spend...");
    console.log("Spend parameters:", {
      account: spendPermission.account,
      spender: spendPermission.spender,
      token: spendPermission.token,
      allowance: spendPermission.allowance.toString(),
      period: spendPermission.period,
      start: spendPermission.start,
      end: spendPermission.end,
      salt: spendPermission.salt.toString(),
      value: spendValue.toString(),
    });

    // Use writeContract instead of sendTransaction for better error messages
    const spendData = encodeFunctionData({
      abi: SPEND_PERMISSION_MANAGER_ABI,
      functionName: "spend",
      args: [spendPermission, spendValue],
    });

    let spendTxHash: string = "";
    let retries = 0;
    const maxRetries = 2;

    while (retries <= maxRetries) {
      try {
        spendTxHash = await walletClient.sendTransaction({
          to: SPEND_PERMISSION_MANAGER_ADDRESS,
          data: spendData,
        });

        console.log("Spend tx hash:", spendTxHash);
        break;
      } catch (spendError: any) {
        const errorData = spendError?.cause?.cause?.data || spendError?.cause?.data || "";

        // Check if this is a "spend already used for this period" error or similar
        if (errorData === "0x282b9f97") {
          console.error(
            "SpendPermissionManager error: Likely exceeded spend limit for this period or permission issue",
          );
          throw new Error("Spend limit exceeded for this period. The permission may have already been used.");
        }

        if (retries < maxRetries && spendError.message?.includes("execution reverted")) {
          console.log(`Spend failed, retrying in 2 seconds... (attempt ${retries + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          retries++;
        } else {
          throw spendError;
        }
      }
    }

    // Wait for spend transaction
    const receipt = await publicClient.waitForTransactionReceipt({ hash: spendTxHash! as `0x${string}` });

    if (receipt.status !== "success") {
      throw new Error(
        "Spend transaction failed - check if the user account is a Smart Account with spend permissions enabled",
      );
    }

    // Calculate breakdown for each protocol using the strategy values (potentially updated by AI rebalancing)
    const aaveAmount = (spendValue * BigInt(strategyAave)) / 100n;
    const compoundAmount = (spendValue * BigInt(strategyCompound)) / 100n;
    const uniswapAmount = (spendValue * BigInt(strategyUniswap)) / 100n;

    // Update the plan in database
    const currentTotalDeposited = (plan.total_deposited as string) || "0";
    const newTotalDeposited = parseEther(currentTotalDeposited) + spendValue;
    const newTotalDepositedStr = formatEther(newTotalDeposited);
    const nowIso = now.toISOString();

    await turso.execute({
      sql: `UPDATE sip_plans SET total_deposited = ?, last_execution = ?, updated_at = ? WHERE id = ?`,
      args: [newTotalDepositedStr, nowIso, nowIso, planId],
    });

    // Record the execution
    await turso.execute({
      sql: `INSERT INTO sip_executions (plan_id, user_address, amount, tx_hash, status, executed_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [planId, userAddress, formatEther(spendValue), spendTxHash, "success", nowIso],
    });

    return NextResponse.json({
      success: true,
      message: "SIP execution completed successfully",
      execution: {
        planId,
        userAddress,
        amount: formatEther(spendValue),
        strategy: {
          aave: strategyAave,
          compound: strategyCompound,
          uniswap: strategyUniswap,
        },
        breakdown: {
          aave: formatEther(aaveAmount),
          compound: formatEther(compoundAmount),
          uniswap: formatEther(uniswapAmount),
        },
        aiRebalancing: aiRebalanceResult,
        totalDeposited: newTotalDepositedStr,
        transactions: {
          approval: approvalTxHash,
          spend: spendTxHash,
        },
        executedAt: nowIso,
        nextExecution: new Date(now.getTime() + executionIntervalMs).toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Error executing SIP:", error);
    return NextResponse.json({ error: error.message || "Failed to execute SIP" }, { status: 500 });
  }
}
