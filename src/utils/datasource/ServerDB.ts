/// <reference path="../../../api/database/types/schema.d.ts" />

import { Datasource } from './Datasource';
import { Row } from '../data';
import { http } from '../networking/http';
import { streamChanges } from '../../workspace/routers/dbStream';


export class ServerDB extends Datasource<Row> {

    // ── Abstract implementations (required by Datasource) ────────────────────

    /**
     * Receives a per-table delta from the poll or stream cycle and emits the
     * 'updates' event so the listener in `sw/init.ts` can apply it to LocalDB.
     *
     * Merges `updates` and `deletes` into a single array where deleted rows
     * carry `deleted: true` — matching the shape LocalDB.applyServerUpdates
     * expects.
     */
    async applyDelta(
        tableName: string,
        delta: { deletes: BaseRow[]; updates: BaseRow[] },
    ): Promise<void> {
        const merged: BaseRow[] = [
            ...delta.updates,
            ...delta.deletes.map(r => ({ ...r, deleted: true } as Row)),
        ];
        if (!merged.length) return;
        this.emit('updates', {
            data: { [tableName]: merged },
            time: Date.now(),
        });
    }

    getNewId(_tableName: string): Promise<any> {
        throw new Error('ServerDB.getNewId: IDs are assigned by the server.');
    }

    newRow<T extends Row = Row>(_tableName: string): Promise<T> {
        throw new Error('ServerDB.newRow: rows originate from the server.');
    }

    auth(_user: any, _callback: () => Promise<void>): Promise<void> {
        throw new Error('ServerDB.auth: use the http auth layer directly.');
    }

    init(): Promise<this> {
        return Promise.resolve(this);
    }

    saveRow<T extends Row = Row>(tableName: string, row: T): Promise<T> {
        return this.create(tableName, row) as Promise<T>;
    }

    deleteRow(tableName: string, id: any): Promise<void> {
        return this.delete(tableName, String(id));
    }

    getAll<T extends Row = Row>(tableName: string): Promise<T[]> {
        return this._post(tableName, 'getAll', {}).then(r => (r.data ?? []) as T[]);
    }

    // ── Private state ─────────────────────────────────────────────────────────

    private _running = false;
    private _postQueue: Promise<any> = Promise.resolve();
    private _streamAbort: AbortController | null = null;
    private _isStreaming = false;

    constructor(readonly API_BASE: string | URL | RequestInfo) {
        super();
    }

    // ── Polling ───────────────────────────────────────────────────────────────

    /**
     * One-shot delta fetch: pull all rows updated since `since` from the
     * server and emit a single 'updates' event so LocalDB can apply them all
     * in one transaction batch.
     *
     * Use this on SW boot (catch-up) and as the polling fallback body.
     */
    async sync(since: Date | number = new Date(0)): Promise<void> {
        const tables = await this.getUpdates(since);
        if (!tables || typeof tables !== 'object') return;
        
        // Check if there are any changes for adaptive polling
        const hasChanges = Object.values(tables as Record<string, Row[]>).some(rows => rows.length > 0);
        
        this.emit('updates', { data: tables as Record<string, Row[]>, time: Date.now() });
        
        // Emit adjustment event for adaptive polling
        this.emit('poll:adjust', hasChanges);
    }

    /**
     * Open the Server-Sent Events stream and block until it closes or is
     * aborted. Each parsed {@link StreamChunk} is turned into an 'updates'
     * event via `applyDelta`.
     *
     * The caller is responsible for reconnect / backoff logic.
     * Call `stopStream()` to abort cleanly from the outside.
     */
    async connectStream(since: Date | number = new Date(0)): Promise<void> {
        if (this._isStreaming) {
            console.warn('[ServerDB] connectStream called while already streaming — ignoring.');
            return;
        }

        const sinceMs = since instanceof Date ? since.getTime() : Number(since || 0);
        this._streamAbort = new AbortController();
        this._isStreaming = true;

        try {
            for await (const chunk of streamChanges(sinceMs, this._streamAbort.signal)) {
                if (!this._isStreaming) break;
                await this.applyDelta(chunk.table, {
                    updates: chunk.rows,
                    deletes: chunk.deletes,
                });
                // Let init.ts persist the server-authoritative timestamp.
                this.emit('stream:tick', { time: chunk.time });
            }
        } finally {
            this._isStreaming = false;
            this._streamAbort = null;
        }
    }

    /**
     * Gracefully abort the active SSE stream.
     * `connectStream` will return (and its finally block cleans up state).
     */
    stopStream(): void {
        this._isStreaming = false;
        this._streamAbort?.abort();
        this._streamAbort = null;
    }

    startPolling(): void {
        if (this._running) return;
        this._running = true;
        this.emit('startPolling');
    }

    stopPolling(): void {
        if (!this._running) return;
        this._running = false;
        this.emit('stopPolling');
    }

    // ── Server API — all POST ─────────────────────────────────────────────────

    /**
     * action: "system.getUpdates"  params: { since: ISO string }
     * Returns Record<tableName, Row[]>
     */
    async getUpdates(since: Date | string | number) {
        const iso =
            since instanceof Date ? since.toISOString() :
                typeof since === 'number' ? new Date(since).toISOString() :
                    since;
        return (await this._post('system', 'getUpdates', { since: iso })).data;
    }

    /** action: "{tableName}.get"  params: { id } */
    async get(tableName: string, id: string) {
        return (await this._post(tableName, 'get', { id })).data;
    }

    /** action: "{tableName}.create"  params: { ...rowData } */
    async create(tableName: string, data: any) {
        return (await this._post(tableName, 'create', data)).data;
    }

    /**
     * action: "{tableName}.update"  params: { id, ...changes }
     * Server merges & bumps updated_at via trigger.
     */
    async update(tableName: string, id: string, changes: any) {
        return (await this._post(tableName, 'update', { id, ...changes })).data;
    }

    /** action: "{tableName}.delete"  params: { id }  — server soft-deletes */
    async delete(tableName: string, id: string): Promise<void> {
        await this._post(tableName, 'delete', { id });
    }

    // ── Internal — thread-safe sequential POST queue ──────────────────────────

    /**
     * All server writes are serialised through a promise chain so concurrent
     * callers never interleave requests on the same connection.
     * Errors are caught on the chain so one failure never blocks future calls.
     */
    _post(tableName: string, method: string, data: any) {
        const task = async () => {
            const action = `${tableName}/${method}`;
            return http.fetch({
                route: action,
                method: 'POST',
                body: JSON.stringify({ action, params: data }),
            });
        };

        const queuedTask = this._postQueue.then(() => task());
        // Swallow the error on the chain to keep future calls unblocked.
        // The error still propagates to the original caller via queuedTask.
        this._postQueue = queuedTask.catch(() => undefined);
        return queuedTask;
    }
}