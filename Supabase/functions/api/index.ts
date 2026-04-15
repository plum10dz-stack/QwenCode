/**
 * StockOS — Single Edge Function Router
 * POST /functions/v1/api
 *
 * All client calls go through this one function.
 * The request body must be JSON with a "fn" field that names the handler.
 *
 * Body shape:
 *   { "fn": "<handler>", ...params }
 *
 * Handlers:
 *   fn: "sync"        { since: string }
 *   fn: "new-id"      { table: string }
 *   fn: "row-save"    { table: string, row: object }
 *   fn: "row-delete"  { table: string, id: string }
 *
 * Auth: every handler requires a valid Supabase JWT.
 *       The JWT is read from the Authorization: Bearer <token> header.
 */

import {
  requireAuth,
  serviceClient,
  anonClient,
  ALLOWED_TABLES,
  json,
  err,
  CORS,
} from "../_shared/auth.ts";

// ── Main dispatcher ──────────────────────────────────────────────────────────
declare var Deno: any;
Deno.serve(async (req: Request) => {
  // Preflight
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return err("Only POST is accepted", 405);

  // ── Auth ───────────────────────────────────────────────────────────────
  const auth = await requireAuth(req);
  if (!auth) return err("Unauthorized", 401);

  // ── Parse body ─────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Request body must be valid JSON");
  }

  const fn = body.fn;
  if (!fn || typeof fn !== "string") return err('Missing required field: "fn"');

  // ── Route to handler ────────────────────────────────────────────────────
  switch (fn) {
    case "sync": return handleSync(auth, body);
    case "new-id": return handleNewId(auth, body);
    case "row-save": return handleRowSave(auth, body);
    case "row-delete": return handleRowDelete(auth, body);
    case "get-rows": return handleGetRows(auth, body);
    case "sign-out": return handleSignOut(auth);
    default: return err(`Unknown function: "${fn}"`, 400);
  }
});

// ── Handler: sync ─────────────────────────────────────────────────────────────
// Params: { fn: "sync", since: string (ISO 8601) }
// Returns: { tables: { [tableName]: { updates, deletes, eventTime } } }
async function handleSync(auth: Awaited<ReturnType<typeof requireAuth>>, body: Record<string, unknown>) {
  const rawSince = body.since ?? "1970-01-01T00:00:00Z";
  if (typeof rawSince !== "string") return err('"since" must be an ISO 8601 string');

  let sinceDate: Date;
  try {
    sinceDate = new Date(rawSince as string);
    if (isNaN(sinceDate.getTime())) throw new Error("invalid date");
  } catch {
    return err('"since" is not a valid ISO 8601 timestamp');
  }

  const svc = serviceClient();

  // Call the get_delta() PG function — runs as service_role
  const { data, error } = await svc.rpc("get_delta", {
    since: sinceDate.toISOString(),
  });

  if (error) {
    console.error("[api:sync] get_delta error:", error.message);
    return err("Database error: " + error.message, 500);
  }

  // Update the caller's sync cursor
  await svc
    .from("sync_cursors")
    .upsert({ user_id: auth!.user.id, last_sync: new Date().toISOString() });

  return json(data);
}

// ── Handler: new-id ───────────────────────────────────────────────────────────
// Params: { fn: "new-id", table: string }
// Returns: { id: string }
async function handleNewId(_auth: unknown, body: Record<string, unknown>) {
  const table = body.table;
  if (!table || typeof table !== "string") return err('Missing field: "table"');
  if (!ALLOWED_TABLES.has(table)) return err(`Unknown table: "${table}"`, 400);

  // Always generate server-side via Postgres for true uniqueness
  const svc = serviceClient();
  const { data, error } = await svc.rpc("generate_uuid");

  if (error || !data) {
    // Deno crypto fallback
    return json({ id: crypto.randomUUID() });
  }

  return json({ id: data });
}

// ── Handler: row-save ─────────────────────────────────────────────────────────
// Params: { fn: "row-save", table: string, row: object }
// Returns: { row: object }  (the saved row as stored in the DB)
async function handleRowSave(auth: Awaited<ReturnType<typeof requireAuth>>, body: Record<string, unknown>) {
  const table = body.table;
  const row = body.row as Record<string, unknown> | undefined;

  if (!table || typeof table !== "string") return err('Missing field: "table"');
  if (!row || typeof row !== "object") return err('Missing field: "row"');
  if (!ALLOWED_TABLES.has(table as string)) return err(`Unknown table: "${table}"`, 400);
  if (!row.id) return err('"row.id" is required');

  const dbTable = toDbTable(table as string);
  const dbRow = sanitizeRow(table as string, row);

  // Use caller's JWT so RLS policies are enforced
  const client = anonClient(auth!.jwt);

  const { data, error } = await client
    .from(dbTable)
    .upsert(dbRow, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    console.error(`[api:row-save] ${table}:`, error.message, error.details);
    if (error.code === "42501") return err("Permission denied by database policy", 403);
    if (error.code === "23505") return err("Duplicate value — record already exists", 409);
    if (error.code === "23503") return err("Foreign key constraint violated", 422);
    return err("Database error: " + error.message, 500);
  }

  return json({ row: data });
}

