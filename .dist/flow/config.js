"use strict";
/**
 * src/flow/config.js
 *
 * Central configuration for the flow data layer.
 *
 * Plain browser project — no build tool.
 * Edit this file directly to match your server and schema.
 *
 * How to import:
 *   <script type="module">
 *     import { StockOS_CONFIG } from './flow/config.js'
 *   </script>
 *
 * The Service Worker loads this file too (same ES-module import).
 * Make sure the path from sw/worker.js → config.js stays '../config.js'.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TABLE_NAMES = exports.dataEvents = exports.StockOS_CONFIG = exports.DbEvents = void 0;
exports.getIdList = getIdList;
const EventEmitter_1 = require("../utils/EventEmitter");
exports.DbEvents = Object.freeze({
    ROWS_CHANGED: 'rows:changed',
    ROWS_DELETED: 'rows:deleted',
    ROWS_SYNC_STATUS: 'rows:sync-status',
    DB_UPDATED: 'db:updated',
    DB_UPDATE_ERROR: 'db:update-error',
    SYNC_STATUS: 'sync:status',
    CONNECTION: 'connection',
    CMD_RESULT: 'cmd:result',
    PONG: 'pong',
    LAST_UPDATE: 'last:update',
    SW_INIT: 'sw:init',
    AUTH_SET: 'auth:set',
    AUTH_CLEAR: 'auth:clear',
    CMD_CREATE: 'cmd:create',
    CMD_UPDATE: 'cmd:update',
    CMD_DELETE: 'cmd:delete',
    CMD_GET_ALL: 'cmd:get_all',
    CMD_GET: 'cmd:get',
    CMD_GET_BY_INDEX: 'cmd:get_by_index',
    CMD_FLUSH_QUEUE: 'cmd:flush_queue',
    PING: 'ping',
    CMD_GET_ALL_TABLES: 'cmd:get_all_tables',
    GET_ALL_TABLES: 'cmd:get_all_tables',
});
exports.StockOS_CONFIG = {
    // ── API ────────────────────────────────────────────────────────────────────
    /**
     * Base URL of your server API.
     * Leave as '' for same-origin requests (recommended).
     * Set to a full URL only when the API lives on a different origin.
     *
     * Examples:
     *   API_BASE: ''                           → POST /api  (same origin)
     *   API_BASE: 'https://api.example.com'   → POST https://api.example.com/api
     */
    API_BASE: 'https://bgiescpveobbvuhymbrq.supabase.co/functions/v1/Stock',
    /** How often the Service Worker polls the server for updates (milliseconds). */
    POLL_INTERVAL: 5000,
    // ── IndexedDB ──────────────────────────────────────────────────────────────
    /** Name of the IndexedDB database created in the browser. */
    DB_NAME: 'stockos',
    /**
     * Increment this when you add or modify a table / index in TABLES below.
     * The browser will run the onupgradeneeded handler automatically.
     */
    DB_VERSION: 1,
    // ── BroadcastChannel ──────────────────────────────────────────────────────
    /** Channel name shared between the Service Worker and all tabs. */
    BROADCAST_CHANNEL: 'flow-db',
    BROADCAST_CHANNEL_SW: 'flow-db-sw',
    BROADCAST_TABLES: 'tables',
    BROADCAST_DB_EVENTS: 'db-events',
    // ── TABLE SCHEMAS ──────────────────────────────────────────────────────────
    /**
     * IndexedDB object store definitions.
     * Internal tables (_queue) are prefixed with underscore.
     *
     * Every data table implicitly carries these runtime columns:
     *   id          UUID string   — primary key
     *   updated_at  ISO string    — set by server trigger on every write
     *   deleted     boolean       — soft-delete flag
     *   syncStatus  string        — 'pending' | 'syncing' | 'synced' | 'error'
     */
    TABLES: {
        customers: {
            name: 'customers',
            keyPath: 'id',
            lists: ['customers'],
            indexes: [
                { name: '#updated_at', keyPath: 'updated_at' },
                { name: 'deleted', keyPath: 'deleted' },
            ],
            locally: true,
            id_list: (_row) => ['customers'],
        },
        end_customers: {
            name: 'end_customers',
            keyPath: 'id',
            lists: ['end_customers'],
            indexes: [
                { name: 'updated_at', keyPath: 'updated_at' },
            ],
            locally: true,
            id_list: (_row) => ['end_customers'],
        },
        suppliers: {
            name: 'suppliers',
            keyPath: 'id',
            lists: ['suppliers'],
            indexes: [
                { name: '#updated_at', keyPath: 'updated_at' },
            ],
            locally: true,
            id_list: (_row) => ['suppliers'],
        },
        categories: {
            name: 'categories',
            keyPath: 'id',
            lists: ['categories'],
            indexes: [
                { name: '#updated_at', keyPath: 'updated_at' },
            ],
            locally: true,
            id_list: (_row) => ['categories'],
        },
        products: {
            name: 'products',
            keyPath: 'id',
            lists: ['products'],
            indexes: [
                { name: 'sku', keyPath: 'sku', unique: true },
                { name: 'supplier_id', keyPath: 'supplier_id' },
                { name: '#updated_at', keyPath: 'updated_at' },
            ],
            locally: true,
            id_list: (_row) => ['products'],
        },
        movements: {
            name: 'movements',
            keyPath: 'id',
            lists: ['movements'],
            indexes: [
                { name: 'product_id', keyPath: 'product_id' },
                { name: '#updated_at', keyPath: 'updated_at' },
            ],
            locally: false,
            id_list: (row) => ['movements', row.product_id ? `movements_${row.product_id}` : null].filter(Boolean),
        },
        purchase_orders: {
            name: 'purchase_orders',
            keyPath: 'id',
            indexes: [
                { name: 'supplier_id', keyPath: 'supplier_id' },
                { name: '#updated_at', keyPath: 'updated_at' },
            ],
            locally: true,
            id_list: (row) => ['purchase_orders', row.supplier_id ? `purchase_orders_${row.supplier_id}` : null,].filter(Boolean),
        },
        sales_orders: {
            name: 'sales_orders',
            keyPath: 'id',
            indexes: [
                { name: 'customer_id', keyPath: 'customer_id' },
                { name: '#updated_at', keyPath: 'updated_at' },
            ],
            locally: true,
            id_list: (row) => ['sales_orders', row.customer_id ? `sales_orders_${row.customer_id}` : null, row.customer_id ? `sales_orders_${row.customer_id}` : null,].filter(Boolean),
        },
        order_lines: {
            name: 'order_lines',
            keyPath: 'id',
            indexes: [
                { name: 'order_id', keyPath: 'order_id' },
                { name: '#updated_at', keyPath: 'updated_at' },
            ],
            locally: false,
            id_list: (row) => ['order_lines', row.order_id ? `items_${row.order_id}` : null,].filter(Boolean),
        },
        s_payments: {
            name: 's_payments',
            keyPath: 'id',
            indexes: [
                { name: 'customer_id', keyPath: 'customer_id' },
                { name: 'order_id', keyPath: 'order_id' },
                { name: '#updated_at', keyPath: 'updated_at' },
            ],
            locally: false,
            id_list: (row) => ['payments', row.customer_id ? `payments_${row.customer_id}` : null, row.order_id ? `payments_${row.order_id}` : null,].filter(Boolean),
        },
        p_payments: {
            name: 'p_payments',
            keyPath: 'id',
            indexes: [
                { name: 'supplier_id', keyPath: 'supplier_id' },
                { name: 'order_id', keyPath: 'order_id' },
                { name: '#updated_at', keyPath: 'updated_at' },
            ],
            locally: false,
            id_list: (row) => ['payments', row.supplier_id ? `payments_${row.supplier_id}` : null, row.order_id ? `payments_${row.order_id}` : null,].filter(Boolean),
        },
        // ── Internal ──────────────────────────────────────────────────────────
        _queue: {
            name: '_queue',
            keyPath: 'id',
            indexes: [
                { name: 'status', keyPath: 'status' },
                { name: '#updated_at', keyPath: 'updated_at' },
                { name: 'tableName', keyPath: 'tableName' },
            ],
            id_list: (_row) => ['_queue'],
        },
    }
};
/**
 *
 * @param {string} tableName
 * @param {Row} row
 * @returns {Readonly<string[]>}
 */
function getIdList(tableName, row) {
    const fn = exports.StockOS_CONFIG.TABLES[tableName].id_list;
    return fn ? fn(row) : [tableName];
}
exports.dataEvents = new EventEmitter_1.EventEmitter();
exports.TABLE_NAMES = Object.keys(exports.StockOS_CONFIG.TABLES);
