/**
 * API Route: Execute SIP
 * POST /api/sip/execute
 *
 * Executes a SIP investment using the user's spend permission
 * This is called by the server on a schedule or triggered manually
 */
import { NextRequest, NextResponse } from "next/server";
import { formatEther, parseEther } from "viem";
import { isDatabaseConfigured, turso } from "~~/utils/db/turso";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userAddress } = body;

    if (!userAddress) {
      return NextResponse.json({ error: "userAddress is required" }, { status: 400 });
    }

    // Check if database is configured
    if (!isDatabaseConfigured()) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Fetch the plan from database
    const planResult = await turso.execute({
      sql: `SELECT * FROM sip_plans WHERE user_address = ?`,
      args: [userAddress.toLowerCase()],
    });

    if (planResult.rows.length === 0) {
      return NextResponse.json({ error: "No active SIP plan found" }, { status: 404 });
    }

    const plan = planResult.rows[0];

    if (!plan.active) {
      return NextResponse.json({ error: "SIP plan is paused" }, { status: 400 });
    }

    // Check if enough time has passed since last execution (60 seconds for testing)
    const now = new Date();
    const EXECUTION_INTERVAL_MS = 60 * 1000; // 60 seconds for testing

    if (plan.last_execution) {
      const lastExecution = new Date(plan.last_execution as string);
      const timeSinceLastExecution = now.getTime() - lastExecution.getTime();
      if (timeSinceLastExecution < EXECUTION_INTERVAL_MS) {
        const remainingSeconds = Math.ceil((EXECUTION_INTERVAL_MS - timeSinceLastExecution) / 1000);
        return NextResponse.json(
          {
            error: `Next execution in ${remainingSeconds} seconds`,
            nextExecution: new Date(lastExecution.getTime() + EXECUTION_INTERVAL_MS).toISOString(),
          },
          { status: 429 },
        );
      }
    }

    // Calculate amounts for each protocol based on strategy
    const monthlyAmount = plan.monthly_amount as string;
    const monthlyAmountWei = parseEther(monthlyAmount);
    const strategyAave = plan.strategy_aave as number;
    const strategyCompound = plan.strategy_compound as number;
    const strategyUniswap = plan.strategy_uniswap as number;

    const aaveAmount = (monthlyAmountWei * BigInt(strategyAave)) / 100n;
    const compoundAmount = (monthlyAmountWei * BigInt(strategyCompound)) / 100n;
    const uniswapAmount = (monthlyAmountWei * BigInt(strategyUniswap)) / 100n;

    console.log(`Executing SIP for ${userAddress}:`);
    console.log(`  Total: ${formatEther(monthlyAmountWei)} ETH`);
    console.log(`  Aave (${strategyAave}%): ${formatEther(aaveAmount)} ETH`);
    console.log(`  Compound (${strategyCompound}%): ${formatEther(compoundAmount)} ETH`);
    console.log(`  Uniswap (${strategyUniswap}%): ${formatEther(uniswapAmount)} ETH`);

    // TODO: Actual execution logic using spend permissions
    // This would:
    // 1. Get the stored spend permission signature from database
    // 2. Use the SpendPermissionManager contract to approve the spend
    // 3. Transfer funds from user's wallet to protocols

    // For now, we simulate success and update the plan
    const currentTotalDeposited = (plan.total_deposited as string) || "0";
    const newTotalDeposited = parseEther(currentTotalDeposited) + monthlyAmountWei;
    const newTotalDepositedStr = formatEther(newTotalDeposited);
    const nowIso = now.toISOString();

    // Update the plan in database
    await turso.execute({
      sql: `UPDATE sip_plans SET total_deposited = ?, last_execution = ?, updated_at = ? WHERE user_address = ?`,
      args: [newTotalDepositedStr, nowIso, nowIso, userAddress.toLowerCase()],
    });

    // Record the execution
    await turso.execute({
      sql: `INSERT INTO sip_executions (user_address, amount, status, executed_at) VALUES (?, ?, ?, ?)`,
      args: [userAddress.toLowerCase(), monthlyAmount, "success", nowIso],
    });

    return NextResponse.json({
      success: true,
      message: "SIP execution simulated successfully",
      execution: {
        userAddress,
        amount: monthlyAmount,
        breakdown: {
          aave: formatEther(aaveAmount),
          compound: formatEther(compoundAmount),
          uniswap: formatEther(uniswapAmount),
        },
        totalDeposited: newTotalDepositedStr,
        executedAt: nowIso,
        nextExecution: new Date(now.getTime() + EXECUTION_INTERVAL_MS).toISOString(),
      },
      note: "This is a simulation. Actual spend permission execution requires blockchain integration.",
    });
  } catch (error: any) {
    console.error("Error executing SIP:", error);
    return NextResponse.json({ error: error.message || "Failed to execute SIP" }, { status: 500 });
  }
}
