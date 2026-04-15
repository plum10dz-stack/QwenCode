import Env from "../cache";

async function encryptString(plaintext: string, password: string) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);

    // Import the password directly as a raw key
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
    );

    // Generate a random IV (12 bytes is standard for AES-GCM)
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt
    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        data
    );

    // Return JSON object with base64-encoded IV and ciphertext
    return {
        iv: btoa(String.fromCharCode(...iv)),
        data: btoa(String.fromCharCode(...new Uint8Array(encrypted)))
    };
}
async function decryptString(json: { iv: string; data: string; cert?: string }, password: string) {
    const encoder = new TextEncoder();
    if (json.cert) {
        json.cert = atob(json.cert);
    }
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
}
export async function encryptData(data: any, cert?: string) {
    cert = cert || Env.cert;
    if (!cert) throw new Error("Not authenticated");
    return encryptString(JSON.stringify(data), cert);
}

export async function decryptData(data: { iv: string; data: string; }, cert?: string) {
    cert = cert || Env.cert;
    if (!cert) throw new Error("Not authenticated");
    return JSON.parse(await decryptString(data, cert));
}

(self as any)['crypt'] = {
    decryptData, encryptData
}