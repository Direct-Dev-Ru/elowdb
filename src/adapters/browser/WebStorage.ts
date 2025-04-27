import { Adapter } from '../../core/Low.js'
import { decryptString } from '../../common/decrypt/browser-decrypt-common.js'
import { encryptString } from '../../common/encrypt/browser-encrypt-common.js'

export const defBrowserEncrypt = async (text: string, cypherKey: string): Promise<string | { error: string }> => {
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
    const encrypted = await encryptString(text, cypherKey);
    return encrypted;
  } catch (error) {
    return { error: "Encryption failed" };
  }
}

export const defBrowserDecrypt = async (text: string, cypherKey: string): Promise<string | { error: string }> => {
  if (typeof text !== "string" || typeof cypherKey !== "string") {
    return { error: "text and cypherKey must be strings" };
  }
  if (!cypherKey) return text
  try {
    const decrypted = await decryptString(text, cypherKey);
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

export class WebStorage<T> implements Adapter<T> {
  private key: string
  private storage: Storage
  private parse: (str: string) => T
  private stringify: (data: T) => string
  __decrypt: (encryptedText: string, cypherKey: string) => Promise<string | { error: string }> = defBrowserDecrypt
  __encrypt: (
    secretkey: string,
    text: string,
  ) => Promise<string | { error: string }> = defBrowserEncrypt

  private _cypherKey?: string

  constructor(
    key: string,
    storage: Storage,
    options: {
      parse?: (str: string) => T
      stringify?: (data: T) => string
      _cypherKey?: string
      decrypt?: (encryptedText: string) => Promise<string | { error: string }>
      encrypt?: (
        secretkey: string,
        text: string,
      ) => Promise<string | { error: string }>
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

  get decrypt(): (secretkey: string) => Promise<string | { error: string }> {
    return (secretkey: string = this._cypherKey as string) => {
      const value = this.storage.getItem(this.key) || ''
      return this.__decrypt(value, secretkey)
    }
  }

  get encrypt(): (secretkey: string) => Promise<string | { error: string }> {
    return (secretkey: string = this._cypherKey as string) => {
      const value = this.storage.getItem(this.key) || ''
      return this.__encrypt(value, secretkey)
    }
  }

  async read(): Promise<T | null> {
    const value = this.storage.getItem(this.key)
    if (value === null) {
      return null
    }
    if (this._cypherKey?.length || 0 > 0) {
      const decrypted = await this.__decrypt(value, this._cypherKey as string)
      const error = decrypted as { error: string }
      if (error?.error) {
        //   console.log("decrypted error:", `Decryption failed: ${error.error}`);
        throw new Error(`Decryption failed: ${error.error}`)
      }
      return this.parse(decrypted as string)
    }
    return this.parse(value)
  }

  async write(obj: T): Promise<void> {
    const stringified = this.stringify(obj)
    if (this._cypherKey?.length || 0 > 0) {
      const encrypted = await this.__encrypt(stringified, this._cypherKey as string)
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
