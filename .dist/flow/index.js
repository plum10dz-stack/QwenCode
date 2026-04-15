"use strict";
/**
 * flow/index.js
 *
 * Public barrel export for the flow data layer.
 * Plain browser ES module — no build step required.
 *
 * Usage in an HTML page:
 *   <script type="module">
 *     import { Orchestrator, Table, ObjectGarbage, Row, ROW, EVT } from './flow/index.js'
 *   </script>
 *
 * The Service Worker imports directly from sub-modules (it is a separate
 * module scope and cannot share this barrel):
 *   import { LocalDB }  from './utils/LocalDB.js'    // relative inside sw/
 *   import { ServerDB } from './utils/ServerDB.js'
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventEmitter = exports.ServerDB = exports.LocalDB = exports.StockOS_CONFIG = exports.QUEUE_ENTRY_STATUS = exports.QUEUE_OP = exports.SYNC_STATUS = exports.sendCommand = exports.EVT = exports.Table = exports.ROW = exports.Row = exports.ObjectGarbage = void 0;
// ── Main-thread classes ────────────────────────────────────────────────────
//export { Table } from '../data/core/Table'
var ObjectGarbage_1 = require("../utils/ObjectGarbage");
Object.defineProperty(exports, "ObjectGarbage", { enumerable: true, get: function () { return ObjectGarbage_1.ObjectGarbage; } });
var Row_1 = require("../utils/data/Row");
Object.defineProperty(exports, "Row", { enumerable: true, get: function () { return Row_1.Row; } });
Object.defineProperty(exports, "ROW", { enumerable: true, get: function () { return Row_1.ROW; } });
var Table_1 = require("../utils/data/Table");
Object.defineProperty(exports, "Table", { enumerable: true, get: function () { return Table_1.Table; } });
// ── BroadcastChannel helpers ──────────────────────────────────────────────
var broadcast_1 = require("../utils/channels/broadcast");
Object.defineProperty(exports, "EVT", { enumerable: true, get: function () { return broadcast_1.DbEvents; } });
Object.defineProperty(exports, "sendCommand", { enumerable: true, get: function () { return broadcast_1.sendCommand; } });
// ── Constants ─────────────────────────────────────────────────────────────
var types_1 = require("./types");
Object.defineProperty(exports, "SYNC_STATUS", { enumerable: true, get: function () { return types_1.SYNC_STATUS; } });
Object.defineProperty(exports, "QUEUE_OP", { enumerable: true, get: function () { return types_1.QUEUE_OP; } });
Object.defineProperty(exports, "QUEUE_ENTRY_STATUS", { enumerable: true, get: function () { return types_1.QUEUE_ENTRY_STATUS; } });
// ── Config ────────────────────────────────────────────────────────────────
var config_1 = require("./config");
Object.defineProperty(exports, "StockOS_CONFIG", { enumerable: true, get: function () { return config_1.StockOS_CONFIG; } });
// ── Low-level classes (advanced use / testing) ────────────────────────────
var LocalDB_1 = require("../utils/datasource/LocalDB");
Object.defineProperty(exports, "LocalDB", { enumerable: true, get: function () { return LocalDB_1.LocalDB; } });
var ServerDB_1 = require("../utils/datasource/ServerDB");
Object.defineProperty(exports, "ServerDB", { enumerable: true, get: function () { return ServerDB_1.ServerDB; } });
var EventEmitter_1 = require("../utils/EventEmitter");
Object.defineProperty(exports, "EventEmitter", { enumerable: true, get: function () { return EventEmitter_1.EventEmitter; } });
