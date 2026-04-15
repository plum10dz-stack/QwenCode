//import { DB } from "../sw/init";
import { LoadFile, parseEnvFile, saveFile, tryParseJSON } from "./common";
import { isServiceWorker } from "./helpers";
const $fetch = self.fetch;
self.fetch = self.constructor.prototype.fetch = fetch;
interface Env {
    AUTH_API: string;
    API_URL: string;
    WS_URL: string;
    DEBUG: boolean;
    LOG_LEVEL: string;
}

interface Session extends Env {
    s_id: string;
    cert: string;
    username: string;
    password: string;
    remember: boolean;
    connected: boolean;
}

// Replaced Record<string, any> with a Map to support all key types (objects, numbers, etc.)
const env = new Map<any, any>();

declare type CacheObject<T> = Session & typeof cacheObject & T;

const cacheObject = {
    async clear() {
        env.clear();
        await this.save();
    },

    // Updated 'key' type from string to 'any'
    set<ASYNC extends boolean = false>(key: any, value: any, _async?: ASYNC): ASYNC extends true ? Promise<any> : any {
        env.set(key, value);
        if (_async)
            return this.save().then(() => value) as any;
        else
            this.save();
        return value;
    },

    // Updated 'key' type from string to 'any'
    get<ASYNC extends boolean = false>(key: any, _async?: ASYNC): ASYNC extends true ? Promise<any> : any {
        return env.get(key);
    },


    async getCacheEntries(file: string = '/.env') {
        let content = await LoadFile(file);
        if (typeof content === 'string') {
            content = tryParseJSON(content);
        }
        if (content instanceof Array) {
            throw new Error("");
        }
        return typeof content === 'object' ? content : {};
    },
    getEntries() {
        const X: Record<any, any> = {};
        for (const [key, value] of env) {
            if (typeof key === 'object' || typeof key == 'function' || typeof key === 'undefined' || typeof key === 'symbol') {
                continue;
            }
            X[key] = value;
        }
        return X;
    },

    async save() {

        let p = this.getEntries();
        let p1 = await this.getCacheEntries();
        return await saveFile('/.env', { ...p1, ...p });
    },

    async load(opt?: boolean) {

        return await parseEnvFile(env, { file: '/.env' });
    },

    // Accepts Record, Map, or Array of entries
    async setAll(props: Map<any, any> | Record<any, any> | [any, any][]) {
        if (props instanceof Map) {
            for (const [key, value] of props.entries()) {
                env.set(key, value);
            }
        } else if (Array.isArray(props)) {
            for (const [key, value] of props) {
                env.set(key, value);
            }
        } else if (typeof props === 'object' && props !== null) {
            for (const [key, value] of Object.entries(props)) {
                env.set(key, value);
            }
        }
        await this.save();
    },

    // Accepts Array of keys, Map, or Object
    async clearAll(props?: any[] | Map<any, any> | Record<any, any>) {
        if (!props) return;

        if (Array.isArray(props)) {
            for (const key of props) {
                env.delete(key);
            }
        } else if (props instanceof Map) {
            for (const key of props.keys()) {
                env.delete(key);
            }
        } else if (typeof props === 'object' && props !== null) {
            for (const key of Object.keys(props)) {
                env.delete(key);
            }
        }
        await this.save();
    }
};

declare type x = delectFunctions<typeof cacheObject>;
declare type delectFunctions<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? (...args: Parameters<T[K]>) => ReturnType<T[K]> : never;
}

const _Env = new Proxy<Env & Session>(<typeof cacheObject & Env & Session><any>{}, {
    get(target, prop: string | symbol, receiver) {
        if (prop in cacheObject) return (cacheObject as any)[prop as string] as any;
        return cacheObject.get(prop); // Proxy keys are naturally strings/symbols
    },
    set(target, prop: string | symbol, value, receiver) {
        if (prop in cacheObject)
            throw new Error(`${String(prop)} is not a valid property`);

        cacheObject.set(prop, value);
        return true;
    },
    has(target, prop: string | symbol) {
        return env.has(prop);
    },
    deleteProperty(target, prop: string | symbol) {
        env.delete(prop);
        cacheObject.save();
        return true;
    },
    apply<FN extends keyof typeof cacheObject>(target: any, thisArg: any, argArray: [FN, ...Parameters<x[FN]>]) {
        const prop = argArray[0];
        if (typeof cacheObject[prop] === 'function')
            (cacheObject[prop] as any)(...argArray.slice(1));
    },
});

export async function loadEnv<T>(file: string = '/env.json') {
    await parseEnvFile(env, { content: tryParseJSON(await fetch(file).catch(v => undefined).then(v => v?.text()).catch(v => "")) });
    await parseEnvFile(env, { file: '/.env' });
    return _Env as CacheObject<T>;
}


export const AsyncEnv = (<T>() => {
    let loaded = false;
    const _p = loadEnv<T>().finally(() => {
        loaded = true;
        return _Env;
    })
    return <T, ASYNC>(async?: ASYNC): ASYNC extends false ? CacheObject<T> : Promise<CacheObject<T>> => {
        if (async === false) {
            return _Env as CacheObject<T> as any;
        }
        else if (loaded) return _Env as CacheObject<T> as any;
        else return _p as any;
    };
})()

export default AsyncEnv<Session, false>(false);


export async function fetch(url: RequestInfo | URL, options?: RequestInit) {
    const res = await $fetch(url, options);

    const sid = res.headers.get('S-ID');
    if (sid && (sid !== _Env.s_id)) {
        _Env.s_id = sid;
        console.log("S-ID changed to", sid);
    }
    return res;
};

(self as any).cacheObject = cacheObject;
//DB.localDB