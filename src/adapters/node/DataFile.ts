import { PathLike } from 'fs'

import { Adapter, SyncAdapter } from '../../core/Low.js'
import { TextFile, TextFileSync } from './TextFile.js'


export class DataFile<T> implements Adapter<T> {
    #adapter: TextFile

    #parse: (str: string) => T
    #stringify: (data: T) => string


    constructor(
        filename: PathLike,
        _cypherKey: string = '',
        options: {
            parse?: (str: string) => T
            stringify?: (data: T) => string
            decrypt?: (encryptedText: string, cypherKey: string) => Promise<string | { error: string }>
            encrypt?: (
                text: string,
                cypherKey: string,
            ) => Promise<string | { error: string }>
        } = {}
    ) {
        this.#adapter = new TextFile(filename, _cypherKey, { decrypt: options.decrypt, encrypt: options.encrypt })
        this.#parse = options.parse || JSON.parse
        this.#stringify = options.stringify || JSON.stringify
    }

    async read(): Promise<T | null> {
        const data = await this.#adapter.read()

        if (process.env.NODE_ENV === 'test') {
            console.log('read() - data:', data)
        }
        if (data === null) {
            return null
        } else {
            return this.#parse(data)
        }

    }

    write(obj: T): Promise<void> {
        return this.#adapter.write(this.#stringify(obj))
    }
}

export class DataFileSync<T> implements SyncAdapter<T> {
    #adapter: TextFileSync
    #parse: (str: string) => T
    #stringify: (data: T) => string

    constructor(
        filename: PathLike,
        _cypherKey: string = '',
        options: {
            parse?: (str: string) => T
            stringify?: (data: T) => string
            decrypt?: (encryptedText: string, cypherKey: string) => string | { error: string }
            encrypt?: (
                text: string,
                cypherKey: string,
            ) => string | { error: string }
        } = {}
    ) {
        this.#adapter = new TextFileSync(filename, _cypherKey, { decrypt: options.decrypt, encrypt: options.encrypt })
        this.#parse = options.parse || JSON.parse
        this.#stringify = options.stringify || JSON.stringify
    }

    read(): T | null {
        const data = this.#adapter.read()
        if (data === null) {
            return null
        } else {
            return this.#parse(data)
        }
    }

    write(obj: T): void {
        this.#adapter.write(this.#stringify(obj))
    }
}
