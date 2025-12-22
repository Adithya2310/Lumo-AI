/**
 * API Route: Execute SIP (Legacy)
 * POST /api/sip/execute
 *
 * Executes a SIP investment for a user's active plan
 * This route is maintained for backward compatibility.
 * For better control, use /api/sip/execute/[id] instead.
 */
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userAddress, planId } = body;

    if (!userAddress) {
      return NextResponse.json({ error: "userAddress is required" }, { status: 400 });
    }

    // If planId is provided, redirect to the specific execute route
    if (planId) {
      const response = await fetch(new URL(`/api/sip/execute/${planId}`, request.url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    }

    // If no planId, return error asking to specify which plan
    return NextResponse.json(
      {
        error: "Please specify a planId to execute. Use /api/sip/execute/[id] or include planId in the request body.",
        hint: "Fetch user's plans from /api/sip/create?userAddress=... to get available plan IDs",
      },
      { status: 400 },
    );
  } catch (error: any) {
    console.error("Error executing SIP:", error);
    return NextResponse.json({ error: error.message || "Failed to execute SIP" }, { status: 500 });
  }
}
