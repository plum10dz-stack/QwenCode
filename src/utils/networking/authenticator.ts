

import { ExecutionContext, SmartGraph, createGraph } from "../SmartGraph";
import Env, { loadEnv } from "../cache";

import RemoteObject, { addProperties, remoteObject } from "./broadCastProperies";
import { emit, on } from "../EventEmitter";


import { decryptData, md5 } from "../crypto";
import { http } from "./http";
import { AsyncLock, singleFlight } from "../concurrency";
import { sleep } from "../common";
import { swChannel } from "../channels";

declare type STATE = "USERID" | "PASSWORD" | "CONNECTED" | "DISCONNECTED";
declare type NodeName = "START" | "SIGNIN" | "AUTOSIGNIN" | "PASSWORD" | "CONNECTED" | "USERID" | "OFFLINE" | "FINISHED" | "DISCONNECTED";
declare type ResultType = String;
declare type NodeResponse = ResultType | Promise<ResultType>;
declare type ANodeResponse = Promise<ResultType | void>;


interface HandshakeData {
    username: string;
    pwdSuffix: string;
}



async function isConnected(): ANodeResponse {
    if (!navigator.onLine)
        return 'OFFLINE';
    const resp = await http.callAPI({ route: Env.AUTH_API, headers: { 'username': Env.username } });
    if (resp instanceof Error) return 'USERID';
    return (resp === "CONNECTED") ? "CONNECTED" : (resp === "NOT_REGISTERED") ? "USERID" : "PASSWORD";
}
function START(ctx: ExecutionContext<STATE, ResultType>, graph: SmartGraph<STATE, ResultType>): NodeResponse {
    return navigator.onLine ? 'AUTOSIGNIN' : 'OFFLINE';
}

async function AUTOSIGNIN(ctx: ExecutionContext<STATE, ResultType>, graph: SmartGraph<STATE, ResultType>): ANodeResponse {
    return await isConnected();
}

async function USERID(ctx: ExecutionContext<STATE, ResultType>, graph: SmartGraph<STATE, ResultType>): ANodeResponse {
    RemoteObject.set('AUTH.CONNECTED', false);
    const x = await RemoteObject.call('getUSERID', {}, 5000);
    if (!x || x instanceof Error) {
        return "USERID";
    }
    Env.set('username', x, true);
    return "PASSWORD";
}

async function PASSWORD(ctx: ExecutionContext<STATE, ResultType>, graph: SmartGraph<STATE, ResultType>): ANodeResponse {
    RemoteObject.set('AUTH.CONNECTED', false);
    Env.cert = '';
    if (!Env.username) return "USERID";
    const x = await RemoteObject.call('getPWD', {}, 5000);
    if (!x) {
        return "PASSWORD";
    }
    return HANDSHAKE(Env.username, x) as any;
}
async function HANDSHAKE(username: string, pwd: string) {
    await Env.clearAll(['username', 'cert']);
    const resp = await http.callAPI<HandshakeData>({ route: Env.AUTH_API, headers: { 'handshake': 'true', 'username': username } }, md5(pwd));
    if (resp instanceof Error) return resp;
    await Env.set('username', username, true);
    const handShakeDATA = resp;
    if (!handShakeDATA.pwdSuffix) return new Error("Invalid handshake data");
    {
        const cert = md5(pwd + handShakeDATA.pwdSuffix);
        const resp = await http.callAPI({ route: Env.AUTH_API, method: 'POST', headers: { 'handshake': 'true' }, body: <any>handShakeDATA }, cert);
        if (resp instanceof Error) return resp;
        if (resp === 'CONNECTED') {
            await Env.set('cert', cert, true);
            return 'CONNECTED';
        } else throw new Error('PASSWORD-ERROR');
    }
}
async function OFFLINE(ctx: ExecutionContext<STATE, ResultType>, graph: SmartGraph<STATE, ResultType>): ANodeResponse {
    return 'DISCONNECTED';
    // const signedIn = Env.username && Env.cert;
    // RemoteObject.set('AUTH.OFFLINE', true);
    // if (signedIn) {
    //     return 'CONNECTED';
    // } else {
    //     return 'DISCONNECTED';
    // }
}

