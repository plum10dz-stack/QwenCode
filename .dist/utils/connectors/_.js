"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Connector_1 = require("./Connector");
class SWConnector extends Connector_1.Connector {
    getNewId(tableName) {
        return Promise.resolve();
    }
    newRow(tableName) {
        throw new Error("Method not implemented.");
    }
    saveRow(tableName, row) {
        throw new Error("Method not implemented.");
    }
    deleteRow(tableName, id) {
        throw new Error("Method not implemented.");
    }
    getAll(tableName, lastTimeUpdate) {
        throw new Error('Method not implemented.');
    }
    getUpdates(lastTimeUpdate) {
        throw new Error('Method not implemented.');
    }
    startPooling() {
        throw new Error('Method not implemented.');
    }
    stopPooling() {
    }
}
exports.default = SWConnector;
