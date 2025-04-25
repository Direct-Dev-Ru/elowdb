import { WebStorage } from './WebStorage.js'
import { WebStorageSync } from './WebStorageSync.js'

export class SessionStorage<T> extends WebStorage<T> {
    constructor(key: string, options: {
        parse?: (str: string) => T
        stringify?: (data: T) => string
        _cypherKey?: string
        decrypt?: (encryptedText: string) => Promise<string | { error: string }>
        encrypt?: (
            secretkey: string,
            text: string,
        ) => Promise<string | { error: string }>
    } = {}) {
        super(key, sessionStorage, options)
    }
}

export class SessionStorageSync<T> extends WebStorageSync<T> {
    constructor(key: string, options: {
        parse?: (str: string) => T
        stringify?: (data: T) => string
        _cypherKey?: string
        decrypt?: (encryptedText: string) => string | { error: string }
        encrypt?: (            
            secretkey: string,
            text: string,
        ) => string | { error: string }
    } = {}) {
        super(key, sessionStorage, options)
    }
}
