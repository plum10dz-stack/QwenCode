# StockOS Solution Architecture Diagram

## System Overview

```mermaid
graph TB
    subgraph "Client Layer"
        UI[Vue Components]
        Pinia[Pinia Stores]
        Router[Vue Router]
    end

    subgraph "Data Layer"
        Memory[Memory - In-Memory Tables]
        Table[Table<T> Row Cache]
    end

    subgraph "Store Chain"
        ServerStore[ServerStore<br/>HTTP/WebSocket]
        LocalStore[LocalStore<br/>IndexedDB/SQLite]
    end

    subgraph "External Services"
        API[Remote API Server]
        Supabase[(Supabase)]
    end

    UI -->|reads| Memory
    UI -->|writes| Table
    Pinia --> Memory
    Router --> UI

    Memory -->|contains| Table
    Table -->|save| ServerStore
    Table -->|newRow| ServerStore

    ServerStore -->|HTTP REST| API
    ServerStore -->|WebSocket| API
    ServerStore -->|delegates| LocalStore

    LocalStore -->|persists| IndexedDB[(IndexedDB)]
    LocalStore -->|persists| SQLite[(SQLite)]

    API -->|syncs| Supabase
    ServerStore -->|onSourceEvent| Memory
```

---

## Data Flow Diagrams

### Read Path (Zero Network Calls)

```mermaid
sequenceDiagram
    participant Vue as Vue Component
    participant Mem as Memory
    participant Table as Table.rows

    Vue->>Mem: Access table data
    Mem->>Table: Get rows from cache
    Table-->>Vue: Return data (instant)
    Note over Vue,Table: No network calls on read
```

### Write Path (Server-First, Pessimistic)

```mermaid
sequenceDiagram
    participant Vue as Vue Component
    participant Table as Table.save()
    participant Server as ServerStore
    participant API as Remote API
    participant Local as LocalStore
    participant Cache as Table.rows

    Vue->>Table: save(row)
    Table->>Server: HTTP POST/PUT
    Server->>API: Send request
    API-->>Server: Success/Failure

    alt Success
        Server->>Local: Persist row
        Server->>Cache: Push to rows[]
        Cache-->>Vue: Re-render
    else Failure
        Server-->>Table: Error
        Table-->>Vue: Show error, retry
        Note over Local,Cache: Nothing written locally
    end
```

### Real-Time Sync Path (Server Push)

```mermaid
sequenceDiagram
    participant API as Remote API
    participant WS as WebSocket
    participant Server as ServerStore
    participant Local as LocalStore
    participant Mem as Memory
    participant Vue as Vue Components

    API->>WS: Broadcast change
    WS->>Server: onSourceEvent fires
    Server->>Local: Apply deletes/updates
    Server->>Mem: Update table rows
    Mem->>Vue: Reactively re-render
    Server->>Server: Store updateDate
```

---

## Application Startup Flow

```mermaid
sequenceDiagram
    participant App as App Start
    participant Mem as Memory.init()
    participant Server as ServerStore.init()
    participant Local as LocalStore
    participant Table as Table.rows
    participant Vue as Vue Components

    App->>Mem: Initialize
    Mem->>Server: Send updateDate
    Server->>Local: Pull delta rows from server
    Local->>Local: Apply deltas to IndexedDB/SQLite

    loop For each table
        Mem->>Local: Query table name
        Local-->>Table: Load rows into memory
        Table->>Vue: Components react to data
    end

    Note over Mem,Vue: After init, onSourceEvent keeps live
```

---

## Store Interface Contract

```mermaid
classDiagram
    class Store {
        <<interface>>
        +Date eventDate
        +Date updateDate
        +onSourceEvent(callback)
        +getNewId(tableName) Promise
        +newRow(tableName) Promise
        +auth(user, callback) Promise
        +init() Promise
        +Store LocalStore
    }

    class ServerStore {
        HTTP/WebSocket connection
        updateDate in localStorage
        WebSocket event handling
        init() fetches deltas
    }

    class IndexedDBStore {
        Browser IndexedDB
        LocalStore = null
        Async transactions
    }

    class SQLiteStore {
        SQLite file database
        LocalStore = null
        Stronger query/indexing
    }

    Store <|.. ServerStore : implements
    Store <|.. IndexedDBStore : extends
    Store <|.. SQLiteStore : extends
    ServerStore o-- "1" LocalStore : delegates to
```

