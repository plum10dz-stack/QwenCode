// @/api.ts
/// <reference path="../database/types/schema.d.ts" />

import { Request, Response } from "express";
import { createClient, PostgrestSingleResponse, SupabaseClient } from "@supabase/supabase-js";

import { decryptData, encryptData } from "./cryptography";
import { args, Callbacks, getAPIHandler, Handler, md5, now, R } from "../help";
import { env } from "process";
import cookie, { SID } from './cookies';
import { isDbErr } from "../database/adapters/rpc-wrappers";
import { ERPHelper } from "../database/adapters/ErpHelper";
import { randomUUID } from "crypto";
import { PostgrestFilterBuilder, PostgrestQueryBuilder } from "@supabase/postgrest-js";
//import { BunFile } from 'bun';



const SUPABASE_URL = env.SUPABASE_URL!;
const KEY = env.KEY!;

const db = createClient(SUPABASE_URL, KEY);
const _packets = new WeakMap<Request, Packet>();


export interface HandlerInfo {
    handler: Handler;
    params: Record<string, string>;
}



export function getPacket(req: Request, res: Response): Packet {
    const packet = _packets.get(req) || new Packet(db, req, res);
    _packets.set(req, packet);
    return packet;
}


export class Packet {
    async send(file: any/*: BunFile*/) {
        if (this.isClosed) return;
        this.#closed = true;
        if (!(await file.exists())) {
            return this.json('NOT_FOUND', 404);
        }
        this.res.setHeader("Content-Type", file.type);
        this.res.send(file);
    }

    #closed = false;
    req: Request;
    res: Response;
    url: URL;
    path: string;
    query: Record<string, string>;
    get params(): Record<string, string> {
        return this.handler?.params || {};
    }
    body: any;
    private _handler?: HandlerInfo | undefined;
    public get handler(): HandlerInfo | undefined {
        return this._handler || (this._handler = getAPIHandler(this.req));
    }

    method: string;
    readonly db: SupabaseClient<Database>;
    data?: HandshakeData;
    private _session?: Sessions;
    public get session(): Sessions | undefined {
        return this._session;
    }
    public setSession(value: Sessions, save: boolean = false) {
        if (save) this.saveSession(value);
        else {
            this._session = value;
            Packet.sessions.set(value.id, value);
        }
        return value;
    }

    get isClosed(): boolean {
        return this.#closed || this.res.writableEnded;
    }

    constructor(db: SupabaseClient, req: Request, res: Response) {
        this.db = db;
        this.req = req;
        this.res = res;
        this.url = new URL(req.url, `http://${req.headers.host}`);
        this.path = this.url.pathname;
        this.query = Object.fromEntries(this.url.searchParams.entries());
        this.body = req.body;
        this.method = req.method;
        this.SID = cookie.SID(req, res);
        if (!this.SID) {
            //    throw "";
        }

    }
    async deleteRow<T extends keyof DatabaseTables>(table: T, id: string | number, column: string = 'id'): Promise<requestResults<DatabaseTables[T]>> {
        const { data, error } = await this.db.schema('public').from(table).delete().eq(column, id).maybeSingle() as PostgrestSingleResponse<DatabaseTables[T]>;
        if (error)
            return { error: error, status: 503 };
        return { data: data!, status: 200 };
    }
    async getRow<T extends keyof DatabaseTables>(table: T, id: string | number, column: string = 'id'): Promise<requestResults<DatabaseTables[T]>> {
        const { data, error } = await this.db.schema('public').from(table).select('*').eq(column, id).maybeSingle() as PostgrestSingleResponse<DatabaseTables[T]>;
        if (error)
            return { error: error, status: 503 };
        if (!data)
            return { error: table.toUpperCase() + '_NOT_FOUND', status: 404 };
        return { data: data, status: 200 };
    }
    async getRows<T extends keyof DatabaseTables>(table: T, id: string | number, column: string = 'id', apply?: V<DatabaseTables[T][]>): Promise<requestResults<DatabaseTables[T][]>> {
        let req = this.db.schema('public').from(table).select('*').eq(column, id);
        if (apply)
            req = apply(req);
        const { data, error } = await req as PostgrestSingleResponse<DatabaseTables[T][]>;
        if (error)
            return { error: error, status: 503 };
        if (!data || data.length === 0)
            return { error: table.toUpperCase() + '_NOT_FOUND', status: 404 };
        return { data: data, status: 200 };
    }
    async upSert<T extends keyof DatabaseTables>(table: T, data: DatabaseTables[T]): Promise<requestResults<DatabaseTables[T]>> {

        const { data: ndata, error } = await this.db.schema('public').from(table).upsert(data).select('*').single() as PostgrestSingleResponse<DatabaseTables[T]>;
        if (error)
            return { error: error, status: 503 };
        if (!ndata)
            return { error: table + '_FAIL_TO_UPSERT', status: 404 };
        return { data: ndata, status: 200 };
    }

