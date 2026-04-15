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
exports.erpQueue = exports.ERPQueue = void 0;
const AsyncTaskQueue_1 = require("../../concurrency/AsyncTaskQueue");
const http_1 = require("../http");
const common_1 = require("../../common");
const authenticator_1 = require("../authenticator");
const cache_1 = require("../../cache");
/**
 * ERPQueue
 *
 * An automation-first HTTP queue designed for ERP systems.
 * It enforces sequential requests and handles complex server directives (services)
 * by injecting mid-flow tasks (like Auth) and processing feedback loops.
 */
class ERPQueue extends AsyncTaskQueue_1.AsyncTaskQueue {
    cancel(erpCall) {
        const queue = this._queue.filter((item) => item.job.self === erpCall || item === erpCall);
        if (queue.length !== 0) {
            super.cancel(queue[0].job);
            queue[0].reject(new Error("Queue cancelled"));
        }
    }
    /**
     * Executes a request within the automated ERP lifecycle.
     *
     * Pattern:
     * 1. Submit Request -> 2. Inspect Response
     * -> If Auth Error: Inject Auth Job at index 0, Pause & Retry from top.
     * -> If Service requested: Run service, gather data, Merge into Body, Retry.
     * -> If Success: Resolve.
     */
    erpCall(req, cert) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.push({
                fn: (job) => __awaiter(this, void 0, void 0, function* () {
                    var _a;
                    console.log(`[AutoHTTP] Processing ${req.method} ${req.url}`);
                    // Execute using the base http class
                    const signal = yield http_1.http.call(yield buildRequest(req), cert);
                    // --- 1. AUTOMATIC AUTH INJECTION ---
                    if (this.isAuthError(signal)) {
                        console.warn("[AutoHTTP] 401/Auth-Required. Injecting high-priority Auth task.");
                        // Inject a re-authentication job at the very front of the queue
                        this.push({
                            fn: () => __awaiter(this, void 0, void 0, function* () {
                                console.log("[AutoHTTP] Running injected Auth process...");
                                yield (0, authenticator_1.login)();
                                return new common_1.TaskControlSignal({ result: "AUTH_SUCCESS" });
                            })
                        }, job); // 'job' identifies the current position for injection
                        // Return a signal to Pause without Shifting.
                        // This pauses the current request, allowing the injected Auth job to run first.
                        // Once resumed, the queue restarts at the Auth job, then returns here.
                        const retrySignal = new common_1.TaskControlSignal({ retry: true, pause: !true });
                        // Auto-resume after a short delay to trigger the injected auth task
                        //setTimeout(() => this.resume(), 100);
                        return retrySignal;
                    }
                    // --- 2. SERVICE FEEDBACK / REACTIVE RETRY ---
                    // If the signal matches a service that requires a feedback loop (sending data back)
                    // We detect it here and update the original request body for the next retry.
                    const data = signal.result;
                    if (data && ((_a = signal.result) === null || _a === void 0 ? void 0 : _a.__needsFeedback)) {
                        console.log("[AutoHTTP] Service feedback loop triggered. Merging data and retrying...");
                        const updatedReq = Object.assign(Object.assign({}, req), { body: Object.assign(Object.assign({}, (req.body || {})), { "#FEEDBACK": data // Carry the service results back to the server
                             }) });
                        // Update the job arguments so the next 'retry' uses the new data
                        job.args = [updatedReq, cert];
                        return new common_1.TaskControlSignal({ retry: true });
                    }
                    // --- 3. STANDARD SUCCESS/ERROR ---
                    return signal;
                }),
                args: [req, cert],
                self: req
            });
        });
    }
    /**
     * Identifies if a response signal indicates an authentication breakdown
     */
    isAuthError(signal) {
        return (signal.error in authenticator_1.SESSION_ERRORS);
    }
}
exports.ERPQueue = ERPQueue;
function buildRequest(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const env = yield (0, cache_1.AsyncEnv)();
        return {
            get url() {
                if (params.url)
                    return params.url;
                return new URL(params.route, env.API_URL);
            },
            method: params.method,
            body: params.body,
            encrypt: params.encrypt === undefined ? true : params.encrypt,
            headers: params.headers
        };
    });
}
// Global Export
exports.erpQueue = new ERPQueue();
self['erpQueue'] = exports.erpQueue;