---

## Technology Stack

```mermaid
pie showData
    title StockOS Tech Stack
    "Vue 3.5" : 25
    "Vite 8.0" : 15
    "Pinia 3.0" : 10
    "Vue Router 5.0" : 10
    "Supabase JS" : 15
    "Tailwind CSS 4.2" : 10
    "TypeScript" : 10
    "XLSX" : 5
```

---

## Project Structure

```
d:\SOS\
├── src/                          # Main source directory
│   ├── components/               # Vue components
│   ├── composables/              # Vue composition functions
│   ├── router/                   # Vue Router configuration
│   ├── stores/                   # Pinia stores (current prototype)
│   ├── sw/                       # Service Worker files
│   ├── utils/                    # Utility functions & channels
│   ├── views/                    # Page views
│   ├── web/                      # Web-specific code
│   ├── workspace/                # Workspace modules
│   ├── App.vue                   # Root component
│   ├── main.ts                   # Application entry point
│   ├── index.ts                  # Module exports
│   └── help.ts                   # Helper functions
├── api/                          # Backend API server
├── Supabase/                     # Supabase configuration
├── assets/                       # Static assets
├── dist/                         # Production build output
├── node_modules/                 # Dependencies
├── package.json                  # Project configuration
├── vite.config.js                # Vite build configuration
├── tsconfig.json                 # TypeScript configuration ⚠️ (has bugs)
├── tailwind.config.js            # Tailwind CSS config
├── postcss.config.js             # PostCSS config
├── manifest.json                 # Web app manifest
├── index.html                    # HTML entry point
└── worker.js                     # Web Worker
```

---

## Known Build Issues

### From build.log:
```
TypeError: manualChunks is not a function
  at rolldown/dist/shared/rolldown-build
```

**Root Cause:** The `manualChunks` option in `vite.config.js` is defined as an **object**, but the build tool (rolldown) expects a **function**.

**Current (incorrect):**
```js
manualChunks: {
  supabase: ['@supabase/supabase-js'],
  xlsx: ['xlsx'],
  vendor: ['vue', 'vue-router', 'pinia'],
}
```

**Should be (function):**
```js
manualChunks(id) {
  if (id.includes('node_modules')) {
    if (id.includes('@supabase')) return 'supabase';
    if (id.includes('xlsx')) return 'xlsx';
    if (id.includes('vue') || id.includes('pinia') || id.includes('vue-router')) return 'vendor';
  }
}
```

---

## Migration Path (Current → Target Architecture)

```mermaid
graph LR
    subgraph "Current State"
        A[Pinia Stores + localStorage]
    end

    subgraph "Target State"
        B[Memory Instance]
        C[ServerStore]
        D[IndexedDBStore/SQLiteStore]
        E[Table.save]
    end

    A -->|1. Replace Pinia with Memory| B
    B -->|2. Implement ServerStore| C
    C -->|3. Choose LocalStore| D
    D -->|4. Replace localStorage.setItem| E
    E -->|5. Subscribe to onSourceEvent| F[Zero component changes needed]

    Note: Vue components require ZERO changes
```

---

## Summary

| Item | Status | Notes |
|------|--------|-------|
| tsconfig.json | ❌ Has Bugs | Trailing comma, duplicate lib entries, invalid path mapping |
| vite.config.js manualChunks | ❌ Has Bug | Object type instead of function |
| Architecture Design | ✅ Documented | Offline-first, layered store pattern |
| Vue Components | ✅ Ready | Zero changes needed for migration |
| Pinia → Memory Migration | 🔄 Planned | 5-step migration path defined |
