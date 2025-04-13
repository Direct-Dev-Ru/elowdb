import { PathLike, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { Writer } from 'steno'

import { decryptString } from '../../common/decrypt/decrypt.js'
import { encryptString } from '../../common/encrypt/encrypt.js'
import { Adapter, SyncAdapter } from '../../core/Low.js'

export class TextFile implements Adapter<string> {
    #filename: PathLike
    #writer: Writer
    _cypherKey?: string | undefined = undefined
    dec = decryptString
    enc = encryptString
    constructor(filename: PathLike, _cypherKey: string = '') {
        this.#filename = filename
        this.#writer = new Writer(filename)
        this._cypherKey = _cypherKey
    }

    async read(): Promise<string | null> {
        let data
        try {
            data = await readFile(this.#filename, 'utf-8')
            if (this._cypherKey) {
                data = decryptString(data, this._cypherKey)
            }
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
                return null
            }
            throw e
        }

        return data
    }

    write(str: string): Promise<void> {
        if (!this._cypherKey) {
            return this.#writer.write(str)
        }
        const encData = encryptString(str, this._cypherKey)
        return this.#writer.write(encData)
    }
}

export class TextFileSync implements SyncAdapter<string> {
    #tempFilename: PathLike
    #filename: PathLike
    _cypherKey?: string = ''

    constructor(filename: PathLike, _cypherKey: string = '') {
        this.#filename = filename
        const f = filename.toString()
        this.#tempFilename = path.join(
            path.dirname(f),
            `.${path.basename(f)}.tmp`,
        )
        this._cypherKey = _cypherKey
    }

    read(): string | null {
        let data

        try {
            data = readFileSync(this.#filename, 'utf-8')
            if (this._cypherKey) {
                data = decryptString(data, this._cypherKey)
            }
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
                return null
            }
            throw e
        }

        return data
    }

    write(str: string): void {
        if (!this._cypherKey) {
            writeFileSync(this.#tempFilename, str)
            renameSync(this.#tempFilename, this.#filename)
            return
        }
        const encData = encryptString(str, this._cypherKey)
        writeFileSync(this.#tempFilename, encData)
        renameSync(this.#tempFilename, this.#filename)
    }
}
