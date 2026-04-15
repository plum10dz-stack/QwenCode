/// <reference types="node" />
// this file is node.js environment and it is in supabase edge function / use this file as isolate  

//create a md5 hash of a string
import { md5 } from '../utils/crypto';
const hash = md5('hello');
console.log(hash);
//Encrypt a string with AES-GCM using only a password
import { Buffer } from 'buffer';
import crypto from 'crypto';
export const encrypt = (text: string, password: string) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', password, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return { iv: iv.toString('hex'), encrypted: encrypted.toString('hex'), authTag: cipher.getAuthTag().toString('hex') };
};
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
export const encryptData = (data: any, password: string) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', password, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
    return { iv: iv.toString('hex'), data: encrypted.toString('hex'), authTag: cipher.getAuthTag().toString('hex') };
};

export const decryptData = (data: { iv: string; data: string; authTag: string }, password: string) => {
    const decipher = crypto.createDecipheriv('aes-256-gcm', password, Buffer.from(data.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));
    return JSON.parse(<any>decipher.update(Buffer.from(data.data, 'hex')) + decipher.final());
};

