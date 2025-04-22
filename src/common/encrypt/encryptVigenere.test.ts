import { equal, throws } from 'node:assert/strict'
import test from 'node:test'

import { encryptVigenere } from './encryptVigenere.js'
import { decryptVigenere } from '../decrypt/decryptVigenere.js'

await test('encryptVigenere - Basic Encryption', () => {
    // Test basic string encryption
    const text = 'Hello, World!'
    const key = 'secret'
    const encrypted = encryptVigenere(text, key)

    // Encrypted text should not equal original
    equal(encrypted !== text, true)

    // Test with empty key (should throw error)
    throws(() => encryptVigenere(text, ''), new Error('secret key must not be empty'))
})

await test('encryptVigenere - Edge Cases', () => {
    // Test empty string
    equal(encryptVigenere('', 'key'), '')

    // Test with special characters
    const specialChars = '!@#$%^&*()_+'
    const encrypted = encryptVigenere(specialChars, 'key')
    equal(encrypted !== specialChars, true)

    // Test with unicode characters
    const unicode = '你好世界'
    const encryptedUnicode = encryptVigenere(unicode, 'key')
    equal(encryptedUnicode !== unicode, true)

    // Test with very long text
    const longText = 'a'.repeat(1000)
    const encryptedLong = encryptVigenere(longText, 'key')
    equal(encryptedLong !== longText, true)
})

await test('encryptVigenere - Error Cases', () => {
    // Test with invalid inputs
    // @ts-ignore - Testing invalid input
    throws(() => encryptVigenere(null, 'key'))
    // @ts-ignore - Testing invalid input
    throws(() => encryptVigenere(undefined, 'key'))
    // @ts-ignore - Testing invalid input
    throws(() => encryptVigenere('text', null))
    // @ts-ignore - Testing invalid input
    throws(() => encryptVigenere('text', undefined))
})

await test('encryptVigenere - Encryption-Decryption Cycle', () => {
    // Test with various types of text
    const testCases = [
        { text: 'Hello, World!', key: 'secret_key' },
        { text: 'Привет, Мир!', key: 'Sсекретный_ключ' },
        { text: '12345', key: 'numbers_key' },
        { text: 'Hello 123 Привет!', key: 'mixed_key' }
    ]

    for (const { text, key } of testCases) {
        const encrypted = encryptVigenere(text, key)
        const decrypted = decryptVigenere(encrypted, key)
        equal(decrypted, text, `Original text should be recovered after encryption-decryption cycle for text: "${text}"`)
    }
})

await test('encryptVigenere - Digit Handling', () => {
    // Test individual digits
    const digits = '0123456789'
    const key = 'digit_key'

    const encrypted = encryptVigenere(digits, key)
    // console.log("encrypted:", encrypted)
    const decrypted = decryptVigenere(encrypted, key)
    // console.log("decrypted:", decrypted)
    equal(decrypted, digits, 'Digits should be correctly encrypted and decrypted')

    // Test digits in context
    const testCases = [
        { text: '1', key: 'key1' },
        { text: '12', key: 'key2' },
        { text: '123', key: 'key3' },
        { text: '1a2b3', key: 'key4' },
        { text: 'a1b2c3', key: 'key5' },
    ]

    for (const { text, key } of testCases) {
        const encrypted = encryptVigenere(text, key)
        const decrypted = decryptVigenere(encrypted, key)
        equal(decrypted, text, `Digits in context should be correctly encrypted and decrypted: "${text}"`)
    }
}) 