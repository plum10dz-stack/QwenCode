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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERPServices = void 0;
exports.initERPServices = initERPServices;
const http_1 = require("../http");
const common_1 = require("../../common");
const cache_1 = __importDefault(require("../../cache"));
const broadCastProperies_1 = __importDefault(require("../broadCastProperies"));
exports.ERPServices = {
    /**
     * Returns the current client time.
     * Useful for synchronization checks.
     */
    "getTime": (res) => __awaiter(void 0, void 0, void 0, function* () {
        return new common_1.TaskControlSignal({
            result: { timestamp: Date.now() }
        });
    }),
    /**
     * Returns requested internal data.
     * The server specifies which keys it needs in the service data.
     */
    "getData": (res, args) => __awaiter(void 0, void 0, void 0, function* () {
        const requestedKeys = args['#DATA'] || [];
        const result = {};
        for (const key of requestedKeys) {
            result[key] = cache_1.default[key];
        }
        return new common_1.TaskControlSignal({ result });
    }),
    /**
     * Triggers a UI prompt to ask the user for information.
     */
    "askUser": (res, args) => __awaiter(void 0, void 0, void 0, function* () {
        const { title, message, field } = args['#DATA'] || {};
        try {
            // Attempt to use RemoteObject if it's a multi-process environment (e.g. SW <-> UI)
            const input = yield broadCastProperies_1.default.call('UI.prompt', { title, message, field }, 60000);
            return new common_1.TaskControlSignal({ result: { [field || 'input']: input } });
        }
        catch (e) {
            // Fallback to standard prompt if running in a window context
            const input = typeof prompt !== 'undefined' ? prompt(`${title}: ${message}`) : null;
            return new common_1.TaskControlSignal({ result: { [field || 'input']: input } });
        }
    }),
    /**
     * Specifically handles missing information by asking the user
     * and then signaling a REPLACE/RETRY with the new info.
     */
    "missingInfo": (res, args) => __awaiter(void 0, void 0, void 0, function* () {
        const missingFields = args['#DATA'] || [];
        const collectedData = {};
        for (const field of missingFields) {
            const val = yield broadCastProperies_1.default.call('UI.prompt', { message: `Please provide ${field}` });
            collectedData[field] = val;
        }
        // We return the collected data. 
        // Logic in the Queue will decide how to re-attach this to the original request.
        return new common_1.TaskControlSignal({ result: collectedData });
    }),
    /**
     * Switches the request to a fallback URL provided by the server.
     */
    "fallbackURL": (res, args) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const newUrl = (_a = args['#DATA']) === null || _a === void 0 ? void 0 : _a.url;
        if (!newUrl)
            return new common_1.TaskControlSignal({ error: "No fallback URL provided" });
        return new common_1.TaskControlSignal({
            result: { msg: "Switching to fallback" },
            // This is a hint to the queue handler to retry with a modified request
        });
    })
};
/**
 * Initialize ERP Services
 */
function initERPServices() {
    http_1.http.addServices(exports.ERPServices);
}
