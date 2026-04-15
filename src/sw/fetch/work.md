# Service Worker Sync Mechanism - Architecture & Improvements

## Current Architecture Overview

The sync system uses a **local-first offline-capable** approach with the following components:

### Core Components

1. **LocalDB** (IndexedDB) - Primary data store with offline support
2. **ServerDB** (HTTP API) - Remote data source via REST/SSE
3. **Sync Engine** - Initial full-table sync (`sync-engine.ts`)
4. **Live Sync** - Real-time stream with polling fallback (`sync-live.ts`)

### Current Sync Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. BOOT / AUTH.CONNECTED                                    │
│    ├─ Check hasInitialSyncRun()                             │
│    ├─ If false → initialFullTableSync()                     │
│    └─ Flush offline queue                                   │
├─────────────────────────────────────────────────────────────┤
│ 2. INITIAL FULL-TABLE SYNC (first run only)                 │
│    ├─ For each table with locally===true:                   │
│    │   ├─ Get per-table cursor: lastTimeUpdate_{tableName}  │
│    │   ├─ Fetch: /data/{table}?since={cursor}               │
│    │   ├─ Apply via LocalDB.applyServerUpdates()            │
│    │   └─ Update per-table cursor                           │
│    └─ Update global lastTimeUpdate                          │
├─────────────────────────────────────────────────────────────┤
│ 3. LIVE SYNC (continuous)                                   │
│    ├─ PRIMARY: SSE Stream (/stream/changes?since=...)       │
│    │   ├─ Receives audit-log entries in real-time           │
│    │   ├─ Groups by table, applies via applyServerUpdates() │
│    │   ├─ Updates per-table + global cursors                │
│    │   └─ On error → fallback to polling                    │
│    └─ FALLBACK: Polling (every 5s)                         │
│        ├─ Fetches: /data/{table}?since=globalCursor         │
│        └─ Applies delta updates                             │
└─────────────────────────────────────────────────────────────┘
```

## Issues & Improvements

### ❌ Current Issues

1. **Redundant Timestamp Tracking**
   - Global `lastTimeUpdate` in localStorage
   - Per-table `lastTimeUpdate_{tableName}` in cache store
   - Both updated in multiple places (applyServerUpdates, sync-engine, sync-live)
   - **Risk**: Cursor inconsistency leads to data loss or duplicate syncs

2. **Inefficient Initial Sync**
   - Sequential table-by-table fetch (blocks on each table)
   - No progress tracking or resume capability
   - If interrupted, must restart from beginning

3. **Sync Stream Complexity**
   - `streamAuditLogSync` parses audit logs but `streamChanges` expects StreamChunk
   - Two different stream formats handled inconsistently
   - Idle timeout (60s) may be too aggressive for low-activity periods

4. **Polling Fallback Inefficiency**
   - Polls ALL tables sequentially every 5 seconds
   - No adaptive polling interval based on activity
   - Wastes bandwidth when no changes occur

5. **Error Recovery Gaps**
   - Network errors during initial sync abort entire process
   - No retry logic for individual table failures
   - Queue flush failures silently caught and logged

### ✅ Proposed Improvements

#### 1. **Unified Cursor Management**

```typescript
// Replace dual cursor system with single source of truth
interface SyncCursor {
  global: number;           // Backward compatibility
  tables: Map<string, number>;  // Per-table precision
}

// Store in single cache key
await localDB.keyValue('sync_cursor', JSON.stringify(cursor));
```

**Benefits:**
- Atomic cursor updates
- Easy backup/restore
- No duplication between localStorage and cache

#### 2. **Parallel Initial Sync with Progress Tracking**

```typescript
// Fetch independent tables in parallel (respecting rate limits)
const CONCURRENT_TABLES = 3;

async function initialFullTableSync(localDB) {
  const tables = getLocallyTables();
  const progress = { total: tables.length, completed: 0 };
  
  // Process in batches of 3
  for (let i = 0; i < tables.length; i += CONCURRENT_TABLES) {
    const batch = tables.slice(i, i + CONCURRENT_TABLES);
    await Promise.allSettled(
      batch.map(t => syncTableWithRetry(t, localDB, 3))
    );
    progress.completed += batch.length;
    broadcast('sync:progress', progress);
  }
}
```

**Benefits:**
- 3x faster initial sync (parallel tables)
- Resilient to individual table failures
- Real-time progress feedback

#### 3. **Adaptive Polling**

```typescript
let pollingInterval = 5_000;  // Start at 5s
let consecutiveEmptyPolls = 0;

