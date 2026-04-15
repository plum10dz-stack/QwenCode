"use strict";
/// <reference types="node" />
// this file is node.js environment and it is in supabase edge function / use this file as isolate  
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decryptData = exports.encryptData = exports.encrypt = void 0;
//create a md5 hash of a string
const crypto_1 = require("../utils/crypto");
const hash = (0, crypto_1.md5)('hello');
console.log(hash);
//Encrypt a string with AES-GCM using only a password
const buffer_1 = require("buffer");
const crypto_2 = __importDefault(require("crypto"));
const encrypt = (text, password) => {
    const iv = crypto_2.default.randomBytes(12);
    const cipher = crypto_2.default.createCipheriv('aes-256-gcm', password, iv);
    const encrypted = buffer_1.Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return { iv: iv.toString('hex'), encrypted: encrypted.toString('hex'), authTag: cipher.getAuthTag().toString('hex') };
};
exports.encrypt = encrypt;
// change the iv ,encrypted arguments to Object {iv:string,data:any}
/**
  // Decrypt a JSON { iv, data } with AES-GCM using the same password
    async decryptString(json: { iv: string; data: string; }, password: string) {
        const encoder = new TextEncoder();

        // Decode base64 IV and ciphertext back to Uint8Array
        const iv = Uint8Array.from(atob(json.iv), c => c.charCodeAt(0));
        const cipherBytes = Uint8Array.from(atob(json.data), c => c.charCodeAt(0));

        // Import the password as a raw key
        const key = await crypto.subtle.importKey(
            "raw",
            encoder.encode(password),
            { name: "AES-GCM" },
            false,
            ["encrypt", "decrypt"]
        );

        // Decrypt
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            key,
            cipherBytes
        );

        return new TextDecoder().decode(decrypted);
    },
 */
const encryptData = (data, password) => {
    const iv = crypto_2.default.randomBytes(12);
    const cipher = crypto_2.default.createCipheriv('aes-256-gcm', password, iv);
    const encrypted = buffer_1.Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
    return { iv: iv.toString('hex'), data: encrypted.toString('hex'), authTag: cipher.getAuthTag().toString('hex') };
};
exports.encryptData = encryptData;
const decryptData = (data, password) => {
    const decipher = crypto_2.default.createDecipheriv('aes-256-gcm', password, buffer_1.Buffer.from(data.iv, 'hex'));
    decipher.setAuthTag(buffer_1.Buffer.from(data.authTag, 'hex'));
    return JSON.parse(decipher.update(buffer_1.Buffer.from(data.data, 'hex')) + decipher.final());
};
exports.decryptData = decryptData;
