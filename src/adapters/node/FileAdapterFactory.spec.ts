import fs from 'node:fs/promises'

import { temporaryFile } from 'tempy'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { TestData } from '../../common/interfaces/test-data.js'
import { DataFile, DataFileSync } from './DataFile.js'
import { FileAdapterFactory, FileType, SyncType } from './FileAdapterFactory.js'

describe('FileAdapterFactory', () => {
    const secretKey = 'Testkey25!'
    let tempFile: string

    beforeEach(() => {
        tempFile = temporaryFile()
    })

    afterEach(async () => {
        try {
            await fs.unlink(tempFile)
        } catch (error) {
            // Ignore errors if file doesn't exist
        }
    })

    describe('create', () => {
        it.each(['json', 'bson', 'yaml'] as FileType[])(
            'should create %s adapter',
            (type) => {
                const adapter = FileAdapterFactory.create<TestData>(
                    tempFile,
                    type,
                )
                expect(adapter).toBeDefined()
            },
        )

        it.each(['sync', 'async'] as SyncType[])(
            'should create %s adapter',
            (sync) => {
                const adapter = FileAdapterFactory.create<TestData>(
                    tempFile,
                    'json',
                    sync,
                )
                expect(adapter).toBeDefined()
            },
        )

        it('should throw error for unsupported file type', () => {
            expect(() => {
                FileAdapterFactory.create<TestData>(
                    tempFile,
                    'unsupported' as FileType,
                )
            }).toThrow('Unsupported file type: unsupported')
        })
    })

    describe('createJSON', () => {
        it('should create JSON adapter', async () => {
            const adapter = FileAdapterFactory.createJSON<TestData>(tempFile)
            expect(adapter).toBeDefined()
            expect(adapter).toBeInstanceOf(DataFile)
        })

        it('should create JSON sync adapter', () => {
            const adapter = FileAdapterFactory.createJSON<TestData>(
                tempFile,
                'sync',
            )
            expect(adapter).toBeDefined()
            expect(adapter).toBeInstanceOf(DataFileSync)
        })
    })

    describe('createBSON', () => {
        it('should create BSON adapter', async () => {
            const adapter = FileAdapterFactory.createBSON<TestData>(tempFile)
            expect(adapter).toBeDefined()
            expect(adapter).toBeInstanceOf(DataFile)
        })

        it('should create BSON sync adapter', () => {
            const adapter = FileAdapterFactory.createBSON<TestData>(
                tempFile,
                'sync',
            )
            expect(adapter).toBeDefined()
            expect(adapter).toBeInstanceOf(DataFileSync)
        })
    })

    describe('createYAML', () => {
        it('should create YAML adapter', async () => {
            const adapter = FileAdapterFactory.createYAML<TestData>(tempFile)
            expect(adapter).toBeDefined()
            expect(adapter).toBeInstanceOf(DataFile)
        })

        it('should create YAML sync adapter', () => {
            const adapter = FileAdapterFactory.createYAML<TestData>(
                tempFile,
                'sync',
            )
            expect(adapter).toBeDefined()
            expect(adapter).toBeInstanceOf(DataFileSync)
        })
    })

    describe('encryption', () => {
        it('should create encrypted adapter', async () => {
            const adapter = FileAdapterFactory.create<TestData>(
                tempFile,
                'json',
                'async',
                secretKey,
            )
            const data: TestData = {
                id: 1,
                name: 'test',
                value: 100,
                user: 'User1',
            }
            await adapter.write(data)
            const result = await adapter.read()
            expect(result).toEqual(data)
        })

        it('should create encrypted sync adapter', () => {
            const adapter = FileAdapterFactory.create<TestData>(
                tempFile,
                'json',
                'sync',
                secretKey,
            )
            const data: TestData = {
                id: 1,
                name: 'test',
                value: 100,
                user: 'User1',
            }
            adapter.write(data)
            const result = adapter.read()
            expect(result).toEqual(data)
        })
    })

    describe('custom options', () => {
        it('should create adapter with custom encryption', async () => {
            const customEncrypt = async () => ({
                error: 'Custom encryption failed',
            })
            const adapter = FileAdapterFactory.create<TestData>(
                tempFile,
                'json',
                'async',
                secretKey,
                {
                    encrypt: customEncrypt,
                },
            )
            const data: TestData = {
                id: 1,
                name: 'test',
                value: 100,
                user: 'User1',
            }
            await expect(adapter.write(data)).rejects.toThrow(
                'Custom encryption failed',
            )
        })

        it('should create adapter with custom decryption', async () => {
            const customDecrypt = async () => ({
                error: 'Custom decryption failed',
            })
            const adapter = FileAdapterFactory.create<TestData>(
                tempFile,
                'json',
                'async',
                secretKey,
                {
                    decrypt: customDecrypt,
                },
            )

            await expect(adapter.read()).rejects.toThrow(
                'Custom decryption failed',
            )
        })
    })
})
