import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { LineDb, LineDbAdapter, LineDbInitOptions } from './LineDbv2.js'
import { JSONLFile } from '../adapters/node/JSONLFile.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { logTest } from '../common/utils/log.js'
import { JSONLFileOptions } from '../common/interfaces/jsonl-file.js'

interface TestLogData extends LineDbAdapter {
    id: number
    userId: number
    timestamp: number
    message: string
    level: string
}

interface TestData extends LineDbAdapter {
    id: number | string
    name: string
    age: number
    value?: number
    userId: number
    timestamp: number
}

interface TestUser extends LineDbAdapter {
    id: number
    username: string
    password: string
    isActive: boolean
    role: string
    timestamp: number
}

interface TestOrder extends LineDbAdapter {
    id: number
    userId: number
    status: string
    amount: number
    timestamp: number
}

function shouldKeepTestFiles(): boolean {
    const keepFiles = process.env.KEEP_TEST_FILES
    return keepFiles === 'true' || keepFiles === '1'
}

describe('LineDb - Insert Method Tests', () => {
    const testDbFolder = path.join(process.cwd(), 'test-linedb-insert')

    let db: LineDb

    beforeEach(async () => {
        // Очищаем тестовую папку
        try {
            await fs.rm(testDbFolder, { recursive: true, force: true })
        } catch (error) {
            // Игнорируем ошибку, если папка не существует
        }

        const adapterTestDataOptions: JSONLFileOptions<TestData> = {
            collectionName: 'testData',
            encryptKeyForLineDb: '',
            indexedFields: ['id', 'userId'],
        }
        const adapterTestLogOptions: JSONLFileOptions<TestLogData> = {
            collectionName: 'testLogData',
            encryptKeyForLineDb: '',
            indexedFields: ['id', 'userId'],
        }
        const adapterUserOptions: JSONLFileOptions<TestUser> = {
            collectionName: 'testUser',
            encryptKeyForLineDb: '',
            indexedFields: ['id', 'username'],
        }
        const adapterOrdersOptions: JSONLFileOptions<TestOrder> = {
            collectionName: 'orders',
            encryptKeyForLineDb: '',
            indexedFields: ['id', 'status'],
        }
        const initLineDBOptions: LineDbInitOptions = {
            dbFolder: testDbFolder,
            cacheSize: 1000,
            cacheTTL: 10000,
            collections: [
                adapterTestDataOptions as unknown as JSONLFileOptions<unknown>,
                adapterTestLogOptions as unknown as JSONLFileOptions<unknown>,
                adapterUserOptions as unknown as JSONLFileOptions<unknown>,
                adapterOrdersOptions as unknown as JSONLFileOptions<unknown>,
            ],
            partitions: [
                {
                    collectionName: 'orders',
                    partIdFn: 'userId',
                },
            ],
        }
        db = new LineDb(initLineDBOptions)
        await db.init(true)
    })

    afterEach(async () => {
        try {
            if (!shouldKeepTestFiles()) {
                await fs.rm(testDbFolder, { recursive: true, force: true })
            }
        } catch (error) {
            // Игнорируем ошибку
        }
    })

    describe('Base insert operations', () => {
        it('should insert single record with auto-generated ID', async () => {
            const data: Partial<TestData> = {
                name: 'Test User',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(data, 'testData')
            const result = await db.read<TestData>('testData')

            expect(result).toHaveLength(1)
            expect(result[0].id).toBe(1) // Автогенерированный ID
            expect(result[0].name).toBe('Test User')
            expect(result[0].age).toBe(25)
        })

        it('should insert single record with provided ID', async () => {
            const data: TestData = {
                id: 100,
                name: 'Test User',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(data, 'testData')
            const result = await db.read<TestData>('testData')

            expect(result).toHaveLength(1)
            expect(result[0].id).toBe(100)
            expect(result[0].name).toBe('Test User')
        })

        it('should insert multiple records', async () => {
            const dataArray: Partial<TestData>[] = [
                {
                    name: 'User 1',
                    age: 25,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    name: 'User 2',
                    age: 30,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    name: 'User 3',
                    age: 35,
                    userId: 2,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestData>(dataArray, 'testData')
            const result = await db.read<TestData>('testData')

            expect(result).toHaveLength(3)
            expect(result[0].id).toBe(1)
            expect(result[1].id).toBe(2)
            expect(result[2].id).toBe(3)
        })

        it('should insert multiple records with skipCheckExistingForWrite', async () => {
            const dataArray: Partial<TestLogData>[] = [
                {
                    id: 1,
                    userId: 1,
                    timestamp: Date.now(),
                    message: 'message 1',
                    level: 'info',
                },
                {
                    id: 2,
                    userId: 1,
                    timestamp: Date.now(),
                    message: 'message 2',
                    level: 'info',
                },
                {
                    id: 3,
                    userId: 2,
                    timestamp: Date.now(),
                    message: 'message 3',
                    level: 'info',
                },
            ]

            await db.insert<TestLogData>(dataArray, 'testLogData', {
                inTransaction: false,
                skipCheckExistingForWrite: true,
            })
            const result = await db.read<TestLogData>('testLogData')

            expect(result).toHaveLength(3)
            expect(result[0].id).toBe(1)
            expect(result[1].id).toBe(2)
            expect(result[2].id).toBe(3)

            const dataDuplicateArray: Partial<TestLogData>[] = [
                {
                    id: 1,
                    userId: 1,
                    timestamp: Date.now(),
                    message: 'message 1 duplicate',
                    level: 'info',
                },
                {
                    id: 2,
                    userId: 1,
                    timestamp: Date.now(),
                    message: 'message 2 duplicate',
                    level: 'info',
                },
                {
                    id: 3,
                    userId: 2,
                    timestamp: Date.now(),
                    message: 'message 3 duplicate',
                    level: 'info',
                },
            ]

            await db.insert<TestLogData>(dataDuplicateArray, 'testLogData', {
                inTransaction: false,
                skipCheckExistingForWrite: true,
            })

            const result2 = (await db.read<TestLogData>('testLogData')).sort(
                (a, b) => a.id - b.id,
            )

            expect(result2).toHaveLength(6)
            expect(result2[0].id).toBe(1)
            expect(result2[1].id).toBe(1)
            expect(result2[2].id).toBe(2)
            expect(result2[3].id).toBe(2)
            expect(result2[4].id).toBe(3)
            expect(result2[5].id).toBe(3)
        })

        it('should throw error when inserting duplicate ID', async () => {
            const data1: TestData = {
                id: 1,
                name: 'User 1',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }
            const data2: TestData = {
                id: 1, // Duplicate ID
                name: 'User 2',
                age: 30,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(data1, 'testData')

            await expect(
                db.insert<TestData>(data2, 'testData'),
            ).rejects.toThrow(
                'Record with id 1 already exists in collection testData',
            )
        })

        it('should handle negative ID values', async () => {
            const data: Partial<TestData> = {
                id: -1, // Negative ID should be replaced with auto-generated
                name: 'Test User',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(data, 'testData')
            const result = await db.read<TestData>('testData')

            expect(result).toHaveLength(1)
            expect(result[0].id).toBe(1) // Should be replaced with positive
        })

        it('should handle zero ID values', async () => {
            const data: Partial<TestData> = {
                id: 0, // Zero ID should be replaced with auto-generated
                name: 'Test User',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(data, 'testData')
            const result = await db.read<TestData>('testData')

            expect(result).toHaveLength(1)
            expect(result[0].id).toBe(1) // Should be replaced with positive
        })
    })

    describe('Insert with partitions', () => {
        it('should insert into partitioned collection', async () => {
            const orders: TestOrder[] = [
                {
                    id: 1,
                    userId: 1,
                    status: 'pending',
                    amount: 100,
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    userId: 2,
                    status: 'completed',
                    amount: 200,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestOrder>(orders, 'orders')
            const result = await db.read<TestOrder>('orders')

            expect(result).toHaveLength(2)
            expect(result[0].userId).toBe(1)
            expect(result[1].userId).toBe(2)
        })

        it('should create separate partition files', async () => {
            const orders: TestOrder[] = [
                {
                    id: 1,
                    userId: 1,
                    status: 'pending',
                    amount: 100,
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    userId: 2,
                    status: 'completed',
                    amount: 200,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestOrder>(orders, 'orders')

            // Проверяем, что создались отдельные файлы партиций
            const files = await fs.readdir(testDbFolder)
            const orderFiles = files.filter(
                (file) => file.startsWith('orders_') && file.endsWith('.jsonl'),
            )

            expect(orderFiles).toContain('orders_1.jsonl')
            expect(orderFiles).toContain('orders_2.jsonl')
        })
    })

    describe('Insert with transactions', () => {
        it('should insert within transaction', async () => {
            const data: Partial<TestData> = {
                name: 'Test User',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(data, 'testData', { inTransaction: true })
            const result = await db.read<TestData>('testData')

            expect(result).toHaveLength(1)
            expect(result[0].name).toBe('Test User')
        })
    })

    describe('Insert with custom nextId function', () => {
        it('should use custom nextId function in insert in partitioned and updates partition key', async () => {
            const adapterTestDataOptions: JSONLFileOptions<TestData> = {
                collectionName: 'custom',
                encryptKeyForLineDb: '',
                indexedFields: ['id', 'userId'],
            }

            const initLineDBOptions: LineDbInitOptions = {
                dbFolder: testDbFolder,
                cacheSize: 1000,
                cacheTTL: 10_000,
                collections: [
                    adapterTestDataOptions as unknown as JSONLFileOptions<unknown>,
                ],
                partitions: [
                    {
                        collectionName: 'custom',
                        partIdFn: 'userId',
                    },
                ],
                nextIdFn: async (data, collectionName) => {
                    return `${collectionName}_${Date.now()}_${Math.floor(
                        Math.random() * 1_000_000,
                    )}`
                },
            }
            db = new LineDb(initLineDBOptions)
            await db.init(true)

            const data: Partial<TestData> = {
                name: 'Test User',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(data, 'custom')
            const result = await db.read<TestData>('custom')
            logTest(true, result)

            expect(result).toHaveLength(1)
            expect(typeof result[0].id).toBe('string')
            expect(result[0].id).toMatch(/^custom_\d+_\d+$/)

            const data2: Partial<TestData> = {
                name: 'Test User 2',
                age: 26,
                userId: 2,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(data2, 'custom')
            const result2 = await db.read<TestData>('custom')

            expect(result2).toHaveLength(2)
            expect(result2[1].id).toMatch(/^custom_\d+_\d+$/)

            const record2Id = result2[1].id
            await db.update<TestData>({ userId: 1 }, 'custom', {
                id: record2Id,
            })

            const result3 = await db.read<TestData>('custom')

            expect(result3).toHaveLength(2)
            expect(result3[1].userId).toBe(1)
            expect(result3[1].id).toBe(record2Id)
        }, 2_000_000)

        it.only('should use custom nextId function in insert with skipCheckExistingForWrite', async () => {
            const adapterTestLogDataOptions: JSONLFileOptions<TestLogData> = {
                collectionName: 'logs',
                encryptKeyForLineDb: '',
                indexedFields: ['id'],
            }

            const initLineDBOptions: LineDbInitOptions = {
                dbFolder: testDbFolder,
                cacheSize: 1000,
                cacheTTL: 10_000,
                collections: [
                    adapterTestLogDataOptions as unknown as JSONLFileOptions<unknown>,
                ],
                nextIdFn: async (data, collectionName) => {
                    return `${Date.now()}`
                },
            }
            db = new LineDb(initLineDBOptions)
            await db.init(true)

            const logsCount = 1000
            const logs: Partial<TestLogData>[] = []
            for (let i = 0; i < logsCount; i++) {
                logs.push({                    
                    userId: 1,
                    timestamp: Date.now(),
                    message: `message ${i}`,
                    level: 'info',
                })
            }

            await db.insert<TestLogData>(logs, 'logs', {
                inTransaction: false,
                skipCheckExistingForWrite: true,
            })

            const result = await db.read<TestLogData>('logs')
            expect(result).toHaveLength(logsCount)
        }, 2_000_000)
    })

    describe('Insert edge cases', () => {
        it('should handle empty array', async () => {
            await db.insert<TestData>([], 'testData')
            const result = await db.read<TestData>('testData')
            expect(result).toHaveLength(0)
        })

        it('should handle null/undefined values', async () => {
            const data: Partial<TestData> = {
                name: 'Test User',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
                value: undefined,
            }

            await db.insert<TestData>(data, 'testData')
            const result = await db.read<TestData>('testData')

            expect(result).toHaveLength(1)
            expect(result[0].name).toBe('Test User')
        })

        it('should handle large number of records', async () => {
            const dataArray: Partial<TestData>[] = []
            for (let i = 0; i < 100; i++) {
                dataArray.push({
                    name: `User ${i}`,
                    age: 20 + i,
                    userId: 1,
                    timestamp: Date.now(),
                })
            }

            await db.insert<TestData>(dataArray, 'testData')
            const result = await db.read<TestData>('testData')

            expect(result).toHaveLength(100)
            expect(result[99].id).toBe(100)
        })
    })
})
