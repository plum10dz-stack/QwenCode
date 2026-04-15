/**
 * flow/sw/worker.js
 *
 * Service Worker entry point — plain browser ES module, no build step.
 *
 * File layout expected on the server
 * ────────────────────────────────────
 * Place this file (and the whole flow/ folder) at a path your web server
 * can serve statically.  The SW must be served from the same origin as
 * your app.  The simplest layout:
 *
 *   /                        ← web root
 *   ├── index.html
 *   └── flow/
 *       ├── config.js
 *       ├── broadcast.js
 *       ├── types.js
 *       └── sw/
 *           ├── worker.js    ← this file (served at /flow/sw/worker.js)
 *           ├── LocalDB.js
 *           ├── ServerDB.js
 *           └── EventEmitter.js
 *
 * Registration (in your app's main JS):
 *   navigator.serviceWorker.register('/flow/sw/worker.js', { type: 'module' })
 *
 * Browser support:
 *   Module-type Service Workers are supported in Chrome 91+, Edge 91+,
 *   Safari 16.4+, and Firefox 116+.
 *   For older browsers, bundle this file with any ES-module bundler that
 *   produces a single IIFE/UMD script, then register without { type: 'module' }.
 *
 * lastTimeUpdate
 * ──────────────
 * Seeded on every boot by the Orchestrator via SW_INIT (value read from
 * localStorage by the main thread).  Each time the watermark advances,
 * LocalDB broadcasts LAST_UPDATE so the main thread saves it to localStorage,
 * ensuring it survives SW restarts.
 */
import "./src/sw/index";
