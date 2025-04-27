import { PathLike, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { Writer } from 'steno'

import { decryptStringNodeAnsibleVault, decryptStringSyncNodeAnsibleVault } from '../../common/decrypt/node-decrypt.js'
import { encryptStringNodeAnsibleVault, encryptStringSyncNodeAnsibleVault } from '../../common/encrypt/node-encrypt.js'
import { Adapter, SyncAdapter } from '../../core/Low.js'



export const defNodeEncrypt = async (text: string, cypherKey: string): Promise<string | { error: string }> => {
    if (typeof text !== "string" || typeof cypherKey !== "string") {
        return { error: "text and cypherKey must be strings" };
    }
    if (!cypherKey) return text
    try {
        const encrypted = await encryptStringNodeAnsibleVault(text, cypherKey);
        return encrypted;
    } catch (error) {
        return { error: "Encryption failed" };
    }
}

export const defNodeDecrypt = async (text: string, cypherKey: string): Promise<string | { error: string }> => {
    if (typeof text !== "string" || typeof cypherKey !== "string") {
        return { error: "text and cypherKey must be strings" };
    }
    if (!cypherKey) return text
    try {
        const decrypted = await decryptStringNodeAnsibleVault(text, cypherKey);
        return decrypted;
    } catch (error) {
        return { error: "Decryption failed" };
    }
}

export const defNodeEncryptSync = (text: string, cypherKey: string): string | { error: string } => {
    if (typeof text !== "string" || typeof cypherKey !== "string") {
        return { error: "text and cypherKey must be strings" };
    }
    if (!cypherKey) return text
    try {
        const encrypted = encryptStringSyncNodeAnsibleVault(text, cypherKey);
        return encrypted;
    } catch (error) {
        return { error: "Encryption failed" };
    }
}

export const defNodeDecryptSync = (text: string, cypherKey: string): string | { error: string } => {
    if (typeof text !== "string" || typeof cypherKey !== "string") {
        return { error: "text and cypherKey must be strings" };
    }
    if (!cypherKey) return text
    try {
        const decrypted = decryptStringSyncNodeAnsibleVault(text, cypherKey);
        return decrypted;
    } catch (error) {
        return { error: "Decryption failed" };
    }
}


export class TextFile implements Adapter<string> {
    #filename: PathLike
    #writer: Writer
    _cypherKey?: string | undefined = undefined
    #decrypt: (text: string, cypherKey: string) => Promise<string | { error: string }>
    #encrypt: (text: string, cypherKey: string) => Promise<string | { error: string }>

    constructor(filename: PathLike, _cypherKey: string = '', options: {
        decrypt?: (encryptedText: string, cypherKey: string) => Promise<string | { error: string }>
        encrypt?: (
            text: string,
            cypherKey: string,
        ) => Promise<string | { error: string }>
    } = {}) {
        this.#filename = filename
        this.#writer = new Writer(filename)
        this._cypherKey = _cypherKey
        if (options.decrypt) {
            this.#decrypt = options.decrypt
        } else {
            this.#decrypt = defNodeDecrypt
        }
        if (options.encrypt) {
            this.#encrypt = options.encrypt
        } else {
            this.#encrypt = defNodeEncrypt
        }
    }

    async read(): Promise<string | null> {
        let data: string | { error: string }
        try {
            data = await readFile(this.#filename, 'utf-8')
            if (this._cypherKey) {
                data = await this.#decrypt(data, this._cypherKey || '')
            }
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
                return null
            }
            throw e
        }
        if (typeof data !== 'string') {
            const error = data as { error: string }
            throw new Error(`Decryption failed ${error.error}`)
        }
        return data
    }

    async write(strDataToWrite: string): Promise<void> {
        if (!this._cypherKey) {
            return this.#writer.write(strDataToWrite)
        }
        const encryptedData = await this.#encrypt(strDataToWrite, this._cypherKey || '')
        if (typeof encryptedData !== 'string') {
            const error = encryptedData as { error: string }
            throw new Error(`Encryption failed ${error.error}`)
        }
        return this.#writer.write(encryptedData)
    }
}

export class TextFileSync implements SyncAdapter<string> {
    #tempFilename: PathLike
    #filename: PathLike
    _cypherKey?: string = ''
    #decrypt: (encryptedText: string, cypherKey: string) => string | { error: string }
    #encrypt: (text: string, cypherKey: string) => string | { error: string }

    constructor(filename: PathLike, _cypherKey: string = '', options: {
        decrypt?: (encryptedText: string, cypherKey: string) => string | { error: string }
        encrypt?: (
            text: string,
            cypherKey: string,
        ) => string | { error: string }
    } = {}) {
        this.#filename = filename
        const f = filename.toString()
        this.#tempFilename = path.join(
            path.dirname(f),
            `.${path.basename(f)}.tmp`,
        )
        this._cypherKey = _cypherKey
        if (options.decrypt) {
            this.#decrypt = options.decrypt
        } else {
            this.#decrypt = (data, key) => decryptStringSyncNodeAnsibleVault(data, key)
        }
        if (options.encrypt) {
            this.#encrypt = options.encrypt
        } else {
            this.#encrypt = (data, key) => encryptStringSyncNodeAnsibleVault(data, key)
        }
    }

    read(): string | null {
        let data

        try {
            data = readFileSync(this.#filename, 'utf-8')
            if (this._cypherKey) {
                data = this.#decrypt(data, this._cypherKey)
            }
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
                return null
            }
            throw e
        }
        if (typeof data !== 'string') {
            const error = data as { error: string }
            throw new Error(`Decryption failed ${error.error}`)
        }
        return data
    }

    write(str: string): void {
        if (!this._cypherKey) {
            writeFileSync(this.#tempFilename, str)
            renameSync(this.#tempFilename, this.#filename)
            return
        }
        const encryptedData = this.#encrypt(str, this._cypherKey)
        if (typeof encryptedData !== 'string') {
            const error = encryptedData as { error: string }
            throw new Error(`Encryption failed ${error.error}`)
        }
        writeFileSync(this.#tempFilename, encryptedData)
        renameSync(this.#tempFilename, this.#filename)
    }
}
