import { SyncAdapter } from '../../core/Low.js'

const defEncrypt = (text: string, cypherKey: string): string | { error: string } => {
  if (typeof text !== "string" || typeof cypherKey !== "string") {
    return { error: "text and cypherKey must be strings" };
  }
  if (!cypherKey) return text
  // Simple XOR encryption for demonstration
  let result = ''
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ cypherKey.charCodeAt(i % cypherKey.length))
  }
  return result
}

const defDecrypt = (text: string, cypherKey: string): string | { error: string } => {
  if (typeof text !== "string" || typeof cypherKey !== "string") {
    return { error: "text and cypherKey must be strings" };
  }
  if (!cypherKey) return text
  // Simple XOR encryption for demonstration
  let result = ''
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ cypherKey.charCodeAt(i % cypherKey.length))
  }
  return result
}

export class WebStorage<T> implements SyncAdapter<T> {
  private key: string
  private storage: Storage
  private parse: (str: string) => T
  private stringify: (data: T) => string
  __decrypt: (encryptedText: string, cypherKey: string) => string | { error: string } = defDecrypt
  __encrypt: (
    secretkey: string,
    text: string,
  ) => string | { error: string } = defEncrypt

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
    this._cypherKey = options._cypherKey
  }



  read(): T | null {
    const value = this.storage.getItem(this.key)
    if (value === null) {
      return null
    }
    const decrypted = this.__decrypt(value, this._cypherKey as string)
    return this.parse(decrypted as string)
  }

  write(obj: T): void {
    const stringified = this.stringify(obj)
    const encrypted = this.__encrypt(stringified, this._cypherKey as string)
    this.storage.setItem(this.key, encrypted as string)
  }
}
