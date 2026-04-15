# StockOS — Backend API Contract

## Single Endpoint

All client-to-server communication goes through **one edge function**:

```
POST https://<project>.supabase.co/functions/v1/api
Authorization: Bearer <supabase-jwt>
Content-Type: application/json
apikey: <supabase-anon-key>

{ "fn": "<handler>", ...params }
```

The `fn` field selects the handler. All other fields are the handler parameters.

---

## Handlers

### `fn: "sync"`
Pull all rows changed since a given timestamp across all tables.

**Request body:**
```json
{ "fn": "sync", "since": "2025-01-01T00:00:00Z" }
```

**Response:**
```json
{
  "tables": {
    "products": {
      "eventTime": "2025-04-01T10:00:00.000Z",
      "updates": [{ "id": "…", "name": "Laptop", "…": "…" }],
      "deletes": [{ "id": "old-uuid" }]
    },
    "salesOrders": { "eventTime": "…", "updates": [], "deletes": [] }
  }
}
```
Only tables with changes are included. Deletes are sourced from `delete_log`.

---

### `fn: "new-id"`
Get a server-generated UUID for a table.

**Request body:**
```json
{ "fn": "new-id", "table": "products" }
```

**Response:**
```json
{ "id": "uuid-v4-string" }
```

---

### `fn: "row-save"`
Upsert a row. RLS policies are enforced using the caller's JWT.

**Request body:**
```json
{
  "fn": "row-save",
  "table": "salesOrders",
  "row": { "id": "uuid", "so_number": "SO-0001", "…": "…" }
}
```

**Response:**
```json
{ "row": { "id": "uuid", "so_number": "SO-0001", "updated_at": "…", "…": "…" } }
```

**Errors:**
- `403` — RLS policy denied the operation
- `409` — unique constraint violation
- `422` — foreign key constraint violated

---

### `fn: "row-delete"`
Delete a row. RLS policies are enforced. Records the deletion in `delete_log`.

**Request body:**
```json
{ "fn": "row-delete", "table": "clients", "id": "uuid" }
```

**Response:**
```json
{ "ok": true, "id": "uuid" }
```

**Errors:**
- `403` — RLS policy denied the operation
- `422` — record is referenced by other rows (FK constraint)

---

### `fn: "get-rows"`
Fetch all rows from a table (paginated in batches of 1000). Used for a fresh full-table load when coming back online.

**Request body:**
```json
{ "fn": "get-rows", "table": "products" }
```

**Response:**
```json
{ "rows": [ { "id": "…", "…": "…" } ] }
```

---

### `fn: "sign-out"`
Revoke the caller's Supabase session server-side.

**Request body:**
```json
{ "fn": "sign-out" }
```

**Response:**
```json
{ "ok": true }
```

---

## Allowed Table Names

Frontend uses camelCase; the edge function maps to DB snake_case internally:

| Frontend (`fn` param) | Database table |
|---|---|
| `categories` | `categories` |
| `suppliers` | `suppliers` |
| `clients` | `clients` |
| `endCustomers` | `end_customers` |
| `products` | `products` |
| `movements` | `movements` |
| `purchaseOrders` | `purchase_orders` |
| `salesOrders` | `sales_orders` |
| `sPayments` | `s_payments` |
| `pPayments` | `p_payments` |

Any other table name returns `400 Unknown table`.

---

## Realtime (Supabase Postgres Changes)

The client subscribes to all tables via `supabase.channel('stockos-realtime')`.  
The server emits a Postgres Changes event on every INSERT / UPDATE / DELETE.

**Event shape received by the client:**
```js
{
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  new: { /* row object */ },   // null on DELETE
  old: { /* row object */ },   // id only on INSERT
  table: 'products',
  schema: 'public'
}
```

The client's `SupabaseStore._handleRealtimeEvent()` maps these to `Memory._onDelta()`.

---

## Authentication

All requests require a valid Supabase JWT in the `Authorization: Bearer` header.  
The edge function calls `auth.getUser()` on every request; expired or missing tokens return `401`.

User roles are read from `app_metadata.role`:
- `admin` — full access (SELECT + INSERT + UPDATE + DELETE on all tables)
- `user` — SELECT + INSERT + UPDATE; no DELETE on movements
- anything else — denied (default RLS deny policy)

Roles are set via the Supabase Dashboard → Authentication → Users → Edit user metadata, or via the Auth Admin API.
