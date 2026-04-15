# StockOS — Changelog

## Session 1 — Initial Build

### Added
- `AdminOS` single-file app from SQL schema (14 tables)
- `StockOS` single-file ERP with Vue 3 CDN + Tailwind CDN
- Pages: Inventory, Purchase Orders, Clients, Sales Orders
- `SearchableSelect` component (fuzzy / contains / startsWith)
- Settings panel to configure search mode (persisted in localStorage)

---

## Session 2 — Vue 3 Project Rewrite

### Architecture
- Migrated from single HTML file to full Vite + Vue 3 project
- **Tech stack:** Vue 3.4 · Pinia 2 · Vue Router 4 · Vite 5 · Tailwind CSS 3

### Added
- `src/stores/db.js` — Pinia store with all CRUD + seed data
- `src/stores/modal.js` — modal open/close/editData state
- `src/stores/settings.js` — searchMode persistence
- `src/composables/useSort.js`, `usePagination.js`, `useClickOutside.js`
- `src/components/SearchableSelect.vue` — reusable dropdown
- `src/components/AppSidebar.vue`, `AppTopbar.vue`, `SidebarIcon.vue`
- All modal components: Product, Client, Supplier, SO, PO, Adjust, Category, Settings
- All views: Dashboard, Products, Categories, Clients, SalesOrders, PurchaseOrders,
  Suppliers, Movements, Alerts, Analytics

---

## Session 3 — Feature Expansion

