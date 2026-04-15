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
exports.loadEnv = loadEnv;
exports.Env = Env;
exports.load = load;
const common_1 = require("./common");
const helpers_1 = require("./helpers");
// Replaced Record<string, any> with a Map to support all key types (objects, numbers, etc.)
const env = new Map();
const cacheObject = {
    clear() {
        return __awaiter(this, void 0, void 0, function* () {
            env.clear();
            yield this.save();
        });
    },
    // Updated 'key' type from string to 'any'
    set(key, value, _async) {
        env.set(key, value);
        if (_async)
            return this.save().then(() => value);
        else
            this.save();
        return value;
    },
    // Updated 'key' type from string to 'any'
    get(key, _async) {
        if (_async)
            return this.load().then(() => env.get(key));
        return env.get(key);
    },
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            const x = yield (0, common_1.getCacheValue)('/.env');
            if (x !== undefined) {
                // Handle loading from Map's array-of-entries format or fallback to legacy object format
                if (Array.isArray(x)) {
                    for (const [k, v] of x) {
                        env.set(k, v);
                    }
                }
                else if (typeof x === 'object' && x !== null) {
                    for (const [k, v] of Object.entries(x)) {
                        env.set(k, v);
                    }
                }
            }
            const sid = env.get('sid') || (0, helpers_1.uuid)();
            env.set('sid', sid);
            return _Env;
        });
    },
    save() {
        return __awaiter(this, void 0, void 0, function* () {
            // Convert Map back to an array of entries for storage 
            // (JSON doesn't support Maps directly)
            yield (0, common_1.setCacheValue)('/.env', Array.from(env.entries()));
        });
    },
    // Accepts Record, Map, or Array of entries
    saveAll(props) {
        return __awaiter(this, void 0, void 0, function* () {
            if (props instanceof Map) {
                for (const [key, value] of props.entries()) {
                    env.set(key, value);
                }
            }
            else if (Array.isArray(props)) {
                for (const [key, value] of props) {
                    env.set(key, value);
                }
            }
            else if (typeof props === 'object' && props !== null) {
                for (const [key, value] of Object.entries(props)) {
                    env.set(key, value);
                }
            }
            yield this.save();
        });
    },
    // Accepts Array of keys, Map, or Object
    clearAll(props) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!props)
                return;
            if (Array.isArray(props)) {
                for (const key of props) {
                    env.delete(key);
                }
            }
            else if (props instanceof Map) {
                for (const key of props.keys()) {
                    env.delete(key);
                }
            }
            else if (typeof props === 'object' && props !== null) {
                for (const key of Object.keys(props)) {
                    env.delete(key);
                }
            }
            yield this.save();
        });
    }
};
const _Env = new Proxy({}, {
    get(target, prop, receiver) {
        if (prop in cacheObject)
            return cacheObject[prop];
        return cacheObject.get(prop); // Proxy keys are naturally strings/symbols
    },
    set(target, prop, value, receiver) {
        if (prop in cacheObject)
            throw new Error(`${String(prop)} is not a valid property`);
        cacheObject.set(prop, value);
        return true;
    },
    has(target, prop) {
        return env.has(prop);
    },
    deleteProperty(target, prop) {
        env.delete(prop);
        cacheObject.save();
        return true;
    },
    apply(target, thisArg, argArray) {
        const prop = argArray[0];
        if (typeof cacheObject[prop] === 'function')
            cacheObject[prop](...argArray.slice(1));
    },
});
function loadEnv() {
    return __awaiter(this, arguments, void 0, function* (file = '/env.json') {
        yield load(file);
        yield cacheObject.load();
        return _Env;
    });
}
function Env() { return _Env; }
exports.default = Env();
function load() {
    return __awaiter(this, arguments, void 0, function* (file = '/env.json') {
        const res = yield self.fetch(file);
        const data = yield res.json();
        yield _Env.saveAll(data);
        return _Env;
    });
}
