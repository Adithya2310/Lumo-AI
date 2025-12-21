/**
 * API Route: Get SIP Status
 * GET /api/sip/status
 *
 * Returns the current status of a user's SIP plan
 * including execution history from database
 */
import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured, turso } from "~~/utils/db/turso";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get("userAddress");

    if (!userAddress) {
      return NextResponse.json({ error: "userAddress is required" }, { status: 400 });
    }

    // Check if database is configured
    if (!isDatabaseConfigured()) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Get plan from database
    const planResult = await turso.execute({
      sql: `SELECT * FROM sip_plans WHERE user_address = ?`,
      args: [userAddress.toLowerCase()],
    });

    if (planResult.rows.length === 0) {
      return NextResponse.json({ error: "No SIP plan found for this address" }, { status: 404 });
    }

    const plan = planResult.rows[0];

    // Get recent executions
    const executionsResult = await turso.execute({
      sql: `SELECT * FROM sip_executions WHERE user_address = ? ORDER BY executed_at DESC LIMIT 10`,
      args: [userAddress.toLowerCase()],
    });

    // Get spend permissions
    const permissionsResult = await turso.execute({
      sql: `SELECT * FROM spend_permissions WHERE user_address = ? AND revoked = 0 ORDER BY created_at DESC LIMIT 5`,
      args: [userAddress.toLowerCase()],
    });

    // Calculate next execution time (60 seconds interval for testing)
    const EXECUTION_INTERVAL_MS = 60 * 1000;
    let nextExecution = null;
    if (plan.last_execution) {
      const lastExecution = new Date(plan.last_execution as string);
      nextExecution = new Date(lastExecution.getTime() + EXECUTION_INTERVAL_MS).toISOString();
    } else {
      nextExecution = new Date(Date.now() + EXECUTION_INTERVAL_MS).toISOString();
    }

    // Format the response
    const formattedPlan = {
      userAddress: plan.user_address as string,
      goal: plan.goal as string,
      monthlyAmount: plan.monthly_amount as string,
      riskLevel: plan.risk_level as string,
      strategy: {
        aave: plan.strategy_aave as number,
        compound: plan.strategy_compound as number,
        uniswap: plan.strategy_uniswap as number,
      },
      aiSpendLimit: plan.ai_spend_limit as string,
      rebalancing: Boolean(plan.rebalancing),
      active: Boolean(plan.active),
      totalDeposited: plan.total_deposited as string,
      createdAt: plan.created_at as string,
      lastExecution: plan.last_execution as string | null,
    };

    const formattedExecutions = executionsResult.rows.map(row => ({
      id: row.id,
      amount: row.amount as string,
      txHash: row.tx_hash as string | null,
      status: row.status as string,
      errorMessage: row.error_message as string | null,
      executedAt: row.executed_at as string,
    }));

    const formattedPermissions = permissionsResult.rows.map(row => ({
      id: row.id,
      spender: row.spender_address as string,
      token: row.token as string,
      allowance: row.allowance as string,
      period: row.period as number,
      startTime: row.start_time as number,
      endTime: row.end_time as number,
      revoked: Boolean(row.revoked),
      createdAt: row.created_at as string,
    }));

    return NextResponse.json({
      success: true,
      status: {
        plan: formattedPlan,
        executions: formattedExecutions,
        permissions: formattedPermissions,
        nextExecution,
        isActive: Boolean(plan.active),
      },
    });
  } catch (error: any) {
    console.error("Error fetching SIP status:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch SIP status" }, { status: 500 });
  }
}
