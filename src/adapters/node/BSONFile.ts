import { PathLike } from 'fs'

import { bsonOptionsForStorage } from '../../common/bson/bson-option.js'
import { DataFile, DataFileSync } from './DataFile.js'
import {
    defNodeDecrypt,
    defNodeDecryptSync,
    defNodeEncrypt,
    defNodeEncryptSync,
} from './TextFile.js'

export class BSONFile<T> extends DataFile<T> {
    constructor(
        filename: PathLike,
        _cypherKey: string = '',
        options: {
            decrypt?: (
                encryptedText: string,
                cypherKey: string,
            ) => Promise<string | { error: string }>
            encrypt?: (
                text: string,
                cypherKey: string,
            ) => Promise<string | { error: string }>
            parse?: (str: string) => T
            stringify?: (data: T) => string
        } = {},
    ) {
        super(filename, _cypherKey, {
            parse: options?.parse ?? bsonOptionsForStorage.parse,
            stringify: options?.stringify ?? bsonOptionsForStorage.stringify,
            decrypt: options?.decrypt ?? defNodeDecrypt,
            encrypt: options?.encrypt ?? defNodeEncrypt,
        })
    }
}

export class BSONFileSync<T> extends DataFileSync<T> {
    constructor(
        filename: PathLike,
        _cypherKey: string = '',
        options: {
            decrypt?: (
                encryptedText: string,
                cypherKey: string,
            ) => string | { error: string }
            encrypt?: (
                text: string,
                cypherKey: string,
            ) => string | { error: string }
            parse?: (str: string) => T
            stringify?: (data: T) => string
        } = {},
    ) {
        super(filename, _cypherKey, {
            parse: options?.parse ?? bsonOptionsForStorage.parse,
            stringify: options?.stringify ?? bsonOptionsForStorage.stringify,
            decrypt: options?.decrypt ?? defNodeDecryptSync,
            encrypt: options?.encrypt ?? defNodeEncryptSync,
        })
    }
}
