import { Request, Response } from 'express';
import * as cookieParser from 'cookie-parser';

interface CookieOptions {
    httpOnly?: boolean;
    secure?: boolean;
    signed?: boolean;
    sameSite?: 'lax' | 'strict' | 'none' | boolean;
    path?: string;
    maxAge?: number;
    domain?: string;
}
export const SID: 'S-ID' = 'S-ID';
class CookieManager {
    private readonly secret: string;
    private readonly isProduction: boolean;

    constructor(
        secret: string = process.env.SESSION_SECRET || 'DEFAULT_SECRET',
        isProduction: boolean = process.env.NODE_ENV === 'production'
    ) {
        this.secret = secret;
        this.isProduction = isProduction;
    }

    /**
     * Default configuration focused on security and cross-origin compatibility.
     */
    private get defaultOptions(): CookieOptions {
        return {
            httpOnly: false,
            // In TS, sameSite must be lowercase 'none' | 'lax' | 'strict'
            sameSite: !this.isProduction ? 'none' : 'lax',
            secure: this.isProduction,
            signed: true,
            path: '/',
            maxAge: 100000 * 60 * 60 * 24 // 24 hours

        };
    }

    /**
     * Bakes a new cookie into the response.
     */
    public set<T = string | object>(
        res: Response,
        name: string,
        value: T,
        options: CookieOptions = {}, req: Request
    ) {
        const finalOptions = { ...this.defaultOptions, ...options };

        if (finalOptions.sameSite === 'none' && !finalOptions.secure) {
            console.warn(`[CookieManager] Security Risk: SameSite='none' requires Secure=true.`);
        }
        res.cookie(name, value, finalOptions);
        if (!req.cookies) req.cookies = {};
        req.cookies[name] = value;
        return value;
    }

    /**
     * Retrieves and validates a signed cookie.
     * Returns null if the signature is invalid or cookie is missing.
     */
    public get<T = string | object>(req: Request, name: string): T | null {
        // 1. Check signedCookies (populated by cookie-parser middleware)
        const signedValue = req.signedCookies?.[name];
        if (!signedValue) {
            // 2. Manual fallback if middleware is not used or hasn't run
            const rawValue = req.cookies?.[name];
            if (rawValue) {
                const unsigned = cookieParser.signedCookie(rawValue, this.secret);
                if (unsigned !== false) return unsigned as unknown as T;
            }
        }
        return null;
    }

    /**
     * Removes the cookie from the client.
     */
    public clear(res: Response, name: string, options: CookieOptions = {}): void {
        // Note: When clearing, options must match the 'path' and 'domain' used to set it.
        const { signed, ...clearOptions } = this.defaultOptions;
        res.clearCookie(name, { ...clearOptions, ...options });
    }
    SID(req: Request, res: Response) {
        let sid = this.sidFromCookie ? this.get<string>(req, SID) : req.header(SID) as any;
        if (!this.isvalideUUID(sid)) {
            sid = '';
            if (this.sidFromCookie)
                this.set<string>(res, SID, sid, {}, req);
            else
                res.setHeader(SID, sid);
        }
        return sid;
    }
    setSID(req: Request, res: Response, sid: string) {
        if (this.sidFromCookie) {
            this.set<string>(res, SID, sid, {}, req);
        } else {
            res.setHeader(SID, sid);
        }
    }
    isvalideUUID(uuid: string) {
        return uuid && typeof uuid === 'string' && uuid.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
    }
    sidFromCookie = false;
}

export default new CookieManager(process.env.COOKIE_SECRET, false);