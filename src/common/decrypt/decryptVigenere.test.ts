import { equal, throws } from 'node:assert/strict'
import test from 'node:test'

import { decryptVigenere } from './decryptVigenere.js'
import { encryptVigenere } from '../encrypt/encryptVigenere.js'

await test('decryptVigenere - Basic Decryption', () => {
    // Test basic string decryption
    const text = 'Hello, World!'
    const key = 'secretKey'
    const encrypted = encryptVigenere(text, key)
    const decrypted = decryptVigenere(encrypted, key)

    // Decrypted text should equal original
    equal(decrypted, text)


})

await test('decryptVigenere - Edge Cases', () => {
    // Test empty string
    equal(decryptVigenere('', 'key'), '')

    // Test with special characters
    const specialChars = '!@#$%^&*()_+'
    const encrypted = encryptVigenere(specialChars, 'key')
    const decrypted = decryptVigenere(encrypted, 'key')
    equal(decrypted, specialChars)

    // Test with unicode characters
    const unicode = '你好世界'
    const encryptedUnicode = encryptVigenere(unicode, 'key')
    const decryptedUnicode = decryptVigenere(encryptedUnicode, 'key')
    equal(decryptedUnicode, unicode)

    // Test with very long text
    const longText = 'a'.repeat(1000)
    const encryptedLong = encryptVigenere(longText, 'key')
    const decryptedLong = decryptVigenere(encryptedLong, 'key')
    equal(decryptedLong, longText)
})

await test('decryptVigenere - Error Cases', () => {
    // Test with invalid inputs
    // @ts-ignore - Testing invalid input
    throws(() => decryptVigenere(null, 'key'))
    // @ts-ignore - Testing invalid input
    throws(() => decryptVigenere(undefined, 'key'))
    // @ts-ignore - Testing invalid input
    throws(() => decryptVigenere('text', null))
    // @ts-ignore - Testing invalid input
    throws(() => decryptVigenere('text', undefined))
    throws(() => decryptVigenere('text', ''))
})

await test('decryptVigenere - Encryption-Decryption Cycle', () => {
    // Test with various types of text
    const testObject: any = {
        text: 'Hello, World! Меня зовут Иван. Мне 20 лет.', key: 'Персональная Информация'
    }
    const key = "SecretKey"
    const encrypted = encryptVigenere(JSON.stringify(testObject), key)
    console.log("encrypted:", encrypted)
    // const decrypted = decryptVigenere(encrypted.replace("|532", "|632"), key)
    const decrypted = decryptVigenere(encrypted, key)
    console.log("decrypted:", decrypted)
    equal(decrypted, JSON.stringify(testObject), `Original text should be recovered after encryption-decryption cycle for text: "${JSON.stringify(testObject)}"`)

})