/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import * as crypto from 'node:crypto'

// Function to decrypt the Ansible Vault encrypted data
// export async function decryptString(data: string, password: string): Promise<string> {
//     if (!data) {
//         return '';
//     }
//     if (!password) {
//         throw new Error('password is required for decryption');
//     }
//     data = replaceCarriageReturn(data)
//     const body = splitHeader(data)
//     const { salt, cryptedHmac, ciphertext } = decodeData(body)
//     const { key1, key2, iv } = genKeyInitctr(password, salt)
//     checkDigest(key2, cryptedHmac, ciphertext)

//     const decipher = crypto.createDecipheriv('aes-256-ctr', key1, iv)
//     let plaintext = decipher.update(ciphertext)
//     plaintext = Buffer.concat([plaintext, decipher.final()])

//     // Remove padding
//     const padding = plaintext[plaintext.length - 1]
//     return plaintext
//         .slice(0, plaintext.length - (padding ? padding : 0))
//         .toString()
// }

// Function to decrypt the Ansible Vault encrypted data
export async function decryptStringNodeAnsibleVault(
    data: string,
    password: string,
): Promise<string> {
    if (!data) {
        return ''
    }
    if (!password) {
        throw new Error('password is required for decryption')
    }
    return decryptStringSyncNodeAnsibleVault(data, password)
}

// Function to decrypt the Ansible Vault encrypted data
export function decryptStringSyncNodeAnsibleVault(
    data: string,
    password: string,
): string {
    if (!data) {
        return ''
    }
    if (!password) {
        throw new Error('password is required for decryption')
    }
    data = replaceCarriageReturn(data)

    const body = splitHeader(data)
    const { salt, cryptedHmac, ciphertext } = decodeData(body)
    const { key1, key2, iv } = genKeyInitctr(password, salt)
    checkDigest(key2, cryptedHmac, ciphertext)

    const decipher = crypto.createDecipheriv('aes-256-ctr', key1, iv)
    let plaintext = decipher.update(ciphertext)
    plaintext = Buffer.concat([plaintext, decipher.final()])

    // Remove padding
    const padding = plaintext[plaintext.length - 1]
    return plaintext
        .slice(0, plaintext.length - (padding ? padding : 0))
        .toString()
}

// Replace carriage return for Windows line endings
function replaceCarriageReturn(data: string) {
    // Normalize line endings to \n
    return data.replace(/\r\n/g, '\n')
}

// Split the header and return the body
function splitHeader(data: string) {
    const lines = data.split('\n')
    const header = lines[0]?.split(';') || ''
    const cipherName = header[2]?.trim()
    if (cipherName !== 'AES256') {
        throw new Error('unsupported cypher: ' + cipherName)
    }
    return lines.slice(1).join('')
}

// Decode the data from hex
function decodeData(body: string) {
    const decoded = Buffer.from(body, 'hex')
    const elements: any[] = decoded.toString().split('\n')
    const salt = Buffer.from(elements[0], 'hex')
    const cryptedHmac = Buffer.from(elements[1], 'hex')
    const ciphertext = Buffer.from(elements[2], 'hex')
    return { salt, cryptedHmac, ciphertext }
}

// Generate key, IV, and initialization vector
function genKeyInitctr(password: string, salt: Buffer) {
    const keylength = 32
    const ivlength = 16
    const iterations = 10000
    const key = crypto.pbkdf2Sync(
        password,
        salt,
        iterations,
        keylength * 2 + ivlength,
        'sha256',
    )
    const key1 = key.slice(0, keylength)
    const key2 = key.slice(keylength, keylength * 2)
    const iv = key.slice(keylength * 2, keylength * 2 + ivlength)
    return { key1, key2, iv }
}

// Check the HMAC digest
function checkDigest(key2: any, cryptedHmac: any, ciphertext: any) {
    const hmac = crypto.createHmac('sha256', key2)
    hmac.update(ciphertext)
    const expectedMAC = hmac.digest()
    if (!crypto.timingSafeEqual(cryptedHmac, expectedMAC)) {
        throw new Error('digests do not match - exiting')
    }
}
