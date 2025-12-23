/**
 * Cron Job: SIP Execution
 * GET /api/cron/sip-execute
 *
 * Triggered by external cron scheduler (e.g., Vercel Cron).
 * Executes all active SIP plans that are due for execution.
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

    console.log("⏰ Running SIP execution cron job...");

    // Check if database is configured
    if (!isDatabaseConfigured()) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const now = new Date();

    // Fetch all active SIP plans with their spend permission periods
    // A plan is due for execution if:
    // 1. It has never been executed (last_execution IS NULL), OR
    // 2. The time since last execution is greater than the permission period
    const plansResult = await turso.execute({
      sql: `SELECT sp.*, 
            sperm.period as permission_period,
            sperm.signature as permission_signature
            FROM sip_plans sp 
            LEFT JOIN spend_permissions sperm 
            ON sperm.plan_id = sp.id AND sperm.permission_type = 'sip' AND sperm.revoked = 0
            WHERE sp.active = 1 
            AND (
                sp.last_execution IS NULL 
                OR datetime(sp.last_execution, '+' || COALESCE(sperm.period, 2592000) || ' seconds') <= datetime('now')
            )`,
      args: [],
    });

    console.log(`📋 Found ${plansResult.rows.length} plans due for execution`);

    const results: any[] = [];

    for (const plan of plansResult.rows) {
      const planId = plan.id as number;
      const userAddress = plan.user_address as string;

      try {
        // Call the SIP execution endpoint
        const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL
          ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
          : `http://localhost:${process.env.PORT || 3000}`;

        const response = await fetch(`${baseUrl}/api/sip/execute/${planId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        const data = await response.json();

        results.push({
          planId,
          userAddress,
          success: response.ok,
          message: response.ok ? "Executed successfully" : data.error,
        });

        console.log(`✅ Plan #${planId}: ${response.ok ? "Success" : data.error}`);
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
        args: ["sip-execute", now.toISOString(), results.length, "completed"],
      })
      .catch(() => {
        // Ignore if cron_executions table doesn't exist yet
      });

    return NextResponse.json({
      success: true,
      message: `Processed ${results.length} SIP plans`,
      executedAt: now.toISOString(),
      results,
    });
  } catch (error: any) {
    console.error("Error in SIP execution cron:", error);
    return NextResponse.json({ error: error.message || "Failed to execute cron job" }, { status: 500 });
  }
}
