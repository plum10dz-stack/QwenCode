# StockOS — Data Architecture

## Overview

StockOS uses a **layered, offline-first data architecture** where all data
originates from a remote API server and flows down through a chain of stores
into an in-memory working layer. Every write goes upward through the same
chain before being reflected locally.

```
API Server
    │
    ▼
ServerStore          ← talks to the remote API over HTTP / WebSocket
    │
    ▼
LocalStore           ← persists locally (IndexedDB or SQLite)
(IndexedDBStore
 or SQLiteStore)
    │
    ▼
Memory               ← reactive in-memory tables consumed by the UI
    │
    ▼
Vue Components / Pinia Stores
```

The UI **never talks directly to the server**. It only reads from and writes
to `Memory`. The stores underneath handle synchronisation, conflict
resolution, and offline support transparently.

---

## Goal of the Architecture

| Goal | How it is achieved |
|---|---|
| **Offline-first** | `LocalStore` (IndexedDB / SQLite) mirrors the server. The app works with no network. |
| **Real-time sync** | `ServerStore.onSourceEvent` pushes server-side changes down without polling. |
| **Single source of truth** | Server is authoritative. `LocalStore` is a cache. Conflicts resolve in the server's favour. |
| **Pluggable storage** | `Store` interface is implemented by `ServerStore`, `IndexedDBStore`, and `SQLiteStore`. Swap targets with zero app-logic change. |
| **Optimistic UI** | `Table.newRow()` allocates in memory immediately. `Table.save()` persists server-first, writes locally only on success. |

---

## Interface: `API`

The top-level contract exposed to the rest of the application.

```ts
interface API {
  store: Store;
  // Every server endpoint used by the app is declared here.
  // Makes the server contract explicit and type-safe at compile time.
}
```

**Purpose:** Single entry point for all server communication. Components and
business logic import `API`, never `Store` directly. This keeps the boundary
between UI and infrastructure clean and swappable.

---

## Interface: `Store`

The core abstraction. Every concrete store (server, IndexedDB, SQLite)
implements this interface identically.

```ts
interface Store {
  // Timestamp of the last event successfully received from the server.
  eventDate: Date;

  // Reads/writes the last known update date in localStorage.
  // Used to request only incremental (delta) changes on reconnect.
  get updateDate(): Date;
  set updateDate(value: Date);

  // Event raised whenever the server reports a data change.
  // The application subscribes to keep Memory in sync without polling.
  onSourceEvent(
    callback: (
      event: 'delete' | 'update',
      e: {
        eventTime: Date;
        deletes:  { id: any }[];
        updates:  dataType[];
      }
    ) => void
  ): void;

  // Requests a new unique row ID from the server for a given table.
  // IDs are always server-generated to prevent conflicts across clients.
  async getNewId(tableName: string): Promise<any>;

  // Allocates an empty row object in memory for a given table.
  // Does NOT insert into the database — only prepares the shape.
  async newRow(tableName: string): Promise<void>;

  // Authenticates the current user.
  // The callback is invoked when the server needs additional input
  // (password, email, 2FA code …), keeping the auth flow flexible.
  async auth(
    user: any,
    callback: () => Promise<any>
  ): Promise<boolean>;

  // Pulls all changes from ServerStore into LocalStore.
  // Called once on application startup and again on every reconnection.
  init(): Promise<void>;

  // The local cache store nested inside this store instance.
  //   ServerStore.LocalStore  → IndexedDBStore or SQLiteStore
  //   IndexedDBStore.LocalStore → null  (it IS the local store)
  //   SQLiteStore.LocalStore    → null
  LocalStore: Store | null;
}
```

---

## Class: `ServerStore`

```ts
class ServerStore implements Store {
  // Connected to the remote API server via HTTP REST and/or WebSocket.
  //
  // Responsibilities:
  //   • Translates Store method calls into HTTP requests / WS messages
  //   • Receives server-push events via WebSocket (onSourceEvent)
  //   • Delegates all local persistence to LocalStore
  //   • Keeps updateDate current so init() fetches only deltas
}
```

**Key behaviours:**
- `onSourceEvent` is wired to a **WebSocket channel**. When the server
  broadcasts a change, `ServerStore` processes it, updates `LocalStore`,
  then notifies `Memory`.
- `init()` sends `updateDate` to the server and receives only rows changed
  **after** that timestamp — incremental sync, not a full reload.
- `getNewId()` always hits the server to guarantee uniqueness across all
  connected clients and devices.

---

## Class: `IndexedDBStore`

```ts
class IndexedDBStore extends Store {
  // Connected to the browser's built-in IndexedDB.
  // Used as LocalStore on web and Electron targets.

  readonly LocalStore = null; // Bottom of the chain — no further local store.

  // Implements the full Store interface against IndexedDB object stores.
  // All reads and writes are async and transactional.
}
```

