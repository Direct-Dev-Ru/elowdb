/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { promisify } from 'util'
import { gunzip, gunzipSync, gzip, gzipSync } from 'zlib'

import {
    decryptStringNodeAnsibleVault,
    decryptStringSyncNodeAnsibleVault,
} from '../common/decrypt/node-decrypt.js'
import {
    encryptStringNodeAnsibleVault,
    encryptStringSyncNodeAnsibleVault,
} from '../common/encrypt/node-encrypt.js'
import { Adapter, SyncAdapter } from '../core/Low.js'

/***
// Создание экземпляра
const key = randomBytes(32) // 256 бит
const adapter = new EncryptedMemory({
    encryptionKey: key,
    compressionEnabled: true
})

// Использование с LowDB
const db = new Low(adapter)
*/

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

interface EncryptedMemoryOptions {
    encryptionKey: Buffer
    compressionEnabled?: boolean
}

export class EncryptedMemory<T> implements Adapter<T> {
    #data: string | null = null
    #encryptionKey: Buffer
    #compressionEnabled: boolean
    #algorithm = 'aes-256-gcm'

    constructor(options: EncryptedMemoryOptions) {
        this.#encryptionKey = options.encryptionKey
        this.#compressionEnabled = options.compressionEnabled ?? true
    }

    get data(): string {
        return this.#data as string
    }

    async encrypt(data: string): Promise<string | { error: string }> {
        try {
            return await encryptStringNodeAnsibleVault(
                data,
                this.#encryptionKey.toString(),
            )
        } catch (error) {
            return { error: 'Encryption failed' }
        }
    }

    async decrypt(data: string): Promise<string | { error: string }> {
        try {
            return await decryptStringNodeAnsibleVault(
                data,
                this.#encryptionKey.toString(),
            )
        } catch (error) {
            return { error: 'Decryption failed' }
        }
    }

    async read(): Promise<T | null> {
        if (!this.#data) return null

        try {
            let decrypted: string
            if (this.#compressionEnabled) {
                const buf = Buffer.from(this.#data, 'base64')
                const decompressed = (await gunzipAsync(buf)).toString('utf8')
                decrypted = (await this.decrypt(decompressed)) as string
            } else {
                decrypted = (await this.decrypt(this.#data)) as string
            }

            if (typeof decrypted !== 'string') {
                throw new Error('Decryption failed')
            }

            return JSON.parse(decrypted) as T
        } catch (error) {
            console.error('Error reading encrypted data:', error)
            return null
        }
    }

    async write(obj: T): Promise<void> {
        try {
            const jsonString = JSON.stringify(obj)

            // Сначала шифруем
            const encrypted = await this.encrypt(jsonString)

            if (typeof encrypted !== 'string') {
                throw new Error('Encryption failed')
            }

            // Потом сжимаем
            if (this.#compressionEnabled) {
                const compressed = await gzipAsync(Buffer.from(encrypted))
                this.#data = compressed.toString('base64')
            } else {
                this.#data = encrypted
            }
        } catch (error) {
            console.error('Error writing encrypted data:', error)
            throw error
        }
    }
}

export class EncryptedMemorySync<T> implements SyncAdapter<T> {
    #data: string | null = null
    #encryptionKey: Buffer
    #compressionEnabled: boolean
    #algorithm = 'aes-256-gcm'

    constructor(options: EncryptedMemoryOptions) {
        this.#encryptionKey = options.encryptionKey
        this.#compressionEnabled = options.compressionEnabled ?? true
    }


    get data(): string {
        return this.#data as string
    }

    encrypt(data: string): string | { error: string } {
        try {
            return encryptStringSyncNodeAnsibleVault(
                data,
                this.#encryptionKey.toString(),
            )
        } catch (error) {
            return { error: 'Encryption failed' }
        }
    }

    decrypt(data: string): string | { error: string } {
        try {
            return decryptStringSyncNodeAnsibleVault(
                data,
                this.#encryptionKey.toString(),
            )
        } catch (error) {
            return { error: 'Decryption failed' }
        }
    }

    read(): T | null {
        if (!this.#data) return null

        try {
            let decrypted: string
            if (this.#compressionEnabled) {
                const buf = Buffer.from(this.#data, 'base64')
                const decompressed = gunzipSync(buf).toString('utf8')
                decrypted = this.decrypt(decompressed) as string
            } else {
                decrypted = this.decrypt(this.#data) as string
            }

            if (typeof decrypted !== 'string') {
                throw new Error('Decryption failed')
            }

            return JSON.parse(decrypted) as T
        } catch (error) {
            console.error('Error reading encrypted data:', error)
            return null
        }
    }

    write(obj: T): void {
        try {
            const jsonString = JSON.stringify(obj)

            // Сначала шифруем
            const encrypted = this.encrypt(jsonString)

            if (typeof encrypted !== 'string') {
                throw new Error('Encryption failed')
            }

            // Потом сжимаем
            if (this.#compressionEnabled) {
                const compressed = gzipSync(Buffer.from(encrypted))
                this.#data = compressed.toString('base64')
            } else {
                this.#data = encrypted
            }
        } catch (error) {
            console.error('Error writing encrypted data:', error)
            throw error
        }
    }
}
