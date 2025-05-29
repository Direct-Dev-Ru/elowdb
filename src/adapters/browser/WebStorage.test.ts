import { TestData } from '../../common/interfaces/test-data.js'
import { deepEqual, equal } from 'node:assert/strict'
import test from 'node:test'

import { WebStorage } from './WebStorage.js'
import { bsonOptionsForStorage } from '../../common/bson/bson-option.js'

const storage: { [key: string]: string } = {}

// Example: Using btoa and atob for base64 encoding/decoding
const base64Options = {
    parse: (str: string): any => JSON.parse(atob(str)),
    stringify: (data: any): string => btoa(JSON.stringify(data)),
};

// Mock localStorage
const mockStorage = () => ({
    getItem: (key: string): string | null => storage[key] || null,
    setItem: (key: string, data: string) => (storage[key] = data),
    length: 1,
    removeItem() {
        return
    },
    clear() {
        return
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    key(_: number): string {
        return ''
    },
})
global.localStorage = mockStorage()
global.sessionStorage = mockStorage()

await test('localStorage', async () => {
    const obj = { id: 1, name: 'test' }
    const storage = new WebStorage<{ id: number, name: string }>('key base64', localStorage, { ...base64Options })
        // Write
    equal(await storage.write(obj), undefined)
        // Read
    deepEqual(await storage.read(), obj)
    console.log('localStorage unencrypted', await storage.read())
    console.log('localStorage unencrypted in storage representation',global.localStorage.getItem('key base64'))
})

await test('localStorage bson', async () => {
    const obj = { id: 1, name: 'test' }
    const storage = new WebStorage<{ id: number, name: string }>('key bson', localStorage, { ...bsonOptionsForStorage })
        // Write
    equal(await storage.write(obj), undefined)
        // Read
    deepEqual(await storage.read(), obj)
    console.log('localStorage bson unencrypted', await storage.read())
    console.log('localStorage bson unencrypted in storage representation',global.localStorage.getItem('key bson'))
})

await test('localStorage encrypted', async () => {
    const obj = { id: 1, name: 'test' }
    const encStorage = new WebStorage<{ id: number, name: string }>('encrypted', localStorage, { _cypherKey: 'secret', })
    // Write encrypted
    equal(await encStorage.write(obj), undefined)
    // Read encrypted   
    deepEqual(await encStorage.read(), obj)
    // console.log(global.sessionStorage.getItem('key'))
    // console.log(global.sessionStorage.getItem('encrypted'))
    // console.log(await encStorage.read())
})

await test('sessionStorage without encryption', async () => {
    const obj = { id: 1, name: 'test' }
    const storage = new WebStorage('key', sessionStorage)
    // Write
    equal(await storage.write(obj), undefined)
    // Read
    deepEqual(await storage.read(), obj)    
})

await test('sessionStorage encrypted', async () => {
    const obj = { id: 1, name: 'test' }
    const encStorage = new WebStorage<{ id: number, name: string }>('encrypted', sessionStorage, { _cypherKey: 'secret' })
    // Write encrypted
    equal(await encStorage.write(obj), undefined)
    // Read encrypted   
    deepEqual(await encStorage.read(), obj)
    // console.log(global.sessionStorage.getItem('key'))
    // console.log(global.sessionStorage.getItem('encrypted'))
    // console.log(await encStorage.read())
})

// const vigenereEncrypt = (text: string, key: string): string => {
//     if (typeof text !== "string" || typeof key !== "string") {
//         return JSON.stringify({ error: "text and key must be strings" })
//     }
//     if (!key) return text

//     const result: string[] = []
//     const keyLength = key.length

//     for (let i = 0; i < text.length; i++) {
//         const textChar = text.charCodeAt(i)
//         const keyChar = key.charCodeAt(i % keyLength)
//         const encryptedChar = ((textChar + keyChar) % 256)
//         result.push(String.fromCharCode(encryptedChar))
//     }

//     return result.join('')
// }

// const vigenereDecrypt = (text: string, key: string): string => {
//     if (typeof text !== "string" || typeof key !== "string") {
//         return JSON.stringify({ error: "text and key must be strings" })
//     }
//     if (!key) return text

//     const result: string[] = []
//     const keyLength = key.length

//     for (let i = 0; i < text.length; i++) {
//         const textChar = text.charCodeAt(i)
//         const keyChar = key.charCodeAt(i % keyLength)
//         const decryptedChar = ((textChar - keyChar + 256) % 256)
//         result.push(String.fromCharCode(decryptedChar))
//     }

//     return result.join('')
// }

// await test('WebStorage with Vigenère Cipher', () => {
//     // Mock localStorage
//     const mockStorage = {
//         data: {} as Record<string, string>,
//         getItem(key: string): string | null {
//             return this.data[key] || null
//         },
//         setItem(key: string, value: string): void {
//             this.data[key] = value
//         }
//     }

//     // Test basic encryption/decryption
//     const storage = new WebStorage('test', mockStorage, {
//         _cypherKey: 'secret',
//         encrypt: vigenereEncrypt,
//         decrypt: vigenereDecrypt
//     })

//     // Test data
//     const testData = { message: 'Hello, World!' }
    
//     // Write encrypted data
//     storage.write(testData)
    
//     // Read and decrypt data
//     const readData = storage.read()
    
//     // Verify data matches
//     deepEqual(readData, testData)

//     // Test with empty key (should not encrypt)
//     const storageNoEncrypt = new WebStorage('test2', mockStorage, {
//         _cypherKey: '',
//         encrypt: vigenereEncrypt,
//         decrypt: vigenereDecrypt
//     })

//     storageNoEncrypt.write(testData)
//     const readDataNoEncrypt = storageNoEncrypt.read()
//     deepEqual(readDataNoEncrypt, testData)

//     // Test with invalid inputs
//     const storageInvalid = new WebStorage('test3', mockStorage, {
//         _cypherKey: 'secret',
//         encrypt: vigenereEncrypt,
//         decrypt: vigenereDecrypt
//     })

//     // @ts-ignore - Testing invalid input
//     throws(() => storageInvalid.write(null))
//     // @ts-ignore - Testing invalid input
//     throws(() => storageInvalid.write(undefined))
// })

// await test('Vigenère Cipher Edge Cases', () => {
//     // Test empty strings
//     equal(vigenereEncrypt('', 'key'), '')
//     equal(vigenereDecrypt('', 'key'), '')

//     // Test with special characters
//     const specialChars = '!@#$%^&*()_+'
//     const encrypted = vigenereEncrypt(specialChars, 'key')
//     const decrypted = vigenereDecrypt(encrypted, 'key')
//     equal(decrypted, specialChars)

//     // Test with unicode characters
//     const unicode = '你好世界'
//     const encryptedUnicode = vigenereEncrypt(unicode, 'key')
//     const decryptedUnicode = vigenereDecrypt(encryptedUnicode, 'key')
//     equal(decryptedUnicode, unicode)

//     // Test with very long text
//     const longText = 'a'.repeat(1000)
//     const encryptedLong = vigenereEncrypt(longText, 'key')
//     const decryptedLong = vigenereDecrypt(encryptedLong, 'key')
//     equal(decryptedLong, longText)
// })
