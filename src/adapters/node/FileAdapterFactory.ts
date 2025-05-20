import { PathLike } from 'fs'

import { BSONFile, BSONFileSync } from './BSONFile.js'
import { DataFile, DataFileSync } from './DataFile.js'
import { JSONFile, JSONFileSync } from './JSONFile.js'
import { YAMLFile, YAMLFileSync } from './YAMLFile.js'

export type FileType = 'json' | 'bson' | 'yaml' | 'jsonl'
export type SyncType = 'sync' | 'async'

export interface AsyncFileAdapterOptions {
    decrypt?: (
        encryptedText: string,
        cypherKey: string,
    ) => Promise<string | { error: string }>
    encrypt?: (
        text: string,
        cypherKey: string,
    ) => Promise<string | { error: string }>
}

export interface SyncFileAdapterOptions {
    decrypt?: (
        encryptedText: string,
        cypherKey: string,
    ) => string | { error: string }
    encrypt?: (text: string, cypherKey: string) => string | { error: string }
}

export class FileAdapterFactory {
    static create<T>(
        filename: PathLike,
        type: FileType = 'json',
        sync: SyncType = 'async',
        _cypherKey: string = '',
        options: AsyncFileAdapterOptions | SyncFileAdapterOptions = {},
    ): DataFile<T> | DataFileSync<T> {
        switch (type) {
            case 'json':
                return sync === 'sync'
                    ? new JSONFileSync<T>(
                          filename,
                          _cypherKey,
                          options as SyncFileAdapterOptions,
                      )
                    : new JSONFile<T>(
                          filename,
                          _cypherKey,
                          options as AsyncFileAdapterOptions,
                      )
            case 'bson':
                return sync === 'sync'
                    ? new BSONFileSync<T>(
                          filename,
                          _cypherKey,
                          options as SyncFileAdapterOptions,
                      )
                    : new BSONFile<T>(
                          filename,
                          _cypherKey,
                          options as AsyncFileAdapterOptions,
                      )
            case 'yaml':
                return sync === 'sync'
                    ? new YAMLFileSync<T>(
                          filename,
                          _cypherKey,
                          options as SyncFileAdapterOptions,
                      )
                    : new YAMLFile<T>(
                          filename,
                          _cypherKey,
                          options as AsyncFileAdapterOptions,
                      )
            default:
                throw new Error(`Unsupported file type: ${type}`)
        }
    }

    static createJSON<T>(
        filename: PathLike,
        sync: SyncType = 'async',
        _cypherKey: string = '',
        options: AsyncFileAdapterOptions | SyncFileAdapterOptions = {},
    ): DataFile<T> | DataFileSync<T> {
        return this.create<T>(filename, 'json', sync, _cypherKey, options)
    }

    static createBSON<T>(
        filename: PathLike,
        sync: SyncType = 'async',
        _cypherKey: string = '',
        options: AsyncFileAdapterOptions | SyncFileAdapterOptions = {},
    ): DataFile<T> | DataFileSync<T> {
        return this.create<T>(filename, 'bson', sync, _cypherKey, options)
    }

    static createYAML<T>(
        filename: PathLike,
        sync: SyncType = 'async',
        _cypherKey: string = '',
        options: AsyncFileAdapterOptions | SyncFileAdapterOptions = {},
    ): DataFile<T> | DataFileSync<T> {
        return this.create<T>(filename, 'yaml', sync, _cypherKey, options)
    }

    static createJSONL<T>(
        filename: PathLike,
        sync: SyncType = 'async',
        _cypherKey: string = '',
        options: AsyncFileAdapterOptions | SyncFileAdapterOptions = {},
    ): DataFile<T> | DataFileSync<T> {
        return this.create<T>(filename, 'jsonl', sync, _cypherKey, options)
    }
}
