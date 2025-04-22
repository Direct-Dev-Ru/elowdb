export async function decryptString(encryptedData: string, password: string): Promise<string> {
    // Convert from base64 to Uint8Array
    if (!encryptedData) {
        return '';
    }

    // Normalize line endings to \n
    encryptedData = encryptedData.replace(/\r\n/g, '\n');

    // console.log("Encrypted String:", encryptedData);

    const lines = encryptedData.split('\n');
    if (lines?.length < 2) {
        throw new Error('Encrypted string is empty or invalid');
    }
    if (!lines[0]?.startsWith('$ENCRYPTED;')) {
        throw new Error('Invalid Encrypted format');
    }

    const encryptedBase64Data = lines[1] || '';
    const binaryString = atob(encryptedBase64Data);
    const combined = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        combined[i] = binaryString.charCodeAt(i);
    }

    // Extract salt, IV, and encrypted data
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const encryptedContent = combined.slice(28);

    // Import the password as a key
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
    );
    

    // Derive the same key using PBKDF2
    const key = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
    );
    
    // Decrypt the data
    try {
        const decryptedContent = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            encryptedContent
        );
        

        const decryptedString = new TextDecoder().decode(decryptedContent);       

        // Convert the decrypted data back to a string
        return decryptedString;
    } catch (error) {
        // console.log("Decryption failed:", error);
        throw new Error('decryption failed');
    }

} 