"use strict";
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamChanges = streamChanges;
const http_1 = require("../../utils/networking/http");
/**
 * Raw SSE / NDJSON generator that connects to /stream/changes and yields
 * parsed {@link StreamChunk} objects.
 *
 * Protocol: the server may send either:
 *   - Standard SSE:  `data: <JSON>\n\n`
 *   - NDJSON:        `<JSON>\n`
 *
 * Both are handled transparently by stripping the optional "data:" prefix.
 *
 * @param sinceMs  Epoch ms of the last known sync point.
 *                 The server will only send rows with `updated_at > since`.
 * @param signal   Optional AbortSignal to cleanly tear down the connection.
 */
function streamChanges(sinceMs, signal) {
    return __asyncGenerator(this, arguments, function* streamChanges_1() {
        var _a, e_1, _b, _c;
        var _d;
        const stream = http_1.http.fetchStream({
            route: '/stream/changes',
            method: 'GET',
            headers: { since: sinceMs.toString() },
            signal,
        });
        // Buffer for incomplete lines that arrive mid-chunk.
        let buffer = '';
        try {
            for (var _e = true, stream_1 = __asyncValues(stream), stream_1_1; stream_1_1 = yield __await(stream_1.next()), _a = stream_1_1.done, !_a; _e = true) {
                _c = stream_1_1.value;
                _e = false;
                const { chunk } = _c;
                if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                    break;
                // Normalise: chunk is either a raw string (text/* content-type) or an
                // already-parsed object. Streaming text is expected here.
                buffer += typeof chunk === 'string' ? chunk : JSON.stringify(chunk);
                // Split on newlines; the last element is either empty or a partial line.
                const lines = buffer.split('\n');
                buffer = (_d = lines.pop()) !== null && _d !== void 0 ? _d : ''; // keep incomplete tail for next iteration
                for (const raw of lines) {
                    const line = raw.trim();
                    // Skip SSE keep-alive comments and blank lines.
                    if (!line || line.startsWith(':'))
                        continue;
                    // Strip optional "data: " SSE prefix.
                    const json = line.startsWith('data:') ? line.slice(5).trim() : line;
                    try {
                        const parsed = JSON.parse(json);
                        // Guard: only yield valid chunks that carry a table name.
                        if (parsed && typeof parsed.table === 'string') {
                            yield yield __await({
                                table: parsed.table,
                                rows: Array.isArray(parsed.rows) ? parsed.rows : [],
                                deletes: Array.isArray(parsed.deletes) ? parsed.deletes : [],
                                time: typeof parsed.time === 'number' ? parsed.time : Date.now(),
                            });
                        }
                    }
                    catch (_f) {
                        // Malformed line — log in dev, skip in production.
                        if (typeof self.__DEV__ !== 'undefined') {
                            console.warn('[streamChanges] malformed chunk:', json);
                        }
                    }
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (!_e && !_a && (_b = stream_1.return)) yield __await(_b.call(stream_1));
            }
            finally { if (e_1) throw e_1.error; }
        }
    });
}
