# StockOS — Vue 3 ERP

A professional ERP system for Algerian SMEs (DZD currency).  
Fully offline-first. No backend required to run — uses IndexedDB as local storage.  
Ready to connect to a REST + WebSocket API when deployed.

---

## Quick Start

```bash
cd stockos-vue
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → dist/
```

Click **"Seed Demo Data"** in the sidebar to populate with sample records.

---

## Tech Stack

| Layer       | Technology |
|-------------|-----------|
| Framework   | Vue 3 — Composition API + `<script setup>` |
| State       | Pinia 2 (setup store) |
| Routing     | Vue Router 4 (hash history) |
| Styling     | Tailwind CSS 3 + CSS custom properties |
| Build       | Vite 5 |
| Local store | IndexedDB (`src/data/stores/IndexedDBStore.js`) |
| Remote sync | HTTP REST + WebSocket (`src/data/stores/ServerStore.js`) |

---

## Environment Variables

Copy `.env.example` to `.env`:

```
VITE_API_URL=        # leave empty for offline-only mode
VITE_WS_URL=         # leave empty to disable live push
```

When `VITE_API_URL` is set the app syncs with the backend on startup and
receives live changes over WebSocket. When empty, it runs entirely from
IndexedDB — no network calls.

---

## Project Structure

```
stockos-vue/
├── .env.example               Environment variable template
├── API_CONTRACT.md            Backend API spec (endpoints + WebSocket format)
├── ARCHITECTURE.md            Full data-layer design document
│
├── src/
│   ├── main.js                Bootstrap: memory.init() → mount App
│   ├── App.vue                Root layout, keyboard shortcuts, FAB, notifications
│   │
│   ├── data/                  ── Data Layer ──────────────────────────────────
│   │   ├── schema.js          All table definitions (name, keyPath, indexes)
│   │   ├── api.js             Singleton factory: ServerStore → IndexedDBStore → Memory
│   │   ├── index.js           Public barrel export
│   │   ├── core/
│   │   │   ├── Store.js       Abstract base class (interface)
│   │   │   ├── Table.js       Reactive Table<T>: rows[], save(), delete(), find()
│   │   │   └── Memory.js      Orchestrator: creates tables, wires onSourceEvent
│   │   └── stores/
│   │       ├── IndexedDBStore.js  Browser IndexedDB (web/Electron target)
│   │       ├── ServerStore.js     HTTP + WebSocket (production target)
│   │       └── SQLiteStore.js     SQLite stub (desktop/mobile target)
│   │
│   ├── stores/                ── Pinia Stores ─────────────────────────────────
│   │   ├── db.js              Adapter: exposes Memory.table().rows + all actions
│   │   ├── modal.js           Modal open/close/editData state
│   │   └── settings.js        searchMode, defaultTva, productSearchMode
│   │
│   ├── router/index.js        15 routes (lazy-loaded views, hash history)
│   │
│   ├── composables/           ── Shared Logic ──────────────────────────────────
│   │   ├── useAsync.js        Wrap async fn with reactive loading + error
│   │   ├── useClickOutside.js Close dropdowns on outside click
│   │   ├── useConfirm.js      Async confirm() wrapper (swappable for modal)
│   │   ├── useModalSave.js    useAsync + useNotify combined for modal saves
│   │   ├── useNotify.js       Module-scoped toast bus: notify.success/error/info/warn
│   │   ├── useOnlineStatus.js Reactive isOnline, hasApi, lastSync
│   │   ├── usePagination.js   page, totalPages, paginated, prev, next
│   │   ├── useSort.js         setSort, sortIcon, applySortToArray
│   │   ├── useTable.js        Direct Table access: rows, save, del, find, newRow
│   │   └── useTableSearch.js  Text search using settings.searchMode algorithm
│   │
│   ├── components/            ── Reusable Components ───────────────────────────
│   │   ├── AppLoader.vue      Splash shown while memory.init() runs
│   │   ├── AppNotifications.vue  Toast container (Teleport, TransitionGroup)
│   │   ├── AppSidebar.vue     Navigation with badges, chips, all routes
│   │   ├── AppTopbar.vue      Title, Live/Offline badge, last-sync chip
│   │   ├── SearchableSelect.vue  Reusable dropdown: fuzzy/contains/startsWith
│   │   ├── SidebarIcon.vue    SVG icon map (16 icons)
│   │   ├── StatCard.vue       KPI card shell
│   │   └── StockBar.vue       Horizontal progress bar
│   │
│   ├── components/modals/     ── Modal Forms ───────────────────────────────────
│   │   ├── ModalManager.vue   Dynamic router: modal.type → component
│   │   ├── ModalShell.vue     Shared chrome: header, footer, :saving spinner
│   │   ├── ProductModal.vue
│   │   ├── CategoryModal.vue  name + ABR + ref code
│   │   ├── ClientModal.vue
│   │   ├── EndCustomerModal.vue
│   │   ├── SupplierModal.vue
│   │   ├── SalesOrderModal.vue   Auto-save, line confirm/lock, Enter flow
│   │   ├── PurchaseOrderModal.vue  POR field, same patterns
│   │   ├── AdjustModal.vue    Stock in/out/adjustment
│   │   ├── SPaymentModal.vue  Sales payment with balance display
│   │   ├── PPaymentModal.vue  Purchase payment with balance display
│   │   ├── ProductPickerModal.vue  Full product table (advanced search mode)
│   │   └── SettingsModal.vue  TVA %, search mode, product search mode
│   │
│   ├── utils/
│   │   ├── export.js          CSV, JSON, Excel, HTML, Image, WhatsApp, Email
│   │   ├── helpers.js         uuid, now, fmtNum, fmtDate, seq generators
│   │   └── search.js          fuzzy, contains, startsWith algorithms
│   │
│   └── views/                 ── Pages ────────────────────────────────────────
│       ├── DashboardView.vue
│       ├── ClientsView.vue
│       ├── EndCustomersView.vue
│       ├── SalesOrdersView.vue    Export toolbar, payment badge, share
│       ├── SPaymentsView.vue
│       ├── ProductsView.vue
│       ├── CategoriesView.vue     ABR + ref display
│       ├── MovementsView.vue
│       ├── PurchaseOrdersView.vue  POR column, export toolbar
│       ├── PPaymentsView.vue
│       ├── SuppliersView.vue
│       ├── AlertsView.vue
│       ├── AnalyticsView.vue
│       └── ClientSituationView.vue  13-filter report + KPIs + export
```

