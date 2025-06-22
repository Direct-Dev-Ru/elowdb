import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { LineDb, LineDbAdapter, LineDbInitOptions } from './LineDbv2.js'
import { JSONLFile, TransactionOptions } from '../adapters/node/JSONLFile.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { logTest } from '../common/utils/log.js'
import { JSONLFileOptions } from '../common/interfaces/jsonl-file.js'
import fsClassic, { PathLike } from 'node:fs'

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

describe('LineDb', () => {
    const testFileData = path.join(process.cwd(), 'test-linedb/testData.jsonl')
    const testFileUser = path.join(process.cwd(), 'test-linedb/testUser.jsonl')

    let db: LineDb

    beforeEach(async () => {
        try {
            await fs.unlink(testFileData)
            await fs.unlink(testFileUser)
        } catch (error) {
            // Игнорируем ошибку, если файл не существует
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
        const initLineDBOptions: LineDbInitOptions = {
            dbFolder: path.join(process.cwd(), 'test-linedb'),
            collections: [
                adapterTestDataOptions as unknown as JSONLFileOptions<unknown>,
                adapterUserOptions as unknown as JSONLFileOptions<unknown>,
            ],
            partitions: [],
        }
        db = new LineDb(initLineDBOptions)
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

    describe('Инициализация', () => {
        it('должен успешно инициализироваться с несколькими коллекциями', async () => {
            expect(db).toBeDefined()
            await expect(db.init()).resolves.not.toThrow()
        })

        it('should do something', () => {
            logTest(true, 'we do something ...')
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

    describe('Data operations', () => {
        it.only('should add new record to testData collection', async () => {
            const logThisTest = true

            const data: TestData = {
                id: -1,
                name: 'Test',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }
            await db.insert<TestData>(data, 'testData')
            const result = await db.read<TestData>('testData')
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual({...data, id: 1})
            
            // add another new record with not existing id
            const data2: Partial<TestData> = {                
                name: 'Test 2',
                age: 40,
                userId: 1,
                timestamp: Date.now(),
            }
            await db.insert<TestData>(data2, 'testData')
            const result2 = await db.read<TestData>('testData')
            logTest(logThisTest, result2, [data, data2])
            expect(result2).toHaveLength(2)
            expect(result2[0]).toEqual({...data, id: 1})
            expect(result2[1]).toEqual({...data2, id: 2})

            // add another new record with existing id
            const data3: TestData = {
                id: 3,
                name: 'Test 3',
                age: 30,
                userId: 1,
                timestamp: Date.now(),
            }
            await db.insert<TestData>(data3, 'testData')
            const result3 = await db.read<TestData>('testData')
            logTest(logThisTest, result3, [data, data2, data3])
            expect(result3).toHaveLength(3)
            expect(result3[0]).toEqual({...data, id: 1})
            expect(result3[1]).toEqual({...data2, id: 2})
            expect(result3[2]).toEqual({...data3, id: 3})
        })

        it('should throw error when insert with existing id in testUser collection', async () => {
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

        it('should update existing record in collection', async () => {
            const logThisTest = true
            const data: TestData[] = [{
                id: 3333,
                name: 'Test 3333',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            },
            {
                id: 4444,
                name: 'Test 4444',
                age: 35,
                userId: 1,
                timestamp: Date.now(),
            }
            ]
            await db.write<TestData>(data, 'testData')
            // update one record
            const updatedData = { id: 3333, age: 45 }
            const updatedResult = await db.update<TestData>(updatedData, 'testData')
            expect(updatedResult).toHaveLength(1)
            const result = await db.readByFilter<TestData>({ id: 3333 }, 'testData')
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual({ ...data[0], ...updatedData })

            // update several records 
            // const updatedResult2 = await db.update<TestData>([{ id: 3333, name: 'updated 3333' }, { id: 4444, name: 'updated 4444' }], 'testData', { userId: 1 })
            const updatedResult2 = await db.update<TestData>([{ id: 3333, name: 'updated 3333' }, { id: 4444, name: 'updated 4444' }], 'testData')
            logTest(logThisTest, "updatedResult2:", updatedResult2)
            const result2 = await db.readByFilter<TestData>({ userId: 1 }, 'testData')
            logTest(logThisTest, "result2", result2)
            expect(result2).toHaveLength(2)
            expect(result2[0]).toEqual({ ...result[0], ...{ name: 'updated 3333' } })
            expect(result2[1]).toEqual({ ...data[1], ...{ name: 'updated 4444' } })

            // update several records with filter
            const updatedResult3 = await db.update<TestData>({ age: 55 }, 'testData', `age > 30`)
            logTest(logThisTest, "updatedResult3:", updatedResult3)
            const result3 = await db.readByFilter<TestData>(`age == 55`, 'testData')
            logTest(logThisTest, "result3", result3)
            expect(result3).toHaveLength(2)
            expect(result3[0].age).toEqual(55)
            expect(result3[1].age).toEqual(55)

            // update several records with ids in data and filter

            const updatedResult4 = await db.update<TestData>([
                { id: 3333, name: 'Update #3333' },
                { id: 4444, name: 'Update #4444' }, 
                { id: 5555, name: 'Update #5555' }
            ],
                'testData', `id == 3333 || id == 4444`)
            logTest(logThisTest, "updatedResult4:", updatedResult4)
            const result4 = await db.readByFilter<TestData>(`id == 3333 || id == 4444`, 'testData')
            logTest(logThisTest, "result4", result4)
            expect(result4).toHaveLength(2)
            expect(result4[0]).toEqual({ ...result3[0], ...{ name: 'Update #3333' } })
            expect(result4[1]).toEqual({ ...result3[1], ...{ name: 'Update #4444' } })

        })

        it('должен удалять запись из коллекции', async () => {
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

        it('должен читать запись по частичному совпадению из коллекции', async () => {
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
            const result = await db.readByFilter<TestData>(
                { id: 1 },
                'testData',
            )
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual(data)
            const result2 = await db.readByFilter<TestData>(
                { age: 25 },
                'testData',
            )
            expect(result2).toHaveLength(1)
            expect(result2[0]).toEqual(data)
        })

        it('должен читать записи с частичным совпадением из коллекции', async () => {
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

    describe('Check cache', () => {
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
            const result1 = await db.readByFilter<TestData>(
                { id: 1 },
                'testData',
            )
            expect(result1).toHaveLength(1)
            expect(result1[0]).toEqual(data)
            expect(db.actualCacheSize).toBe(1)

            // Второе чтение - должно быть из кэша
            const result2 = await db.readByFilter<TestData>(
                { id: 1 },
                'testData',
            )
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
            const adapterData = new JSONLFile<TestData>(testFileData, '', {
                collectionName: 'testData',
            })
            const adapterUser = new JSONLFile<TestUser>(testFileUser, '', {
                collectionName: 'testUser',
            })
            const cacheSizeLocal = 10 // размер кэша по умолчанию
            db = new LineDb(
                {
                    cacheSize: cacheSizeLocal,
                    cacheTTL: 10_000,
                },
                [
                    adapterData,
                    adapterUser,
                ],
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


            expect(db.cacheMap.size).toBe(cacheSizeLocal)
            let someCacheData = db.cacheMap.get('testData:11')?.data as unknown as TestData
            expect(someCacheData).toBeDefined()
            expect(someCacheData.id).toBe(11)
            expect(someCacheData.name).toBe('Test - 11')
            someCacheData = db.cacheMap.get('testData:1')?.data as unknown as TestData
            expect(someCacheData).not.toBeDefined()
            someCacheData = db.cacheMap.get('testData:2')?.data as unknown as TestData
            expect(someCacheData).toBeDefined()

            // Читаем последние записи - они должны быть в кэше
            const result1 = await db.readByFilter<TestData>(
                { id: 11 },
                'testData',
            )
            expect(result1).toHaveLength(1)
            expect(db.cacheMap.size).toBe(cacheSizeLocal)


            // Читаем первe. записи - они должны вытеснить старые из кэша
            const result2 = await db.readByFilter<TestData>(
                { id: 1 },
                'testData',
            )
            expect(result2).toHaveLength(1)
            someCacheData = db.cacheMap.get('testData:2')?.data as unknown as TestData
            expect(someCacheData).not.toBeDefined()
            someCacheData = db.cacheMap.get('testData:1')?.data as unknown as TestData
            expect(someCacheData).toBeDefined()

            // Проверяем, что вытесненная запись все еще доступна (но не из кэша)
            const result3 = await db.readByFilter<TestData>(
                { id: 2 },
                'testData',
            )
            expect(result3).toHaveLength(1)
            // после чтения запись должна быть в кэше
            someCacheData = db.cacheMap.get('testData:2')?.data as unknown as TestData
            expect(someCacheData).toBeDefined()
            expect(db.cacheMap.size).toBe(cacheSizeLocal)

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
            const result1 = await db.readByFilter<TestData>(
                { id: 1 },
                'testData',
            )
            expect(result1).toHaveLength(1)

            expect(db.actualCacheSize).toBe(1)
            expect(result1[0]).toEqual(data)

            // пишем во вторую коллекцию
            await db.write<TestUser>(user, 'testUser')

            // Читаем из второй коллекции
            const result2 = await db.readByFilter<TestUser>(
                { id: 1 },
                'testUser',
            )

            expect(result2).toHaveLength(1)
            expect(db.actualCacheSize).toBe(2)
            expect(result2[0]).toEqual(user)

            // Повторное чтение должно быть из кэша
            const result3 = await db.readByFilter<TestData>(
                { id: 1 },
                'testData',
            )
            expect(result3).toHaveLength(1)
            expect(db.actualCacheSize).toBe(2)
            // logTest(true, 'cache map', db.cacheMap)
            expect(result3[0]).toEqual(data)
        })
    })

    describe('select method', () => {
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

            const res = await db.select<TestData>({ name: 'Test-1' })
            const result =
                typeof res === 'object' && 'value' in res ? res.value() : res
            expect(result).toBeDefined()
            expect(result).toEqual([data[0]])
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

            const resultLodashChain = await db.select<TestData>({
                name: 'Test',
            })

            // const result = resultLodashChain
            //     .filter((item) => item.age > 25)
            //     .map((item) => ({ ...item, age: item.age * 2 }))
            //     .value()

            const res = db.selectResultChain<TestData>(resultLodashChain)
                ?.filter((item: TestData) => item.age > 25) // Step 1: Filter
                ?.thru((filteredItems: TestData[]) => {
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



            expect(res).toEqual([
                { id: 2, name: 'Test-2', age: 35, averageAge: 40 },
                { id: 3, name: 'Test-3', age: 45, averageAge: 40 },
            ])
            logTest(true, 'result', res)
        })

        it('should work with strict comparison', async () => {
            const testData = [
                { id: 1, name: 'Test 1', value: 100 },
                { id: 2, name: 'Test 2', value: 200 },
                { id: 3, name: 'Test 3', value: 300 },
            ]

            await db.write(testData)

            const res = await db.select<TestData>(
                { name: 'Test 1' },
                undefined,
                {
                    strictCompare: true,
                },
            )
            const result =
                typeof res === 'object' && 'value' in res ? res.value() : res

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

            const res1 = await db.select<TestData>({ name: 'Test' }, 'testData')
            const result1 =
                typeof res1 === 'object' && 'value' in res1
                    ? res1.value()
                    : res1
            const res2 = await db.select<TestUser>(
                { username: 'Test' },
                'testUser',
            )
            const result2 =
                typeof res2 === 'object' && 'value' in res2
                    ? res2.value()
                    : res2
            expect(result1).toEqual(testData1)
            expect(result2).toEqual(testData2)
        })
    })

    describe('withTransaction method', () => {
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
            expect(dbContent).toHaveLength(2)
            expect(dbContent[0]).toEqual(testData[0])
        })
    })

    describe('join method', () => {
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
                    userId: 10,
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

            logTest(true, 'joinedData', joinedData)

            expect(joinedData).toHaveLength(2)

            let joinResult =
                joinedData.find((joinResult) => joinResult.left.id === 1) ||
                undefined
            expect(joinResult?.left).toEqual(
                orders.find((order) => order.id === joinResult?.left.id),
            )
            expect(joinResult?.right).toEqual(
                users.find((user) => user.id === joinResult?.right?.id),
            )

            joinResult =
                joinedData.find((joinResult) => joinResult.left.id === 2) ||
                undefined
            expect(joinResult?.left).toEqual(
                orders.find((order) => order.id === joinResult?.left.id),
            )
            expect(joinResult?.right).toEqual(
                users.find((user) => user.id === joinResult?.right?.id),
            )

            const result2 = await db.join<TestData, TestUser>(orders, users, {
                type: 'left',
                leftFields: ['userId'],
                rightFields: ['id'],
            })
            const joinedData2 = result2.value()
            logTest(true, 'joinedData2', joinedData2)
            expect(joinedData2).toHaveLength(3)

            let joinResult2 =
                joinedData2.find((joinResult) => joinResult.left.id === 1) ||
                undefined
            expect(joinResult2?.left).toEqual(
                orders.find((order) => order.id === joinResult2?.left.id),
            )
            expect(joinResult2?.right).toEqual(
                users.find((user) => user.id === joinResult2?.right?.id),
            )

            joinResult2 =
                joinedData2.find((joinResult) => joinResult.left.id === 2) ||
                undefined
            expect(joinResult2?.left).toEqual(
                orders.find((order) => order.id === joinResult2?.left.id),
            )
            expect(joinResult2?.right).toEqual(
                users.find((user) => user.id === joinResult2?.right?.id),
            )

            joinResult2 =
                joinedData2.find((joinResult) => joinResult.left.id === 3) ||
                undefined
            expect(joinResult2?.left).toEqual(
                orders.find((order) => order.id === joinResult2?.left.id),
            )
            expect(joinResult2?.right).toBeNull()
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

    describe('withTransaction', () => {
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
                await adapter.write(testData[1])
            }

            try {
                await db.withAdapterTransaction<TestData>(
                    callback,
                    'testData',
                    {
                        rollback: true,
                        timeout: 100_000,
                    },
                )
            } catch (error) {
                expect(error).toBeInstanceOf(Error)
            }
            const dbContent = await db.read<TestData>('testData')
            // logTest(true, 'dbContent', dbContent)

            expect(dbContent).toHaveLength(2)
            expect(dbContent[0]).toEqual({ ...testData[0], name: 'test11' })
            expect(dbContent[1]).toEqual(testData[1])
        }, 100_000)
        it('должен выполнять операции в транзакции для конкретной коллекции  с ошибкой', async () => {
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
                        timeout: 100_000,
                    },
                )
            } catch (error) {
                expect(error).toBeInstanceOf(Error)
            }
            const dbContent = await db.read<TestData>('testData')
            // logTest(true, 'dbContent', dbContent)

            expect(dbContent).toHaveLength(1)
            expect(dbContent[0]).toEqual(testData[0])
        }, 100_000)
    })
})

describe('Backup and Restore', () => {
    it('should create backup and restore data correctly', async () => {
        const dbFolder = path.join(process.cwd(), 'test-data')
        if (!fsClassic.existsSync(dbFolder)) {
            await fs.mkdir(dbFolder, { recursive: true })
        }
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
        const adapter1 = new JSONLFile<TestData>(
            'test-data/collection-1.jsonl',
            '',
            {
                collectionName: 'collection-1',
            },
        )
        const adapter2 = new JSONLFile<TestData>(
            'test-data/collection-2.jsonl',
            '',
            {
                collectionName: 'collection-2',
            },
        )
        const db = new LineDb({}, [adapter1, adapter2])
        await db.init(true)

        // Записываем тестовые данные
        const data1: TestData[] = [
            {
                id: 1,
                name: 'test1-1',
                timestamp: Date.now(),
                age: 10,
                userId: 1,
            },
            {
                id: 2,
                name: 'test1-2',
                timestamp: Date.now(),
                age: 10,
                userId: 1,
            },
        ]
        const data2: TestData[] = [
            {
                id: 1,
                name: 'test2-1',
                timestamp: Date.now(),
                age: 10,
                userId: 1,
            },
            {
                id: 2,
                name: 'test2-2',
                timestamp: Date.now(),
                age: 10,
                userId: 1,
            },
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

    it('should handle empty collections in backup', async () => {
        const dbFolder = path.join(process.cwd(), 'test-data')
        if (!fsClassic.existsSync(dbFolder)) {
            await fs.mkdir(dbFolder, { recursive: true })
        }
        try {
            await fs.unlink('test-data/test1.jsonl')
        } catch (error) {
            // console.log('Error deleting file:', error)
        }
        try {
            await fs.unlink('test-data/test2.jsonl')
        } catch (error) {
            // console.log('Error deleting file:', error)
        }

        const db = new LineDb({}, [
            new JSONLFile<TestData>('test-data/test1.jsonl', '', {
                collectionName: 'test1',
            }),
            new JSONLFile<TestData>('test-data/test2.jsonl', '', {
                collectionName: 'test2',
            }),
        ])
        await db.init(true)

        // Записываем данные только в одну коллекцию
        const data = [{ id: 1, name: 'test1-1' }]
        await db.write(data, 'test1')

        // Создаем бэкап
        const backupFile = 'test-data/test-backup.txt'
        await db.createBackup(backupFile)

        // Очищаем данные
        await db.delete({}, 'test1')
        const deletedData = await db.read('test1')
        logTest(true, 'deletedData', deletedData)
        expect(deletedData).toHaveLength(0)

        // Восстанавливаем из бэкапа
        await db.restoreFromBackup(backupFile, {
            keepBackup: false,
        })

        // Проверяем восстановленные данные
        const restored1 = await db.read('test1')
        const restored2 = await db.read('test2')

        expect(restored1).toHaveLength(1)
        expect(restored2).toHaveLength(0)
        expect(restored1).toEqual(expect.arrayContaining(data))

        // Очищаем тестовые файлы
        try {
            // await fs.unlink(backupFile)
            await fs.unlink('test-data/test1.jsonl')
            await fs.unlink('test-data/test2.jsonl')
        } catch (error) {
            // console.log('Error deleting file:', error)
        }
    })

    it('should handle deleted records in backup', async () => {
        const dbFolder = path.join(process.cwd(), 'test-data')
        if (!fsClassic.existsSync(dbFolder)) {
            await fs.mkdir(dbFolder, { recursive: true })
        }
        try {
            await fs.unlink('test-data/test1.jsonl')
        } catch (error) {
            // console.log('Error deleting file:', error)
        }

        const db = new LineDb({}, [
            new JSONLFile<TestData>('test-data/test1.jsonl', '', {
                collectionName: 'test1',
            }),
        ])
        await db.init(true)

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
        await db.restoreFromBackup(backupFile, {
            keepBackup: true,
        })

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
        try {
            await fs.unlink(backupFile)
        } catch (error) {
            // console.log('Error deleting file:', error)
        }
        try {
            await fs.unlink('test-data/test1.jsonl')
        } catch (error) {
            // console.log('Error deleting file:', error)
        }
    })
})
