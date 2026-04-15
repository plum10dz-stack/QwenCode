The user wants me to implement the entire data sync system based on the coding map. Let me read all the relevant files carefully before writing any code, then implement everything in the correct order as specified in the checklist.


Let me review what I need:


src/workspace/types.ts - Add StreamChunk + DeltaPayload interfaces


src/utils/datasource/ServerDB.ts - Full refactor


src/workspace/routers/dbStream.ts - Promote to full module


src/utils/datasource/LocalDB.ts - Harden applyServerUpdates + flushQueue


src/sw/init.ts - Wire stream:tick, initial sync, setAuth export


src/sw/index.ts - startLiveSync implementation


I've already reviewed the core files, so now I need to wire up the service worker initialization to handle the stream tick events and coordinate the initial sync, then implement the live sync orchestration in the main service worker index.


For the implementation plan, I'm starting with src/workspace/types.ts to define the stream chunk and delta payload interfaces, then moving to ServerDB.ts where I need to implement the applyDelta method to match the abstract signature and emit updates, plus add the streaming state management fields and implement the sync and connect methods.


Next I'll finish the ServerDB implementation by adding the sync method that uses streamChanges from the database stream module, implementing stopStream to handle cleanup, fixing the getUpdates serialization issue, and removing the unused sleep function.


Then I'm replacing the stub in src/workspace/routers/dbStream.ts with a clean streamChanges export, adding guards in LocalDB.ts to prevent applying server updates locally and to check network connectivity before flushing the queue, and updating the service worker initialization to listen for stream ticks, call serverDB.sync() at startup, and export the setAuth function.


Finally, in the service worker index file, I need to import setAuth, trigger sync on boot, implement startLiveSync to coordinate the streaming, and wire up the queue flushing to fire when authentication connects and when the browser comes back online.


Now I'm thinking through the production-quality requirements: all async operations need proper error handling with try-catch blocks, the SSE reconnection should use exponential backoff with jitter and a maximum delay cap, stream cleanup needs to be handled correctly, and I need to be careful with the locally flag since it's optional on the table schema—checking schema?.locally !== false accounts for undefined values that represent internal tables like _queue that shouldn't sync from the server.


Actually, looking at the _queue table definition, it doesn't have a locally field at all, so the filter should just be schema.locally === true to only sync tables explicitly marked for syncing.


For the applyDelta implementation in ServerDB, I'm implementing the abstract method from the base class to merge the incoming deletes and updates...


Implementing the delta merge logic...


For connectStream, I'll leverage the existing streamChanges function from dbStream.ts, and then I need to handle SSE reconnection with exponential backoff in the service worker, setting up the backoff constants and logic.


Now I'm implementing the reconnection handler that stops polling, fetches the last sync timestamp, connects to the stream, and falls back to polling if the connection closes—then waits with exponential backoff and jitter before retrying.


I need to be careful about auth state though. The SSE stream should only attempt to connect when the user is authenticated, so I should check if auth is set before starting the reconnect loop. Rather than over-complicating this, I'll keep the implementation straightforward and ensure startLiveSync only kicks off the SSE connection when auth is already established.


Looking at the existing auth event system in the service worker, I can hook into AUTH.CONNECTED and AUTH.DISCONNECTED to manage the SSE lifecycle properly. Now I'll write out the actual implementation, starting with how LocalDB.applyServerUpdates handles the different table types from the config. I can break out of the for-await loop when needed, and the generator's finally block will clean up the reader lock, but the underlying fetch might still be pending. To properly handle this in production, I should add an signal field to the request interface so AbortController can be passed through to the fetch call in fetchStream.


Now I'm mapping out the full set of changes needed across the codebase: adding the stream-related types to the types file, updating the request interface and fetch calls to support abort signals, and then rewriting the ServerDB class to manage the abort controller and stream lifecycle properly. Now I'm wiring up the service worker to handle authentication and queue flushing, then I'll implement the HTTP layer changes to support abort signals for streaming requests.


Adding type definitions for stream chunks and delta payloads...


Now I'm setting up the ServerDB class to handle table-level deltas from the polling and streaming cycle, merging updates and deletes together...