---

## Data Architecture

```
API Server (optional)
      │  HTTP REST + WebSocket
      ▼
ServerStore          ← src/data/stores/ServerStore.js
      │  applyDelta()
      ▼
IndexedDBStore       ← src/data/stores/IndexedDBStore.js
      │  getAll()
      ▼
Memory               ← src/data/core/Memory.js
  table('products').rows  ← Vue reactive[]
  table('orders').rows    ← Vue reactive[]
  …
      │  read directly
      ▼
Vue Components / Pinia db store
```

**Read path:** components read from `memory.table(name).rows` — always from
the local cache, zero network calls.

**Write path:** `Table.save(row)` → `ServerStore.saveRow()` → local IndexedDB
on success → `Table.rows` updated reactively.

**Live sync:** WebSocket message → `ServerStore._emit()` → `Memory._onDelta()`
→ `Table._applyDelta()` → Vue re-renders.

See `ARCHITECTURE.md` for full documentation and `API_CONTRACT.md` for the
backend API specification.

---

## Features

### Sales
- **Clients** — CRUD, status filter, click-through to orders
- **End Customers** — final beneficiaries linked to orders
- **Sales Orders** — line items, auto-save, Enter-key flow, line locking,
  Ship → Deliver workflow, payment tracking, export + WhatsApp/Email share
- **Sales Payments** — payment ledger with remaining balance display

### Inventory
- **Products** — sortable, category/stock filters, stock bars
- **Categories** — name + ABR abbreviation + reference code
- **Movements** — full ledger with before/after quantities

### Procurement
- **Suppliers** — linked product and PO counts
- **Purchase Orders** — POR field, line items, one-click Receive, payment tracking
- **Purchase Payments** — payment ledger with remaining balance display

### Reports
- **Client Situation** — 13-parameter filter (client, end customer, payment
  status, date ranges, total range, lines range, paid range) + KPI cards
- **Analytics** — movement breakdown, inventory health, top clients, top moved products

### UX
- **SearchableSelect** — every dropdown searchable: fuzzy / contains / starts-with
- **Configurable TVA** — set once in Settings, applied to every new order
- **Product Search Mode** — simple inline dropdown or advanced full-table picker
- **Toast notifications** — success / error / warn / info for every action
- **Async save with spinner** — no more fire-and-forget; buttons disable while saving
- **Keyboard shortcuts** — `N` new record, `Esc` close modal
- **Auto-save on orders** — header saved to DB as soon as client/supplier is chosen
- **Line locking** — confirmed lines lock the product field; unlock to edit or delete
- **Export** — CSV, JSON, Excel (SheetJS), HTML, Image (html2canvas)
- **Share** — WhatsApp and Email with formatted order summary

---

## Keyboard Shortcuts

| Key    | Action |
|--------|--------|
| `N`    | Open "New" modal for current page |
| `Esc`  | Close any open modal |
| `↑↓`  | Navigate SearchableSelect dropdown |
| `Enter`| Select focused option / confirm line |

---

## Settings

Open **Settings** from the sidebar bottom:

| Setting | Options |
|---------|---------|
| **Default TVA** | Any % — applied to every new order |
| **Product Search Mode** | Simple (inline dropdown) · Advanced (full table picker) |
| **Dropdown Algorithm** | Contains · Fuzzy · Starts With |

All settings are persisted in `localStorage`.
"# QwenCode" 
