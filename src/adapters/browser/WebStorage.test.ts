import { deepEqual, equal, throws } from 'node:assert/strict'
import test from 'node:test'

import { WebStorage } from './WebStorage.js'

const storage: { [key: string]: string } = {}

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

await test('localStorage', () => {
    const obj = { a: 1 }
    const storage = new WebStorage('key', localStorage)

    // Write
    equal(storage.write(obj), undefined)

    // Read
    deepEqual(storage.read(), obj)
})

await test('sessionStorage', () => {
    const obj = { a: 1 }
    const storage = new WebStorage('key', sessionStorage)

    // Write
    equal(storage.write(obj), undefined)

    // Read
    deepEqual(storage.read(), obj)
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
