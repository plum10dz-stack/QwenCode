import { http, httpResponse, serviceData, request } from "../http";
import { TaskControlSignal } from "../../common";
import Env from "../../cache";
import RemoteObject from "../broadCastProperies";


export const ERPServices = {
    /**
     * Returns the current client time.
     * Useful for synchronization checks.
     */
    "getTime": async (res: httpResponse): Promise<TaskControlSignal> => {
        return new TaskControlSignal({
            result: { timestamp: Date.now() }
        });
    },

    /**
     * Returns requested internal data.
     * The server specifies which keys it needs in the service data.
     */
    "getData": async (res: httpResponse, args: serviceData): Promise<TaskControlSignal> => {
        const requestedKeys: string[] = args['#DATA'] || [];
        const result: Record<string, any> = {};

        for (const key of requestedKeys) {
            result[key] = (Env as any)[key];
        }

        return new TaskControlSignal({ result });
    },

    /**
     * Triggers a UI prompt to ask the user for information.
     */
    "askUser": async (res: httpResponse, args: serviceData): Promise<TaskControlSignal> => {
        const { title, message, field } = args['#DATA'] || {};

        try {
            // Attempt to use RemoteObject if it's a multi-process environment (e.g. SW <-> UI)
            const input = await RemoteObject.call('UI.prompt', { title, message, field }, 60000);
            return new TaskControlSignal({ result: { [field || 'input']: input } });
        } catch (e) {
            // Fallback to standard prompt if running in a window context
            const input = typeof prompt !== 'undefined' ? prompt(`${title}: ${message}`) : null;
            return new TaskControlSignal({ result: { [field || 'input']: input } });
        }
    },

    /**
     * Specifically handles missing information by asking the user
     * and then signaling a REPLACE/RETRY with the new info.
     */
    "missingInfo": async (res: httpResponse, args: serviceData): Promise<TaskControlSignal> => {
        const missingFields: string[] = args['#DATA'] || [];
        const collectedData: Record<string, any> = {};

        for (const field of missingFields) {
            const val = await RemoteObject.call('UI.prompt', { message: `Please provide ${field}` });
            collectedData[field] = val;
        }

        // We return the collected data. 
        // Logic in the Queue will decide how to re-attach this to the original request.
        return new TaskControlSignal({ result: collectedData });
    },

    /**
     * Switches the request to a fallback URL provided by the server.
     */
    "fallbackURL": async (res: httpResponse, args: serviceData): Promise<TaskControlSignal> => {
        const newUrl = args['#DATA']?.url;
        if (!newUrl) return new TaskControlSignal({ error: "No fallback URL provided" });

        return new TaskControlSignal({
            result: { msg: "Switching to fallback" },
            // This is a hint to the queue handler to retry with a modified request
        });
    }
};

/**
 * Initialize ERP Services
 */
export function initERPServices() {
    http.addServices(ERPServices as any);
}
