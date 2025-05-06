/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-explicit-any */
import fsSync from 'node:fs'
import fs from 'node:fs/promises'

import { ObjectId } from 'bson'
import { temporaryFile } from 'tempy'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { bsonOptionsForStorage } from '../../common/bson/bson-option.js'
import { BSONFile, BSONFileSync } from './BSONFile.js'

interface TestData {
    _id?: ObjectId
    id: number
    name: string
    nested?: {
        value: string
        date?: Date
    }
    array?: any[]
    binary?: Uint8Array
}

describe('BSONFile', () => {
    const secretKey = undefined
    let tempFile: string
    let bsonFile: BSONFile<TestData>
    let bsonFileSync: BSONFileSync<TestData>

    beforeEach(() => {
        tempFile = temporaryFile()
        bsonFile = new BSONFile<TestData>(tempFile, secretKey)
        bsonFileSync = new BSONFileSync<TestData>(tempFile, secretKey)
    })

    afterEach(async () => {
        try {
            await fs.unlink(tempFile)
        } catch (error) {
            // Ignore errors if file doesn't exist
        }
    })

    describe.skip('Async Operations', () => {
        it('should return null for non-existent file', async () => {
            const result = await bsonFile.read()
            expect(result).toBeNull()
        })

        it('should write and read simple data', async () => {
            const bsonFile = new BSONFile<TestData>(
                'c:\\tmp\\test.txt',
                'secret',
                { ...bsonOptionsForStorage },
            )
            const data: TestData = { id: 10, name: 'TheTest' }
            await bsonFile.write(data)
            const result = await bsonFile.read()
            if (process.env.NODE_ENV === 'test') {
                // console.log('result:', result);
            }
            expect(result).toEqual(data)
        })

        it('should write and read complex BSON data', async () => {
            const data: TestData = {
                _id: new ObjectId(),
                id: 1,
                name: 'test',
                nested: {
                    value: 'nested value',
                    date: new Date(),
                },
                array: [1, 2, 3],
                // binary: new Uint8Array([1, 2, 3, 4, 5])
            }
            await bsonFile.write(data)
            const result = await bsonFile.read()
            expect(result).toEqual(data)
        })

        it('should handle encryption and decryption', async () => {
            bsonFile = new BSONFile<TestData>(tempFile, 'secretKey', {
                ...bsonOptionsForStorage,
            })
            const data: TestData = {
                _id: new ObjectId(),
                id: 1,
                name: 'test',
                nested: {
                    value: 'nested value',
                    date: new Date(),
                },
            }
            await bsonFile.write(data)
            if (process.env.NODE_ENV === 'test') {
                const content = await fs.readFile(tempFile, 'utf-8')
                console.log('result in file after write:', content)
            }
            const result = await bsonFile.read()
            expect(result).toEqual(data)
        })

        it('should handle without encryption and decryption bson', async () => {
            bsonFile = new BSONFile<TestData>(tempFile, undefined, {
                ...bsonOptionsForStorage,
            })
            const data: TestData = {
                _id: new ObjectId(),
                id: 1,
                name: 'test',
                nested: {
                    value: 'nested value',
                    date: new Date(),
                },
            }
            await bsonFile.write(data)
            if (process.env.NODE_ENV === 'test') {
                const content = await fs.readFile(tempFile, 'utf-8')
                console.log('result in file after write:', content)
            }
            const result = await bsonFile.read()
            expect(result).toEqual(data)
        })

        it('should handle encryption errors', async () => {
            const customFile = new BSONFile<TestData>(
                tempFile,
                'secretKey-encryption-error',
                {
                    encrypt: async () => {
                        return { error: 'Encryption failed' }
                    },
                    decrypt: async () => {
                        return { error: 'Decryption failed' }
                    },
                },
            )

            const data: TestData = { id: 1, name: 'test' }
            // await customFile.write(data);
            await expect(customFile.write(data)).rejects.toThrow(
                /^Encryption failed/,
            )
        })

        it('should handle decryption errors', async () => {
            const customFile = new BSONFile<TestData>(
                tempFile,
                'secretKey-decryption-error',
                {
                    decrypt: async () => {
                        return { error: 'Decryption failed' }
                    },
                },
            )

            const data: TestData = { id: 1, name: 'test' }
            await bsonFile.write(data)
            await expect(customFile.read()).rejects.toThrow(
                /^Decryption failed/,
            )
        })

        it('should handle race conditions', async () => {
            const promises: Promise<void>[] = []
            for (let i = 0; i < 10; i++) {
                promises.push(bsonFile.write({ id: i, name: `test${i}` }))
            }
            await Promise.all(promises)
            const result = await bsonFile.read()
            expect(result).toBeDefined()
        })
    })

    describe('Sync Operations', () => {
        it('should return null for non-existent file', () => {
            const tempFileLocal = temporaryFile()
            const bsonFileSyncLocal = new BSONFileSync<TestData>(
                tempFileLocal,
                secretKey,
            )
            const result = bsonFileSyncLocal.read()
            expect(result).toBeNull()
            try {
                fsSync.unlinkSync(tempFileLocal)
            } catch (error) {
                // Ignore errors if file doesn't exist
            }
        })

        it('should write and read simple data', () => {
            const data: TestData = { id: 1, name: 'test' }
            bsonFileSync.write(data)
            const result = bsonFileSync.read()
            expect(result).toEqual(data)
        })

        it('should write and read complex BSON data', () => {
            const data: TestData = {
                _id: new ObjectId(),
                id: 1,
                name: 'test',
                nested: {
                    value: 'nested value',
                    date: new Date(),
                },
                array: [1, 2, 3],
                // binary: new Uint8Array([1, 2, 3, 4, 5])
            }
            bsonFileSync.write(data)
            const result = bsonFileSync.read()
            expect(result).toEqual(data)
        })

        it('should handle encryption and decryption', () => {
            const tempFileLocal = temporaryFile()
            const bsonFileSyncLocal = new BSONFileSync<TestData>(
                tempFileLocal,
                'secretKey',
            )
            const data: TestData = {
                _id: new ObjectId(),
                id: 1,
                name: 'test',
                nested: {
                    value: 'nested value',
                    date: new Date(),
                },
            }
            bsonFileSyncLocal.write(data)
            if (process.env.NODE_ENV === 'test') {
                const content = fsSync.readFileSync(tempFileLocal, 'utf-8')
                console.log('result in file after write:', content)
            }
            const result = bsonFileSyncLocal.read()
            expect(result).toEqual(data)
        })

        it('should handle encryption errors', () => {
            const customFile = new BSONFileSync<TestData>(
                tempFile,
                'secretKey',
                {
                    encrypt: () => ({ error: 'Encryption failed' }),
                },
            )

            const data: TestData = { id: 1, name: 'test' }
            expect(() => customFile.write(data)).toThrow('Encryption failed')
        })

        it('should handle decryption errors', () => {
            const customFile = new BSONFileSync<TestData>(
                tempFile,
                'secretKey',
                {
                    decrypt: () => ({ error: 'Decryption failed' }),
                },
            )

            const data: TestData = { id: 1, name: 'test' }
            bsonFileSync.write(data)
            expect(() => customFile.read()).toThrow('Decryption failed')
        })
    })
})
