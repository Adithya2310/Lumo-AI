/**
 * Financial Planner Service
 * Client-side service for calling the AI financial planner API
 */

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
 * Call the Financial Planner API to get an AI-generated strategy
 * Optionally pays the AI agent first if agentPayment is provided
 */
export async function callFinancialPlanner(request: StrategyRequest): Promise<StrategyResponse> {
  console.log("📊 Calling Financial Planner API...", {
    amount: request.amount,
    riskTolerance: request.riskTolerance,
    hasAgentPayment: !!request.agentPayment,
  });

  try {
    const response = await fetch("/api/financial-planner", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    const data: StrategyResponse = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to get strategy");
    }

    console.log("✅ Strategy received:", data);

    if (data.paymentInfo) {
      console.log("💸 Payment info:", data.paymentInfo);
    }

    return data;
  } catch (error: any) {
    console.error("❌ Financial Planner API error:", error);
    return {
      success: false,
      strategy: { aave: 0, compound: 0, uniswap: 0 },
      error: error.message || "Failed to get strategy",
    };
  }
}
