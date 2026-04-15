"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
const http_1 = require("../http");
const broadCastProperies_1 = __importDefault(require("../broadCastProperies"));
/**
 * MOCK ENVIRONMENT for Verification
 */
function runVerification() {
    return __awaiter(this, void 0, void 0, function* () {
        (0, index_1.initAutoHTTP)();
        // Mock http.call responses to simulate the scenario
        let authDone = false;
        let missingInfoDone = false;
        // Intercept http.call for our test
        const originalCall = http_1.http.call.bind(http_1.http);
        http_1.http.call = (req) => __awaiter(this, void 0, void 0, function* () {
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
        });
        // Mock Authenticator.start
        const authenticator = yield Promise.resolve().then(() => __importStar(require("../authenticator")));
        authenticator.start = () => __awaiter(this, void 0, void 0, function* () {
            console.log("[MOCK] Authenticator running...");
            return new Promise(r => setTimeout(r, 500));
        });
        // Mock UI Prompt
        broadCastProperies_1.default.call = (cmd, args) => __awaiter(this, void 0, void 0, function* () {
            if (cmd === 'UI.prompt') {
                console.log(`[MOCK] UI Prompt: ${args.message}`);
                return "MOCK_VAL_123";
            }
        });
        console.log("--- STARTING AUTO HTTP FLOW ---");
        // const pA = erpQueue.erpCall({ url: "/reqA", method: "GET" });
        // const pB = erpQueue.erpCall({ url: "/reqB", method: "GET" });
        // const pC = erpQueue.erpCall({ url: "/reqC", method: "POST", body: { initial: "data" } });
        // const results = await Promise.all([pA, pB, pC]);
        // console.log("--- FINAL RESULTS ---");
        // results.forEach((r, i) => console.log(`${i}: ${JSON.stringify(r)}`));
    });
}
// runVerification(); // Run this in a test runner or uncomment in dev
