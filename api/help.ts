export * from "./utils";

import { Request } from "express";
import { Packet } from './utils/packet';
import { PostgrestQueryBuilder } from "@supabase/postgrest-js";


export type Handler = (packet: Packet) => any;
const APIS = new Map<string, Map<RegExp, { keys: string[]; handler: Handler }>>();

export function compileAPIS(apis: Record<string, any>) {
    const addRoute = (method: string, route: string, handler: Handler) => {
        if (typeof handler !== "function") return;

        // Ensure the HTTP method is always uppercase (handles "get", "Get", etc.)
        method = method.toUpperCase();

        const parts = route.split("/").filter(Boolean);
        const keys: string[] = [];

        const regexParts = parts.map((p) => {
            if (p === "*") {
                keys.push("wildcard");
                return "(.*)";
            } else if (p.startsWith(":")) {
                keys.push(p.slice(1));
                return "([^/]+)";
            } else if (p.includes("[") && p.includes("]")) {
                return p; // Allows regex syntax like /users/[0-9]+
            } else {
                return p; // Static text
            }
        });

        const regex = new RegExp("^/" + regexParts.join("/") + "$");

        if (!APIS.has(method)) {
            APIS.set(method, new Map());
        }

        // Map.set() overwrites if the exact same regex already exists
        APIS.get(method)!.set(regex, { keys, handler });
    };

    // Helper to check if a top-level key is an HTTP method (e.g., "GET", "PUT")
    const isHttpMethod = (key: string) => /^[A-Z]+$/.test(key);

    for (const [topKey, nestedObj] of Object.entries(apis)) {
        if (typeof nestedObj !== "object" || nestedObj === null) continue;

        if (isHttpMethod(topKey)) {
            // FORMAT 1: Method-first -> { GET: { '/api': handler } }
            for (const [path, handler] of Object.entries(nestedObj)) {
                addRoute(topKey, path, handler as Handler);
            }
        } else {
            // FORMAT 2: Path-first -> { '/users': { GET: handler } }
            for (const [method, handler] of Object.entries(nestedObj)) {
                addRoute(method, topKey, handler as Handler);
            }
        }
    }
}

export function getAPIHandler(req: Request) {
    const method = req.method.toUpperCase();
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;

    const methodMap = APIS.get(method);
    if (!methodMap) return undefined;

    for (const [regex, { keys, handler }] of methodMap.entries()) {
        const match = path.match(regex);
        if (match) {
            const params: Record<string, string> = {};
            keys.forEach((k, i) => {
                params[k] = match[i + 1];
            });
            return { handler, params };
        }
    }

    return undefined;
}

export function now<NUMBER extends true | false>(type?: NUMBER): NUMBER extends true ? number : string {
    let now = Date.now();
    now = Math.floor(now / 1000);
    const date = new Date(now);
    return type === true ? now as any : date.toISOString() as any;
}

export declare type ReqType<T> = PostgrestQueryBuilder<{ PostgrestVersion: "12"; }, any, any, T, unknown>;
export declare type args<T> = { req: ReqType<T>, session: Sessions, body: any, params: any };

export declare type R<T, X> = Exclude<UserRole, T> | ((e: args<T>) => Promise<X | void> | any);

export declare type Callbacks<T, X> = { [P in UserRole]?: R<P, X> }
// export async function request<T extends keyof DatabaseTables, X>(packet: Packet, table: T, callback: Callback<T, X>): Promise<Partial<args<T>>> {
//     const session = await packet.loadSession();
//     let e: Partial<args<T>>;
//     if (session) {
//         const req = packet.db.schema('public').from(table);
//         const role = session.role;
//         let _callback = callback[role];
//         if (typeof _callback === 'string')
//             _callback = callback[_callback] as R<UserRole, X>;
//         e = <args<T>>{ req, packet, session, body: packet.body, params: packet.params, result: null };
//         e.result = await _callback?.(e as args<T>);
//     } else {
//         e = { params: packet.params, packet };
//         packet.text('UNAUTHORIZED', 401)
//     }
//     return e;
// }
