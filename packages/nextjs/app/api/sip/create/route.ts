/**
 * API Route: Create SIP Plan
 * POST /api/sip/create - Create a new SIP plan
 * GET /api/sip/create - Get all SIP plans for a user
 *
 * Users can have multiple SIP plans
 */
import { NextRequest, NextResponse } from "next/server";
import { initializeDatabase, isDatabaseConfigured, turso } from "~~/utils/db/turso";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("Received SIP plan creation request:", JSON.stringify(body, null, 2));

    // Handle both flat structure and nested structure
    const userAddress = body.userAddress;
    const planData = body.plan || body;
    const spendPermission = body.spendPermission;

    const { goal, monthlyAmount, riskLevel, strategy, aiSpendLimit, rebalancing } = planData;

    // Validate required fields
    if (!userAddress) {
      return NextResponse.json({ error: "Missing required field: userAddress" }, { status: 400 });
    }

    if (!goal || !monthlyAmount || !riskLevel || !strategy) {
      return NextResponse.json(
        { error: "Missing required fields in plan data", received: { goal, monthlyAmount, riskLevel, strategy } },
        { status: 400 },
      );
    }

    // Validate strategy percentages
    const { aave = 0, compound = 0, uniswap = 0 } = strategy || {};
    if (aave + compound + uniswap !== 100) {
      return NextResponse.json(
        { error: "Strategy percentages must sum to 100", received: { aave, compound, uniswap } },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    let planId: number | null = null;

    // Check if Turso is configured
    if (isDatabaseConfigured()) {
      // Initialize database tables if needed
      await initializeDatabase();

      // Insert a new SIP plan (users can have multiple)
      const result = await turso.execute({
        sql: `
                    INSERT INTO sip_plans (
                        user_address, goal, monthly_amount, risk_level,
                        strategy_aave, strategy_compound, strategy_uniswap,
                        ai_spend_limit, rebalancing, active, total_deposited,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, '0', ?, ?)
                `,
        args: [
          userAddress.toLowerCase(),
          goal,
          monthlyAmount,
          riskLevel,
          aave,
          compound,
          uniswap,
          aiSpendLimit || "0",
          rebalancing ? 1 : 0,
          now,
          now,
        ],
      });

      planId = Number(result.lastInsertRowid);

      // Store spend permission if provided
      if (spendPermission && spendPermission.signature && planId) {
        await turso.execute({
          sql: `
                        INSERT INTO spend_permissions (
                            plan_id, user_address, spender_address, token, allowance,
                            period, start_time, end_time, salt, signature,
                            revoked, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
                    `,
          args: [
            planId,
            userAddress.toLowerCase(),
            spendPermission.spender,
            spendPermission.token,
            spendPermission.allowance,
            spendPermission.period,
            spendPermission.start,
            spendPermission.end,
            spendPermission.salt,
            spendPermission.signature,
            now,
          ],
        });
      }

      console.log(`SIP Plan #${planId} saved to database for ${userAddress}`);
    } else {
      console.log("Turso not configured, skipping database save");
      planId = Date.now(); // Use timestamp as fake ID for local testing
    }

    // Return success response
    return NextResponse.json({
      success: true,
      message: "SIP plan created successfully",
      plan: {
        id: planId,
        userAddress: userAddress.toLowerCase(),
        goal,
        monthlyAmount,
        riskLevel,
        strategy: { aave, compound, uniswap },
        aiSpendLimit: aiSpendLimit || "0",
        rebalancing: rebalancing || false,
        active: true,
        totalDeposited: "0",
        createdAt: now,
      },
    });
  } catch (error: any) {
    console.error("Error creating SIP plan:", error);
    return NextResponse.json({ error: error.message || "Failed to create SIP plan" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get("userAddress");
    const planId = searchParams.get("planId");

    if (!userAddress) {
      return NextResponse.json({ error: "userAddress is required" }, { status: 400 });
    }

    // Check if Turso is configured
    if (!isDatabaseConfigured()) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // If planId is provided, get specific plan
    if (planId) {
      const result = await turso.execute({
        sql: `SELECT * FROM sip_plans WHERE id = ? AND user_address = ?`,
        args: [parseInt(planId), userAddress.toLowerCase()],
      });

      if (result.rows.length === 0) {
        return NextResponse.json({ error: "SIP plan not found" }, { status: 404 });
      }

      const row = result.rows[0];
      return NextResponse.json({
        success: true,
        plan: formatPlanRow(row),
      });
    }

    // Get all plans for the user
    const result = await turso.execute({
      sql: `SELECT * FROM sip_plans WHERE user_address = ? ORDER BY created_at DESC`,
      args: [userAddress.toLowerCase()],
    });

    const plans = result.rows.map(formatPlanRow);

    return NextResponse.json({
      success: true,
      plans,
      count: plans.length,
    });
  } catch (error: any) {
    console.error("Error fetching SIP plans:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch SIP plans" }, { status: 500 });
  }
}

// Helper function to format plan row
function formatPlanRow(row: any) {
  return {
    id: row.id as number,
    userAddress: row.user_address as string,
    goal: row.goal as string,
    monthlyAmount: row.monthly_amount as string,
    riskLevel: row.risk_level as string,
    strategy: {
      aave: row.strategy_aave as number,
      compound: row.strategy_compound as number,
      uniswap: row.strategy_uniswap as number,
    },
    aiSpendLimit: row.ai_spend_limit as string,
    rebalancing: Boolean(row.rebalancing),
    active: Boolean(row.active),
    totalDeposited: row.total_deposited as string,
    createdAt: row.created_at as string,
    lastExecution: row.last_execution as string | null,
  };
}
