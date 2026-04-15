



// utils/crypto.ts


// md5.ts


/**
 * Encrypt a plaintext string with AES-GCM using a password.
 */
async function encryptString(
    plaintext: string,
    password: string
): Promise<{ iv: string; data: string, password: string }> {
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
        data: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
        password
    };
}

/**
 * Decrypt a JSON { iv, data } with AES-GCM using the same password.
 */
async function decryptString(
    json: { iv: string; data: string },
    password: string
): Promise<string> {
    const encoder = new TextEncoder();

    // Decode base64 IV and ciphertext back to Uint8Array
    const iv = Uint8Array.from(atob(json.iv), (c) => c.charCodeAt(0));
    const cipherBytes = Uint8Array.from(atob(json.data), (c) =>
        c.charCodeAt(0)
    );

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
declare type TJSON = number | string | boolean | undefined | null | { [n: string]: TJSON };
/**
 * Encrypt a JSON object using a certificate (password).
 */
export async function encryptData(
    data: TJSON,
    cert: string
): Promise<{ iv: string; data: string }> {
    if (!cert) throw new Error("Not authenticated");
    return encryptString(JSON.stringify(data), cert);
}

/**
 * Decrypt a JSON { iv, data } using a certificate (password).
 */
export async function decryptData(
    data: { iv: string; data: string },
    cert: string
): Promise<string> {
    if (!cert) throw new Error("Not authenticated");
    return decryptString(data, cert);
}