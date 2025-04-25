import { SyncAdapter } from '../../core/Low.js'
import { encryptVigenere } from '../../common/encrypt/encryptVigenere.js'
import { decryptVigenere } from '../../common/decrypt/decryptVigenere.js';

export const defEncryptSync = (text: string, cypherKey: string): string | { error: string } => {
  if (typeof text !== "string" || typeof cypherKey !== "string") {
    return { error: "text and cypherKey must be strings" };
  }
  if (!cypherKey) return text
  // Simple XOR encryption for demonstration
  // let result = ''
  // for (let i = 0; i < text.length; i++) {
  //   result += String.fromCharCode(text.charCodeAt(i) ^ cypherKey.charCodeAt(i % cypherKey.length))
  // }
  try {
    const encrypted = encryptVigenere(text, cypherKey);
    return encrypted;
  } catch (error) {
    return { error: "Encryption failed" };
  }
}

export const defDecryptSync = (text: string, cypherKey: string): string | { error: string } => {
  if (typeof text !== "string" || typeof cypherKey !== "string") {
    return { error: "text and cypherKey must be strings" };
  }
  if (!cypherKey) return text
  try {
    const decrypted = decryptVigenere(text, cypherKey);
    return decrypted;
  } catch (error) {
    return { error: "Decryption failed" };
  }
  // Simple XOR encryption for demonstration
  // let result = ''
  // for (let i = 0; i < text.length; i++) {
  //   result += String.fromCharCode(text.charCodeAt(i) ^ cypherKey.charCodeAt(i % cypherKey.length))
  // }
  // return result
}

export class WebStorageSync<T> implements SyncAdapter<T> {
  private key: string
  private storage: Storage
  private parse: (str: string) => T
  private stringify: (data: T) => string
  __decrypt: (encryptedText: string, cypherKey: string) => string | { error: string } = defDecryptSync
  __encrypt: (
    secretkey: string,
    text: string,
  ) => string | { error: string } = defEncryptSync

  private _cypherKey?: string

  constructor(
    key: string,
    storage: Storage,
    options: {
      parse?: (str: string) => T
      stringify?: (data: T) => string
      _cypherKey?: string
      decrypt?: (encryptedText: string) => string | { error: string }
      encrypt?: (
        secretkey: string,
        text: string,
      ) => string | { error: string }
    } = {}
  ) {
    this.key = key
    this.storage = storage
    this.parse = options.parse || JSON.parse
    this.stringify = options.stringify || JSON.stringify
    if (options.decrypt) {
      this.__decrypt = options.decrypt
    }
    if (options.encrypt) {
      this.__encrypt = options.encrypt
    }
    this._cypherKey = options._cypherKey || ''
  }

  read(): T | null {
    const value = this.storage.getItem(this.key)
    if (value === null) {
      return null
    }
    if (this._cypherKey?.length || 0 > 0) {
      const decrypted = this.__decrypt(value, this._cypherKey as string)
      const error = decrypted as { error: string }
      if (error?.error) {
        //   console.log("decrypted error:", `Decryption failed: ${error.error}`);
        throw new Error(`Decryption failed: ${error.error}`)
      }
      return this.parse(decrypted as string)
    }
    return this.parse(value)
  }

  write(obj: T): void {
    const stringified = this.stringify(obj)
    if (this._cypherKey?.length || 0 > 0) {
      const encrypted = this.__encrypt(stringified, this._cypherKey as string)
      const error = encrypted as { error: string }
      if (error?.error) {
        //   console.log("encrypted error:", `Encryption failed: ${error.error}`);
        throw new Error(`Encryption failed: ${error.error}`)
      }
      this.storage.setItem(this.key, encrypted as string)
    } else {
      this.storage.setItem(this.key, stringified)
    }
  }
}
