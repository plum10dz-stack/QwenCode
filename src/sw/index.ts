/// <reference types="@types/serviceworker" />

/**
 * src/sw/index.ts — Service Worker entry point (thin shell).
 *
 * All sync / DB / auth orchestration lives in `data-sync.ts`.
 * This file only handles SW lifecycle: install → activate → claim.
 */

import { ensureInitialized } from './sync';
import { isServiceWorker } from '../utils';

if (!isServiceWorker()) throw new Error('Not a service worker');
declare const self: ServiceWorkerGlobalScope;

// ── SW lifecycle ──────────────────────────────────────────────────────────────

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e: ExtendableEvent) => {
    e.waitUntil(ensureInitialized());
});

self.addEventListener('message', (e: ExtendableMessageEvent) => {
    if (e.data?.type === 'PING') {
        ensureInitialized().then(() =>
            (e.source as Client).postMessage({ type: 'PONG' }),
        );
    }
});
