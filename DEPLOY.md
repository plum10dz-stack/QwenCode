# StockOS — Deployment Guide

## Prerequisites

```bash
node >= 18
npm >= 9
supabase CLI  (optional — only for backend deployment)
```

---

## 1. Local Development (Offline / IndexedDB only)

No `.env` file needed. All data lives in the browser's IndexedDB.

```bash
cd stockos-vue
npm install
npm run dev        # http://localhost:5173
```

Click **Seed Demo Data** in the sidebar to load sample records.

---

## 2. Local Development with Supabase

### 2a. Start Supabase locally

```bash
supabase start
# output includes: API URL, anon key, service_role key
```

### 2b. Run migrations + seed

```bash
supabase db push          # applies migrations 001–005
# seed.sql runs automatically on supabase db reset
```

### 2c. Deploy edge function locally

```bash
supabase functions serve api   # serves on http://localhost:54321/functions/v1/api
```

### 2d. Configure frontend

Create `.env` (copy from `.env.example`):

```env
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<anon key from supabase start output>
```

```bash
npm run dev
```

---

## 3. Production Deployment

### 3a. Supabase Cloud

1. Create a project at https://app.supabase.com
2. Get your `Project URL` and `anon key` from **Settings → API**
3. Push migrations:

```bash
supabase db push --project-ref <your-project-ref>
```

4. Deploy edge function:

```bash
supabase functions deploy api --project-ref <your-project-ref>
```

5. Set user roles — in **Authentication → Users**, edit a user's metadata:

```json
{ "role": "admin" }
```

or use the Supabase Auth Admin API:

```bash
curl -X PUT "https://<ref>.supabase.co/auth/v1/admin/users/<user-id>" \
  -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json" \
  -d '{"app_metadata": {"role": "admin"}}'
```

---

### 3b. Frontend (Vite build)

Create `.env.production`:

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

Build:

```bash
npm run build      # outputs to dist/
```

Deploy `dist/` to any static host:

| Host | Command |
|---|---|
| **Vercel** | `vercel --prod` |
| **Netlify** | `netlify deploy --dir dist --prod` |
| **Nginx** | copy `dist/` to webroot, add `try_files $uri /index.html` |
| **GitHub Pages** | push `dist/` to `gh-pages` branch |

---

## 4. Roles & Access

| Role | Permissions |
|---|---|
| `admin` | Full CRUD on all tables. Can view audit log. |
| `user` | SELECT + INSERT + UPDATE. Cannot delete movements. |
| *(no role)* | Denied — all requests return 403. |

Set roles via Supabase Dashboard → Authentication → Users → Raw app meta data:

```json
{ "role": "admin" }
```

---

## 5. Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Optional | Supabase project URL. Empty = offline IndexedDB mode. |
| `VITE_SUPABASE_ANON_KEY` | If URL set | Supabase anon (public) key. |
| `VITE_API_URL` | Optional | Custom REST API base URL (alternative to Supabase). |
| `VITE_WS_URL` | Optional | Custom WebSocket URL (used with `VITE_API_URL`). |

Priority: `VITE_SUPABASE_URL` → `VITE_API_URL` → IndexedDB only.

---

## 6. Resetting Data

### Clear IndexedDB (browser)

Open DevTools → Application → IndexedDB → Delete `stockos` database.

### Re-seed demo data

Click **Seed Demo Data** in the sidebar. This clears all existing records first.

### Reset Supabase (local dev)

```bash
supabase db reset   # drops + recreates + runs migrations + seed.sql
```

---

## 7. Edge Function — Single Entry Point

All API calls route through one function:

```
POST /functions/v1/api
{ "fn": "sync" | "new-id" | "row-save" | "row-delete" | "get-rows" | "sign-out", ...params }
```

See `API_CONTRACT.md` for full documentation.

---

## 8. Build Output

```
dist/
├── index.html
├── assets/
│   ├── vendor-[hash].js    (Vue + Pinia + Router)
│   ├── supabase-[hash].js  (@supabase/supabase-js)
│   ├── xlsx-[hash].js      (SheetJS)
│   └── index-[hash].js     (app code)
└── ...
```

Total bundle size (gzipped): ~220 KB without Supabase, ~380 KB with Supabase.

---

## 9. Common Issues

**IndexedDB quota exceeded**  
Clear old data with: `await localStore.clearAll()` in the browser console, or use the browser's DevTools to delete the IndexedDB.

**Supabase RLS blocking all requests**  
Check that the user's `app_metadata.role` is `admin` or `user`. The edge function reads this from the JWT `app_metadata` claim.

**`fn: "sync"` returns empty tables**  
This is expected on first load — the `since` timestamp is `1970-01-01`, so all rows should be returned. If tables are genuinely empty, run `supabase db reset` locally or seed via the sidebar.

**CORS errors in dev**  
Supabase local functions allow all origins by default. If you see CORS errors, check that `supabase start` is running and that `VITE_SUPABASE_URL=http://localhost:54321` (no trailing slash).
