/**
 * Turso Database Client
 *
 * Uses @libsql/client to connect to Turso (libSQL) database
 * Environment variables:
 * - NEXT_PUBLIC_TURSO_DB_URL: The database URL
 * - NEXT_PUBLIC_TURSO_DB_ACCESS_KEY: The authentication token
 */
import { createClient } from "@libsql/client";

// Create the Turso client
export const turso = createClient({
  url: process.env.NEXT_PUBLIC_TURSO_DB_URL || "",
  authToken: process.env.NEXT_PUBLIC_TURSO_DB_ACCESS_KEY || "",
});

// Initialize database tables if they don't exist
export async function initializeDatabase() {
  try {
    // Create SIP plans table (users can have multiple SIPs)
    await turso.execute(`
            CREATE TABLE IF NOT EXISTS sip_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_address TEXT NOT NULL,
                goal TEXT NOT NULL,
                monthly_amount TEXT NOT NULL,
                risk_level TEXT NOT NULL CHECK(risk_level IN ('low', 'medium', 'high')),
                strategy_aave INTEGER NOT NULL DEFAULT 0,
                strategy_compound INTEGER NOT NULL DEFAULT 0,
                strategy_uniswap INTEGER NOT NULL DEFAULT 0,
                ai_spend_limit TEXT DEFAULT '0',
                rebalancing INTEGER DEFAULT 0,
                active INTEGER DEFAULT 1,
                total_deposited TEXT DEFAULT '0',
                created_at TEXT NOT NULL,
                last_execution TEXT,
                updated_at TEXT NOT NULL
            )
        `);

    // Create index on user_address for faster lookups
    await turso.execute(`
            CREATE INDEX IF NOT EXISTS idx_sip_plans_user_address ON sip_plans(user_address)
        `);

    // Create spend permissions table (linked to specific SIP plans)
    await turso.execute(`
            CREATE TABLE IF NOT EXISTS spend_permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_id INTEGER NOT NULL,
                user_address TEXT NOT NULL,
                spender_address TEXT NOT NULL,
                token TEXT NOT NULL,
                allowance TEXT NOT NULL,
                period INTEGER NOT NULL,
                start_time INTEGER NOT NULL,
                end_time INTEGER NOT NULL,
                salt TEXT NOT NULL,
                signature TEXT NOT NULL,
                revoked INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (plan_id) REFERENCES sip_plans(id)
            )
        `);

    // Create executions history table (linked to specific SIP plans)
    await turso.execute(`
            CREATE TABLE IF NOT EXISTS sip_executions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_id INTEGER NOT NULL,
                user_address TEXT NOT NULL,
                amount TEXT NOT NULL,
                tx_hash TEXT,
                status TEXT NOT NULL CHECK(status IN ('pending', 'success', 'failed')),
                error_message TEXT,
                executed_at TEXT NOT NULL,
                FOREIGN KEY (plan_id) REFERENCES sip_plans(id)
            )
        `);

    console.log("Database tables initialized successfully");
    return true;
  } catch (error) {
    console.error("Failed to initialize database:", error);
    return false;
  }
}

// Helper function to check if database is configured
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURSO_DB_URL && process.env.NEXT_PUBLIC_TURSO_DB_ACCESS_KEY);
}
