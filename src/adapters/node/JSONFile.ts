/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { PathLike } from 'fs'

import { DataFile, DataFileSync } from './DataFile.js'
import {
    defNodeDecrypt,
    defNodeDecryptSync,
    defNodeEncrypt,
    defNodeEncryptSync,
} from './TextFile.js'

export class Serializers<T> {
    parse: (str: string) => T = JSON.parse
    stringify: (data: T) => string = (data: T) => JSON.stringify(data, null, 2)
}

export const defaultSerializers = new Serializers<any>()

export class JSONFile<T> extends DataFile<T> {
    constructor(
        filename: PathLike,
        _cypherKey: string = '',
        options: {
            serializers?: Serializers<T>
            decrypt?: (
                encryptedText: string,
                cypherKey: string,
            ) => Promise<string | { error: string }>
            encrypt?: (
                text: string,
                cypherKey: string,
            ) => Promise<string | { error: string }>
        } = {},
    ) {
        super(filename, _cypherKey, {
            parse: options?.serializers?.parse || defaultSerializers.parse,
            stringify:
                options?.serializers?.stringify || defaultSerializers.stringify,
            decrypt: options?.decrypt ?? defNodeDecrypt,
            encrypt: options?.encrypt ?? defNodeEncrypt,
        })
    }
}

export class JSONFileSync<T> extends DataFileSync<T> {
    constructor(
        filename: PathLike,
        _cypherKey: string = '',
        options: {
            serializers?: Serializers<T>
            decrypt?: (
                encryptedText: string,
                cypherKey: string,
            ) => string | { error: string }
            encrypt?: (
                text: string,
                cypherKey: string,
            ) => string | { error: string }
        } = {},
    ) {
        super(filename, _cypherKey, {
            parse: options?.serializers?.parse || defaultSerializers.parse,
            stringify:
                options?.serializers?.stringify || defaultSerializers.stringify,
            decrypt: options?.decrypt ?? defNodeDecryptSync,
            encrypt: options?.encrypt ?? defNodeEncryptSync,
        })
    }
}