    static sessions = new Map<string, Sessions>();
    async saveSession(session: Sessions = this.session!) {
        this._session = session;
        Packet.sessions.set(session.id, session);
        const result = await this.upSert('sessions', this.session!);
        if (isDbErr(result)) return false;
        return result.data;
    }
    async loadAnonymousSession() {
        if (this.session) return this.session;
        if (Packet.sessions.has(this.SID)) {
            return this._session = Packet.sessions.get(this.SID)!;
        }
        const { data, error } = await this.db.schema('public').from('sessions').select('*').eq('id', this.SID).maybeSingle() as PostgrestSingleResponse<Sessions>
        if (error)
            return this.json('DB_CONNECTION_ERROR', 500), null;
        if (!data) {
            const session: Sessions = {
                id: this.SID,
                username: this.req.header('username') || 'anonymouse',
                uid: 0,
                cid: 0,
                pwd_suffix: crypto.randomUUID().toString().slice(-8),
                cert: '',
                created_at: now(true),
                handshake_time: now(true),
                IP: this.req.ip!,
                role: 'anonymous',
                expire: now(true) + 1000 * 60 * 60 * 24 * 7,
                logged: false
            }
            if (!await this.saveSession(session)) {
                throw new Error("DBSERVER: Failed to save session");
            }
            return session;
        } else {
            return this.setSession(data, false);
        }
    }
    async createSession(username: string, cert: { value?: string }) {
        let nsid;
        const id = this.SID || (nsid = randomUUID());
        const rUser = await this.getRow('users', username, 'name');
        const { data: user } = rUser!;
        if (rUser.error) {
            return rUser;
        }
        if (user!.blocked) {
            return { error: 'USER_BLOCKED', status: 403 };
        }
        const { data: currSession } = nsid ? await this.getRow('sessions', id) : {};

        const { data: sessions, error } = await this.getRows('sessions', username, 'username', req => req.order('created_at', { ascending: true }).limit(6));
        if (error) {
            return { error: error, status: 503 };
        }
        if (!currSession && sessions && sessions!.length > 5) {
            await this.deleteRow('sessions', sessions![0].id);
        }
        const pwd_suffix = randomUUID();
        const session: Sessions = {
            id,
            username: username,
            uid: user!.id,
            cid: user!.cid,
            pwd_suffix,
            cert: md5(user!.pwd + pwd_suffix),
            created_at: now(true),
            handshake_time: now(true),
            IP: this.req.ip!,
            role: user!.role,
            expire: now(true) + 1000 * 60 * 60 * 24 * 7,
            logged: false
        }
        cert.value = md5(user!.pwd);
        if (nsid)
            this.SID = nsid;

        return await this.upSert('sessions', session);
    }
    #sid: string = '';
    get SID() {
        return this.#sid || (this.#sid = cookie.SID(this.req, this.res));
    }
    set SID(sid: string) {
        this.#sid = sid;
        cookie.setSID(this.req, this.res, sid);
    }
    /**
     * Load session from database or cache
     * @returns {Promise<Sessions | null>} The session if found, null otherwise 
     * @throws {Error} If the session is not found to user
     */
    async loadSession(): Promise<Sessions | null> {

        if (this.session) return this.session;
        if (cookie.isvalideUUID(this.SID)) {
            if (Packet.sessions.has(this.SID)) {
                return this._session = Packet.sessions.get(this.SID)!;
            }
            const result = await this.getRow('sessions', this.SID);
            if (result.error) {
                this.validate(result);
            }
            else if (result.data) {
                return this.setSession(result.data, false);
            }
        }
        else this.validate({ error: 'SESSION_NOT_FOUND', status: 404 })
        return null;
    }

    async keeyAlive(code = 200, contentType = "application/json", session: Sessions) {
        if (this.isClosed) return;
        this.#closed = true;
        this.res.statusCode = code;
        this.res.setHeader("Connection", "keep-alive");
        this.res.setHeader("Cache-Control", "no-cache, no-transform");
        this.res.setHeader('Transfer-Encoding', 'chunked');
        if (session.cert)
            this.res.setHeader('x-encrypt', 'true');
        this.res.setHeader('Content-Type', contentType);

        // Force headers to be sent
        this.res.flushHeaders();

        const self = this;
        return {
            async write(data: any) {
                if (session.cert)
                    data = await self.encrypt(data, session.cert);
                if (contentType === 'application/json')
                    data = JSON.stringify(data);

                // Write with explicit encoding and callback
                return new Promise<void>((resolve, reject) => {
                    self.res.write(String(data), 'utf8', (err) => {
                        self.res.flush();
                        if (err) reject(err);
                        else resolve();
                    });
                });
            },
            end() {
                self.res.end();
            }
        }
    }
    async return(data: any, code = 200, contentType = "application/json", cert?: string): Promise<void> {
        if (this.isClosed) return;
        this.#closed = true;
        this.res.status(code);
        if (cert) {
            this.res.setHeader('x-encrypt', 'true');
            data = await this.encrypt(data, cert);
            data.cert = cert;
        }
        if (contentType === "application/json") {
            this.res.json(data);
        } else {
            this.res.type(contentType).send(data);
        }
    }
    async serviceWraper(name: string, serviceData: any, data?: any, code = 400) {
        return await this.return({ "#SERVICE": name, "#DATA": serviceData, data }, code, "application/json");
    }
    async json(data: any, code = 200, cert?: string) {
        return await this.return(data, code, "application/json", cert);
    }