### Added
- **Categories:** `{ id, name, abr, ref }` objects with auto-migration from strings
- **End Customers:** full `endCustomers` table + `EndCustomerModal`
- **Payments:** `sPayments` + `pPayments` tables; `SPaymentModal`, `PPaymentModal`
- **`useTableSearch` composable** — applies global `searchMode` to all table searches
- **`upsertSO` / `upsertPO`** — incremental auto-save by `.id`
- **Line locking** — confirmed lines lock product field; `confirmed: boolean`
- **PO number + SO number non-editable** (readonly inputs)
- **POR field** on Purchase Orders (client's reference)
- **TVA configurable** from Settings
- **Product search mode** in Settings: simple inline or advanced popup table
- **`ProductPickerModal`** — full-screen product picker table
- `EndCustomersView`, `SPaymentsView`, `PPaymentsView`, `ClientSituationView`
- **Client Situation report** — 13 range filters + 4 KPI cards + export
- **Export:** CSV, JSON, Excel, HTML, Image, WhatsApp share, Email share
- `utils/export.js` with all export functions
- Updated `AppSidebar` with all new routes + badges

---

## Session 4 — Data Architecture Migration

### Architecture
- Introduced layered offline-first data architecture:
  `ServerStore → LocalStore (IndexedDB/SQLite) → Memory → Pinia → Vue`
- `Store` abstract base class with `eventDate`, `updateDate`, `onSourceEvent`,
  `getNewId`, `newRow`, `auth`, `init`, `saveRow`, `deleteRow`, `getAll`
- `Table<T>` — reactive per-table cache: `rows[]`, `save()`, `delete()`, `find()`
- `Memory` — orchestrates all tables, wires `onSourceEvent → _applyDelta()`
- `IndexedDBStore` — full IDB implementation with `applyDelta()`, `clearAll()`
- `ServerStore` — HTTP REST + WebSocket with IDB as LocalStore
- `SQLiteStore` — stub for desktop/mobile (Tauri/Capacitor)
- `api.js` — singleton factory auto-selecting chain from env vars

### Changed
- `stores/db.js` rewritten as Pinia setup store delegating to `Memory`
- `main.js` now calls `memory.init()` before mounting Vue

---

## Session 5 — Supabase Integration

### Added
- `SupabaseStore` — implements Store via single edge function + Supabase Realtime
- `supabase/migrations/` — 5 SQL migration files:
  - `001_schema.sql` — all 12 tables + audit triggers
  - `002_rls.sql` — restrictive RLS, deny-by-default + `get_my_role()` helper
  - `003_indexes_realtime.sql` — 14 indexes + realtime publication
  - `004_helpers.sql` — placeholder stub
  - `005_rpcs.sql` — `generate_uuid()`, `delete_log`, full `get_delta()` function
- `supabase/functions/api/index.ts` — **single edge function** routing by `fn` param:
  - `fn: "sync"` — delta sync via `get_delta()` RPC
  - `fn: "new-id"` — server-side UUID generation
  - `fn: "row-save"` — upsert with RLS enforcement
  - `fn: "row-delete"` — delete + `delete_log` entry
  - `fn: "get-rows"` — paginated full-table load
  - `fn: "sign-out"` — revoke session via Auth Admin API
- `supabase/functions/_shared/auth.ts` — JWT verification, role extraction,
  `anonClient()`, `serviceClient()`, CORS, `ALLOWED_TABLES`
- `supabase/config.toml`, `supabase/seed.sql`
- `.env.example` documenting all env vars
- `API_CONTRACT.md` — full backend API specification
- `ARCHITECTURE.md` — data layer design document
- `DEPLOY.md` — complete deployment guide

### Changed
- `api.js` auto-selects: `SupabaseStore` → `ServerStore` → `IndexedDB`
- `package.json` adds `@supabase/supabase-js`, `xlsx`
- `vite.config.js` adds `optimizeDeps` + `manualChunks` splitting

---

## Session 6 — Auth + UX Layer

### Added
- `LoginView.vue` — email/password + MFA code form; redirect after login
- `useSupabaseAuth` — reactive `{ user, isAuthenticated, signIn, signOut, restoreSession }`;
  offline mode always authenticated
- Router navigation guard — restores session on reload, redirects to `/login`
- `AppLoader.vue` — animated splash while `memory.init()` runs
- `AppNotifications.vue` — toast container via `<Teleport>` + `TransitionGroup`
- `useNotify` — module-scoped toast bus: `notify.success/error/warn/info(msg)`
- `useAsync` — reactive `{ loading, error, run(fn) }`
- `useConfirm` — `async confirm(msg)` wrapping `window.confirm`
- `useModalSave` — combines `useAsync + useNotify` for modal saves
- `useOnlineStatus` — `{ isOnline, hasBackend, lastSync, syncError }`
- `useTable` — direct `Table` access: `{ rows, save, del, find, newRow }`
- `composables/index.js` barrel export
- Sign-out button in `AppSidebar` with user email display
- `AppTopbar` Live/Local/Offline indicator with last-sync chip
- `ModalShell :saving` prop — disables buttons + shows spinner during async saves
- `ModalManager` — calls `modal.afterClose()` after transition ends
- `App.vue` — login page gets no chrome; FAB hidden on login

### Changed
- **All modals** converted to async: `useModalSave` / `useAsync` + spinner
- **All views** converted from raw `alert()`/`confirm()` to `useNotify`/`useConfirm`
- `main.js` — global Vue error handler + warn handler

---

## Session 7 — Critical Bug Fixes

### Fixed
- **ES module binding caching** — `api.js` exported `let memory` bindings that
  downstream modules cached at import time (before `initApi()` ran). Fixed by
  introducing `getMemory()`, `getServerStore()`, `getLocalStore()` getter functions.
  All callers updated to use getter functions instead of direct bindings.
- **Duplicate import in `EndCustomerModal.vue`** — double `import { useModalSave }` removed
- **Missing `:saving` prop** on `EndCustomerModal`'s `ModalShell`
- **CDN SheetJS import** removed — `export.js` now uses the npm `xlsx` package
- **Unused imports** cleaned up: `fmtDate` in `SalesOrderModal`, `useModalStore` in `DashboardView`
- **`LoginView` `$env` reference** replaced with `import.meta.env.VITE_SUPABASE_URL`
- **`useOnlineStatus`** fixed to use `getServerStore()` instead of stale binding
- **`AppSidebar` seed** uses `notify` instead of raw `alert()`
- `data/index.js` exports `getMemory`, `getServerStore`, `getLocalStore`
- `styles.css` utility class additions: `space-y-2/4/5/8`, margins, `grid-cols-3`, `min-w-0`

---

## File Count Summary

```
src/
  App.vue                          Root layout + keyboard shortcuts
  main.js                          Bootstrap: initApi() → mount
  assets/styles.css                All CSS (vars + components + utilities)
  components/  (11 files)          AppLoader, AppNotifications, AppSidebar,
                                   AppTopbar, SearchableSelect, SidebarIcon,
                                   StatCard, StockBar + modals/
  components/modals/  (15 files)   All modal forms
  composables/  (11 files)         All composables
  data/  (8 files)                 Store layer (api, schema, core/, stores/)
  router/index.js                  15 routes + auth guard
  stores/  (3 files)               db, modal, settings
  utils/  (4 files)                export, helpers, search, index
  views/  (15 files)               All page views

supabase/
  config.toml                      Local dev config
  seed.sql                         Demo data for local Supabase
  functions/api/index.ts           Single edge function (6 handlers)
  functions/_shared/auth.ts        JWT + client helpers
  migrations/  (5 files)           001–005 SQL migrations

Root docs:
  README.md                        Quick start + full project structure
  API_CONTRACT.md                  Backend API specification
  ARCHITECTURE.md                  Data layer design
  DEPLOY.md                        Deployment guide
  CHANGELOG.md                     This file
```
