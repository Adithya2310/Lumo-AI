/**
 * API Route: SIP Plan Actions
 * POST /api/sip/action - Update plan status (pause/resume/cancel)
 *
 * Syncs the database with on-chain state after smart contract actions
 */
import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured, turso } from "~~/utils/db/turso";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { planId, userAddress, action, txHash } = body;

    // Validate required fields
    if (!planId || !userAddress || !action) {
      return NextResponse.json({ error: "Missing required fields: planId, userAddress, action" }, { status: 400 });
    }

    // Validate action type
    if (!["pause", "resume", "cancel"].includes(action)) {
      return NextResponse.json({ error: "Invalid action. Must be: pause, resume, or cancel" }, { status: 400 });
    }

    // Check if database is configured
    if (!isDatabaseConfigured()) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Verify the plan exists and belongs to the user
    const planResult = await turso.execute({
      sql: `SELECT * FROM sip_plans WHERE id = ? AND user_address = ?`,
      args: [planId, userAddress.toLowerCase()],
    });

    if (planResult.rows.length === 0) {
      return NextResponse.json({ error: "Plan not found or access denied" }, { status: 404 });
    }

    const now = new Date().toISOString();
    let newActiveStatus: number;
    let message: string;

    switch (action) {
      case "pause":
        newActiveStatus = 0;
        message = "Plan paused successfully";
        break;
      case "resume":
        newActiveStatus = 1;
        message = "Plan resumed successfully";
        break;
      case "cancel":
        newActiveStatus = 0;
        message = "Plan cancelled successfully";
        break;
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Update the plan status in database
    await turso.execute({
      sql: `UPDATE sip_plans SET active = ?, updated_at = ? WHERE id = ? AND user_address = ?`,
      args: [newActiveStatus, now, planId, userAddress.toLowerCase()],
    });

    // Log the action if we have a transaction hash
    if (txHash) {
      console.log(`[SIP Action] ${action} for plan #${planId}, tx: ${txHash}`);
    }

    return NextResponse.json({
      success: true,
      message,
      plan: {
        id: planId,
        active: newActiveStatus === 1,
        action,
        txHash: txHash || null,
        updatedAt: now,
      },
    });
  } catch (error: any) {
    console.error("Error executing SIP action:", error);
    return NextResponse.json({ error: error.message || "Failed to execute action" }, { status: 500 });
  }
}