---

## Class: `SQLiteStore`

```ts
class SQLiteStore extends Store {
  // Connected to a SQLite database file.
  // Used as LocalStore on desktop (Tauri) and mobile (Capacitor) targets.

  readonly LocalStore = null;

  // Implements the same Store interface against SQLite tables.
  // Provides stronger query and indexing capabilities than IndexedDB.
}
```

---

## Class: `Table<T>`

Represents one database table inside `Memory`.
Each table owns its row cache and knows how to persist through the chain.

```ts
class Table<T> {
  readonly serverStore: ServerStore;
  readonly name: string;

  private rows: T[];

  // Asks the data source for a new ID, then creates an empty row
  // shape in memory only. Nothing is written to the database.
  async newRow(): Promise<void>;
  // → calls this.serverStore.newRow(this.name)

  // Attempts to persist the row to the server first.
  // Writes locally (this.rows) ONLY after server confirms success.
  // On failure: row is rolled back — no local ghost data.
  async save(row: T): Promise<void>;
  // → calls serverStore.save(row)
  // → on success: this.rows.push(row)
  // → on failure: error propagated, nothing stored locally
}
```

**Design decision:** `save()` is **pessimistic**, not optimistic. The local
cache is only updated after server confirmation. This avoids ghost data when
the network fails mid-write.

---

## Class: `Memory`

The reactive working layer. The UI reads **exclusively** from here.

```ts
class Memory {
  readonly serverStore: ServerStore;
  private tables: Map<string, Table<any>>;

  // Initialises all tables and triggers ServerStore.init()
  // to pull delta updates from the server into LocalStore,
  // then loads LocalStore data into each Table's row cache.
  async init(): Promise<void>;
}
```

**Startup lifecycle:**

```
app starts
  │
  └─► Memory.init()
        │
        ├─► ServerStore.init()
        │     sends updateDate → receives delta rows from server
        │       │
        │       └─► LocalStore.apply(deltas)
        │             writes deltas to IndexedDB / SQLite
        │
        └─► for each table:
              Table.rows = LocalStore.query(tableName)
              (loads from local cache into memory)
              │
              └─► Vue components react to reactive Table.rows
```

After `init()`, `onSourceEvent` keeps everything live in real time.

---

## Complete Data Flow

### Read path  (UI → data)

```
Vue Component
  reads Memory.tables["orders"].rows
  ← always served from local in-memory cache
  ← zero network calls on read
```

### Write path  (user action → server → local)

```
Vue Component calls Table.save(row)
  │
  └─► ServerStore.save(row)       HTTP POST / PUT to API server
        │
        ├── success
        │     LocalStore.save(row)     persist to IndexedDB / SQLite
        │     Table.rows.push(row)     update in-memory cache
        │     Vue components re-render
        │
        └── failure
              error propagated to UI
              nothing written locally
              user prompted to retry
```

### Sync path  (server pushes a change)

```
WebSocket message arrives at ServerStore
  │
  └─► onSourceEvent fires with { event, deletes, updates, eventTime }
        │
        ├─► LocalStore.apply(deletes, updates)
        │     write delta to IndexedDB / SQLite
        │
        └─► Memory updates affected Table.rows
              Vue components re-render reactively
              updateDate = eventTime  (stored in localStorage)
```

---

## Why this architecture?

| Concern | Solution |
|---|---|
| **Network unreliability** | `LocalStore` serves all reads. The app is fully usable offline. |
| **Multi-device consistency** | Server is authoritative. `onSourceEvent` propagates remote changes to every connected client instantly. |
| **Cross-platform deployment** | Swap `IndexedDBStore` ↔ `SQLiteStore` per target. No application-logic change required. |
| **ID collision prevention** | `getNewId()` is always server-side. No UUID collision risk across simultaneous clients. |
| **Efficient reconnection** | `updateDate` means reconnecting after days offline costs only the missed delta, not a full reload. |
| **Testability** | Any class implementing `Store` can be injected as a mock. The UI depends on the interface, never the implementation. |
| **Security** | Auth is centralised in `Store.auth()`. The callback pattern allows MFA, challenge-response, or biometrics without changing the interface. |

---

## Relationship to the current StockOS Pinia stores

The current `stores/db.js` (Pinia + localStorage) is a **simplified prototype**
of this architecture. Migrating to the full architecture means:

1. Replace the Pinia store with a `Memory` instance
2. Implement `ServerStore` pointing at the StockOS API
3. Choose `IndexedDBStore` (web) or `SQLiteStore` (desktop/mobile) as `LocalStore`
4. Replace `localStorage.setItem` calls with `Table.save()` calls
5. Subscribe to `onSourceEvent` instead of calling `persist()` manually

The Vue components require **zero changes** — they continue reading from
reactive table row arrays, regardless of what store implementation sits
underneath.
