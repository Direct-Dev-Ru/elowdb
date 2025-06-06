import { Adapter } from "../../core/Low.js";
import { defBrowserDecrypt, defBrowserEncrypt } from "./WebStorage.js";


class indexedDBStorage {
    private db: IDBDatabase | null = null;
    private dbName: string;
    private storeName: string;
    private initialized = false;

    constructor(dbName: string = 'app', storeName: string = 'data') {
        this.dbName = dbName;
        this.storeName = storeName;
        // this.init().catch((error) => {
        //     console.error('Failed to initialize IndexedDB:', error);
        //     throw error; // Rethrow the error to prevent further usage
        // });
    }

    private init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onupgradeneeded = () => {
                
                const db = request.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'id' });
                }
            };

            request.onsuccess = () => {
                this.db = request.result;
                if (process.env.NODE_ENV === 'test') {
                    console.log('IndexedDB initialized successfully', this.db);
                }
                this.initialized = true;
                resolve(); // Resolve the promise when initialization is complete
            };

            request.onerror = () => {
                this.initialized = false;
                if (process.env.NODE_ENV === 'test') {
                    console.error('Error initializing IndexedDB:', request.error);
                }
                reject(new Error(`Error initializing IndexedDB: ${request.error}`));
            };
        });
    }
    async initialize(): Promise<void> {
        if (!this.initialized) {
            await this.init();
        }
    }

    async getItem(key: string = this.storeName): Promise<string | null> {
        await this.initialize();
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        return new Promise((resolve, reject) => {

            const transaction = this.db!.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);

            request.onsuccess = () => {
                if (request.result) {
                    if (process.env.NODE_ENV === 'test') {
                        console.log('Value retrieved from the database:', request.result.value);
                    }
                    resolve(request.result.value); // Resolve with the value associated with the key
                } else {
                    if (process.env.NODE_ENV === 'test') {
                        console.log('No value found for the key:', key);
                    }
                    resolve(null); // Resolve with null if no value is found
                }
            };

            request.onerror = () => {
                if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'dev') {
                    console.error('Error retrieving value from the database', request.error);
                }
                reject(request.error); // Reject with the error
            };
        });
    }

    async setItem(value: string, key: string = this.storeName): Promise<void> {
        await this.initialize();
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        const transaction = this.db!.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const objectToAdd: any = { id: key, value };        
        // console.log('objectToAdd:', objectToAdd);
        const request = store.put(objectToAdd);

        request.onsuccess = () => {
            if (process.env.NODE_ENV === 'test') {
                console.log(`Value added to the database: ${value}`);
            }
        };
        request.onerror =  () => {
            if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'dev') {
                console.error('Error adding value to the database', request.error?.message);
            }
        };
    }

    async removeItem(key: string = this.storeName): Promise<void> {
        await this.initialize();
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        await this.initialize();
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(key);

            request.onsuccess = function () {
                if (process.env.NODE_ENV === 'test') {
                    console.log(`Item with key "${key}" removed from the database`);
                }
                resolve(); // Resolve the promise when deletion is successful
            };

            request.onerror = function () {
                if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'dev') {
                    console.error('Error removing item from the database', request.error);
                }
                reject(request.error); // Reject the promise with the error
            };
        });
    }


    async clear(): Promise<void> {
        await this.initialize();
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => {
                if (process.env.NODE_ENV === 'test') {
                    console.log('All items cleared from the database');
                }
                resolve(); // Resolve the promise when clearing is successful
            };

            request.onerror = () => {
                if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'dev') {
                    console.error('Error clearing items from the database', request.error);
                }
                reject(request.error); // Reject the promise with the error
            };
        });
    }

    async getAllKeys(): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAllKeys();

            request.onsuccess = () => {
                if (process.env.NODE_ENV === 'test') {
                    console.log('All keys retrieved from the database:', request.result);
                }
                resolve(request.result as string[]); // Resolve with the array of keys
            };

            request.onerror = () => {
                if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'dev') {
                    console.error('Error retrieving keys from the database', request.error);
                }
                reject(request.error); // Reject with the error
            };
        });
    }
}

export class IndexedDbStorage<T> implements Adapter<T> {
    // private dbName: string
    // private storeName: string
    private storage: indexedDBStorage
    private parse: (str: string) => T
    private stringify: (data: T) => string
    _decrypt: (encryptedText: string, cypherKey: string) => Promise<string | { error: string }> = defBrowserDecrypt
    _encrypt: (
        secretkey: string,
        text: string,
    ) => Promise<string | { error: string }> = defBrowserEncrypt

    private _cypherKey?: string

    constructor(dbName: string = 'app', storeName: string = 'data', options: {
        parse?: (str: string) => T
        stringify?: (data: T) => string
        _cypherKey?: string
        decrypt?: (encryptedText: string) => Promise<string | { error: string }>
        encrypt?: (
            secretkey: string,
            text: string,
        ) => Promise<string | { error: string }>
    } = {}) {

        // this.dbName = dbName
        // this.storeName = storeName
        this.storage = new indexedDBStorage(dbName, storeName)
        this.parse = options.parse || JSON.parse
        this.stringify = options.stringify || JSON.stringify
        if (options.decrypt) {
            this._decrypt = options.decrypt
        }
        if (options.encrypt) {
            this._encrypt = options.encrypt
        }
        this._cypherKey = options._cypherKey || ''
    }

    async read(): Promise<T | null> {
        const value = await this.storage.getItem()
        if (value === null || value === undefined) {
            return null
        }
        if (this._cypherKey?.length || 0 > 0) {
            const decrypted = await this._decrypt(value, this._cypherKey as string)
            const error = decrypted as { error: string }
            if (error?.error) {
                throw new Error(`Decryption failed: ${error.error}`)
            }
            return this.parse(decrypted as string)
        }
        return this.parse(value)
    }

    async write(obj: T): Promise<void> {
        const stringified: string = this.stringify(obj)
        if (this._cypherKey?.length || 0 > 0) {
            const encrypted = await this._encrypt(stringified, this._cypherKey as string)
            const error = encrypted as { error: string }
            if (error?.error) {
              // console.log("encrypted error:", `Encryption failed: ${error.error}`);
              throw new Error(`Encryption failed: ${error.error}`)
            }
            this.storage.setItem(encrypted as string)
        } else {
            this.storage.setItem(stringified)
        }
    }
}

export default IndexedDbStorage;