import { PathLike } from 'fs'

import { Adapter, SyncAdapter } from '../../core/Low.js'
import { TextFile, TextFileSync } from './TextFile.js'

export class DataFile<T> implements Adapter<T> {
    #adapter: TextFile
    #parse: (str: string) => T
    #stringify: (data: T) => string

    constructor(
        filename: PathLike,
        _cypherKey: string | undefined = undefined,
        {
            parse,
            stringify,
        }: {
            parse: (str: string) => T
            stringify: (data: T) => string
        },
    ) {
        this.#adapter = new TextFile(filename, _cypherKey)
        this.#parse = parse
        this.#stringify = stringify
        this.#adapter._cypherKey = _cypherKey
    }

    async read(): Promise<T | null> {
        const data = await this.#adapter.read()
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
        {
            parse,
            stringify,
        }: {
            parse: (str: string) => T
            stringify: (data: T) => string
        },
    ) {
        this.#adapter = new TextFileSync(filename, _cypherKey)
        this.#parse = parse
        this.#stringify = stringify
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
