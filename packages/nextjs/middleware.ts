/**
 * Next.js Middleware for x402 Payment Protocol
 *
 * Now uses Spend Permissions for payment - the API route handles payment
 * execution via CDP SDK. Middleware just logs and passes through.
 */
import { NextRequest, NextResponse } from "next/server";

// x402 Protected Routes Configuration
const X402_ROUTES: Record<string, { price: string; description: string }> = {
  "/api/x402-financial-planner": {
    price: "0.001 USDC",
    description: "AI-powered DeFi investment strategy generation",
  },
};

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Check if this is an x402 protected route
  const routeConfig = X402_ROUTES[path];
  if (!routeConfig) {
    return NextResponse.next();
  }

  console.log(`🔒 x402 Middleware: ${request.method} ${path}`);

  // For POST requests, allow through - payment is handled via spend permission in API route
  // The API route will use CDP SDK to execute the spend permission payment
  if (request.method === "POST") {
    console.log("✅ POST request - allowing through for spend permission payment");
    return NextResponse.next();
  }

  // For other methods (GET, OPTIONS, etc.), just pass through
  return NextResponse.next();
}

// Only run middleware on x402 protected routes
export const config = {
  matcher: ["/api/x402-financial-planner"],
};
