import { TestData } from '../../common/interfaces/test-data.js'
import { describe, it, expect, beforeEach, afterEach, vi, Test } from 'vitest'
import { LineDb, LineDbAdapter } from './LineDbv2.js'
import { JSONLFile, TransactionOptions } from '../adapters/node/JSONLFile.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chain } from 'lodash'
import { log } from 'node:console'
import e from 'express'

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

function logTest(log: boolean = true, ...args: unknown[]): void {
    if (process.env.NODE_ENV === 'test' && log) {
        console.log(...args)
    }
}

describe('LineDb', () => {
    const testFileData = path.join(process.cwd(), 'test-data/testDatav2.jsonl')
    const testFileUser = path.join(process.cwd(), 'test-data/testUserv2.jsonl')
    let db: LineDb
    let adapterData: JSONLFile<TestData>
    let adapterUser: JSONLFile<TestUser>

    beforeEach(async () => {
        try {
            await fs.unlink(testFileData)
            await fs.unlink(testFileUser)
        } catch (error) {
            // Игнорируем ошибку, если файл не существует
        }
        adapterData = new JSONLFile<TestData>(testFileData, '', {
            collectionName: 'testData',
        })
        adapterUser = new JSONLFile<TestUser>(testFileUser, '', {
            collectionName: 'testUser',
        })
        db = new LineDb([
            adapterData as JSONLFile<TestData>,
            adapterUser as JSONLFile<TestUser>,
        ])

        await db.init(true)
    })

    afterEach(async () => {
        try {
            // await fs.unlink(testFileData)
            // await fs.unlink(testFileUser)
        } catch (error) {
            // Игнорируем ошибку, если файл не существует
        }
    })

    describe.skip('Инициализация', () => {
        it('должен успешно инициализироваться с несколькими коллекциями', async () => {
            expect(db).toBeDefined()
            await expect(db.init()).resolves.not.toThrow()
        })

        it('должен создавать файлы при инициализации', async () => {
            await db.init()
            const existsData = await fs
                .access(testFileData)
                .then(() => true)
                .catch(() => false)
            const existsUser = await fs
                .access(testFileUser)
                .then(() => true)
                .catch(() => false)
            expect(existsData).toBe(true)
            expect(existsUser).toBe(true)
        })
    })

    describe('Операции с данными', () => {
        it.skip('должен добавлять новую запись в коллекцию testData', async () => {
            const logThisTest = true

            const data: TestData = {
                id: -1,
                name: 'Test',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }
            await db.write<TestData>(data, 'testData')
            const result = await db.read<TestData>('testData')
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual(data)
            const data2: TestData = {
                id: -1,
                name: 'Test 2',
                age: 40,
                userId: 1,
                timestamp: Date.now(),
            }
            await db.insert<TestData>(data2, 'testData')
            const result2 = await db.read<TestData>('testData')
            logTest(logThisTest, result2, [data, data2])
            expect(result2).toEqual([data, data2])
        })

        it.skip('должен должен выдавать ошибку когда производится попытка insert с существующим id в коллекцию testUser', async () => {
            const user: TestUser = {
                id: 1,
                username: 'testuser',
                password: 'password123',
                isActive: true,
                role: 'user',
                timestamp: Date.now(),
            }
            await db.insert<TestUser>(user, 'testUser')
            const result = await db.read<TestUser>('testUser')
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual(user)
            await expect(
                db.insert<TestUser>(user, 'testUser'),
            ).rejects.toThrow()
        })

        it.skip('должен обновлять существующую запись в коллекции', async () => {
            const logThisTest = true
            const data: TestData = {
                id: '3333',
                name: 'Test',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }
            await db.write<TestData>(data, 'testData')

            const updatedData = { id: '3333', age: 45 }
            await db.update<TestData>(updatedData, 'testData')
            // await db.write<TestData>(updatedData as TestData, 'testData')

            const result = await db.read<TestData>('testData')
            logTest(logThisTest, result, updatedData)
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual({ ...data, ...updatedData })
        })

        it.skip('должен удалять запись из коллекции', async () => {
            const data: TestData[] = [
                {
                    id: 1,
                    name: 'Test-1',
                    age: 25,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    name: 'Test-2',
                    age: 25,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    id: 3,
                    name: 'Test-3',
                    age: 25,
                    userId: 1,
                    timestamp: Date.now(),
                },
            ]
            await db.write<TestData>(data, 'testData')

            const dataUser: TestUser[] = [
                {
                    id: 1,
                    username: 'Test-1',
                    password: 'password123',
                    isActive: true,
                    role: 'user',
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    username: 'Test-2',
                    password: 'password123',
                    isActive: true,
                    role: 'user',
                    timestamp: Date.now(),
                },
                {
                    id: 3,
                    username: 'Test-3',
                    password: 'password123',
                    isActive: true,
                    role: 'user',
                    timestamp: Date.now(),
                },
            ]
            await db.write<TestUser>(dataUser, 'testUser')

            await db.delete<TestData>({ id: 2 }, 'testData')
            const result = await db.read<TestData>('testData')
            expect(result).toHaveLength(2)
            expect(result[0]).toEqual(data[0])
            expect(result[1]).toEqual(data[2])

            await db.delete<TestUser>({ id: 1 }, 'testUser')
            const resultUser = await db.read<TestUser>('testUser')
            expect(resultUser).toHaveLength(2)
            expect(resultUser[0]).toEqual(dataUser[1])
            expect(resultUser[1]).toEqual(dataUser[2])

            await db.delete<TestUser>({ id: 2 }, 'testUser')
            const resultUser2 = await db.read<TestUser>('testUser')
            expect(resultUser2).toHaveLength(1)
            expect(resultUser2[0]).toEqual(dataUser[2])

            await db.delete<TestUser>({ id: 3 }, 'testUser')
            const resultUser3 = await db.read<TestUser>('testUser')
            expect(resultUser3).toHaveLength(0)
        })

        it.skip('должен читать запись по частичному совпадению из коллекции', async () => {
            const data: TestData = {
                id: 1,
                name: 'Test',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }
            const data2: TestData = {
                id: 2,
                name: 'Test',
                age: 30,
                userId: 1,
                timestamp: Date.now(),
            }
            await db.write<TestData>([data, data2], 'testData')
            const result = await db.readByFilter<TestData>({ id: 1 }, 'testData')
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual(data)
            const result2 = await db.readByFilter<TestData>(
                { age: 25 },
                'testData',
            )
            expect(result2).toHaveLength(1)
            expect(result2[0]).toEqual(data)
        })

        it.skip('должен читать записи с частичным совпадением из коллекции', async () => {
            const data1: TestData = {
                id: 1,
                name: 'Test User',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }
            const data2: TestData = {
                id: 2,
                name: 'Another User',
                age: 30,
                userId: 1,
                timestamp: Date.now(),
            }
            await db.write<TestData>([data1, data2], 'testData')

            const result = await db.readByFilter<TestData>(
                { name: 'Test' },
                'testData',
                { strictCompare: false },
            )
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual(data1)
        })
    })

    describe.skip('Check cache', () => {
        it('должен использовать кэш при чтении', async () => {
            const data: TestData = {
                id: 1,
                name: 'Test',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }
            // при записи также записывается в кэш
            await db.write<TestData>(data, 'testData')

            // Первое чтение - кэш пустой
            const result1 = await db.readByFilter<TestData>({ id: 1 }, 'testData')
            expect(result1).toHaveLength(1)
            expect(result1[0]).toEqual(data)
            expect(db.actualCacheSize).toBe(1)

            // Второе чтение - должно быть из кэша
            const result2 = await db.readByFilter<TestData>({ id: 1 }, 'testData')
            expect(result2).toHaveLength(1)
            expect(result2[0]).toEqual(data)
            expect(db.actualCacheSize).toBe(1)
        })

        it('должен вытеснять старые записи при переполнении кэша', async () => {
            try {
                await fs.unlink(testFileData)
                await fs.unlink(testFileUser)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }
            adapterData = new JSONLFile<TestData>(testFileData, '', {
                collectionName: 'testData',
            })
            adapterUser = new JSONLFile<TestUser>(testFileUser, '', {
                collectionName: 'testUser',
            })
            const cacheSizeLocal = 10 // размер кэша по умолчанию
            db = new LineDb(
                [
                    adapterData as JSONLFile<TestData>,
                    adapterUser as JSONLFile<TestUser>,
                ],
                {
                    cacheSize: cacheSizeLocal,
                },
            )

            await db.init(true)
            // Создаем больше записей, чем размер кэша
            const testData: TestData[] = []

            for (let i = 1; i < cacheSizeLocal + 2; i++) {
                testData.push({
                    id: i,
                    name: `Test - ${i}`,
                    age: 20 + i,
                    userId: 1,
                    timestamp: Date.now(),
                })
            }

            // Записываем все данные
            await db.write<TestData>(testData, 'testData')
            logTest(true, '--------write complete--------')
            // Читаем последние записи - они должны быть в кэше
            const result1 = await db.readByFilter<TestData>(
                { id: 11 },
                'testData',
            )
            expect(result1).toHaveLength(1)

            // Читаем первые записи - они должны вытеснить старые из кэша
            const result2 = await db.readByFilter<TestData>({ id: 1 }, 'testData')
            expect(result2).toHaveLength(1)

            // Проверяем, что вытесненная запись все еще доступна (но не из кэша)
            const result3 = await db.readByFilter<TestData>({ id: 2 }, 'testData')
            expect(result3).toHaveLength(1)
            // logTest(true, 'cache size', db.cacheMap)
        })

        it('должен корректно работать с разными коллекциями', async () => {
            const data: TestData = {
                id: 1,
                name: 'Test Data',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            const user: TestUser = {
                id: 1,
                username: 'testuser',
                password: 'password123',
                isActive: true,
                role: 'user',
                timestamp: Date.now(),
            }

            // Записываем данные в разные коллекции
            await db.write<TestData>(data, 'testData')

            // Читаем из первой коллекции
            const result1 = await db.readByFilter<TestData>({ id: 1 }, 'testData')
            expect(result1).toHaveLength(1)

            expect(db.actualCacheSize).toBe(1)
            expect(result1[0]).toEqual(data)

            // пишем во вторую коллекцию
            await db.write<TestUser>(user, 'testUser')

            // Читаем из второй коллекции
            const result2 = await db.readByFilter<TestUser>({ id: 1 }, 'testUser')

            expect(result2).toHaveLength(1)
            expect(db.actualCacheSize).toBe(2)
            expect(result2[0]).toEqual(user)

            // Повторное чтение должно быть из кэша
            const result3 = await db.readByFilter<TestData>({ id: 1 }, 'testData')
            expect(result3).toHaveLength(1)
            expect(db.actualCacheSize).toBe(2)
            // logTest(true, 'cache map', db.cacheMap)
            expect(result3[0]).toEqual(data)
        })
    })

    describe.skip('select method', () => {
        it('should return lodash chain for query results', async () => {
            const data: TestData[] = [
                {
                    id: 1,
                    name: 'Test-1',
                    age: 25,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    name: 'Test-2',
                    age: 35,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    id: 3,
                    name: 'Test-3',
                    age: 45,
                    userId: 1,
                    timestamp: Date.now(),
                },
            ]
            await db.write<TestData>(data, 'testData')

            const result = await db.select<TestData>({ name: 'Test-1' })
            expect(result).toBeDefined()
            expect(result.value()).toEqual([data[0]])
        })

        it('should allow chaining operations', async () => {
            const data: TestData[] = [
                {
                    id: 1,
                    name: 'Test-1',
                    age: 25,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    name: 'Test-2',
                    age: 35,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    id: 3,
                    name: 'Test-3',
                    age: 45,
                    userId: 1,
                    timestamp: Date.now(),
                },
            ]
            await db.write<TestData>(data, 'testData')

            const resultLodashChain = await await db.select<TestData>({
                name: 'Test',
            })

            // const result = resultLodashChain
            //     .filter((item) => item.age > 25)
            //     .map((item) => ({ ...item, age: item.age * 2 }))
            //     .value()

            const result = resultLodashChain
                .filter((item: TestData) => item.age > 25) // Step 1: Filter
                .thru((filteredItems: TestData[]) => {
                    // Step 2 & 3: Calculate average and map
                    if (filteredItems.length === 0) {
                        return [] // No items, so no average, return empty
                    }
                    // Calculate average age of the filtered items
                    const sumOfAges = filteredItems.reduce(
                        (sum, item) => sum + item.age,
                        0,
                    )
                    const averageAge = sumOfAges / filteredItems.length

                    // Map the filtered items to new objects with the average age
                    return filteredItems.map((item) => ({
                        // ...item, // Spread original item if you want to keep all properties
                        id: item.id, // Or explicitly pick properties
                        name: item.name,
                        age: item.age,
                        averageAge: averageAge, // Set the calculated average age
                        // timestamp is not in the expected output, so we omit it here.
                    }))
                })
                .value() // Execute the chain and get the final array

            expect(result).toEqual([
                { id: 2, name: 'Test-2', age: 35, averageAge: 40 },
                { id: 3, name: 'Test-3', age: 45, averageAge: 40 },
            ])
            logTest(true, 'result', result)
        })

        it('should work with strict comparison', async () => {
            const testData = [
                { id: 1, name: 'Test 1', value: 100 },
                { id: 2, name: 'Test 2', value: 200 },
                { id: 3, name: 'Test 3', value: 300 },
            ]

            await db.write(testData)

            const result = (
                await db.select<TestData>({ name: 'Test 1' }, undefined, {
                    strictCompare: true,
                })
            ).value()

            expect(result).toEqual([{ id: 1, name: 'Test 1', value: 100 }])
        })

        it('should work with multiple collections', async () => {
            const testData1 = [
                { id: 1, name: 'Test 1', age: 15, value: 100 },
                { id: 2, name: 'Test 2', age: 20, value: 200 },
            ]

            const testData2: TestUser[] = [
                {
                    id: 1,
                    username: 'Test-1',
                    password: 'password123',
                    isActive: true,
                    role: 'user',
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    username: 'Test-2',
                    password: 'password123',
                    isActive: true,
                    role: 'user',
                    timestamp: Date.now(),
                },
                {
                    id: 3,
                    username: 'Test-3',
                    password: 'password123',
                    isActive: true,
                    role: 'user',
                    timestamp: Date.now(),
                },
            ]

            await db.write(testData1, 'testData')
            await db.write(testData2, 'testUser')

            const result1 = (
                await db.select<TestData>({ name: 'Test' }, 'testData')
            ).value()
            const result2 = (
                await db.select<TestUser>({ username: 'Test' }, 'testUser')
            ).value()

            expect(result1).toEqual(testData1)
            expect(result2).toEqual(testData2)
        })
    })

    describe.skip('withTransaction method', () => {
        it('должен выполнять операции в транзакции для конкретной коллекции', async () => {
            const testData: TestData[] = [
                {
                    id: 1,
                    name: 'test',
                    age: 40,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    name: 'test2',
                    age: 40,
                    userId: 1,
                    timestamp: Date.now(),
                },
            ]

            const callback = async (
                adapter: JSONLFile<TestData>,
                db: LineDb,
            ) => {
                await adapter.write(testData)
            }

            try {
                await db.withAdapterTransaction<TestData>(callback, 'testData', {
                    rollback: true,
                })
            } catch (error) {
                expect(error).toBeInstanceOf(Error)
            }
            const dbContent = await db.read<TestData>('testData')
            expect(dbContent).toHaveLength(2)
            expect(dbContent[0]).toEqual(testData[0])
        })
    })

    describe.skip('join method', () => {
        it('should perform inner join between collections', async () => {
            const orders: TestData[] = [
                {
                    id: 1,
                    name: 'Order 1',
                    age: 25,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    name: 'Order 2',
                    age: 30,
                    userId: 2,
                    timestamp: Date.now(),
                },
                {
                    id: 3,
                    name: 'Order 3',
                    age: 35,
                    userId: 1,
                    timestamp: Date.now(),
                },
            ]

            const users: TestUser[] = [
                {
                    id: 1,
                    username: 'User 1',
                    password: 'pass1',
                    isActive: true,
                    role: 'admin',
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    username: 'User 2',
                    password: 'pass2',
                    isActive: true,
                    role: 'user',
                    timestamp: Date.now(),
                },
            ]

            await db.write(orders, 'testData')
            await db.write(users, 'testUser')

            const result = await db.join<TestData, TestUser>(
                'testData',
                'testUser',
                {
                    type: 'inner',
                    leftFields: ['userId'],
                    rightFields: ['id'],
                },
            )

            const joinedData = result.value()
            // logTest(true, 'joinedData', joinedData)
            expect(joinedData).toHaveLength(3)
            expect(joinedData[0].left).toEqual(orders[0])
            expect(joinedData[0].right).toEqual(users[0])
            expect(joinedData[1].left).toEqual(orders[1])
            expect(joinedData[1].right).toEqual(users[1])
            expect(joinedData[2].left).toEqual(orders[2])
            expect(joinedData[2].right).toEqual(users[0])

            const result2 = await db.join<TestData, TestUser>(orders, users, {
                type: 'left',
                leftFields: ['userId'],
                rightFields: ['id'],
            })
            const joinedData2 = result2.value()
            expect(joinedData2).toHaveLength(3)
            expect(joinedData2[0].left).toEqual(orders[0])
            expect(joinedData2[0].right).toEqual(users[0])
            expect(joinedData2[1].left).toEqual(orders[1])
            expect(joinedData2[1].right).toEqual(users[1])
            expect(joinedData2[2].left).toEqual(orders[2])
            expect(joinedData2[2].right).toEqual(users[0])
        })

        it('should perform join with array input', async () => {
            const orders: TestData[] = [
                {
                    id: 1,
                    name: 'Order 1',
                    age: 25,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    name: 'Order 2',
                    age: 30,
                    userId: 2,
                    timestamp: Date.now(),
                },
            ]

            const users: TestUser[] = [
                {
                    id: 1,
                    username: 'User 1',
                    password: 'pass1',
                    isActive: true,
                    role: 'admin',
                    timestamp: Date.now(),
                },
            ]

            const result = await db.join<TestData, TestUser>(orders, users, {
                type: 'inner',
                leftFields: ['userId'],
                rightFields: ['id'],
            })

            const joinedData = result.value()
            expect(joinedData).toHaveLength(1)
            expect(joinedData[0].left).toEqual(orders[0])
            expect(joinedData[0].right).toEqual(users[0])

            const result2 = await db.join<TestData, TestUser>(orders, users, {
                type: 'left',
                leftFields: ['userId'],
                rightFields: ['id'],
            })
            const joinedData2 = result2.value()
            expect(joinedData2).toHaveLength(2)
            expect(joinedData2[0].left).toEqual(orders[0])
            expect(joinedData2[0].right).toEqual(users[0])
            expect(joinedData2[1].left).toEqual(orders[1])
            expect(joinedData2[1].right).toBeNull()
        })

        it('should apply filters during join', async () => {
            const orders: TestData[] = [
                {
                    id: 1,
                    name: 'Order 1',
                    age: 25,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    name: 'Order 2',
                    age: 30,
                    userId: 2,
                    timestamp: Date.now(),
                },
                {
                    id: 3,
                    name: 'Order 3',
                    age: 35,
                    userId: 1,
                    timestamp: Date.now(),
                },
            ]

            const users: TestUser[] = [
                {
                    id: 1,
                    username: 'User 1',
                    password: 'pass1',
                    isActive: true,
                    role: 'admin',
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    username: 'User 2',
                    password: 'pass2',
                    isActive: false,
                    role: 'user',
                    timestamp: Date.now(),
                },
            ]

            await db.write(orders, 'testData')
            await db.write(users, 'testUser')

            const result = await db.join<TestData, TestUser>(
                'testData',
                'testUser',
                {
                    type: 'inner',
                    leftFields: ['userId'],
                    rightFields: ['id'],
                    rightFilter: { isActive: true },
                },
            )

            const joinedData = result.value()
            expect(joinedData).toHaveLength(2)
            expect(joinedData[0].right).toEqual(users[0])
            expect(joinedData[1].right).toEqual(users[0])
        })

        it('should perform left join between collections', async () => {
            const orders: TestData[] = [
                {
                    id: 1,
                    name: 'Order 1',
                    age: 25,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    name: 'Order 2',
                    age: 30,
                    userId: 2,
                    timestamp: Date.now(),
                },
                {
                    id: 3,
                    name: 'Order 3',
                    age: 35,
                    userId: 3,
                    timestamp: Date.now(),
                },
            ]

            const users: TestUser[] = [
                {
                    id: 1,
                    username: 'User 1',
                    password: 'pass1',
                    isActive: true,
                    role: 'admin',
                    timestamp: Date.now(),
                },
            ]

            await db.write(orders, 'testData')
            await db.write(users, 'testUser')

            const result = await db.join<TestData, TestUser>(
                'testData',
                'testUser',
                {
                    type: 'left',
                    leftFields: ['userId'],
                    rightFields: ['id'],
                },
            )

            const joinedData = result.value()
            expect(joinedData).toHaveLength(3)
            expect(joinedData[0].right).toEqual(users[0])
            expect(joinedData[1].right).toBeNull()
            expect(joinedData[2].right).toBeNull()
        })

        it('should perform right join between collections', async () => {
            const orders: TestData[] = [
                {
                    id: 1,
                    name: 'Order 1',
                    age: 25,
                    userId: 1,
                    timestamp: Date.now(),
                },
            ]

            const users: TestUser[] = [
                {
                    id: 1,
                    username: 'User 1',
                    password: 'pass1',
                    isActive: true,
                    role: 'admin',
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    username: 'User 2',
                    password: 'pass2',
                    isActive: true,
                    role: 'user',
                    timestamp: Date.now(),
                },
            ]

            await db.write(orders, 'testData')
            await db.write(users, 'testUser')

            const result = await db.join<TestData, TestUser>(
                'testData',
                'testUser',
                {
                    type: 'right',
                    leftFields: ['userId'],
                    rightFields: ['id'],
                },
            )

            const joinedData = result.value()
            expect(joinedData).toHaveLength(2)
            expect(joinedData[0].left).toEqual(orders[0])
            expect(joinedData[0].right).toEqual(users[0])
            expect(joinedData[1].left).toEqual(null as unknown as TestData)
            expect(joinedData[1].right).toEqual(users[1])
        })

        it('should perform full outer join between collections', async () => {
            const orders: TestData[] = [
                {
                    id: 1,
                    name: 'Order 1',
                    age: 25,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    name: 'Order 2',
                    age: 30,
                    userId: 3,
                    timestamp: Date.now(),
                },
            ]

            const users: TestUser[] = [
                {
                    id: 1,
                    username: 'User 1',
                    password: 'pass1',
                    isActive: true,
                    role: 'admin',
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    username: 'User 2',
                    password: 'pass2',
                    isActive: true,
                    role: 'user',
                    timestamp: Date.now(),
                },
            ]

            await db.write(orders, 'testData')
            await db.write(users, 'testUser')

            const result = await db.join<TestData, TestUser>(
                'testData',
                'testUser',
                {
                    type: 'full',
                    leftFields: ['userId'],
                    rightFields: ['id'],
                },
            )

            const joinedData = result.value()
            logTest(true, 'joinedData', joinedData)
            expect(joinedData).toHaveLength(3)
            expect(joinedData[0].left).toEqual(orders[0])
            expect(joinedData[0].right).toEqual(users[0])
            expect(joinedData[1].left).toEqual(orders[1])
            expect(joinedData[1].right).toBeNull()
            expect(joinedData[2].left).toEqual(null as unknown as TestData)
            expect(joinedData[2].right).toEqual(users[1])
        })

        it('should support multiple join fields', async () => {
            const orders: TestData[] = [
                {
                    id: 1,
                    name: 'Order 1',
                    age: 25,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    name: 'Order 2',
                    age: 30,
                    userId: 1,
                    timestamp: Date.now(),
                },
            ]

            const users: TestUser[] = [
                {
                    id: 1,
                    username: 'Order 1',
                    password: 'pass1',
                    isActive: true,
                    role: 'admin',
                    timestamp: Date.now(),
                },
            ]

            await db.write(orders, 'testData')
            await db.write(users, 'testUser')

            const result = await db.join<TestData, TestUser>(
                'testData',
                'testUser',
                {
                    type: 'inner',
                    leftFields: ['userId', 'name'],
                    rightFields: ['id', 'username'],
                },
            )

            const joinedData = result.value()
            expect(joinedData).toHaveLength(1)
            expect(joinedData[0].left).toEqual(orders[0])
            expect(joinedData[0].right).toEqual(users[0])
        })
    })

    describe.skip('withTransaction', () => {
        it('должен выполнять операции в транзакции для конкретной коллекции', async () => {
            const testData: TestData[] = [
                {
                    id: 1,
                    name: 'test1',
                    age: 20,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    name: 'test2',
                    age: 40,
                    userId: 1,
                    timestamp: Date.now(),
                },
            ]
            await db.write(testData[0], 'testData')
            const callback = async (
                adapter: JSONLFile<TestData>,
                db: LineDb,
            ) => {
                await adapter.write({ ...testData[0], name: 'test11' })
                throw new Error('test error')
                await adapter.write(testData[1])
            }

            try {
                await db.withAdapterTransaction<TestData>(
                    callback,
                    'testData',
                    {
                        rollback: true,
                    },
                )
            } catch (error) {
                expect(error).toBeInstanceOf(Error)
            }
            const dbContent = await db.read<TestData>('testData')
            expect(dbContent).toHaveLength(1)
            expect(dbContent[0]).toEqual(testData[0])
        })
    })
})

describe('Backup and Restore', () => {
    it('should create backup and restore data correctly', async () => {
        try {
            await fs.unlink('test-data/collection-1.jsonl')
        } catch (error) {
            // console.log('Error deleting file:', error)
        }
        try {
            await fs.unlink('test-data/collection-2.jsonl')
        } catch (error) {
            // console.log('Error deleting file:', error)
        }
        try {
            await fs.unlink('test-data/test-backup.txt')
        } catch (error) {
            // console.log('Error deleting file:', error)
        }
        let adapter1 = new JSONLFile<TestData>(
            'test-data/collection-1.jsonl',
            '',
            {
                collectionName: 'collection-1',
            },
        )
        let adapter2 = new JSONLFile<TestData>(
            'test-data/collection-2.jsonl',
            '',
            {
                collectionName: 'collection-2',
            },
        )
        let db = new LineDb([adapter1, adapter2], {
            objName: 'test-data',
        })
        await db.init()

        // Записываем тестовые данные
        const data1: TestData[] = [
            { id: 1, name: 'test1-1', timestamp: Date.now(), age: 10, userId: 1 },
            { id: 2, name: 'test1-2', timestamp: Date.now(), age: 10, userId: 1 },
        ]
        const data2: TestData[] = [
            { id: 1, name: 'test2-1', timestamp: Date.now(), age: 10, userId: 1 },
            { id: 2, name: 'test2-2', timestamp: Date.now(), age: 10, userId: 1 },
        ]

        await db.write<TestData>(data1, 'collection-1')
        await db.write<TestData>(data2, 'collection-2')

        // Создаем бэкап
        const backupFile = 'test-data/test-backup.txt'
        await db.createBackup(backupFile)

        // Очищаем данные
        await db.delete<TestData>({ id: 1 }, 'collection-1')
        await db.delete<TestData>({ id: 2 }, 'collection-1')
        await db.delete<TestData>({ id: 1 }, 'collection-2')
        await db.delete<TestData>({ id: 2 }, 'collection-2')

        // Проверяем, что данные удалены
        expect(await db.read<TestData>('collection-1')).toHaveLength(0)
        expect(await db.read<TestData>('collection-2')).toHaveLength(0)

        // Восстанавливаем из бэкапа
        await db.restoreFromBackup(backupFile)

        // adapter1 = new JSONLFile<TestData>('test-data/collection-1.jsonl', '', {
        //     collectionName: 'collection-1',
        // })
        // adapter2 = new JSONLFile<TestData>('test-data/collection-2.jsonl', '', {
        //     collectionName: 'collection-2',
        // })
        // db = new LineDb([adapter1, adapter2], {
        //     objName: 'test-data',
        // })
        // await db.init(true)

        // Проверяем восстановленные данные
        const restored1 = await db.read<TestData>('collection-1')
        const restored2 = await db.read<TestData>('collection-2')

        logTest(true, 'restored1', restored1)
        logTest(true, 'restored2', restored2)

        expect(restored1).toHaveLength(2)
        // expect(restored2).toHaveLength(2)
        // expect(restored1).toEqual(expect.arrayContaining(data1))
        // expect(restored2).toEqual(expect.arrayContaining(data2))
    })

    it.skip('should handle empty collections in backup', async () => {
        const db = new LineDb([
            new JSONLFile<TestData>('test1', 'test1.jsonl'),
            new JSONLFile<TestData>('test2', 'test2.jsonl'),
        ])
        await db.init()

        // Записываем данные только в одну коллекцию
        const data = [{ id: 1, name: 'test1-1' }]
        await db.write(data, 'test1')

        // Создаем бэкап
        const backupFile = 'test-backup.txt'
        await db.createBackup(backupFile)

        // Очищаем данные
        await db.delete({}, 'test1')

        // Восстанавливаем из бэкапа
        await db.restoreFromBackup(backupFile)

        // Проверяем восстановленные данные
        const restored1 = await db.read('test1')
        const restored2 = await db.read('test2')

        expect(restored1).toHaveLength(1)
        expect(restored2).toHaveLength(0)
        expect(restored1).toEqual(expect.arrayContaining(data))

        // Очищаем тестовые файлы
        await fs.unlink(backupFile)
        await fs.unlink('test1.jsonl')
        await fs.unlink('test2.jsonl')
    })

    it.skip('should handle deleted records in backup', async () => {
        const db = new LineDb([new JSONLFile<TestData>('test1', 'test1.jsonl')])
        await db.init()

        // Записываем тестовые данные
        const data = [
            { id: 1, name: 'test1-1' },
            { id: 2, name: 'test1-2' },
            { id: 3, name: 'test1-3' },
        ]
        await db.write(data, 'test1')

        // Удаляем одну запись
        await db.delete({ id: 2 }, 'test1')

        // Создаем бэкап
        const backupFile = 'test-backup.txt'
        await db.createBackup(backupFile)

        // Очищаем данные
        await db.delete({}, 'test1')

        // Восстанавливаем из бэкапа
        await db.restoreFromBackup(backupFile)

        // Проверяем восстановленные данные
        const restored = await db.read('test1')
        expect(restored).toHaveLength(2)
        expect(restored).toEqual(
            expect.arrayContaining([
                { id: 1, name: 'test1-1' },
                { id: 3, name: 'test1-3' },
            ]),
        )

        // Очищаем тестовые файлы
        await fs.unlink(backupFile)
        await fs.unlink('test1.jsonl')
    })
})
