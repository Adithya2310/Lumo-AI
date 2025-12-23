/**
 * Cron Job: Rebalancing
 * GET /api/cron/rebalance
 *
 * Triggered by external cron scheduler (e.g., Vercel Cron).
 * Rebalances all plans that have rebalancing enabled.
 */
import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured, turso } from "~~/utils/db/turso";

// Authorization key for cron jobs (set in environment)
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  try {
    // Verify cron authorization if secret is configured
    if (CRON_SECRET) {
      const authHeader = request.headers.get("authorization");
      if (authHeader !== `Bearer ${CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    console.log("🔄 Running rebalancing cron job...");

    // Check if database is configured
    if (!isDatabaseConfigured()) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const now = new Date();

    // Fetch all active plans with rebalancing enabled
    const plansResult = await turso.execute({
      sql: `SELECT sp.* FROM sip_plans sp WHERE sp.active = 1 AND sp.rebalancing = 1`,
      args: [],
    });

    console.log(`📋 Found ${plansResult.rows.length} plans for rebalancing`);

    const results: any[] = [];

    for (const plan of plansResult.rows) {
      const planId = plan.id as number;
      const userAddress = plan.user_address as string;
      const monthlyAmount = plan.monthly_amount as string;
      const riskLevel = plan.risk_level as string;
      const goal = plan.goal as string;

      try {
        const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL
          ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
          : `http://localhost:${process.env.PORT || 3000}`;

        // Step 1: Pay the AI agent (using ETH spend permission)
        const paymentResponse = await fetch(`${baseUrl}/api/agent/pay`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planId,
            userAddress,
            amount: "0.001", // Default agent payment
          }),
        });

        if (!paymentResponse.ok) {
          const paymentError = await paymentResponse.json();
          throw new Error(paymentError.error || "Agent payment failed");
        }

        console.log(`💸 Agent payment successful for plan #${planId}`);

        // Step 2: Get new strategy from AI
        const strategyResponse = await fetch(`${baseUrl}/api/financial-planner`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: parseFloat(monthlyAmount),
            timeHorizon: "1 year", // Default
            riskTolerance: riskLevel.toLowerCase(),
            goal,
          }),
        });

        if (!strategyResponse.ok) {
          const strategyError = await strategyResponse.json();
          throw new Error(strategyError.error || "Strategy generation failed");
        }

        const strategyData = await strategyResponse.json();
        console.log(`🧠 New strategy for plan #${planId}:`, strategyData.strategy);

        // Step 3: Update the plan with new strategy
        await turso.execute({
          sql: `UPDATE sip_plans SET 
                strategy_aave = ?, 
                strategy_compound = ?, 
                strategy_uniswap = ?, 
                updated_at = ? 
                WHERE id = ?`,
          args: [
            strategyData.strategy.aave,
            strategyData.strategy.compound,
            strategyData.strategy.uniswap,
            now.toISOString(),
            planId,
          ],
        });

        results.push({
          planId,
          userAddress,
          success: true,
          newStrategy: strategyData.strategy,
          reasoning: strategyData.reasoning,
        });

        console.log(`✅ Plan #${planId}: Rebalanced successfully`);
      } catch (error: any) {
        results.push({
          planId,
          userAddress,
          success: false,
          message: error.message,
        });
        console.error(`❌ Plan #${planId}: ${error.message}`);
      }
    }

    // Record cron execution
    await turso
      .execute({
        sql: `INSERT INTO cron_executions (job_type, executed_at, plans_processed, status) VALUES (?, ?, ?, ?)`,
        args: ["rebalance", now.toISOString(), results.length, "completed"],
      })
      .catch(() => {
        // Ignore if cron_executions table doesn't exist yet
      });

    return NextResponse.json({
      success: true,
      message: `Rebalanced ${results.filter(r => r.success).length}/${results.length} plans`,
      executedAt: now.toISOString(),
      results,
    });
  } catch (error: any) {
    console.error("Error in rebalancing cron:", error);
    return NextResponse.json({ error: error.message || "Failed to execute cron job" }, { status: 500 });
  }
}