// ── Handler: row-delete ───────────────────────────────────────────────────────
// Params: { fn: "row-delete", table: string, id: string }
// Returns: { ok: true, id: string }
async function handleRowDelete(auth: Awaited<ReturnType<typeof requireAuth>>, body: Record<string, unknown>) {
  const table = body.table;
  const id = body.id;

  if (!table || typeof table !== "string") return err('Missing field: "table"');
  if (!id || typeof id !== "string") return err('Missing field: "id"');
  if (!ALLOWED_TABLES.has(table as string)) return err(`Unknown table: "${table}"`, 400);

  const dbTable = toDbTable(table as string);

  // Delete using caller's JWT — RLS decides if they can delete this row
  const client = anonClient(auth!.jwt);
  const { error } = await client.from(dbTable).delete().eq("id", id as string);

  if (error) {
    if (error.code === "42501") return err("Permission denied by database policy", 403);
    if (error.code === "23503") return err("Cannot delete — record is referenced by other data", 422);
    return err("Database error: " + error.message, 500);
  }

  // Record in delete_log via service_role so sync delta can propagate the deletion
  const svc = serviceClient();
  await svc.from("delete_log").insert({
    table_name: dbTable,
    row_id: id,
    deleted_by: auth!.user.id,
  });

  return json({ ok: true, id });
}

// ── Handler: get-rows ─────────────────────────────────────────────────────────
// Params: { fn: "get-rows", table: string }
// Returns: { rows: object[] }
// Fetches all rows from a table using the caller's JWT (RLS enforced).
// Used for fresh full-table loads when the client comes back online.
async function handleGetRows(auth: Awaited<ReturnType<typeof requireAuth>>, body: Record<string, unknown>) {
  const table = body.table;
  if (!table || typeof table !== "string") return err('Missing field: "table"');
  if (!ALLOWED_TABLES.has(table as string)) return err(`Unknown table: "${table}"`, 400);

  const dbTable = toDbTable(table as string);
  const client = anonClient(auth!.jwt);

  // Paginate in batches of 1000 to avoid payload limits
  let rows: Record<string, unknown>[] = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await client
      .from(dbTable)
      .select("*")
      .range(from, from + batchSize - 1)
      .order("created_at", { ascending: true });

    if (error) {
      if (error.code === "42501") return err("Permission denied", 403);
      return err("Database error: " + error.message, 500);
    }

    rows = rows.concat(data ?? []);
    if (!data || data.length < batchSize) break;
    from += batchSize;
  }

  return json({ rows });
}

// ── Handler: sign-out ─────────────────────────────────────────────────────────
// Params: { fn: "sign-out" }
// Returns: { ok: true }
// Revokes the user's session server-side via service_role Auth Admin API.
async function handleSignOut(auth: Awaited<ReturnType<typeof requireAuth>>) {
  const svc = serviceClient();
  // Remove session from Supabase Auth — next request will 401
  await svc.auth.admin.signOut(auth!.user.id).catch(() => { });
  return json({ ok: true });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Map frontend camelCase table names → Postgres snake_case table names */
function toDbTable(name: string): string {
  const map: Record<string, string> = {
    categories: "categories",
    suppliers: "suppliers",
    customers: "customers",
    endCustomers: "end_customers",
    products: "products",
    movements: "movements",
    purchaseOrders: "purchase_orders",
    salesOrders: "sales_orders",
    sPayments: "s_payments",
    pPayments: "p_payments",
  };
  return map[name] ?? name;
}

/** Strip frontend-only fields that are not DB columns */
function sanitizeRow(
  _table: string,
  row: Record<string, unknown>
): Record<string, unknown> {
  const clean = { ...row };
  delete clean._id;           // internal Vue key helper
  // Normalise empty timestamp strings to null
  for (const k of ["created_at", "updated_at", "shipped_at", "delivered_at", "received_at", "date_created"]) {
    if (clean[k] === "") clean[k] = null;
  }
  return clean;
}
