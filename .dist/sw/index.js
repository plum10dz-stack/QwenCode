"use strict";
/// <reference types="@types/serviceworker" />
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * src/sw/index.ts — Service Worker entry point (thin shell).
 *
 * All sync / DB / auth orchestration lives in `data-sync.ts`.
 * This file only handles SW lifecycle: install → activate → claim.
 */
const sync_1 = require("./sync");
const utils_1 = require("../utils");
if (!(0, utils_1.isServiceWorker)())
    throw new Error('Not a service worker');
// ── SW lifecycle ──────────────────────────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
    e.waitUntil((0, sync_1.ensureInitialized)());
});
self.addEventListener('message', (e) => {
    var _a;
    if (((_a = e.data) === null || _a === void 0 ? void 0 : _a.type) === 'PING') {
        (0, sync_1.ensureInitialized)().then(() => e.source.postMessage({ type: 'PONG' }));
    }
});
