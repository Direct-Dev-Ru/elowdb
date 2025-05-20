export async function encryptString(
    input: string,
    password: string,
    force: boolean = false,
): Promise<string> {
    if (!input) {
        return ''
    }
    if (!password) {
        throw new Error('password is required for encryption')
    }
    // Check if the file is already encrypted
    if (input.startsWith('$ENCRYPTED;') && !force) {
        throw new Error('data already encrypted and no force flag provided')
    }

    // Generate a random salt
    const salt = crypto.getRandomValues(new Uint8Array(16))

    // Import the password as a key
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey'],
    )

    // Derive a key using PBKDF2
    const key = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt'],
    )

    // Generate a random IV
    const iv = crypto.getRandomValues(new Uint8Array(12))

    // Encrypt the data
    const encryptedContent = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv,
        },
        key,
        new TextEncoder().encode(input),
    )

    // Combine salt, IV, and encrypted data and set header
    const encryptedArray = new Uint8Array(encryptedContent)
    const combined = new Uint8Array(
        salt.length + iv.length + encryptedArray.length,
    )
    combined.set(salt, 0)
    combined.set(iv, salt.length)
    combined.set(encryptedArray, salt.length + iv.length)

    const heading = '$ENCRYPTED'
    const version = '1.1'
    const cipherName = 'AES-GCM'
    const header = `${heading};${version};${cipherName}`

    const encryptedString = `${header}\n${btoa(
        String.fromCharCode(...combined),
    )}`
    // Convert to base64 for storage/transmission
    return encryptedString
}
