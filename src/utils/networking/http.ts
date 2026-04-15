
import { default as Env, fetch } from "../cache";
import { TaskControlSignal, tryParseJSON } from "../common";
import { decryptData, encryptData } from "../crypto/encrypt";

export class http {

    static readonly #services: Map<string, (e: httpResponse, args: serviceData) => Promise<TaskControlSignal>> = new Map();

    static async fetch<ENC extends boolean>(req: request, cert?: ENC extends true ? string : never): Promise<httpResponse> {
        const options: RequestInit = {
            method: req.method,
            body: req.encrypt && req.body ? JSON.stringify(await encryptData(req.body, cert || Env.cert)) : (req.body != null ? JSON.stringify(req.body) : undefined),
            headers: req.encrypt && req.body ? {
                ...(req.headers || {}),
                'Content-Type': 'application/json',
                'accept-service': 'true',
                'S-ID': Env.s_id,
                'x-encrypt': 'true'
            } : {
                ...(req.headers || {}),
                'S-ID': Env.s_id,
            }
        };
        const p = await fetch(req.url || new URL(req.route || '', Env.API_URL), { ...options, signal: req.signal });
        const parser = this.#parsers.get(p.headers.get('Content-Type')?.split(';')[0] || '');
        const encrypted = p.headers.get('x-encrypt') === 'true';

        let data = parser ? await this.#processData(await parser(p), encrypted, cert) : await p.text();
        return { url: p.url, data, status: p.status, headers: p.headers, ok: p.ok, bodyUsed: p.bodyUsed, type: p.type, statusText: p.statusText };
    }

    static async *fetchStream<ENC extends boolean>(
        req: request,
        cert?: ENC extends true ? string : never
    ): AsyncGenerator<{ chunk: any, fullResponse: Partial<httpResponse> }> {

        const options: RequestInit = {
            method: req.method,
            credentials: 'include',
            body: req.encrypt && req.body
                ? JSON.stringify(await encryptData(req.body, cert || Env.cert))
                : (req.body != null ? JSON.stringify(req.body) : undefined),
            headers: {

                ...(req.headers || {}),
                'S-ID': Env.s_id,
                ...(req.encrypt && req.body ? {
                    'Content-Type': 'application/json',
                    'accept-service': 'true',
                    'x-encrypt': 'true'
                } : {})
            }
        };

        const response = await fetch(req.url || new URL(req.route || '', Env.API_URL), { ...options, signal: req.signal });

        if (!response.body) {
            throw new Error("Response body is null; cannot stream.");
        }

        const reader = response.body.getReader();
        const encrypted = response.headers.get('x-encrypt') === 'true';

        // Base response metadata
        const meta = {
            url: response.url,
            status: response.status,
            headers: response.headers,
            ok: response.ok
        };

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const decoder = new TextDecoder('utf-8');
                // Decode the stream chunk
                let rawChunk = decoder.decode(value, { stream: true });

                const data = tryParseJSON(rawChunk);

                // If the chunk is encrypted or needs parsing, handle it here
                // Note: Partial JSON chunks require a buffer if they aren't complete lines
                try {

                    let processedChunk = encrypted
                        ? await this.#processData(data, true, cert)
                        : data;

                    yield {
                        chunk: processedChunk,
                        fullResponse: meta
                    };
                } catch (error) {
                    debugger;
                    yield {
                        chunk: rawChunk,
                        fullResponse: meta
                    };
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    static async #processData(data: any, encrypted?: boolean, cert?: string): Promise<any> {

        if (typeof data === 'object') {
            if (encrypted) {
                if ('iv' in data && 'data' in data) {
                    data = await decryptData(data, cert || Env.cert);
                }
                else throw new Error("Invalid encrypted data");
            }
        }
        return data;
    }
    static #parsers: Map<string, (res: Response) => Promise<any>> = new Map([
        ['application/json', (res: Response) => res.json()],
        ['text/plain', (res: Response) => res.text()],
        ['application/octet-stream', (res: Response) => res.arrayBuffer()],
    ]);
    static async call<ENC extends boolean>(req: request, cert?: ENC extends true ? string : never): Promise<TaskControlSignal> {
        const result: httpResponse = await this.fetch(req, cert), data = result.data;
        if (typeof data === 'string' && result.status >= 400) {
            return new TaskControlSignal({ error: data });
        }
        if (typeof data === 'object') {
            if ('#SERVICE' in data) {
                const service = this.#services.get(data['#SERVICE']);
                return service ? await service(result, data as serviceData) : this.serviceNotFound(result);
            } else if ('#ERROR' in data || result.status >= 400) {
                return this.error(result);
            }
        }
        return new TaskControlSignal({ result: data });
    }
    static serviceNotFound(response: httpResponse): TaskControlSignal {
        return new TaskControlSignal({ error: "Service not found", result: response });
    }
    static error(response: httpResponse): TaskControlSignal {
        return new TaskControlSignal({ error: response.data['#ERROR'], result: response });
    }
    static addServices(services: Record<string, (e: httpResponse) => Promise<TaskControlSignal>>) {
        Object.entries(services).forEach(([service, task]) => {
            this.#services.set(service, task);
        });
    }

    static async callAPI<T>({ method, route, body, headers }: { method?: Method, route: string, body?: any, headers?: HeadersInit }, cert: string = Env.cert) {
        //combine the Env.API_URL + route with URL
        const url = new URL(route, Env.API_URL);
        return http.fetch({
            url: url,
            method: method || 'GET',
            body: body || undefined,
            encrypt: true,
            headers
        }, cert).then((res) => {
            return res.data as T;
        }).catch((err) => {
            return new Error(err);
        });
    }
}
declare type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'TRACE' | 'CONNECT';
export interface httpResponse {
    url: string;
    data: any;
    status: number;
    headers: Headers;
    ok: boolean;
    bodyUsed: boolean;
    type: ResponseType;
    statusText: string;
    //fetchQuee?: AsyncTaskQueue;
}

export interface request {
    route?: string;
    url?: URL;
    method: string;
    body?: any;
    headers?: HeadersInit;
    encrypt?: boolean;
    /** AbortSignal to cancel an in-flight fetch or stream. */
    signal?: AbortSignal;
}
export interface serviceData {
    '#SERVICE': string;
    '#DATA': any;
    data: any;
}
