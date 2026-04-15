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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptData = encryptData;
exports.decryptData = decryptData;
const cache_1 = __importDefault(require("../cache"));
function encryptString(plaintext, password) {
    return __awaiter(this, void 0, void 0, function* () {
        const encoder = new TextEncoder();
        const data = encoder.encode(plaintext);
        // Import the password directly as a raw key
        const key = yield crypto.subtle.importKey("raw", encoder.encode(password), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
        // Generate a random IV (12 bytes is standard for AES-GCM)
        const iv = crypto.getRandomValues(new Uint8Array(12));
        // Encrypt
        const encrypted = yield crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
        // Return JSON object with base64-encoded IV and ciphertext
        return {
            iv: btoa(String.fromCharCode(...iv)),
            data: btoa(String.fromCharCode(...new Uint8Array(encrypted)))
        };
    });
}
function decryptString(json, password) {
    return __awaiter(this, void 0, void 0, function* () {
        const encoder = new TextEncoder();
        if (json.cert) {
            json.cert = atob(json.cert);
        }
        // Decode base64 IV and ciphertext back to Uint8Array
        const iv = Uint8Array.from(atob(json.iv), c => c.charCodeAt(0));
        const cipherBytes = Uint8Array.from(atob(json.data), c => c.charCodeAt(0));
        // Import the password as a raw key
        const key = yield crypto.subtle.importKey("raw", encoder.encode(password), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
        // Decrypt
        const decrypted = yield crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherBytes);
        return new TextDecoder().decode(decrypted);
    });
}
function encryptData(data, cert) {
    return __awaiter(this, void 0, void 0, function* () {
        cert = cert || cache_1.default.cert;
        if (!cert)
            throw new Error("Not authenticated");
        return encryptString(JSON.stringify(data), cert);
    });
}
function decryptData(data, cert) {
    return __awaiter(this, void 0, void 0, function* () {
        cert = cert || cache_1.default.cert;
        if (!cert)
            throw new Error("Not authenticated");
        return JSON.parse(yield decryptString(data, cert));
    });
}
self['crypt'] = {
    decryptData, encryptData
};
