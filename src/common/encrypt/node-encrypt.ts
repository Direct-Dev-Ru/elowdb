/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import * as crypto from 'node:crypto'

// const crypto = require("crypto");
// const readline = require("readline");

// Generate random bytes
function generateRandomBytes(length: number) {
    return crypto.randomBytes(length)
}

// Encrypt string data
export async function encryptString(
    inputString: string,
    password: string,
    force?: boolean,
): Promise<string> {
    const strData = inputString
    if (!inputString) {
        return '';
    }
    if (!password) {
        throw new Error('password is required for encryption');
    }
    // Check if the file is already encrypted
    if (strData.startsWith('$ANSIBLE_VAULT;') && !force) {
        throw new Error('data already encrypted and no force flag provided')
    }
    return encrypt(strData, password)
}

// Encrypt the data
function encrypt(body: string, password: string) {
    const salt = generateRandomBytes(32)
    const { key1, key2, iv } = genKeyInitctr(password, salt)
    const ciphertext = createCipherText(body, key1, iv)
    const combined = combineParts(ciphertext, key2, salt)
    const vaultText = Buffer.from(combined)?.toString('hex')
    return formatOutput(vaultText)
}

// Create ciphertext using AES256
function createCipherText(body: string, key1: any, iv: any): Buffer {
    const bs = 16 // AES block size
    let padding = (bs - (body.length % bs)) % bs
    if (padding === 0) {
        padding = bs;
    }
    const padChar = String.fromCharCode(padding)
    const plaintext = Buffer.concat([
        Buffer.from(body),
        Buffer.from(padChar.repeat(padding)),
    ])

    const cipher = crypto.createCipheriv('aes-256-ctr', key1, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
    return ciphertext
}

// Combine parts for HMAC and output
function combineParts(ciphertext: Buffer, key2: any, salt: any) {
    const hmac = crypto.createHmac('sha256', key2)
    hmac.update(ciphertext)
    const hexSalt = salt?.toString('hex')
    const hexHmac = hmac.digest('hex')
    const hexCipher = ciphertext?.toString('hex')
    return `${hexSalt}\n${hexHmac}\n${hexCipher}`
}

// Generate key, IV, and initialization vector
function genKeyInitctr(password: string, salt: Buffer) {
    const keylength = 32 // 256 bits
    const ivlength = 16 // 128 bits
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

// Format the output according to Ansible Vault specification
function formatOutput(vaultText: string): string {
    const heading = '$ANSIBLE_VAULT'
    const version = '1.1'
    const cipherName = 'AES256'
    const header = `${heading};${version};${cipherName}`

    const lines = []
    lines.push(header)
    for (let i = 0; i < vaultText.length; i += 80) {
        lines.push(vaultText.slice(i, i + 80))
    }
    return lines.join('\n')
}
