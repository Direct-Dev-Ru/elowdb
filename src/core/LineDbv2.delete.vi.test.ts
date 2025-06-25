import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { LineDb, LineDbAdapter, LineDbInitOptions } from './LineDbv2.js'
import { JSONLFile } from '../adapters/node/JSONLFile.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { logTest } from '../common/utils/log.js'
import { JSONLFileOptions } from '../common/interfaces/jsonl-file.js'

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

    describe('Базовые операции удаления', () => {
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

    describe('Удаление с кэшированием', () => {
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

    describe('Удаление в партиционированных коллекциях', () => {
        it.only('should delete record from correct partition', async () => {
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
            db.clearCache()
            let allOrders = await db.read<TestOrder>('orders')
            expect(allOrders).toHaveLength(2)
            expect(db.actualCacheSize).toBe(0)
            const selectOrdersResult = await db.readByFilter<TestOrder>('','orders')
            expect(db.selectResultArray(selectOrdersResult)).toHaveLength(2)
            logTest(true, db.cacheMap)
            expect(db.actualCacheSize).toBe(2)
            return

            // Удаляем заказ пользователя 1
            await db.delete<TestOrder>({ userId: 1 }, 'orders')

            allOrders = await db.read<TestOrder>('orders')
            expect(allOrders).toHaveLength(1)
            expect(allOrders[0].userId).toBe(2)
        })

        it('должен удалить записи из всех партиций при использовании общего фильтра', async () => {
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

            await db.write<TestOrder>(orders, 'orders')

            let allOrders = await db.read<TestOrder>('orders')
            expect(allOrders).toHaveLength(3)

            // Удаляем все заказы со статусом 'pending'
            await db.delete<TestOrder>({ status: 'pending' }, 'orders')

            allOrders = await db.read<TestOrder>('orders')
            expect(allOrders).toHaveLength(1)
            expect(allOrders[0].status).toBe('completed')
        })

        it('должен удалить записи из конкретной партиции', async () => {
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

            await db.write<TestOrder>(orders, 'orders')

            let allOrders = await db.read<TestOrder>('orders')
            expect(allOrders).toHaveLength(2)

            // Удаляем из конкретной партиции
            await db.delete<TestOrder>({ id: 1 }, 'orders_1')

            allOrders = await db.read<TestOrder>('orders')
            expect(allOrders).toHaveLength(1)
            expect(allOrders[0].userId).toBe(2)
        })
    })

    describe('Удаление в транзакциях', () => {
        it('должен выполнить удаление в транзакции', async () => {
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

            await db.delete<TestData>({ id: 1 }, 'testData', {
                inTransaction: true,
            })
            result = await db.read<TestData>('testData')
            expect(result).toHaveLength(0)
        })

        it('должен выполнить удаление в адаптерной транзакции', async () => {
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

            await db.withAdapterTransaction<TestData>(async (adapter, db) => {
                await db.delete<TestData>({ id: 1 }, 'testData', {
                    inTransaction: true,
                })
            }, 'testData')

            result = await db.read<TestData>('testData')
            expect(result).toHaveLength(0)
        })
    })

    describe('Граничные случаи и ошибки', () => {
        it('должен корректно обработать удаление несуществующей записи', async () => {
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

            // Удаляем несуществующую запись
            await db.delete<TestData>({ id: 999 }, 'testData')

            // Проверяем, что существующая запись осталась
            result = await db.read<TestData>('testData')
            expect(result).toHaveLength(1)
            expect(result[0].id).toBe(1)
        })

        it('должен корректно обработать пустой массив для удаления', async () => {
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

            // Удаляем пустой массив
            await db.delete<TestData>([], 'testData')

            // Проверяем, что запись осталась
            result = await db.read<TestData>('testData')
            expect(result).toHaveLength(1)
        })

        it('должен выбросить ошибку при удалении из несуществующей коллекции', async () => {
            await expect(
                db.delete<TestData>({ id: 1 }, 'nonExistentCollection'),
            ).rejects.toThrow('Collection nonExistentCollection not found')
        })

        it('должен корректно обработать удаление записей с разными типами ID', async () => {
            const dataWithStringId: TestData = {
                id: 'user-1',
                name: 'Test User',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(dataWithStringId, 'testData')
            let result = await db.read<TestData>('testData')
            expect(result).toHaveLength(1)

            await db.delete<TestData>({ id: 'user-1' }, 'testData')
            result = await db.read<TestData>('testData')
            expect(result).toHaveLength(0)
        })
    })

    describe('Производительность и масштабируемость', () => {
        it('должен эффективно удалять большое количество записей', async () => {
            const largeDataArray: TestData[] = []
            for (let i = 1; i <= 100; i++) {
                largeDataArray.push({
                    id: i,
                    name: `User ${i}`,
                    age: 20 + (i % 50),
                    userId: 1,
                    timestamp: Date.now(),
                })
            }

            await db.write<TestData>(largeDataArray, 'testData')
            let result = await db.read<TestData>('testData')
            expect(result).toHaveLength(100)

            const startTime = Date.now()
            await db.delete<TestData>(largeDataArray, 'testData')
            const endTime = Date.now()

            result = await db.read<TestData>('testData')
            expect(result).toHaveLength(0)

            // Проверяем, что удаление выполнилось за разумное время (менее 5 секунд)
            expect(endTime - startTime).toBeLessThan(5000)
        })

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

    describe('Интеграционные тесты', () => {
        it('должен корректно работать с несколькими коллекциями одновременно', async () => {
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

        it('должен корректно работать с операциями insert -> delete -> insert', async () => {
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
            await db.insert<TestData>(data, 'testData')
            result = await db.read<TestData>('testData')
            expect(result).toHaveLength(1)
            expect(result[0].id).toBe(1)
        })
    })
})
