"use strict";
/**
 * _shared/auth.ts — shared JWT verification and Supabase client helpers.
 * Used by the unified api/index.ts edge function.
 */
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
exports.CORS = exports.ALLOWED_TABLES = void 0;
exports.anonClient = anonClient;
exports.serviceClient = serviceClient;
exports.json = json;
exports.err = err;
exports.requireAuth = requireAuth;
const supabase_js_1 = require("@supabase/supabase-js");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
/** Tables the edge function is allowed to touch — guards against injection */
exports.ALLOWED_TABLES = new Set([
    "categories", "suppliers", "customers", "endCustomers", "end_customers",
    "products", "movements", "purchaseOrders", "purchase_orders",
    "salesOrders", "sales_orders", "sPayments", "s_payments",
    "pPayments", "p_payments",
]);
/** Anon client — uses caller's JWT, RLS applies */
function anonClient(jwt) {
    return (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_ANON, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false },
    });
}
/** Service-role client — bypasses RLS; use only after auth */
function serviceClient() {
    return (0, supabase_js_1.createClient)(SUPABASE_URL, SERVICE_ROLE, {
        auth: { persistSession: false },
    });
}
/** CORS headers for all responses */
exports.CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};
/** Respond with JSON */
function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: Object.assign(Object.assign({}, exports.CORS), { "Content-Type": "application/json" }),
    });
}
/** Respond with a JSON error */
function err(message, status = 400) {
    return json({ error: message }, status);
}
/**
 * Verify JWT and return user + role.
 * Returns null if authentication fails.
 */
function requireAuth(req) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const header = (_a = req.headers.get("Authorization")) !== null && _a !== void 0 ? _a : "";
        if (!header.startsWith("Bearer "))
            return null;
        const jwt = header.slice(7);
        const client = anonClient(jwt);
        const { data, error } = yield client.auth.getUser();
        if (error || !data.user)
            return null;
        const role = (_c = (_b = data.user.app_metadata) === null || _b === void 0 ? void 0 : _b.role) !== null && _c !== void 0 ? _c : "none";
        return { user: data.user, role, jwt };
    });
}
