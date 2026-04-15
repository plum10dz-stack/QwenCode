import { IChannel, message, response, RequestState, request, CallState, Bridge, Channel } from "./channel";


export class ISWChannel implements IChannel {
    _callback: ((msg: message, channelState: any) => void) | null = null;
    get isServiceWorker(): boolean {
        return typeof ServiceWorkerGlobalScope !== 'undefined' && self instanceof ServiceWorkerGlobalScope;
    }
    sendResponse(res: response, state: RequestState) {
        const event: MessageEvent<any> = state.bridge as any;
        if (!event) {
            // role : serviceWorker
            (self as any).customers.get((event as any).id).then((customer: any) => {
                customer?.postMessage(res);
            });
        }
        else
            event.source?.postMessage(res);
    }
    get Clients(): Promise<any[]> {
        return new Promise((res) => {
            (self as any).clients.matchAll({ includeUncontrolled: true }).then((v: any[]) => {
                res(v);
            }).catch((err: any) => {
                res([]);
            });

        });
    }
    async sendRequest(req: request, state: CallState) {
        if (this.isServiceWorker) {
            const p = state.bridge as MessageEvent<any>;
            if (p && p.source)
                p.source?.postMessage(req);
            else {
                const clients = await this.Clients;
                clients.forEach((client) => {
                    client?.postMessage(req);
                });
            }
        }
        else
            navigator.serviceWorker.controller?.postMessage(req);
    }
    onMessage(callback: (msg: message, bridge: Bridge) => void) {
        this._callback = callback;
    }
    constructor(target: Worker | ServiceWorkerContainer = navigator.serviceWorker) {
        if (target) {
            target.addEventListener('message', (event: Event) => {
                if (this._callback) this._callback((event as MessageEvent).data, event);
            });
        } else {
            self.addEventListener('message', (event) => {
                if (this._callback) this._callback(event.data, event);
            });
        }
    }
}
export class IBroadcastChannel implements IChannel {
    private readonly bc: BroadcastChannel;
    private _callback: ((msg: message, channelState: any) => void) | null = null;
    onMessage(callback: (msg: message, channelState: any) => void) {
        this._callback = callback;
    }
    sendRequest(req: request, state: RequestState) {
        this.bc.postMessage(req);
    }
    sendResponse(res: response, state: RequestState) {
        const event: MessageEvent<any> = state.bridge as any;
        if (!event) {
            // role : serviceWorker
            (self as any).customers.get((event as any).id).then((customer: any) => {
                customer?.postMessage(res);
            });
        }
        else
            event.source?.postMessage(res);
    }
    constructor(private readonly name: string) {
        this.bc = new BroadcastChannel(name);
        this.bc.addEventListener('message', (e) => {
            if (this._callback) this._callback(e.data, e);
        })
    }
}
export const swChannel = new Channel(new ISWChannel());
export default swChannel;