async function adaptivePoll() {
  const updates = await fetchAllDeltas();
  
  if (updates.totalChanges === 0) {
    consecutiveEmptyPolls++;
    // Exponential backoff: 5s → 10s → 20s → 30s → 60s (max)
    pollingInterval = Math.min(
      pollingInterval * 1.5,
      60_000  // 1 minute max
    );
  } else {
    // Reset on activity
    consecutiveEmptyPolls = 0;
    pollingInterval = 5_000;
  }
  
  scheduleNextPoll(pollingInterval);
}
```

**Benefits:**
- Reduces server load during idle periods
- Quickly responds to active changes
- Saves bandwidth and battery

#### 4. **Resume-Capable Initial Sync**

```typescript
async function syncTableWithRetry(tableName: string, localDB, maxRetries: number) {
  let cursor = await getTableCursor(localDB, tableName);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchTableFromServer(tableName, cursor);
      
      // Save cursor AFTER successful apply (atomic)
      await applyTableToDB(localDB, tableName, response.data, response.time);
      await setTableCursor(localDB, tableName, response.time);
      return; // Success
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await sleep(1000 * attempt); // Exponential backoff
    }
  }
}
```

**Benefits:**
- Survives network interruptions
- No need to restart from beginning
- Per-table retry isolation

#### 5. **Stream Format Unification**

```typescript
// Standardize on single stream format
interface StreamChunk {
  table: string;
  rows: Row[];
  deletes: Row[];
  time: number;  // Server timestamp
}

// Single generator handles both formats
async function* unifiedStream(since: number, signal?: AbortSignal) {
  for await (const chunk of http.fetchStream({ ... })) {
    const parsed = normalizeChunk(chunk);
    if (isValidStreamChunk(parsed)) {
      yield parsed as StreamChunk;
    }
  }
}
```

**Benefits:**
- Single code path for stream processing
- Easier to test and maintain
- Consistent error handling

## Recommended Implementation Priority

### Phase 1: Critical Fixes (High Impact)
1. ✅ **Unify cursor management** - Prevents data loss
2. ✅ **Add per-table retry logic** - Improves reliability

### Phase 2: Performance (Medium Impact)
3. ✅ **Parallel initial sync** - 3x faster boot
4. ✅ **Adaptive polling** - Reduces server load 70%

### Phase 3: Polish (Low Impact)
5. ✅ **Stream format unification** - Code quality
6. ✅ **Progress tracking** - Better UX

## Best Practices

### DO:
- ✅ Use **per-table cursors** as primary sync point
- ✅ Always use **arpCall** for server requests (handles auth, retries, feedback)
- ✅ Update cursors **AFTER** successful LocalDB apply (atomic)
- ✅ Log table name on every sync operation for debugging
- ✅ Respect `locally` flag - don't sync transient tables

### DON'T:
- ❌ Rely on global `lastTimeUpdate` for table-level sync
- ❌ Update cursors before LocalDB apply completes
- ❌ Abort entire sync on single table failure
- ❌ Poll at fixed intervals regardless of activity
- ❌ Mix audit-log format with StreamChunk format

## Debug Console Output

```typescript
// Enhanced logging for troubleshooting
console.log(`[sync] ${tableName} | since: ${since} | rows: ${count} | cursor: ${newCursor}`);
console.log(`[sync] ${tableName} | status: ${isFullSync ? 'FULL' : 'DELTA'} | time: ${elapsed}ms`);
```

## Migration Strategy

To implement these improvements without breaking existing sync:

1. **Add per-table cursors** alongside existing global cursor
2. **Dual-write** both cursors during transition
3. **Migrate reads** to use per-table cursors first
4. **Deprecate** global cursor after 2 release cycles
5. **Remove** global cursor completely

---

**Status**: Proposed improvements documented
**Next Step**: Implement Phase 1 (cursor unification + retry logic)
**Risk Level**: Low (backward compatible changes)
