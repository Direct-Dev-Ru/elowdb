/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */



// Generate random bytes using Web Crypto API
function generateRandomBytes(length: number): Uint8Array {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    return array;
}

// Encrypt string data
export async function encryptStringBrowserAnsibleVault(inputString: string, password: string, force: boolean = false): Promise<string> {
    if (!inputString) {
        return '';
    }
    if (!password) {
        throw new Error('password is required for encryption');
    }
    const strData = inputString;

    // Check if the file is already encrypted
    if (strData.startsWith('$ANSIBLE_VAULT;') && !force) {
        throw new Error('data already encrypted and no force flag provided');
    }
    return encrypt(strData, password);
}

// Encrypt the data
async function encrypt(body: string, password: string): Promise<string> {
    const salt = generateRandomBytes(32);
    const { key1, key2, iv } = await genKeyInitctr(password, salt);
    const ciphertext = await createCipherText(body, key1, iv);
    const combined = await combineParts(ciphertext, key2, salt);
    const vaultText = combined;
    return formatOutput(vaultText);
}

// Create ciphertext using AES256
async function createCipherText(body: string, key1: CryptoKey, iv: Uint8Array): Promise<Uint8Array> {
    const bs = 16; // AES block size
    let padding = (bs - (body.length % bs)) % bs;
    if (padding === 0) {
        padding = bs;
    }
    const padChar = String.fromCharCode(padding);
    const plaintext = new TextEncoder().encode(body + padChar.repeat(padding));
    // console.log("plaintext: ", plaintext);
    const ciphertext = await window.crypto.subtle.encrypt(
        { name: 'AES-CTR', counter: iv, length: 128 },
        key1,
        plaintext
    );

    return new Uint8Array(ciphertext);
}

// Combine parts for HMAC and output
async function combineParts(ciphertext: Uint8Array, key2: CryptoKey, salt: Uint8Array): Promise<string> {
    const hmac = await window.crypto.subtle.sign('HMAC', key2, ciphertext);
    const hexSalt = BufferToString(salt);
    const hexHmac = BufferToString(new Uint8Array(hmac));
    const hexCipher = BufferToString(ciphertext);
    // console.log("encrypted hexSalt: ", hexSalt);
    // console.log("encrypted hexHmac: ", hexHmac);
    // console.log("encrypted hexCipher: ", hexCipher);
    const result = `${hexSalt}\n${hexHmac}\n${hexCipher}`;
    // console.log("encrypted ${hexSalt}${hexHmac}${hexCipher}: ", result);
    return result;
}

// Generate key, IV, and initialization vector
async function genKeyInitctr(password: string, salt: Uint8Array): Promise<{ key1: CryptoKey, key2: CryptoKey, iv: Uint8Array }> {
    const keylength = 32; // 256 bits
    const ivlength = 16; // 128 bits
    const iterations = 10000;

    const baseKey = await window.crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
    );

    const derivedBits = await window.crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt,
            iterations,
            hash: 'SHA-256',
        },
        baseKey,
        (keylength * 2 + ivlength) * 8
    );

    const derivedArray = new Uint8Array(derivedBits);

    const key1 = await window.crypto.subtle.importKey(
        'raw',
        derivedArray.slice(0, keylength),
        { name: 'AES-CTR' },
        false,
        ['encrypt']
    );

    const key2 = await window.crypto.subtle.importKey(
        'raw',
        derivedArray.slice(keylength, keylength * 2),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify']
    );

    const iv = derivedArray.slice(keylength * 2, keylength * 2 + ivlength);

    return { key1, key2, iv };
}

// Format the output according to Ansible Vault specification
function formatOutput(vaultText: string): string {
    const heading = '$ANSIBLE_VAULT';
    const version = '1.1';
    const cipherName = 'AES256';
    const header = `${heading};${version};${cipherName}`;

    // const lines: string[] = [];
    // lines.push(header);
    // for (let i = 0; i < vaultText.length; i += 80) {
    //     lines.push(vaultText.slice(i, i + 80));
    // }
    // return lines.join('\r\n'); // Use \n explicitly
    return `${header}\n${vaultText}`;
}

// Helper function to convert Uint8Array to hex string
function BufferToString(buffer: Uint8Array): string {
    return Array.from(buffer)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}