Implementing the remaining abstract methods... Finishing the getAll method by posting to the server and extracting the data, then setting up private state for managing the connection queue and streaming with an abort controller. The constructor initializes the API base URL and sets up the promise queue for sequential requests. Now I'm looking at the polling mechanism that fetches delta updates from the server since a given timestamp. LocalDB.applyServerUpdates can run. *


@param since - The epoch ms or Date of the last known sync point. */ async sync(since: Date | number = new Date(0)): Promise { const tables = await this.getUpdates(since); if (!tables || typeof tables !== 'object') return; // tables is Record<tableName, Row[]> — emit in one shot this.emit('updates', { data: tables, time: Date.now() }); }
/**


Open a Server-Sent Events stream. Blocks until the stream closes.
Parse each newline-delimited JSON chunk as a StreamChunk and call
applyDelta per table. Emits 'stream:tick' on each successful chunk
so init.ts can persist
Setting up the stream connection with an abort controller, then iterating through incoming changes and applying deltas to each table while emitting tick events to track progress. Writing API methods... I'm queuing the POST request with an action string and params, ensuring errors don't break the chain by catching and re-throwing from the queued task. Now I'm setting up the SSE stream handler to connect to the changes endpoint...


Building the stream parser... I'm laying out the remaining changes needed across several files—adding offline guards to LocalDB, setting up stream listeners and auth exports in the service worker, and implementing the full live sync. I need to make sure the http.ts request interface includes a signal field for abort control, then pass it through to the fetch calls.


Now I'm ready to execute all these changes in dependency order, starting with the type definitions, then updating http.ts for signal support, building out the new dbStream implementation, and continuing through the service worker files.


I need to be careful with the LocalDB.applyServerUpdates method though—the table names coming from the server are strings, but my TABLES configuration uses typed keys, so I'll need to handle that type casting properly when checking the schema.


For the Service Worker context, navigator.onLine should work fine in modern browsers, so I don't need to overthink that part. Now I'm setting up the backoff strategy for startLiveSync in the Service Worker...


Implementing exponential backoff with initial and max delays... Writing the reconnection logic...


Now I'm setting up the initialization sequence—loading the environment and database, then fetching any updates that happened while the service worker was offline. After that, I'll start the live sync with SSE and set up event listeners to handle authentication state changes, flushing any queued writes when the connection comes back online.


But looking at the existing sw/index.ts code, I see there's already an ensureInitialized function and a setupServiceWorker call that I need to integrate with rather than replace entirely. I need to import setAuth from the init module and make sure it's exported. Now I'm setting up the _boot function which initializes both the local and server databases, then sets up event listeners to handle server updates and apply them to the local database.


The key changes are removing the automatic serverDB.startPolling() call since SSE is now the primary mechanism, adding a listener for the stream:tick event, and making sure an initial sync happens. I'm also noticing that setLastTimeUpdate gets called in the updates handler, so I need to check if that's being duplicated elsewhere.


Looking at the code flow, applyServerUpdates already calls setLastTimeUpdate internally, so the explicit call in the handler with payload.time is redundant—I'm passing 0 as the time parameter but then setting the actual time separately afterward, which defeats the purpose.


The fix is straightforward: pass payload.time directly to applyServerUpdates instead of 0, eliminating the redundant second call. Now I'm thinking about the stream:tick handler—it's emitted by ServerDB.connectStream with the chunk timestamp, but applyDelta already emits updates which triggers the handler, so stream:tick might be unnecessary here.


Actually, there's a key difference: if a chunk gets filtered out (like a non-local table), the updates event won't fire, but stream:tick still advances lastTimeUpdate. Though looking at the flow more carefully, setLastTimeUpdate is called at the end of applyServerUpdates regardless of filtering, so stream:tick might be redundant after all.


But I'm noticing another issue — applyDelta uses Date.now() for the timestamp instead of the actual chunk time, so I need to make sure stream:tick passes the chunk's original timestamp, not the current time.


Emitting stream:tick with the chunk time...


The real problem is that lastTimeUpdate becomes the since parameter we send back to the server, and if we're mixing client time with server time due to clock skew, we could end up requesting the wrong data. I should use the server's timestamp consistently for accuracy.


Let me restructure this: applyDelta will accept an optional time parameter, and in connectStream I'll emit a stream:tick event with the chunk's actual timestamp. Then the stream:tick handler in init.ts will call setLastTimeUpdate with that server time, while the updates handler either skips the time update or ignores a zero value.


But wait, I need to update the abstract method signature in Datasource.ts to include the optional time parameter, otherwise the implementation won't match the interface.


Actually, let me think through the timing more carefully for production. The server sends chunks with a timestamp representing the latest updated_at in that batch, and the client should use that server time for the next sync request to avoid clock skew issues—if I used Date.now() instead and the clocks are misaligned, I'd either re-fetch data I already have or miss new rows entirely. So the server time needs to flow through to the sync logic.


The cleanest approach is to keep applyDelta focused on just the data transformation, and let connectStream handle passing the server timestamp through to whatever manages the sync state.


Refining the implementation...


Still writing implementation... I'm realizing this is getting too complicated with all the time-handling logic scattered around. Let me step back and simplify: the updates event should always include the time (either from the chunk or current timestamp), and applyServerUpdates should consistently update the time without worrying about special cases in applyDelta. I'm settling on a cleaner approach: applyDelta emits updates with the current timestamp for immediate writes, while connectStream sends a separate tick event with the server's authoritative time that gets stored as lastTimeUpdate, and the polling path handles its own time updates through the same mechanism.


Refactoring the applyDelta signature... I'm verifying that TypeScript allows the concrete implementation to have an optional time parameter even though the abstract method doesn't define it—since optional parameters don't violate the contract and callers using the abstract type would just pass the required arguments. Now I need to check what the LocalDB.applyServerUpdates signature expects so I can wire everything together correctly. The issue is that when time = 0, it gets converted to the epoch, which is wrong. I need to make sure the updates handler passes the actual timestamp from the payload—either Date.now() from the polling sync or chunk.time from the server-sent events—so setLastTimeUpdate receives the correct value and doesn't default to epoch. This keeps the flow consistent without double-setting or race conditions.


Now I'm reconsidering whether stream:tick is even necessary. With the corrected flow where applyDelta emits updates with the server's timestamp and the handler passes that directly to applyServerUpdates, lastTimeUpdate gets set correctly without needing an extra tick event.


Even for locally-false tables, applyServerUpdates will skip applying the data but still update the timestamp, so the updates handler covers all cases. I can remove stream:tick entirely and keep the design clean.


Now I'm ready to write out all the implementation files with this finalized approach. For sw/index.ts, I need to add setAuth to the imports from ./init and keep the existing main(DB.localDB, DB.serverDB) call intact.


Now I'm checking the cache object store that gets created in _open() — it's not part of StockOS_CONFIG.TABLES, but the keyValue method explicitly uses it for transactions, so it needs to be initialized separately, which it already is.


Looking at the applyDelta method signature...


The LocalDB implementation directly applies deletes and updates to IndexedDB without any filtering, handling the transaction lifecycle and resolving or rejecting based on completion, whereas applyServerUpdates serves a different purpose.


I'm realizing there's a bug in applyServerUpdates — it's not checking the locally attribute when filtering rows, so it would incorrectly process data marked as local-only changes.


Now I need to write out all the production code, organizing the file edits by their dependencies: types.ts and http.ts can go first since they're independent, then LocalDB.ts and dbStream.ts, followed by ServerDB.ts, and finally init.ts and index.ts.


Looking at LocalDB.ts, I need to make two surgical changes: add a locally guard in applyServerUpdates around line 141 to prevent writing server data when offline, and add a navigator.onLine check in flushQueue to avoid sending updates when there's no connection. I'm realizing the stream parsing needs to handle both SSE format with the data: prefix and plain NDJSON, so I'll strip that prefix when present before parsing each chunk as JSON. Now let me map out all the file changes systematically and implement them.


For src/sw/index.ts, I need to restructure the init() function and add helper methods for starting the live sync and sleeping, while importing setAuth from the init module. In src/sw/init.ts, I'm fixing the timestamp passed to applyServerUpdates, removing the redundant update call, adding a stream:tick handler to the event listener, and keeping the polling as a fallback while SSE takes over once it starts.


The key design decision is keeping startPolling in the boot sequence as the initial state, then letting the live sync manager in index.ts handle switching between SSE and polling—when SSE connects it stops polling, and when it disconnects it resumes polling. I also need to export the setAuth function from init.


ts so that auth state can be managed externally.


For the implementation, polling is already safe to run continuously since _tick() gates on auth being set, so it won't actually sync anything until auth is ready. The live sync should follow the same pattern—start polling immediately but only initiate SSE once auth is connected, since auth events fire later and we don't want to attempt SSE before credentials are available.

ts so that auth state can be managed externally.


For the implementation, polling is already safe to run continuously since _tick() gates on auth being set, so it won't actually sync anything until auth is ready. The live sync should follow the same pattern—start polling immediately but only initiate SSE once auth is connected, since auth events fire later and we don't want to attempt SSE before credentials are available. I see the AUTH.CONNECTED handler is currently empty, so I'll wire up the SSE start there. My plan is to initialize the database first, then handle the auth lifecycle — when auth connects, start the SSE and flush any queued changes; when it disconnects, stop the stream. The tricky part is that the initial sync catch-up also needs authentication, so it can't happen before auth is established.


Setting up the handler to gate everything on auth...


Now I'm finalizing the implementation plan and writing out the complete service worker setup with proper initialization, backoff logic for retries, and the live sync mechanism. After the auth connection, I'm flushing any queued offline writes to the server, then starting the live sync mechanism. When auth disconnects, I stop the live sync. For network events, I'm also flushing the queue when coming back online and resuming live sync if it's not already running.


Now I'm setting up the live sync function with exponential backoff retry logic, starting by disabling polling since SSE is the primary sync method, then fetching the last update timestamp from the local database.


Implementing SSE connection with fallback to polling... Setting up the service worker event handlers to manage installation, activation, and incoming messages from clients.


Now I'm reviewing the changes needed in the init file — I need to pass the actual timestamp to applyServerUpdates instead of hardcoding zero, remove the duplicate time update call, and stop starting polling in the boot function since the index file now controls that lifecycle. But if I remove the polling start from boot, it won't kick off until the auth connection succeeds and SSE starts, which means if SSE fails there's a fallback to polling. Let me think through whether that ordering actually works...


Actually, keeping startPolling() in boot as a safe default makes more sense — it'll just no-op until auth is true anyway, and then the live sync handler can stop it when SSE connects and restart it if SSE drops. That's cleaner than relying on the auth event firing at the right time.


Updating the init file now...


Looking at the actual code structure more carefully, I need to trace through where the updates handler is and what changes are needed there. I need to adjust the implementation—passing the timestamp directly through applyServerUpdates instead of making a separate database call, and actually I can skip the stream:tick handler entirely since the time flows through the delta application now. Let me reconsider...


OK let me be definitive:


Design A (no stream:tick):


applyDelta(tableName, delta, time?) — takes optional time
connectStream calls applyDelta(table, delta, chunk.time)
applyDelta emits updates with { data, time: time ?? Date.now() }
updates handler calls applyServerUpdates(data, payload.time)
applyServerUpdates sets lastTimeUpdate
Pros: Simple, single event path Cons: Datasource.abstract applyDelta signature has two params, adding a third (even optional) requires abstract change in Datasource.ts


Design B (with stream:tick):


applyDelta(tableName, delta) — matches abstract exactly
connectStream calls applyDelta(table, delta) then emits 'stream:tick'
applyDelta emits updates with { data, time: Date.now() }
updates handler calls applyServerUpdates(data, payload.time) — updates lastTimeUpdate to (approximate) now
stream:tick handler calls setLastTimeUpdate(chunk.time) — may rollback if chunk.time < Date.now()
Cons: Double update, potential rollback issue


Design C (cleanest):


applyDelta matches abstract exactly: (tableName, delta) - doesn't deal with time at all, emits time=0
connectStream calls applyDelta AND updates time separately via stream:tick
updates handler calls applyServerUpdates(data, payload.time) — updates lastTimeUpdate to approximate now
stream:tick handler calls setLastTimeUpdate(chunk.time) — may rollback if chunk.time < Date.now()
Design C keeps the abstract signature clean while handling timing through a separate event, avoiding the double-update problem of Design B. stream:tick handler only advances time, never rolls back, so I need to add a guard to setLastTimeUpdate that checks if the new time is actually greater than what's stored. For simplicity, I'll just make the update conditional on that check.


Actually, a cleaner approach: let the updates handler skip time management entirely and only let stream:tick and sync handle time updates. This way there


