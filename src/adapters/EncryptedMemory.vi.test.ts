import { describe, it, expect, beforeEach } from 'vitest'
import { randomBytes } from 'crypto'
import { EncryptedMemory, EncryptedMemorySync } from './EncryptedMemory.js'
interface TestData {
    name: string
    age: number
    isActive: boolean
}

describe('EncryptedMemory', () => {
    let adapter: EncryptedMemory<TestData>
    let testData: TestData
    let encryptionKey: Buffer

    beforeEach(() => {
        encryptionKey = randomBytes(32)
        adapter = new EncryptedMemory({
            encryptionKey,
            compressionEnabled: true,
        })
        testData = {
            name: 'Test User',
            age: 30,
            isActive: true,
        }
    })

    it('should write and read data correctly', async () => {
        await adapter.write(testData)
        const result = await adapter.read()
        expect(result).toEqual(testData)
    })

    it('should handle null data', async () => {
        const result = await adapter.read()
        expect(result).toBeNull()
    })

    it('should encrypt and decrypt data', async () => {
        const testString = 'test string'
        const encrypted = await adapter.encrypt(testString)
        expect(encrypted).not.toBe(testString)

        const decrypted = await adapter.decrypt(encrypted as string)
        expect(decrypted).toBe(testString)
    })

    it.skip('should handle encryption errors', async () => {
        const result = await adapter.encrypt('')
        expect(result).toEqual({ error: 'Encryption failed' })
    })

    it('should handle decryption errors', async () => {
        const result = await adapter.decrypt('invalid base64')
        expect(result).toEqual({ error: 'Decryption failed' })
        // await expect(adapter.decrypt('invalid base64'))
        // .rejects
        // // .toThrow('unsupported cypher');
        // .toThrow();
    })

    it('should work with compression disabled', async () => {
        const adapterWithoutCompression = new EncryptedMemory({
            encryptionKey,
            compressionEnabled: false,
        })
        await adapterWithoutCompression.write(testData)
        const result = await adapterWithoutCompression.read()
        expect(result).toEqual(testData)
    })
})

describe('EncryptedMemorySync', () => {
    let adapter: EncryptedMemorySync<TestData>
    let testData: TestData
    let encryptionKey: Buffer

    beforeEach(() => {
        encryptionKey = randomBytes(32)
        adapter = new EncryptedMemorySync({
            encryptionKey,
            compressionEnabled: true,
        })
        testData = {
            name: 'Test User',
            age: 30,
            isActive: true,
        }
    })

    it('should write and read data correctly', () => {
        adapter.write(testData)
        const result = adapter.read()
        expect(result).toEqual(testData)
    })

    it('should handle null data', () => {
        const result = adapter.read()
        expect(result).toBeNull()
    })

    it('should encrypt and decrypt data', () => {
        const testString = 'test string'
        const encrypted = adapter.encrypt(testString)
        expect(encrypted).not.toBe(testString)

        const decrypted = adapter.decrypt(encrypted as string)
        expect(decrypted).toBe(testString)
    })

    it.skip('should handle encryption errors', () => {
        const result = adapter.encrypt('')
        expect(result).toEqual({ error: 'Encryption failed' })
    })

    it('should handle decryption errors', () => {
        const result = adapter.decrypt('invalid base64')
        expect(result).toEqual({ error: 'Decryption failed' })        
        // expect(adapter.decrypt('invalid base64')).toThrow('unsupported cypher')
    })

    it('should work with compression disabled', () => {
        const adapterWithoutCompression = new EncryptedMemorySync({
            encryptionKey,
            compressionEnabled: false,
        })
        adapterWithoutCompression.write(testData)
        const result = adapterWithoutCompression.read()
        expect(result).toEqual(testData)
    })
})
