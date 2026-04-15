/**
 * _shared/auth.ts — shared JWT verification and Supabase client helpers.
 * Used by the unified api/index.ts edge function.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Tables the edge function is allowed to touch — guards against injection */
export const ALLOWED_TABLES = new Set([
  "categories", "suppliers", "customers", "endCustomers", "end_customers",
  "products", "movements", "purchaseOrders", "purchase_orders",
  "salesOrders", "sales_orders", "sPayments", "s_payments",
  "pPayments", "p_payments",
]);

/** Anon client — uses caller's JWT, RLS applies */
export function anonClient(jwt: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
}

/** Service-role client — bypasses RLS; use only after auth */
export function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });
}

/** CORS headers for all responses */
export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Respond with JSON */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** Respond with a JSON error */
export function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export type AuthResult = {
  user: { id: string; email?: string; app_metadata?: Record<string, unknown> };
  role: string;
  jwt: string;
};

/**
 * Verify JWT and return user + role.
 * Returns null if authentication fails.
 */
export async function requireAuth(req: Request): Promise<AuthResult | null> {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const jwt = header.slice(7);
  const client = anonClient(jwt);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const role = (data.user.app_metadata?.role as string) ?? "none";
  return { user: data.user as AuthResult["user"], role, jwt };
}