async function CONNECTED(ctx: ExecutionContext<STATE, ResultType>, graph: SmartGraph<STATE, ResultType>): ANodeResponse {
    RemoteObject.set('AUTH.CONNECTED', true);
    emit("AUTH", "CONNECTED", [true]);
    return "CONNECTED";
}
async function DISCONNECTED(ctx: ExecutionContext<STATE, ResultType>, graph: SmartGraph<STATE, ResultType>): ANodeResponse {
    RemoteObject.set('AUTH.DISCONNECTED', true);
    emit("AUTH", "DISCONNECTED", [true]);
    return "DISCONNECTED";
}
const auth: SmartGraph<STATE, ResultType> = createGraph<STATE, ResultType, NodeName>({
    START: {
        executer: START,
        edges: [
            { value: 'OFFLINE', target: 'OFFLINE' },
            { value: 'AUTOSIGNIN', target: 'AUTOSIGNIN' }
        ]
    },

    AUTOSIGNIN: {
        executer: AUTOSIGNIN,
        edges: [
            { value: 'CONNECTED', target: 'CONNECTED' },
            { value: 'USERID', target: 'USERID' },
            { value: 'PASSWORD', target: 'PASSWORD' }
        ],
        retry: { attempts: 3, delayMs: 1000, when: (error) => error instanceof Error }
    },
    SIGNIN: {
        executer: USERID,
        edges: [
            { value: 'CONNECTED', target: 'CONNECTED' },
            { value: 'USERID', target: 'USERID' },
            { value: 'PASSWORD', target: 'PASSWORD' }
        ],
        retry: { attempts: 3, delayMs: 1000, when: (error: any) => error instanceof Error }
    },
    USERID: {
        executer: USERID,
        edges: [
            { value: 'USERID', target: 'USERID' },
            { value: 'PASSWORD', target: 'PASSWORD' }
        ],
        retry: { attempts: 3, delayMs: 1000, when: (error) => error instanceof Error }
    },

    PASSWORD: {
        executer: PASSWORD,
        edges: [
            { value: 'CONNECTED', target: 'CONNECTED' },
            { value: 'USERID', target: 'USERID' },
            { value: 'PASSWORD', target: 'PASSWORD' },
            { type: 'error', target: 'PASSWORD' }
        ],
        retry: { attempts: 3, delayMs: 1000, when: (error) => error instanceof Error }
    },
    CONNECTED: {
        executer: CONNECTED,
        edges: []
    },
    DISCONNECTED: {
        executer: DISCONNECTED,
        edges: []
    },
    OFFLINE: {
        executer: OFFLINE,
        edges: []
    },
    // OFFLINE: {
    //     executer: OFFLINE,
    //     edges: [
    //         // { value: 'CONNECTED', target: 'CONNECTED' },
    //         // { value: 'DISCONNECTED', target: 'DISCONNECTED' }
    //     ]
    // },
    FINISHED: {
        executer: (ctx, gr) => {

        },
        edges: [
            { value: 'CONNECTED', target: 'CONNECTED' }
        ]
    },

});





export const login = singleFlight<true>(async (res, _, p) => {
    await loadEnv();;
    if (navigator.onLine)
        start();
    else
        addEventListener('online', start);
    p.finally(() => {
        removeEventListener('online', start);
    });

    async function start() {
        while (navigator.onLine) {
            switch (await process('START')) {
                case 'CONNECTED':
                    return res(true);
                case 'OFFLINE':
                    await remoteObject.call('UI.show', { message: 'Error connecting to server' }, 2000);
                    return;
            }
            await sleep(2000);
        }
    }
    async function process(STATE: String = 'START') {
        try {
            return auth.execute([STATE as any], 'DISCONNECTED');
        } catch (error) {
            return error instanceof Error ? error : new Error(error as any);
        }
    }
});

addProperties({
    'login': {
        type: 'method',
        value: login,
        signature: {
            args: [],
            returns: 'boolean'
        }
    }
});

export const SESSION_ERRORS = {
    'SESSION_NOT_FOUND': 'Session not found',
    'INVALID_SESSION': 'Invalid session',
    'SESSION_EXPIRED': 'Session expired',
    'SESSION_TERMINATED': 'Session terminated',
    "NOT_CONNECTED": 'Not connected to server',
    "INVALID_HANDSHAKE": "Invalid handshake",
    "DB_CONNECTION_ERROR": "Database connection error",
    "USER_NOT_FOUND": "User not found",
    "PASSWORD_ERROR": "Password error",
};

; (self as any)['xfetch'] = async () => {
    http.fetch({ url: new URL('/session', Env.API_URL), method: 'GET' }).then(console.log).catch(console.error);
}
//login().then(console.log).catch(console.error); remoteObject