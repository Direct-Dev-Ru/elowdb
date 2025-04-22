// Decrypt string data
export async function decryptString(encryptedString: string, password: string): Promise<string> {
    if (!encryptedString) {
        return '';
    }

    // Normalize line endings to \n
    encryptedString = encryptedString.replace(/\r\n/g, '\n');

    // console.log("Encrypted String:", encryptedString);

    const lines = encryptedString.split('\n');

    if (lines?.length === 0) {
        throw new Error('Encrypted string is empty or invalid');
    }
    if (!lines[0]?.startsWith('$ANSIBLE_VAULT;')) {
        throw new Error('Invalid Ansible Vault format');
    }

    const [hexSalt, hexHmac, hexCipher] = lines.slice(1);
    // console.log("decrypt hexSalt: ", hexSalt);
    // console.log("decrypt hexHmac: ", hexHmac);
    // console.log("decrypt hexCipher: ", hexCipher);
    if (!hexSalt || !hexHmac || !hexCipher) {
        throw new Error('Encrypted data is incomplete or invalid');
    }

    const salt = hexToUint8Array(hexSalt);
    const hmac = hexToUint8Array(hexHmac);
    const ciphertext = hexToUint8Array(hexCipher);

    // Generate keys and IV
    const { key1, key2, iv } = await genKeyInitctr(password, salt);

    // Verify HMAC
    const computedHmac = await computeHmac(key2, ciphertext);
    if (!arraysEqual(hmac, computedHmac)) {
        // console.log("Stored HMAC:", BufferToString(hmac));
        // console.log("Computed HMAC:", BufferToString(computedHmac));
        throw new Error('HMAC verification failed: data may be tampered or password is incorrect');
    }

    // Decrypt ciphertext
    const plaintext = await decryptCipherText(ciphertext, key1, iv);
    // console.log("decrypt plaintext: ", plaintext);   
    // Remove padding
    // console.log("decrypt plaintext without padding: ", removePadding(plaintext));   
    return removePadding(plaintext);
}

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
        ['decrypt']
    );

    const key2 = await window.crypto.subtle.importKey(
        'raw',
        derivedArray.slice(keylength, keylength * 2),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify', 'sign']
    );

    const iv = derivedArray.slice(keylength * 2, keylength * 2 + ivlength);

    return { key1, key2, iv };
}

// Decrypt ciphertext using AES256
async function decryptCipherText(ciphertext: Uint8Array, key1: CryptoKey, iv: Uint8Array): Promise<string> {
    const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-CTR', counter: iv, length: 128 },
        key1,
        ciphertext
    );

    return arrayBufferToString(decrypted);
}

// Compute HMAC for ciphertext
async function computeHmac(key: CryptoKey, ciphertext: Uint8Array): Promise<Uint8Array> {
    const hmac = await window.crypto.subtle.sign('HMAC', key, ciphertext);
    return new Uint8Array(hmac);
}

// Remove padding from plaintext
function removePadding(plaintext: string): string {
    const paddingLength = plaintext.charCodeAt(plaintext.length - 1);
    return plaintext.slice(0, -paddingLength);
}

// Helper function to convert hex string to Uint8Array
function hexToUint8Array(hex: string): Uint8Array {
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.substr(i, 2), 16));
    }
    return new Uint8Array(bytes);
}

// Helper function to compare two Uint8Arrays
function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

// Helper function to convert Uint8Array to hex string
function BufferToString(buffer: Uint8Array): string {
    return Array.from(buffer)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

function arrayBufferToString(buffer: ArrayBuffer): string {
    const decoder = new TextDecoder('utf-8'); // Specify encoding (default is 'utf-8')
    return decoder.decode(buffer);
}