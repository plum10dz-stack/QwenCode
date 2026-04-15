"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Connector = void 0;
const flow_1 = require("../../flow");
class Connector extends flow_1.EventEmitter {
    constructor() {
        super(...arguments);
        this.lastTimeUpdate = 0;
    }
    on(event, handler) {
        return super.on(event, handler);
    }
    off(event, handler) {
        return super.off(event, handler);
    }
    emit(event, e) {
        super.emit(event, e);
    }
    once(event, handler) {
        return super.once(event, handler);
    }
}
exports.Connector = Connector;
