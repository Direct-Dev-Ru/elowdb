import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { LineDb, LineDbAdapter, LineDbInitOptions } from './LineDbv2.js'
import { JSONLFile } from '../adapters/node/JSONLFile.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { logTest } from '../common/utils/log.js'
import { JSONLFileOptions } from '../common/interfaces/jsonl-file.js'
import { count, log } from 'node:console'

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

describe('LineDb - Select Method Tests', () => {
    const testDbFolder = path.join(process.cwd(), 'test-linedb-select')

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

    describe('Base select operations', () => {
        it('should select all records from collection', async () => {
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
                    userId: 2,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestData>(dataArray, 'testData')
            const result = await db.select<TestData>('testData')
            const resultArray = db.selectResultArray(result)

            expect(resultArray).toHaveLength(3)
            expect(resultArray[0].id).toBe(1)
            expect(resultArray[1].id).toBe(2)
            expect(resultArray[2].id).toBe(3)
        })

        it('should select records by ID filter string', async () => {
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
            const result = await db.select<TestData>('id === 1', 'testData')
            const resultArray = db.selectResultArray(result)

            expect(resultArray).toHaveLength(1)
            expect(resultArray[0].id).toBe(1)
            expect(resultArray[0].name).toBe('User 1')
        })

        it('should select records by partial object filter', async () => {
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
                    name: 'Jane Smith',
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
            const result = await db.select<TestData>({ userId: 1 }, 'testData')
            const resultArray = db.selectResultArray(result)

            expect(resultArray).toHaveLength(2)
            expect(resultArray[0].userId).toBe(1)
            expect(resultArray[1].userId).toBe(1)
        })

        it('should select records with strict comparison', async () => {
            const dataArray: TestData[] = [
                {
                    id: 1,
                    name: 'John',
                    age: 25,
                    userId: 1,
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    name: 'Johnny',
                    age: 30,
                    userId: 1,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestData>(dataArray, 'testData')

            // Нестрогое сравнение (по умолчанию)
            const result1 = await db.select<TestData>(
                { name: 'John' },
                'testData',
            )
            const resultArray1 = db.selectResultArray(result1)
            expect(resultArray1).toHaveLength(2) // Находит и "John" и "Johnny"

            // Строгое сравнение
            const result2 = await db.select<TestData>(
                { name: 'John' },
                'testData',
                { strictCompare: true },
            )
            const resultArray2 = db.selectResultArray(result2)
            expect(resultArray2).toHaveLength(1) // Находит только "John"
        })

        it('should return lodash chain when returnChain is true', async () => {
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
            const selectResult = await db.select<TestData>(
                'testData',
                undefined,
                { returnChain: true },
            )
            const result = db.selectResultChain(selectResult)
            expect(result).toHaveProperty('value')
            expect(typeof result.value).toBe('function')

            const resultArray = db.selectResultArray(result)
            expect(resultArray).toHaveLength(2)
        })

        it('should use cache for ID-based queries', async () => {
            const data: TestData = {
                id: 1,
                name: 'Test User',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(data, 'testData')

            // Первый запрос - должен загрузить из БД
            const result1 = await db.select<TestData>('id === 1', 'testData')
            const resultArray1 = db.selectResultArray(result1)
            expect(resultArray1).toHaveLength(1)

            // Второй запрос - должен использовать кэш
            const result2 = await db.select<TestData>('id === 1', 'testData')
            const resultArray2 = db.selectResultArray(result2)
            expect(resultArray2).toHaveLength(1)
            expect(resultArray2[0]).toEqual(resultArray1[0])
        })
    })

    describe('Select with partitions', () => {
        it('should select from partitioned collection', async () => {
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
                {
                    id: 3,
                    userId: 1,
                    status: 'cancelled',
                    amount: 150,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestOrder>(orders, 'orders')
            const result = await db.select<TestOrder>({}, 'orders')
            const resultArray = db.selectResultArray(result)

            expect(resultArray).toHaveLength(3)
        })

        it('should select from specific partition', async () => {
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

            // Выбираем из конкретной партиции
            const result = await db.select<TestOrder>('id == 1', 'orders_1', {
                optimisticRead: true,
            })
            const resultArray = db.selectResultArray(result)

            expect(resultArray).toHaveLength(1)
            expect(resultArray[0].userId).toBe(1)
        })
    })

    describe('Select with transactions', () => {
        it('should select within transaction', async () => {
            const data: TestData = {
                id: 1,
                name: 'Test User',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(data, 'testData')

            const result = await db.select<TestData>('testData', undefined, {
                inTransaction: true,
            })
            const resultArray = db.selectResultArray(result)

            expect(resultArray).toHaveLength(1)
            expect(resultArray[0].id).toBe(1)
        })
    })

    describe('Select with optimistic read', () => {
        it('should use optimistic read for partitioned collections', async () => {
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

            const result = await db.select<TestOrder>('id == 1', 'orders_1', {
                optimisticRead: true,
            })
            const resultArray = db.selectResultArray(result)

            expect(resultArray).toHaveLength(1)
            expect(resultArray[0].id).toBe(1)

            const resultAll = await db.select<TestOrder>('id != 0', 'orders', {
                optimisticRead: false,
            })
            const resultArrayAll = db.selectResultArray(resultAll)

            expect(resultArrayAll).toHaveLength(2)
            expect(resultArrayAll[0].id).toBe(1)
            expect(resultArrayAll[1].id).toBe(2)
        })
    })

    describe('Complex lodash chain operations', () => {
        it.only('should perform complex data processing with lodash chain', async () => {
            // Создаем большой набор тестовых данных
            const count = 2000
            const largeDataArray: TestData[] = []
            for (let i = 1; i <= count; i++) {
                largeDataArray.push({
                    id: i,
                    name: `User ${i}`,
                    age: 20 + (i % 50), // Возраст от 20 до 69
                    userId: (i % 5) + 1, // userId от 1 до 5
                    value: i * 10,
                    timestamp: Date.now() - i * 1000, // Разные временные метки
                })
            }

            await db.insert<TestData>(largeDataArray, 'testData')

            // Получаем lodash chain
            const selectResult = await db.select<TestData>(
                'testData',
                undefined,
                { returnChain: true },
            )
            const chain = db.selectResultChain(selectResult)

            // Выполняем сложные операции с lodash
            const complexResult = chain
                .filter((item) => item.age > 30) // Фильтруем по возрасту
                .filter((item) => item.userId === 1) // Фильтруем по userId
                .sortBy('age') // Сортируем по возрасту
                .map((item) => ({
                    ...item,
                    ageGroup: item.age < 40 ? 'young' : 'middle',
                    processed: true,
                })) // Добавляем новые поля
                .groupBy('ageGroup') // Группируем по возрастной группе
                .mapValues((group) => ({
                    count: group.length,
                    averageAge:
                        group.reduce((sum, item) => sum + item.age, 0) /
                        group.length,
                    users: group.map((item) => ({
                        id: item.id,
                        name: item.name,
                        age: item.age,
                    })),
                })) // Вычисляем статистику для каждой группы
                .value()
            logTest(true, 'complexResult', complexResult)
            // Проверяем результаты
            expect(complexResult).toHaveProperty('young')
            expect(complexResult).toHaveProperty('middle')

            // Проверяем группу "young"
            expect(complexResult.young.count).toBeGreaterThan(0)
            expect(complexResult.young.averageAge).toBeGreaterThan(30)
            expect(complexResult.young.averageAge).toBeLessThan(40)
            expect(complexResult.young.users).toBeInstanceOf(Array)

            // Проверяем группу "middle"
            expect(complexResult.middle.count).toBeGreaterThan(0)
            expect(complexResult.middle.averageAge).toBeGreaterThanOrEqual(40)
            expect(complexResult.middle.users).toBeInstanceOf(Array)

            // Проверяем, что все пользователи имеют userId === 1
            const allUsers = [
                ...complexResult.young.users,
                ...complexResult.middle.users,
            ]
            allUsers.forEach((user) => {
                expect(user).toHaveProperty('id')
                expect(user).toHaveProperty('name')
                expect(user).toHaveProperty('age')
            })
        },30_000)

        it('should handle multiple chained operations with large dataset', async () => {
            // Создаем данные с разными статусами заказов
            const ordersData: TestOrder[] = []
            for (let i = 1; i <= 50; i++) {
                ordersData.push({
                    id: i,
                    userId: (i % 10) + 1, // userId от 1 до 10
                    status: ['pending', 'completed', 'cancelled', 'shipped'][
                        i % 4
                    ],
                    amount: 50 + i * 10, // Сумма от 60 до 550
                    timestamp: Date.now() - i * 1000,
                })
            }

            await db.insert<TestOrder>(ordersData, 'orders')

            // Получаем lodash chain для заказов
            const ordersChain = await db.select<TestOrder>(
                'orders',
                undefined,
                { returnChain: true },
            )
            const chain = db.selectResultChain(ordersChain)

            // Выполняем комплексный анализ заказов
            const analysis = chain
                .filter((order) => order.amount > 200) // Заказы с суммой больше 200
                .groupBy('status') // Группируем по статусу
                .mapValues((orders) => ({
                    count: orders.length,
                    totalAmount: orders.reduce(
                        (sum, order) => sum + order.amount,
                        0,
                    ),
                    averageAmount:
                        orders.reduce((sum, order) => sum + order.amount, 0) /
                        orders.length,
                    userIds: [...new Set(orders.map((order) => order.userId))], // Уникальные userId
                    orders: orders.map((order) => ({
                        id: order.id,
                        amount: order.amount,
                        userId: order.userId,
                    })),
                }))
                .pickBy((stats) => stats.count > 0) // Убираем пустые группы
                .value()

            // Проверяем результаты анализа
            expect(analysis).toBeInstanceOf(Object)

            // Проверяем каждую группу статусов
            Object.keys(analysis).forEach((status) => {
                const group = analysis[status]
                expect(group.count).toBeGreaterThan(0)
                expect(group.totalAmount).toBeGreaterThan(0)
                expect(group.averageAmount).toBeGreaterThan(200)
                expect(group.userIds).toBeInstanceOf(Array)
                expect(group.orders).toBeInstanceOf(Array)
                expect(group.orders.length).toBe(group.count)
            })

            // Проверяем, что все заказы имеют сумму больше 200
            Object.values(analysis).forEach((group) => {
                group.orders.forEach((order) => {
                    expect(order.amount).toBeGreaterThan(200)
                })
            })
        })

        it('should perform data transformation and aggregation', async () => {
            // Создаем данные пользователей с разными ролями
            const usersData: TestUser[] = []
            for (let i = 1; i <= 75; i++) {
                usersData.push({
                    id: i,
                    username: `user${i}`,
                    password: `pass${i}`,
                    isActive: i % 3 !== 0, // Каждый третий пользователь неактивен
                    role: ['admin', 'user', 'moderator', 'guest'][i % 4],
                    timestamp: Date.now() - i * 1000,
                })
            }

            await db.insert<TestUser>(usersData, 'testUser')

            // Получаем lodash chain для пользователей
            const usersChain = await db.select<TestUser>(
                'testUser',
                undefined,
                { returnChain: true },
            )
            const chain = db.selectResultChain(usersChain)

            // Выполняем трансформацию и агрегацию данных
            const userStats = chain
                .filter((user) => user.isActive) // Только активные пользователи
                .groupBy('role') // Группируем по роли
                .mapValues((users) => ({
                    count: users.length,
                    usernames: users.map((u) => u.username),
                    activePercentage: 100, // Все пользователи в этой группе активны
                }))
                .mapKeys((value, key) => `${key}_role`) // Переименовываем ключи
                .value()

            // Проверяем результаты
            expect(userStats).toBeInstanceOf(Object)

            // Проверяем каждую роль
            Object.keys(userStats).forEach((roleKey) => {
                const stats = userStats[roleKey]
                expect(stats.count).toBeGreaterThan(0)
                expect(stats.usernames).toBeInstanceOf(Array)
                expect(stats.usernames.length).toBe(stats.count)
                expect(stats.activePercentage).toBe(100)
            })

            // Проверяем, что все ключи заканчиваются на "_role"
            Object.keys(userStats).forEach((key) => {
                expect(key).toMatch(/_role$/)
            })
        })
    })
})
