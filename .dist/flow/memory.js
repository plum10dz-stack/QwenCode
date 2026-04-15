"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTable = getTable;
const broadcast_1 = require("../utils/channels/broadcast");
const Table_1 = require("../utils/data/Table");
const ObjectGarbage_1 = require("../utils/ObjectGarbage");
const data_1 = require("../utils/data");
const helpers_1 = require("../utils/helpers");
let _isConnected = false;
let _lastUpdate = 0;
(0, broadcast_1.listen)((data) => __awaiter(void 0, void 0, void 0, function* () {
    if (_isConnected === data.online)
        return;
    _isConnected = data.online;
    if (_isConnected) {
        {
            const now = Date.now();
            const response = yield (0, broadcast_1.sendCommand)(broadcast_1.DbEvents.GET_ALL_TABLES, { _lastUpdate });
            if (response.error)
                return;
            _lastUpdate = now;
        }
    }
    if (_isConnected && data.ts > _lastUpdate) {
        _lastUpdate = data.ts;
        (0, broadcast_1.sendCommand)(broadcast_1.DbEvents.GET_ALL_TABLES, {});
    }
}), { types: broadcast_1.DbEvents.CONNECTION });
const _mem = {};
/**
 * @param {string} tableName
 * @returns {Table}
 */
function getTable(tableName) {
    if (!_mem[tableName]) {
        const opts = {
            includeDeleted: false,
            newID: () => (0, helpers_1.uuid)(),
            newRow(id, data) {
                return __awaiter(this, void 0, void 0, function* () {
                    const row = _mem[tableName].getById(id);
                    if (row)
                        return row;
                    return new data_1.Row(tableName, data, garbage);
                });
            }
        };
        _mem[tableName] = new Table_1.Table(tableName, tableName, opts);
    }
    return _mem[tableName];
}
const garbage = new ObjectGarbage_1.ObjectGarbage({
    onCreate: (row) => {
        getTable(row.tableName).upsert(row);
    },
    onUpdate: (row) => {
        getTable(row.tableName).upsert(row);
    },
    onDispose: (row) => {
        getTable(row.tableName).delete(row);
    }
});
(0, broadcast_1.listen)((data) => {
    let { tableName, id_list, rows } = data;
    const table = getTable(tableName);
    garbage.process(tableName, rows);
    table.hydrate(rows);
}, { types: broadcast_1.DbEvents.ROWS_CHANGED });
(0, broadcast_1.listen)((data) => {
}, { types: broadcast_1.DbEvents.ROWS_DELETED });
exports.default = garbage;
