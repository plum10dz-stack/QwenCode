import { erpQueue, initAutoHTTP } from "./index";
import { http } from "../http";
import RemoteObject from "../broadCastProperies";

/**
 * MOCK ENVIRONMENT for Verification
 */
async function runVerification() {
    initAutoHTTP();

    // Mock http.call responses to simulate the scenario
    let authDone = false;
    let missingInfoDone = false;

    // Intercept http.call for our test
    const originalCall = http.call.bind(http);

    (http as any).call = async (req: any) => {
        const url = req.url.toString();
        console.log(`[MOCK] Intercepted: ${url}`);

        if (url.includes('reqA')) {
            return { result: "Success A" };
        }

        if (url.includes('reqB')) {
            if (!authDone) {
                authDone = true;
                return { result: { "#ERROR": "AUTH_REQUIRED" } };
            }
            return { result: "Success B (After Auth)" };
        }

        if (url.includes('reqC')) {
            if (!missingInfoDone && !req.body["#FEEDBACK"]) {
                missingInfoDone = true;
                return { result: { "#SERVICE": "missingInfo", "#DATA": ["erp_id"], "__needsFeedback": true } };
            }
            return { result: `Success C (Feedback received: ${JSON.stringify(req.body["#FEEDBACK"])})` };
        }

        return originalCall(req);
    };

    // Mock Authenticator.start
    const authenticator = await import("../authenticator");
    (authenticator as any).start = async () => {
        console.log("[MOCK] Authenticator running...");
        return new Promise(r => setTimeout(r, 500));
    };

    // Mock UI Prompt
    (RemoteObject as any).call = async (cmd: string, args: any) => {
        if (cmd === 'UI.prompt') {
            console.log(`[MOCK] UI Prompt: ${args.message}`);
            return "MOCK_VAL_123";
        }
    };

    console.log("--- STARTING AUTO HTTP FLOW ---");

    // const pA = erpQueue.erpCall({ url: "/reqA", method: "GET" });
    // const pB = erpQueue.erpCall({ url: "/reqB", method: "GET" });
    // const pC = erpQueue.erpCall({ url: "/reqC", method: "POST", body: { initial: "data" } });

    // const results = await Promise.all([pA, pB, pC]);

    // console.log("--- FINAL RESULTS ---");
    // results.forEach((r, i) => console.log(`${i}: ${JSON.stringify(r)}`));
}

// runVerification(); // Run this in a test runner or uncomment in dev
