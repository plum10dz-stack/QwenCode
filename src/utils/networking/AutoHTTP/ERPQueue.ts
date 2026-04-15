import { AsyncTaskQueue, QueueJob } from "../../concurrency/AsyncTaskQueue";
import { http, request, httpResponse } from "../http";
import { TaskControlSignal } from "../../common";
import { SESSION_ERRORS, login as startAuth } from "../authenticator";
import { AsyncEnv } from "../../cache";

/**
 * ERPQueue
 * 
 * An automation-first HTTP queue designed for ERP systems.
 * It enforces sequential requests and handles complex server directives (services) 
 * by injecting mid-flow tasks (like Auth) and processing feedback loops.
 */
export class ERPQueue extends AsyncTaskQueue {

    cancel<T>(erpCall: T) {
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
    async erpCall<T>(req: ERPRequest, cert?: string): Promise<T> {

        return this.push({
            fn: async (job: QueueJob): Promise<any> => {
                console.log(`[AutoHTTP] Processing ${req.method} ${req.url}`);
                // Execute using the base http class
                const signal = await http.call(await buildRequest(req), cert);

                // --- 1. AUTOMATIC AUTH INJECTION ---
                if (this.isAuthError(signal)) {
                    console.warn("[AutoHTTP] 401/Auth-Required. Injecting high-priority Auth task.");

                    // Inject a re-authentication job at the very front of the queue
                    this.push({
                        fn: async () => {
                            console.log("[AutoHTTP] Running injected Auth process...");
                            await startAuth();
                            return new TaskControlSignal({ result: "AUTH_SUCCESS" });
                        }
                    }, job); // 'job' identifies the current position for injection

                    // Return a signal to Pause without Shifting.
                    // This pauses the current request, allowing the injected Auth job to run first.
                    // Once resumed, the queue restarts at the Auth job, then returns here.
                    const retrySignal = new TaskControlSignal({ retry: true, pause: !true });

                    // Auto-resume after a short delay to trigger the injected auth task
                    //setTimeout(() => this.resume(), 100);

                    return retrySignal;
                }

                // --- 2. SERVICE FEEDBACK / REACTIVE RETRY ---
                // If the signal matches a service that requires a feedback loop (sending data back)
                // We detect it here and update the original request body for the next retry.
                const data = signal.result;
                if (data && signal.result?.__needsFeedback) {
                    console.log("[AutoHTTP] Service feedback loop triggered. Merging data and retrying...");

                    const updatedReq: request = {
                        ...req,
                        body: {
                            ...(req.body || {}),
                            "#FEEDBACK": data // Carry the service results back to the server
                        }
                    };

                    // Update the job arguments so the next 'retry' uses the new data
                    job.args = [updatedReq, cert];

                    return new TaskControlSignal({ retry: true });
                }

                // --- 3. STANDARD SUCCESS/ERROR ---
                return signal;
            },
            args: [req, cert],
            self: req
        });
    }

    /**
     * Identifies if a response signal indicates an authentication breakdown
     */
    private isAuthError(signal: TaskControlSignal): boolean {
        return (signal.error in SESSION_ERRORS);
    }
}
async function buildRequest(params: ERPRequest) {
    const env = await AsyncEnv();
    return <request>{
        get url(): URL {
            if (params.url) return params.url;
            return new URL(params.route, env.API_URL);
        },
        method: params.method,
        body: params.body,
        encrypt: params.encrypt === undefined ? true : params.encrypt,
        headers: params.headers
    };
}
// Global Export
export const erpQueue = new ERPQueue();
export interface ERPRequest extends request {
    method: Method,
    route: string,
    body?: any,
    headers?: HeadersInit,
    encrypt?: boolean,
    title?(erpCall: ERPRequest, e: { queue: ERPQueue }): string; // this used for toast title for request list(show for user in UI list)
    message?(erpCall: ERPRequest, e: { queue: ERPQueue }): string; // this used for toast message for request list(show for user in UI list)
    actions?(erpCall: ERPRequest, e: { queue: ERPQueue }): Array<{
        label: string;
        action: (erpCall: ERPRequest, e: { queue: ERPQueue }) => void;
    }>;
}
declare type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'TRACE' | 'CONNECT';

(self as any)['erpQueue'] = erpQueue;