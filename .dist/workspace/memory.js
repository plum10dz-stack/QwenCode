"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ObjectGarbage_1 = require("../utils/ObjectGarbage");
const channels_1 = require("../utils/channels");
const config_1 = require("./config");
const _mem = {};
/**
 * @param {string} tableName
 * @returns {Table}
 */
const garbage = new ObjectGarbage_1.ObjectGarbage({
    channel: channels_1.swChannel,
    onCreate(row, e) {
        e.table.upsert(row);
    },
    onUpdate(row, e) {
        e.table.upsert(row);
    },
    onDispose(row) {
    }
});
garbage.getTable;
channels_1.swChannel.listenFor(config_1.DbEvents.ROWS_CHANGED, (data) => {
    let { tableName, rows } = data;
    const table = getTable(tableName);
    garbage.process(tableName, rows);
    table.hydrate(rows);
});
channels_1.swChannel.listenFor(config_1.DbEvents.ROWS_DELETED, (data) => {
});
exports.default = garbage;
