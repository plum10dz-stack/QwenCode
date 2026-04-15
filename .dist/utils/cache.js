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
exports.AsyncEnv = void 0;
exports.loadEnv = loadEnv;
exports.fetch = fetch;
//import { DB } from "../sw/init";
const common_1 = require("./common");
const $fetch = self.fetch;
self.fetch = self.constructor.prototype.fetch = fetch;
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
        return env.get(key);
    },
    getCacheEntries() {
        return __awaiter(this, arguments, void 0, function* (file = '/.env') {
            let content = yield (0, common_1.LoadFile)(file);
            if (typeof content === 'string') {
                content = (0, common_1.tryParseJSON)(content);
            }
            if (content instanceof Array) {
                throw new Error("");
            }
            return typeof content === 'object' ? content : {};
        });
    },
    getEntries() {
        const X = {};
        for (const [key, value] of env) {
            if (typeof key === 'object' || typeof key == 'function' || typeof key === 'undefined' || typeof key === 'symbol') {
                continue;
            }
            X[key] = value;
        }
        return X;
    },
    save() {
        return __awaiter(this, void 0, void 0, function* () {
            let p = this.getEntries();
            let p1 = yield this.getCacheEntries();
            return yield (0, common_1.saveFile)('/.env', Object.assign(Object.assign({}, p1), p));
        });
    },
    load(opt) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield (0, common_1.parseEnvFile)(env, { file: '/.env' });
        });
    },
    // Accepts Record, Map, or Array of entries
    setAll(props) {
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
        yield (0, common_1.parseEnvFile)(env, { content: (0, common_1.tryParseJSON)(yield fetch(file).catch(v => undefined).then(v => v === null || v === void 0 ? void 0 : v.text()).catch(v => "")) });
        yield (0, common_1.parseEnvFile)(env, { file: '/.env' });
        return _Env;
    });
}
exports.AsyncEnv = (() => {
    let loaded = false;
    const _p = loadEnv().finally(() => {
        loaded = true;
        return _Env;
    });
    return (async) => {
        if (async === false) {
            return _Env;
        }
        else if (loaded)
            return _Env;
        else
            return _p;
    };
})();
exports.default = (0, exports.AsyncEnv)(false);
function fetch(url, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const res = yield $fetch(url, options);
        const sid = res.headers.get('S-ID');
        if (sid && (sid !== _Env.s_id)) {
            _Env.s_id = sid;
            console.log("S-ID changed to", sid);
        }
        return res;
    });
}
;
self.cacheObject = cacheObject;
//DB.localDB
