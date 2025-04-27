import { PathLike } from 'fs';
import { defNodeEncrypt, defNodeDecrypt, defNodeEncryptSync, defNodeDecryptSync } from './TextFile.js';
import { DataFile, DataFileSync } from './DataFile.js';
import yaml from 'js-yaml';

export class YAMLFile<T> extends DataFile<T> {
    constructor(
        filename: PathLike,
        _cypherKey: string = '',
        options: {
            decrypt?: (encryptedText: string, cypherKey: string) => Promise<string | { error: string }>
            encrypt?: (
                text: string,
                cypherKey: string,
            ) => Promise<string | { error: string }>
        } = {}
    ) {
        super(filename, _cypherKey, {
            parse: (str: string) => yaml.load(str) as T,
            stringify: (data: T) => yaml.dump(data),
            decrypt: options?.decrypt ?? defNodeDecrypt,
            encrypt: options?.encrypt ?? defNodeEncrypt
        });
    }
}

export class YAMLFileSync<T> extends DataFileSync<T> {
    constructor(
        filename: PathLike,
        _cypherKey: string = '',
        options: {
            decrypt?: (encryptedText: string, cypherKey: string) => string | { error: string }
            encrypt?: (
                text: string,
                cypherKey: string,
            ) => string | { error: string }
        } = {}
    ) {
        super(filename, _cypherKey, {
            parse: (str: string) => yaml.load(str) as T,
            stringify: (data: T) => yaml.dump(data),
            decrypt: options?.decrypt ?? defNodeDecryptSync,
            encrypt: options?.encrypt ?? defNodeEncryptSync
        });
    }
} 