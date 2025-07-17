import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { LineDb, LineDbAdapter, LineDbInitOptions } from './LineDbv2.js'
import { JSONLFile } from '../adapters/node/JSONLFile.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { logTest } from '../common/utils/log.js'
import { JSONLFileOptions } from '../common/interfaces/jsonl-file.js'
import { log } from 'node:console'

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

describe('LineDb - Delete Method Tests', () => {
    const testDbFolder = path.join(process.cwd(), 'test-linedb-delete')
    // const testFileData = path.join(testDbFolder, 'testData.jsonl')
    // const testFileUser = path.join(testDbFolder, 'testUser.jsonl')
    // const testFileOrders = path.join(testDbFolder, 'orders.jsonl')

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

    describe('Base delete operations', () => {
        it('should delete one record by ID', async () => {
            const data: TestData = {
                id: 1,
                name: 'Test User',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(data, 'testData')
            let result = await db.read<TestData>('testData')
            expect(result).toHaveLength(1)

            await db.delete<TestData>({ id: 1 }, 'testData')
            result = await db.read<TestData>('testData')
            expect(result).toHaveLength(0)
        })

        it('should delete one record by ID text filter', async () => {
            const data: TestData = {
                id: 1,
                name: 'Test User',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(data, 'testData')
            let result = await db.read<TestData>('testData')
            expect(result).toHaveLength(1)

            await db.delete<TestData>(`name == 'Test User'`, 'testData')
            result = await db.read<TestData>('testData')
            expect(result).toHaveLength(0)
        })

        it('should delete multiple records by array of data', async () => {
            const dataArray: TestData[] = [
                {
                    id: 1,
                    name: 'User 1',
                    age: 25,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    name: 'User 2',
                    age: 30,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    id: 3,
                    name: 'User 3',
                    age: 35,
                    userId: 1,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestData>(dataArray, 'testData')
            let selectResult = await db.select<TestData>('testData')
            expect(db.selectResultArray(selectResult)).toHaveLength(3)

            const deleted = await db.delete<TestData>(
                [{ id: 1 }, { id: 2 }],
                'testData',
            )
            expect(deleted).toHaveLength(2)
            expect(deleted[0].id).toBe(1)
            expect(deleted[1].id).toBe(2)
            selectResult = await db.select<TestData>('testData')
            expect(db.selectResultArray(selectResult)).toHaveLength(1)
            expect(db.selectResultArray(selectResult)[0].id).toBe(3)
        })

        it('should delete records by partial match with object filtering', async () => {
            const dataArray: TestData[] = [
                {
                    id: 1,
                    name: 'John Doe',
                    age: 25,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    name: 'Jane Ainsley',
                    age: 30,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    id: 3,
                    name: 'John Smith',
                    age: 35,
                    userId: 2,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestData>(dataArray, 'testData')
            let selectResult = await db.select<TestData>('testData')
            expect(db.selectResultArray(selectResult)).toHaveLength(3)

            const deleted = await db.delete<TestData>(
                { name: 'John' },
                'testData',
                {
                    strictCompare: false,
                    inTransaction: false,
                },
            )
            expect(deleted).toHaveLength(2)
            expect(deleted[0].id).toBe(1)
            expect(deleted[1].id).toBe(3)
            selectResult = await db.select<TestData>('testData')
            expect(db.selectResultArray(selectResult)).toHaveLength(1)
            expect(db.selectResultArray(selectResult)[0].name).toBe(
                'Jane Ainsley',
            )
        })
        it('should delete records by partial match with string filtering', async () => {
            const dataArray: TestData[] = [
                {
                    id: 1,
                    name: 'John Doe',
                    age: 25,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    name: 'Jane Ainsley',
                    age: 30,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    id: 3,
                    name: 'John Smith',
                    age: 35,
                    userId: 2,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestData>(dataArray, 'testData')
            let selectResult = await db.select<TestData>('testData')
            expect(db.selectResultArray(selectResult)).toHaveLength(3)

            const deleted = await db.delete<TestData>(
                `strStartsWith(name, 'John')`,
                'testData',
                {
                    inTransaction: false,
                },
            )
            expect(deleted).toHaveLength(2)
            expect(deleted[0].id).toBe(1)
            expect(deleted[1].id).toBe(3)
            selectResult = await db.select<TestData>('testData')
            expect(db.selectResultArray(selectResult)).toHaveLength(1)
            expect(db.selectResultArray(selectResult)[0].name).toBe(
                'Jane Ainsley',
            )
        })

        it('should use first collection if collectionName is not specified', async () => {
            const data: TestData = {
                id: 1,
                name: 'Test User',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(data, 'testData')
            let result = await db.read<TestData>('testData')
            expect(result).toHaveLength(1)

            await db.delete<TestData>({ id: 1 }) // Dont specify collectionName
            result = await db.read<TestData>('testData')
            expect(result).toHaveLength(0)
        })
    })

    describe('Delete and caching', () => {
        it('should clear cache for deleted records', async () => {
            const data: TestData = {
                id: 1,
                name: 'Test User',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(data, 'testData')
            expect(db.actualCacheSize).toBeGreaterThan(0)
            // Читаем запись, чтобы она попала в кэш
            await db.readByFilter<TestData>({ id: 1 }, 'testData')
            expect(db.actualCacheSize).toBeGreaterThan(0)

            await db.delete<TestData>({ name: 'Test User' }, 'testData')

            // Проверяем, что кэш очищен для этой записи
            const cacheKey = `testData:1`
            expect(db.actualCacheSize).toBe(0)
            expect(db.cacheMap.has(cacheKey)).toBe(false)
        })

        it('should clear cache for all deleted records in array', async () => {
            const dataArray: TestData[] = [
                {
                    id: 1,
                    name: 'User 1',
                    age: 25,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    name: 'User 2',
                    age: 30,
                    userId: 1,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestData>(dataArray, 'testData')
            expect(db.actualCacheSize).toBe(2)
            // Читаем записи, чтобы они попали в кэш
            await db.readByFilter<TestData>({ id: 1 }, 'testData')
            await db.readByFilter<TestData>({ id: 2 }, 'testData')
            expect(db.actualCacheSize).toBe(2)
            await db.delete<TestData>(dataArray, 'testData')
            expect(db.actualCacheSize).toBe(0)
            // Проверяем, что кэш очищен для всех записей
            expect(db.cacheMap.has('testData:1')).toBe(false)
            expect(db.cacheMap.has('testData:2')).toBe(false)
        })
    })

    describe('Delete in partitioned collections', () => {
        it('should delete record from correct partition', async () => {
            const order1: TestOrder = {
                id: 1,
                userId: 1,
                status: 'pending',
                amount: 100,
                timestamp: Date.now(),
            }
            const order2: TestOrder = {
                id: 2,
                userId: 2,
                status: 'completed',
                amount: 200,
                timestamp: Date.now(),
            }

            await db.insert<TestOrder>(order1, 'orders')
            await db.insert<TestOrder>(order2, 'orders')
            await db.clearCache()
            expect(db.actualCacheSize).toBe(0)

            let selectOrdersResult = await db.select<TestOrder>('', 'orders')
            expect(db.selectResultArray(selectOrdersResult)).toHaveLength(2)
            // logTest(true, db.cacheMap)
            expect(db.actualCacheSize).toBe(2)
            // Удаляем заказ пользователя 1
            await db.delete<TestOrder>({ userId: 1 }, 'orders')

            selectOrdersResult = await db.select<TestOrder>({}, 'orders')
            expect(db.selectResultArray(selectOrdersResult)).toHaveLength(1)
            expect(db.selectResultArray(selectOrdersResult)[0].userId).toBe(2)
            expect(db.actualCacheSize).toBe(1)
        }, 1_000_000)

        it('should delete records from all partitions when using a common filter', async () => {
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
                    status: 'pending',
                    amount: 200,
                    timestamp: Date.now(),
                },
                {
                    id: 3,
                    userId: 1,
                    status: 'completed',
                    amount: 300,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestOrder>(orders, 'orders')

            let selectOrdersResult = await db.select<TestOrder>('', 'orders')
            expect(db.selectResultArray(selectOrdersResult)).toHaveLength(3)

            // Delete all orders with status 'pending'
            await db.delete<TestOrder>({ status: 'pending' }, 'orders')

            selectOrdersResult = await db.select<TestOrder>('', 'orders')
            expect(db.selectResultArray(selectOrdersResult)).toHaveLength(1)
            expect(db.selectResultArray(selectOrdersResult)[0].status).toBe(
                'completed',
            )
        }, 1_000_000)

        it('should delete records from a specific partition', async () => {
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
                    status: 'pending',
                    amount: 200,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestOrder>(orders, 'orders')

            let selectOrdersResult = await db.select<TestOrder>('', 'orders')
            expect(db.selectResultArray(selectOrdersResult)).toHaveLength(2)

            // Delete from a specific partition
            await db.delete<TestOrder>({ id: 1 }, 'orders_1')

            selectOrdersResult = await db.select<TestOrder>('', 'orders')
            expect(db.selectResultArray(selectOrdersResult)).toHaveLength(1)
            expect(db.selectResultArray(selectOrdersResult)[0].userId).toBe(2)
        })
    })

    describe('Delete in transactions', () => {
        it('should delete in Multy Adapters Transaction', async () => {
            const data: TestData = {
                id: 1,
                name: 'Test User',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            // Create Map of adapters for transaction
            const adapters = ['testData']

            // Execute transaction
            await db.withMultyAdaptersTransaction(
                async (adapterMap, database) => {
                    const options = adapterMap.get('testData')?.adapterOptions
                    await database.insert<TestData>(data, 'testData', {
                        ...options,
                        inTransaction: true,
                    })
                    await database.update<TestData>(
                        [{ name: 'Updated Test User' }],
                        'testData',
                        { id: 1 },
                        options,
                    )
                    const result = await db.select<TestData>(
                        '',
                        'testData',
                        options,
                    )
                    expect(db.selectResultArray(result)).toHaveLength(1)
                    expect(db.selectResultArray(result)[0].name).toBe(
                        'Updated Test User',
                    )
                    await database.delete<TestData>({ id: 1 }, 'testData', {
                        ...options,
                        inTransaction: true,
                    })
                },
                adapters,
                { rollback: true },
            )
            const result = await db.select<TestData>('testData')
            expect(db.selectResultArray(result)).toHaveLength(0)
        })

        it('should delete in adapter transaction', async () => {
            const data: TestData = {
                id: 1,
                name: 'Test User',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(data, 'testData')
            let result = await db.select<TestData>('id === 1', 'testData')
            expect(db.selectResultArray(result)).toHaveLength(1)

            await db.withAdapterTransaction<TestData>(async (adapter, db) => {
                await adapter.delete({ id: 1 })
            }, 'testData')

            result = await db.select<TestData>('', 'testData')
            expect(result).toHaveLength(0)
        })
        it('should delete in Multy Adapters Transaction with several adapters', async () => {
            const data: TestData = {
                id: 1,
                name: 'Test User',
                age: 25,
                userId: -1,
                timestamp: Date.now(),
            }
            const user: Partial<TestUser> = {
                username: 'Test User',
                password: 'password123',
                isActive: true,
                role: 'admin',
                timestamp: Date.now(),
            }
            // Create collection of adapters for transaction
            const adapters = ['testData', 'testUser']

            // Execute transaction
            await db.withMultyAdaptersTransaction(
                async (adapterMap, database) => {
                    const userOptions =
                        adapterMap.get('testUser')?.adapterOptions

                    await database.insert<TestUser>(user, 'testUser', userOptions)
                    const userResult = await database.select<TestUser>(
                        '',
                        'testUser',
                        {
                            ...userOptions,
                            inTransaction: true,
                        },
                    )
                    expect(db.selectResultArray(userResult)).toHaveLength(1)
                    expect(db.selectResultArray(userResult)[0].username).toBe(
                        'Test User',
                    )

                    const options = adapterMap.get('testData')?.adapterOptions
                    await database.insert<TestData>(data, 'testData', options)
                    await database.update<TestData>(
                        [{ name: 'Updated Test User', userId: userResult[0].id }],
                        'testData',
                        { id: 1 },
                        options,
                    )
                    const result = await db.select<TestData>(
                        '',
                        'testData',
                        options,
                    )
                    expect(db.selectResultArray(result)).toHaveLength(1)
                    expect(db.selectResultArray(result)[0].name).toBe(
                        'Updated Test User',
                    )
                    logTest(true, db.selectResultArray(result))
                    await database.delete<TestData>({ id: 1 }, 'testData', options)                    
                },
                adapters,
                { rollback: true },
            )
            const result = await db.select<TestData>('testData')
            expect(db.selectResultArray(result)).toHaveLength(0)            
        })
    })

    describe('Edge cases and errors', () => {
        it('should correctly handle deletion of a non-existent record', async () => {
            const data: TestData = {
                id: 1,
                name: 'Test User',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            const data2: TestData = {
                id: 2,
                name: 'Test User 2',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(data, 'testData')
            await db.insert<TestData>(data2, 'testData')
            let result = await db.read<TestData>('testData')
            expect(result).toHaveLength(2)

            // Delete non-existent record
            const deleted = await db.delete<TestData>({ id: 100 }, 'testData')
            expect(deleted).toHaveLength(0)

            // Check that the existing record remains
            result = await db.read<TestData>('testData')
            expect(result).toHaveLength(2)
            expect(result[0].id).toBe(1)
            expect(result[1].id).toBe(2)
        })

        it('should correctly handle deletion of an empty array', async () => {
            const data: TestData = {
                id: 1,
                name: 'Test User',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(data, 'testData')
            let result = await db.read<TestData>('testData')
            expect(result).toHaveLength(1)

            // Delete empty array
            await db.delete<TestData>([], 'testData')

            // Check that the record remains
            result = await db.read<TestData>('testData')
            expect(result).toHaveLength(1)
        })

        it('should throw an error when deleting from a non-existent collection', async () => {
            await expect(
                db.delete<TestData>({ id: 1 }, 'nonExistentCollection_1'),
            ).rejects.toThrow()
        })

        it('should correctly handle deletion of records with different ID types', async () => {
            const dataWithStringId: TestData = {
                id: 'user-1',
                name: 'Test String Id User',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(dataWithStringId, 'testData')
            let result = await db.read<TestData>('testData')
            expect(result).toHaveLength(1)

            const dataWithNumberId: TestData = {
                id: 2,
                name: 'Test Number Id User',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(dataWithNumberId, 'testData')
            result = await db.read<TestData>('testData')
            expect(result).toHaveLength(2)

            await db.delete<TestData>(`id == 'user-1'`, 'testData')
            result = await db.read<TestData>('testData')
            expect(result).toHaveLength(1)

            await db.delete<TestData>({ id: 2 }, 'testData')
            result = await db.read<TestData>('testData')
            expect(result).toHaveLength(0)
        }, 1_000_000)
    })

    describe('Performance and scalability', () => {
        it('should efficiently delete a large number of records', async () => {
            const recordCount = 2000
            const expectedTime = 2000
            const largeDataArray: TestData[] = []
            for (let i = 1; i <= recordCount; i++) {
                largeDataArray.push({
                    id: i,
                    name: `User ${i}`,
                    age: 20 + (i % 50),
                    userId: 1,
                    timestamp: Date.now(),
                })
            }

            await db.insert<TestData>(largeDataArray, 'testData')
            let result = await db.read<TestData>('testData')
            expect(result).toHaveLength(recordCount)

            const startTime = Date.now()
            const itemsToDelete = largeDataArray.filter(
                (item) => (item.id as number) % 2 === 0,
            )

            await db.delete<TestData>(itemsToDelete, 'testData')
            const endTime = Date.now()
            logTest(true, endTime - startTime)
            result = await db.read<TestData>('testData')
            expect(result).toHaveLength(recordCount / 2)

            // Проверяем, что удаление выполнилось за разумное время (менее 5 секунд)
            expect(endTime - startTime).toBeLessThan(expectedTime)
        }, 1_000_000)

        it('должен корректно работать с кэшем при удалении множества записей', async () => {
            const dataArray: TestData[] = []
            for (let i = 1; i <= 50; i++) {
                dataArray.push({
                    id: i,
                    name: `User ${i}`,
                    age: 20 + (i % 50),
                    userId: 1,
                    timestamp: Date.now(),
                })
            }

            await db.write<TestData>(dataArray, 'testData')

            // Читаем все записи, чтобы они попали в кэш
            await db.read<TestData>('testData')
            const cacheSizeBefore = db.actualCacheSize

            await db.delete<TestData>(dataArray, 'testData')

            // Проверяем, что кэш очищен
            expect(db.actualCacheSize).toBeLessThan(cacheSizeBefore)
        })
    })

    describe('Integration tests', () => {
        it('should correctly work with multiple collections at the same time', async () => {
            const user: TestUser = {
                id: 1,
                username: 'testuser',
                password: 'password123',
                isActive: true,
                role: 'user',
                timestamp: Date.now(),
            }

            const data: TestData = {
                id: 1,
                name: 'Test Data',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestUser>(user, 'testUser')
            await db.insert<TestData>(data, 'testData')

            let users = await db.read<TestUser>('testUser')
            let dataRecords = await db.read<TestData>('testData')
            expect(users).toHaveLength(1)
            expect(dataRecords).toHaveLength(1)

            // Удаляем из обеих коллекций
            await db.delete<TestUser>({ id: 1 }, 'testUser')
            await db.delete<TestData>({ id: 1 }, 'testData')

            users = await db.read<TestUser>('testUser')
            dataRecords = await db.read<TestData>('testData')
            expect(users).toHaveLength(0)
            expect(dataRecords).toHaveLength(0)
        })

        it('should correctly work with insert -> delete -> insert operations', async () => {
            const data: TestData = {
                id: 1,
                name: 'Test User',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            // Insert
            await db.insert<TestData>(data, 'testData')
            let result = await db.read<TestData>('testData')
            expect(result).toHaveLength(1)

            // Delete
            await db.delete<TestData>({ id: 1 }, 'testData')
            result = await db.read<TestData>('testData')
            expect(result).toHaveLength(0)

            // Insert again
            await db.insert<TestData>({ ...data, id: 1 }, 'testData')
            result = await db.read<TestData>('testData')
            expect(result).toHaveLength(1)
            expect(result[0].id).toBe(1)
        })
    })
})
