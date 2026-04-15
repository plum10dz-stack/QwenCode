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
exports.remoteObject = exports.RemoteObject = void 0;
exports.buildEventProperty = buildEventProperty;
exports.addProperty = addProperty;
exports.addProperties = addProperties;
exports.castRemoteObject = castRemoteObject;
const EventEmitter_1 = require("../EventEmitter");
const channel_1 = require("../channels/channel");
const ISWChannel_1 = require("../channels/ISWChannel");
const swChannel = new channel_1.Channel(new ISWChannel_1.ISWChannel());
class RemoteObject {
    constructor(self) {
        this.self = self;
        swChannel.on('#get', (state) => __awaiter(this, void 0, void 0, function* () {
            const req = state.payload;
            const res = {};
            const names = req.payload;
            const props = this.self.properties;
            if (Array.isArray(names)) {
                const resp = new Array(names.length);
                names.forEach((prop, index) => {
                    resp[index] = props[prop];
                });
                return resp;
            }
            else if (typeof names === 'object') {
                const resp = {};
                for (const prop of names)
                    res[prop] = props[prop];
                return res;
            }
            else if (typeof names === 'string') {
                return props[names];
            }
        }));
        swChannel.on('#set', (state) => __awaiter(this, void 0, void 0, function* () {
            const req = state.payload;
            const props = this.self.properties;
            for (const prop in req.payload)
                props[prop] = req.payload[prop];
            return true;
        }));
        swChannel.on('#call', (state) => __awaiter(this, void 0, void 0, function* () {
            const { method, args } = state.payload.payload;
            return yield this.self.methods[method](args);
        }));
    }
    call(method_1, args_1) {
        return __awaiter(this, arguments, void 0, function* (method, args, timeout = 10000) {
            const res = yield swChannel.call(swChannel.createRequest('#call', { method, args }, timeout)).catch(v => new Error(v));
            if (res instanceof Error)
                return res;
            if (res.error)
                return new Error(res.error);
            return res.payload;
        });
    }
    buildArgs(args) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = [];
            for (const arg of args) {
                res.push(yield this.get(arg));
            }
            return res;
        });
    }
    set(prop, value) {
        this.self.properties[prop] = value;
        return true;
    }
    spread(prop, value) {
        return __awaiter(this, void 0, void 0, function* () {
            return swChannel.fire("#set", { [prop]: value });
        });
    }
    gets(props) {
        return __awaiter(this, void 0, void 0, function* () {
            let res = {};
            for (const prop of props) {
                const char = String(prop)[0];
                const key = '.:'.includes(char) ? String(prop).substring(1) : prop;
                res[key] = char === ':' ? yield this.get(prop) : this.self.properties[key];
            }
            return res;
        });
    }
    getLocal(args) {
        const res = [];
        for (const arg of args) {
            res.push(this.self.properties[arg]);
        }
        return res.length === 1 ? res[0] : res;
    }
    get(_prop, timeout = 10000) {
        const { action, args, local } = split(_prop);
        if (action)
            throw new Error('Invalid property format');
        if (local)
            return this.getLocal(args);
        return swChannel.call(swChannel.createRequest('#get', args, timeout)).then(v => v.payload).catch(v => new Error(v));
    }
    _get(prop) {
        return this.self.properties[prop];
    }
}
exports.RemoteObject = RemoteObject;
function split(syntax) {
    let local = false;
    let action = '';
    let args;
    if (syntax.startsWith('.')) {
        local = true;
        syntax = syntax.substring(1);
    }
    const i = syntax.indexOf(':');
    if (i !== -1) {
        action = syntax.substring(0, i);
        args = splitArgs(syntax.substring(i + 1));
    }
    else {
        args = splitArgs(syntax);
    }
    return { action: action, args, local };
    function splitArgs(props) {
        let isArray = props.startsWith('[') && props.endsWith(']');
        if (isArray !== (props.startsWith('[') || props.endsWith(']')))
            throw new Error('Invalid property format');
        if (isArray)
            return props.substring(1, props.length - 1).split(',');
        return [props];
    }
}
exports.remoteObject = new RemoteObject({
    properties: {
        CONNECTED: false,
        pwd: 'achour',
        userid: 'brahim'
    },
    methods: {
        '#get': (props) => {
            return props.map(prop => exports.remoteObject.self.properties[prop]);
        },
        '#set': (props) => {
            return Object.entries(props).map(([key, value]) => exports.remoteObject.self.properties[key] = value);
        }
    },
    signatures: {
        CONNECTED: { type: 'property', returns: 'boolean' },
        getPWD: { type: 'method', args: [], returns: 'string' },
        getUSERID: { type: 'method', args: [], returns: 'string' }
    }
});
function buildEventProperty(e) {
    const id = e.ns ? `${e.ns}.${e.name}` : e.name;
    const { ns, name, broadcast, get, set } = e;
    let value = e.value;
    addProperty('property', { returns: e.type }, id, Object.assign({ get: get || (() => value) }, (!get || set ? {
        set(v) {
            var _a;
            const o = value;
            value = (_a = set === null || set === void 0 ? void 0 : set(v)) !== null && _a !== void 0 ? _a : v;
            if (o !== value) {
                (0, EventEmitter_1.emit)(ns, name, { newValue: value, oldValue: o });
                broadcast && exports.remoteObject.spread(id, value);
            }
        }
    } : {})));
}
function addProperty(type, signature, prop, value) {
    if (type === 'method') {
        Object.defineProperty(exports.remoteObject.self.methods, prop, { value });
    }
    else {
        Object.defineProperty(exports.remoteObject.self.properties, prop, value);
    }
    exports.remoteObject.self.signatures[prop] = Object.assign({ type }, signature);
}
function addProperties(properties) {
    for (const [prop, { type, signature, value }] of Object.entries(properties)) {
        addProperty(type, signature, prop, value);
    }
}
function castRemoteObject() {
    return exports.remoteObject;
}
;
addProperties({
    getPWD: {
        type: 'method', value: () => __awaiter(void 0, void 0, void 0, function* () {
            return "achour";
        }), signature: { args: [], returns: 'string' }
    },
    getUSERID: {
        type: 'method', value: () => __awaiter(void 0, void 0, void 0, function* () {
            return "achour";
        }), signature: { args: [], returns: 'string' }
    },
    CONNECTED: {
        type: 'property', value: {
            enumerable: true,
            configurable: true,
            get() {
                return exports.remoteObject.self.properties._CONNECTED;
            },
            set(value) {
                console.log('setting connected to', value);
                exports.remoteObject.self.properties._CONNECTED = value;
            }
        }, signature: { returns: 'boolean' }
    },
    pwd: { type: 'property', value: { value: 'achour' }, signature: { returns: 'string' } },
    userid: { type: 'property', value: { value: 'brahim' }, signature: { returns: 'string' } }
});
globalThis.remoteObject = exports.remoteObject;
exports.default = exports.remoteObject;
