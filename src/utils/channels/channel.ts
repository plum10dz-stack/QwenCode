import { ALL, EventEmitter } from "../EventEmitter";
import { uuid } from "../helpers";

export declare type Bridge = MessageEvent<any>;
export interface request<action extends string = string> {
    sourceId: string;
    type: 'request';
    id: string;
    action: action;
    payload: any;
    timeout?: number;
    udp?: boolean;
}

export interface response {
    targetId: string;
    sourceId: string;
    type: 'response';
    id: string;
    payload: any;
    error?: string;
}

export interface systemRequest {
    type: 'system';
    id: string;
    action: '#state';
    sourceId: string;
    payload?: never;
    timeout?: number;
}

export interface systemResponse {
    type: 'system';
    id: string;
    targetId: string;
    sourceId: string;
    payload: any;
    error?: 'NOTEXIST' | 'EXECUTING' | 'EXECUTED';
}
export type message = request | response;
export interface State<T = request | response> {
    readonly self: Channel;
    readonly bridge: Bridge;
    readonly payload: T;
}

export interface RequestState extends State<request> { }

export interface ResponseState extends State<response> { }

export interface CallState {
    readonly self: Channel;
    readonly bridge: Bridge;
}


export interface IChannel {
    sendResponse(res: response, state: RequestState): void;
    sendRequest(req: request, state: CallState): void;
    onMessage(callback: (msg: message, channelState: any) => void): void;
}

declare type CallStateType = 'TIMEOUT' | 'CALLING' | 'ERROR' | 'PASSEDAWAY' | 'NORESPONSE';
export class Channel extends EventEmitter<[RequestState | ResponseState]> {
    async stateOf(req: request): Promise<CallStateType> {
        if (this.has(req.id)) {
            const x = await this.call({ action: '#state', id: req.id, sourceId: this.id, payload: undefined, type: 'request', timeout: 1000 });
            return x.payload
        } else return 'PASSEDAWAY';
    }
    readonly id: string;
    constructor(private channel: IChannel, id: string = uuid()) {
        super();
        this.id = id;
        channel.onMessage((msg, channelState) => { this.#onMessage(msg, channelState); });
    }

    #onMessage(msg: message, bridge: any) {
        const state: State = { self: this, bridge: bridge, payload: msg };
        if (msg.type === 'request')
            this.#request(state as RequestState);
        else if (msg.type === 'response')
            this.#response(state as ResponseState);
    }

    async  #request(state: RequestState) {
        const msg: request = state.payload;
        if (!this.has(msg.action)) return;
        const response: response = {
            targetId: msg.sourceId,
            sourceId: this.id,
            id: msg.id,
            type: 'response',
            payload: null
        }
        try {
            response.payload = await this.emitAsync(msg.action, state);
        } catch (error) {
            response.error = String(error);
        }
        this.channel.sendResponse(response, state);
    }
    #response(state: ResponseState) {
        const msg: response = state.payload;
        if (msg.targetId === this.id) {
            this.emit(msg.id, state);
        }
    }
    createRequest(action: string, payload: any, timeout?: number): request {
        return { id: crypto.randomUUID(), type: 'request', action, payload, sourceId: this.id, timeout: timeout || 5000 };
    }
    call(req: request, state?: State): Promise<response> {
        return new Promise((resolve) => {
            const timeout = typeof req.timeout === 'number' ? setTimeout(() => {
                this.off(req.id, handler);
                resolve({ id: req.id, type: 'response', payload: undefined, error: 'TIMEOUT', targetId: this.id, sourceId: '' });
            }, req.timeout) : null;
            const handler = this.once(req.id, (res) => {
                if (timeout) clearTimeout(timeout);
                resolve((res as ResponseState).payload);
            })
            this.channel.sendRequest(req, state || { self: this, bridge: <Bridge><any>undefined });
        });
    }
    fire(action: string, data: any, state?: State) {
        this.channel.sendRequest(this.createRequest(action, data), state || { self: this, bridge: <any>undefined });
    }
    async smartCall(action: string, payload?: any, timeout?: number, state?: State) {
        const resp = await this.call(this.createRequest(action, payload, timeout), state);
        if (resp.error) throw resp.error;
        else return resp.payload;
    }
    broadcast(action: string, payload?: any) {
        this.fire(action, payload);
    }

    listen(handler: (data: any) => void): () => void {
        this.on(ALL, handler);
        return () => this.off(ALL, handler);
    }

    listenFor(action: ALL | string, handler: (data: any) => void): () => void {
        this.on(action, handler);
        return () => this.off(action, handler);
    }

    listenOnce(action: ALL | string, handler: (data: any) => void): () => void {
        return this.once(action, handler);
    }
}