    async text(data: string, code = 200, cert?: string) {
        return await this.return(data, code, "text/plain", cert);
    }

    html(data: string, code = 200, cert?: string) {
        this.return(data, code, "text/html", cert);
    }

    close() {
        if (!this.isClosed) {
            this.#closed = true;
            this.res.end();
        }
    }
    async encrypt(data: any, cert?: string) {
        cert = cert || this.session!.cert;
        return cert ? await encryptData(data, cert) : data;
    }
    async decrypt<T>(data: any, cert?: string): Promise<T> {
        cert = cert || this.session!.cert;
        return cert ? await decryptData(data, cert) as T : data as T;
    }
    async request<T extends keyof DatabaseTables, X>(table: T, callback: Callbacks<T, requestResults<X>>): Promise<requestResults<X>> {
        const session = await this.loadSession();
        if (session) {
            let _callback = callback[session.role];
            let e: args<T> = { params: this.params, body: this.body, req: this.db.schema('public').from(table), session };
            if (typeof _callback === 'string') _callback = callback[session.role] = callback[_callback] as R<UserRole, X>;
            if (_callback) return await _callback?.(e);
            else return { error: 'Forbidden', status: 403 };
        }
        return { error: 'Unauthorized', status: 401 };
    }
    async requestAndValidate<T extends keyof DatabaseTables, X>(table: T, callback: Callbacks<T, requestResults<X>>): Promise<requestResults<X>> {
        const e = await this.request(table, callback);
        return this.validate(e), e;
    }
    validate<T>(e: requestResults<T>, cert?: string) {
        if (isDbErr(e))
            e = { error: e.data as any || e.error, statusText: e.data ? e.error : undefined, status: e.status || 403 } as requestResults<T>;
        else if (!e.data && !e.error && !e.status) e = { error: 'UNKNOWN_ERROR', status: 500 } as requestResults<T>;
        const isErr = !!e.error;
        return this.json(e.error || e.data, e.status || (isErr ? 400 : 200), isErr ? undefined : e.cert || cert || this.session?.cert);
    }
    async saveFile(): Promise<fileCreationResult> {
        const packet = this;
        const session = await packet.loadSession();
        if (!session || session.role === 'anonymous') {
            return { error: 'UNAUTHORIZED', code: 401 };
        }

        const file = packet.req.file;

        if (!file) {
            return { error: 'NO_FILE_UPLOADED', code: 400 };
        }

        // Save file metadata to your database using your 'request' pattern
        let { data: result, error, status: errorCode } = await this.request('assets' as any, {
            employee: "admin",
            customer: "admin",
            admin: ({ req }) => req.insert({
                path: file.filename, // The unique name in ./assets
                name: file.originalname,
                mime_type: file.mimetype,
                size: file.size,
                created_by_user_id: session.uid,
                owner: session.uid,
                for: session.role,
                deleted: false,
                created_at: new Date().toISOString()
            }).select().single()
        });

        if (error) return { file, error, code: errorCode };

        return { file, record: result as Assets, code: 201 };
    }
    filter<T extends keyof DatabaseTables>(table: T, query: Partial<Record<keyof DatabaseTables[T], number | range<number> | string | range<string> | string>>, ilikes?: string[]) {
        const req = this.db.from(table).select('*');
        for (const col in query) {
            const val = query[col as keyof DatabaseTables[T]];
            if (val == undefined) continue;
            if (typeof val === 'object') {
                if (col === 'range') req.range(Number(val.from ?? 0), Number(val.to ?? 9));
                else {
                    if (val.from != undefined) req.gte(col, val.from);
                    if (val.to != undefined) req.lte(col, val.to);
                }
            }
            else if (ilikes?.includes(col)) req.ilike(col, `%${val}%`);
            else req.eq(col as any, val as any);
        }
        return req;
    }


}
export interface requestSucessResults<T> {
    error?: undefined;
    status?: number;
    data: T;
    cert?: string;
}
export interface requestErrorResults {
    error: string | Error;
    status: number;
    data?: undefined;
    cert?: undefined;
}
export type requestResults<T> = requestErrorResults | requestSucessResults<T>;
interface fileCreationResult {
    file?: Express.Multer.File;
    record?: Assets;
    error?: Error | string;
    code?: number;
}

declare type range<T> = { from?: T; to?: T; }
declare type V<T> = (x: PostgrestFilterBuilder<{ PostgrestVersion: "12"; }, any, any, (T extends string ? any : any)[], T, unknown, "GET">) => PostgrestFilterBuilder<{ PostgrestVersion: "12"; }, any, any, (T extends string ? any : any)[], T, unknown, "GET">