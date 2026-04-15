import { emit } from "../EventEmitter";
import { Channel, RequestState } from "../channels/channel";
import { ISWChannel } from "../channels/ISWChannel";
declare type signature<M extends 'method' | 'property'> = M extends 'method' ? { type: M, args: string[], returns: string } : { type: M, returns: string };
declare type csignature<M extends 'method' | 'property'> = M extends 'method' ? { args: string[], returns: string } : { returns: string };
interface IRemoteObject {
    properties: Record<string, any>;
    methods: Record<string, Function>;
    signatures: Record<string, signature<'method'> | signature<'property'>>;
}
const swChannel = new Channel(new ISWChannel());

export class RemoteObject<T extends Record<string, any>> {

    constructor(public self: IRemoteObject) {
        swChannel.on('#get', async (state) => {
            const req = state.payload;
            const res: Record<string, any> = {};
            const names = req.payload;
            const props = this.self.properties;
            if (Array.isArray(names)) {
                const resp = new Array(names.length);
                names.forEach((prop: string, index: number) => {
                    resp[index] = props[prop];
                });
                return resp;
            } else if (typeof names === 'object') {
                const resp = {};
                for (const prop of names)
                    res[prop] = props[prop];
                return res;
            } else if (typeof names === 'string') {
                return props[names];
            }
        });
        swChannel.on('#set', async (state) => {
            const req = state.payload;
            const props = this.self.properties;
            for (const prop in req.payload)
                props[prop] = req.payload[prop];
            return true;
        });
        swChannel.on('#call', async (state) => {
            const { method, args } = (state as RequestState).payload.payload as { method: string, args: any[] };
            return await this.self.methods[method](args);
        });
    }
    async call(method: string, args: Record<string, any>, timeout: number = 10000) {
        const res = await swChannel.call(swChannel.createRequest('#call', { method, args }, timeout)).catch(v => new Error(v));
        if (res instanceof Error) return res;
        if (res.error) return new Error(res.error);
        return res.payload;
    }
    async buildArgs(args: string[]): Promise<any[]> {
        const res: any[] = [];
        for (const arg of args) {
            res.push(await this.get(arg as any));
        }
        return res;
    }
    set(prop: keyof T, value: any) {
        this.self.properties[<any>prop] = value;
        return true;
    }
    async spread(prop: keyof T, value: any) {
        return swChannel.fire("#set", { [prop]: value });
    }
    async gets<T extends (keyof T)[]>(props: T): Promise<any> {
        let res: any = {};
        for (const prop of props) {
            const char = String(prop)[0];
            const key = '.:'.includes(char) ? String(prop).substring(1) : prop;
            res[key] = char === ':' ? await this.get(prop as any) : this.self.properties[<any>key];
        }
        return res;
    }
    getLocal(args: string[]) {
        const res: any[] = [];
        for (const arg of args) {
            res.push(this.self.properties[arg]);
        }
        return res.length === 1 ? res[0] : res;
    }

    get<P extends keyof T, X extends P | `${'.' | ''}${string}:${Exclude<P, Symbol>}`>(_prop: X, timeout: number = 10000): X extends `.${string}` ? T[P] : Promise<T[P]> {
        const { action, args, local } = split(_prop as string);
        if (action) throw new Error('Invalid property format');
        if (local) return this.getLocal(args);
        return <any>swChannel.call(swChannel.createRequest('#get', args, timeout)).then(v => v.payload).catch(v => new Error(v));
    }
    _get(prop: string) {
        return this.self.properties[prop];
    }
}

function split(syntax: string) {
    // format :[prop1,prop2,...] or :prop1,prop2,...  or .[prop1,prop2,...] or .prop1,prop2,...  or action:[prop1,prop2,...] or action:prop1,prop2,...
    interface args {
        call: '.' | 'remote' | string
        props: string[]
    }
    let local = false;
    let action = '';
    let args: any[];
    if (syntax.startsWith('.')) {
        local = true;
        syntax = syntax.substring(1);
    }
    const i = syntax.indexOf(':');
    if (i !== -1) {
        action = syntax.substring(0, i);
        args = splitArgs(syntax.substring(i + 1));
    } else {
        args = splitArgs(syntax);
    }
    return { action: action, args, local };
    function splitArgs(props: string) {
        let isArray = props.startsWith('[') && props.endsWith(']');
        if (isArray !== (props.startsWith('[') || props.endsWith(']')))
            throw new Error('Invalid property format');
        if (isArray)
            return props.substring(1, props.length - 1).split(',');
        return [props];
    }
}
export const remoteObject = new RemoteObject({
    properties: {
        CONNECTED: false,
        pwd: 'achour',
        userid: 'brahim'
    },
    methods: {
        '#get': (props: string[]) => {
            return props.map(prop => remoteObject.self.properties[prop]);
        },
        '#set': (props: { [key: string]: any }) => {
            return Object.entries(props).map(([key, value]) => remoteObject.self.properties[key] = value);
        }
    },
    signatures: {
        CONNECTED: { type: 'property', returns: 'boolean' },
        getPWD: { type: 'method', args: [], returns: 'string' },
        getUSERID: { type: 'method', args: [], returns: 'string' }
    }
});
export function buildEventProperty(e: { broadcast?: boolean, type: string, ns: string, name: string, value?: any, get?(): any, set?(v: any): any }) {
    const id = e.ns ? `${e.ns}.${e.name}` : e.name;
    const { ns, name, broadcast, get, set } = e;
    let value = e.value;
    addProperty('property', { returns: e.type }, id, {
        get: get || (() => value),
        ...(!get || set ? {
            set(v) {
                const o = value; value = set?.(v) ?? v;
                if (o !== value) {
                    emit(ns, name, { newValue: value, oldValue: o });
                    broadcast && remoteObject.spread(id, value);
                }
            }
        } : {})
    });
}
export function addProperty<M extends 'method' | 'property'>(type: M, signature: csignature<M>, prop: string, value: M extends 'method' ? Function : PropertyDescriptor) {
    if (type === 'method') {
        Object.defineProperty(remoteObject.self.methods, prop, { value });
    } else {
        Object.defineProperty(remoteObject.self.properties, prop, value);
    }
    remoteObject.self.signatures[prop] = <signature<M>>{ type, ...signature };
}
declare type deff<M extends 'method' | 'property'> = { type: M, signature: csignature<M>, value: M extends 'method' ? Function : PropertyDescriptor }
export function addProperties(properties: Record<string, deff<'property'> | deff<'method'>>) {
    for (const [prop, { type, signature, value }] of Object.entries(properties)) {
        addProperty(type, signature, prop, value);
    }
}
export function castRemoteObject<T extends Record<string, any>>(): RemoteObject<T> {
    return remoteObject as unknown as RemoteObject<T>;

};

addProperties({
    getPWD: {
        type: 'method', value: async () => {
            return "achour";
        }, signature: { args: [], returns: 'string' }
    },
    getUSERID: {
        type: 'method', value: async () => {
            return "achour";
        }, signature: { args: [], returns: 'string' }
    },
    CONNECTED: {
        type: 'property', value: {
            enumerable: true,
            configurable: true,
            get() {
                return remoteObject.self.properties._CONNECTED;
            },
            set(value: boolean) {
                console.log('setting connected to', value);
                remoteObject.self.properties._CONNECTED = value;
            }
        }, signature: { returns: 'boolean' }
    },
    pwd: { type: 'property', value: { value: 'achour' }, signature: { returns: 'string' } },
    userid: { type: 'property', value: { value: 'brahim' }, signature: { returns: 'string' } }
});
(globalThis as any).remoteObject = remoteObject;
export default remoteObject;