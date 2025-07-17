import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { LineDb, LineDbAdapter, LineDbInitOptions } from './LineDbv2.js'
import { JSONLFile } from '../adapters/node/JSONLFile.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { logTest } from '../common/utils/log.js'
import { JSONLFileOptions } from '../common/interfaces/jsonl-file.js'

interface TestUser extends LineDbAdapter {
    id: number
    username: string
    email: string
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

interface TestProduct extends LineDbAdapter {
    id: number
    name: string
    price: number
    category: string
    timestamp: number
}

function shouldKeepTestFiles(): boolean {
    const keepFiles = process.env.KEEP_TEST_FILES
    return keepFiles === 'true' || keepFiles === '1'
}

describe('LineDb - Join Method Tests', () => {
    const testDbFolder = path.join(process.cwd(), 'test-linedb-join')

    let db: LineDb

    beforeEach(async () => {
        // Очищаем тестовую папку
        try {
            await fs.rm(testDbFolder, { recursive: true, force: true })
        } catch (error) {
            // Игнорируем ошибку, если папка не существует
        }

        const adapterUserOptions: JSONLFileOptions<TestUser> = {
            collectionName: 'users',
            encryptKeyForLineDb: '',
            indexedFields: ['id', 'username'],
        }
        const adapterOrderOptions: JSONLFileOptions<TestOrder> = {
            collectionName: 'orders',
            encryptKeyForLineDb: '',
            indexedFields: ['id', 'userId'],
        }
        const adapterProductOptions: JSONLFileOptions<TestProduct> = {
            collectionName: 'products',
            encryptKeyForLineDb: '',
            indexedFields: ['id', 'category'],
        }
        const initLineDBOptions: LineDbInitOptions = {
            dbFolder: testDbFolder,
            cacheSize: 1000,
            cacheTTL: 10000,
            collections: [
                adapterUserOptions as unknown as JSONLFileOptions<unknown>,
                adapterOrderOptions as unknown as JSONLFileOptions<unknown>,
                adapterProductOptions as unknown as JSONLFileOptions<unknown>,
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

    describe('Inner join operations', () => {
        it('should perform inner join between collections', async () => {
            const users: TestUser[] = [
                {
                    id: 1,
                    username: 'john',
                    email: 'john@example.com',
                    isActive: true,
                    role: 'user',
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    username: 'jane',
                    email: 'jane@example.com',
                    isActive: true,
                    role: 'admin',
                    timestamp: Date.now(),
                },
            ]

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
                    userId: 1,
                    status: 'completed',
                    amount: 200,
                    timestamp: Date.now(),
                },
                {
                    id: 3,
                    userId: 2,
                    status: 'pending',
                    amount: 150,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestUser>(users, 'users')
            await db.insert<TestOrder>(orders, 'orders')

            const result = await db.join<TestOrder, TestUser>('orders', 'users', {
                type: 'inner',
                leftFields: ['userId'],
                rightFields: ['id'],
            })

            const resultArray = result.value()
            expect(resultArray).toHaveLength(3)
            
            // Проверяем, что все записи имеют соответствующие данные
            expect(resultArray[0].left.userId).toBe(resultArray[0].right?.id)
            expect(resultArray[1].left.userId).toBe(resultArray[1].right?.id)
            expect(resultArray[2].left.userId).toBe(resultArray[2].right?.id)
        })

        it('should perform inner join with multiple join fields', async () => {
            const users: TestUser[] = [
                {
                    id: 1,
                    username: 'john',
                    email: 'john@example.com',
                    isActive: true,
                    role: 'user',
                    timestamp: Date.now(),
                },
            ]

            const orders: TestOrder[] = [
                {
                    id: 1,
                    userId: 1,
                    status: 'pending',
                    amount: 100,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestUser>(users, 'users')
            await db.insert<TestOrder>(orders, 'orders')

            const result = await db.join<TestOrder, TestUser>('orders', 'users', {
                type: 'inner',
                leftFields: ['userId', 'status'],
                rightFields: ['id', 'role'],
            })

            const resultArray = result.value()
            expect(resultArray).toHaveLength(1)
        })
    })

    describe('Left join operations', () => {
        it('should perform left join between collections', async () => {
            const users: TestUser[] = [
                {
                    id: 1,
                    username: 'john',
                    email: 'john@example.com',
                    isActive: true,
                    role: 'user',
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    username: 'jane',
                    email: 'jane@example.com',
                    isActive: true,
                    role: 'admin',
                    timestamp: Date.now(),
                },
            ]

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
                    userId: 3, // Пользователь с ID 3 не существует
                    status: 'completed',
                    amount: 200,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestUser>(users, 'users')
            await db.insert<TestOrder>(orders, 'orders')

            const result = await db.join<TestOrder, TestUser>('orders', 'users', {
                type: 'left',
                leftFields: ['userId'],
                rightFields: ['id'],
            })

            const resultArray = result.value()
            expect(resultArray).toHaveLength(2)
            
            // Первая запись должна иметь соответствующие данные пользователя
            expect(resultArray[0].left.userId).toBe(1)
            expect(resultArray[0].right?.id).toBe(1)
            expect(resultArray[0].right?.username).toBe('john')
            
            // Вторая запись должна иметь null для правой части
            expect(resultArray[1].left.userId).toBe(3)
            expect(resultArray[1].right).toBeNull()
        })

        it('should perform left join with filtering', async () => {
            const users: TestUser[] = [
                {
                    id: 1,
                    username: 'john',
                    email: 'john@example.com',
                    isActive: true,
                    role: 'user',
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    username: 'jane',
                    email: 'jane@example.com',
                    isActive: false,
                    role: 'admin',
                    timestamp: Date.now(),
                },
            ]

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

            await db.insert<TestUser>(users, 'users')
            await db.insert<TestOrder>(orders, 'orders')

            const result = await db.join<TestOrder, TestUser>('orders', 'users', {
                type: 'left',
                leftFields: ['userId'],
                rightFields: ['id'],
                rightFilter: { isActive: true },
            })

            const resultArray = result.value()
            expect(resultArray).toHaveLength(2)
            
            // Первая запись должна иметь активного пользователя
            expect(resultArray[0].right?.isActive).toBe(true)
            
            // Вторая запись должна иметь null для неактивного пользователя
            expect(resultArray[1].right).toBeNull()
        })
    })

    describe('Right join operations', () => {
        it('should perform right join between collections', async () => {
            const users: TestUser[] = [
                {
                    id: 1,
                    username: 'john',
                    email: 'john@example.com',
                    isActive: true,
                    role: 'user',
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    username: 'jane',
                    email: 'jane@example.com',
                    isActive: true,
                    role: 'admin',
                    timestamp: Date.now(),
                },
            ]

            const orders: TestOrder[] = [
                {
                    id: 1,
                    userId: 1,
                    status: 'pending',
                    amount: 100,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestUser>(users, 'users')
            await db.insert<TestOrder>(orders, 'orders')

            const result = await db.join<TestOrder, TestUser>('orders', 'users', {
                type: 'right',
                leftFields: ['userId'],
                rightFields: ['id'],
            })

            const resultArray = result.value()
            expect(resultArray).toHaveLength(2)
            
            // Первая запись должна иметь соответствующие данные заказа
            expect(resultArray[0].left?.userId).toBe(1)
            expect(resultArray[0].right?.id).toBe(1)
            
            // Вторая запись должна иметь null для левой части
            expect(resultArray[1].left).toBeNull()
            expect(resultArray[1].right?.id).toBe(2)
        })
    })

    describe('Full outer join operations', () => {
        it('should perform full outer join between collections', async () => {
            const users: TestUser[] = [
                {
                    id: 1,
                    username: 'john',
                    email: 'john@example.com',
                    isActive: true,
                    role: 'user',
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    username: 'jane',
                    email: 'jane@example.com',
                    isActive: true,
                    role: 'admin',
                    timestamp: Date.now(),
                },
            ]

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
                    userId: 3, // Пользователь с ID 3 не существует
                    status: 'completed',
                    amount: 200,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestUser>(users, 'users')
            await db.insert<TestOrder>(orders, 'orders')

            const result = await db.join<TestOrder, TestUser>('orders', 'users', {
                type: 'full',
                leftFields: ['userId'],
                rightFields: ['id'],
            })

            const resultArray = result.value()
            expect(resultArray).toHaveLength(3)
            
            // Записи с совпадающими ID
            const matchedRecords = resultArray.filter(r => r.left && r.right)
            expect(matchedRecords).toHaveLength(1)
            
            // Записи только из левой коллекции
            const leftOnlyRecords = resultArray.filter(r => r.left && !r.right)
            expect(leftOnlyRecords).toHaveLength(1)
            
            // Записи только из правой коллекции
            const rightOnlyRecords = resultArray.filter(r => !r.left && r.right)
            expect(rightOnlyRecords).toHaveLength(1)
        })
    })

    describe('Join with arrays', () => {
        it('should join collection with array', async () => {
            const users: TestUser[] = [
                {
                    id: 1,
                    username: 'john',
                    email: 'john@example.com',
                    isActive: true,
                    role: 'user',
                    timestamp: Date.now(),
                },
            ]

            const ordersArray: TestOrder[] = [
                {
                    id: 1,
                    userId: 1,
                    status: 'pending',
                    amount: 100,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestUser>(users, 'users')

            const result = await db.join<TestOrder, TestUser>(ordersArray, 'users', {
                type: 'inner',
                leftFields: ['userId'],
                rightFields: ['id'],
            })

            const resultArray = result.value()
            expect(resultArray).toHaveLength(1)
            expect(resultArray[0].left.userId).toBe(resultArray[0].right?.id)
        })

        it('should join two arrays', async () => {
            const usersArray: TestUser[] = [
                {
                    id: 1,
                    username: 'john',
                    email: 'john@example.com',
                    isActive: true,
                    role: 'user',
                    timestamp: Date.now(),
                },
            ]

            const ordersArray: TestOrder[] = [
                {
                    id: 1,
                    userId: 1,
                    status: 'pending',
                    amount: 100,
                    timestamp: Date.now(),
                },
            ]

            const result = await db.join<TestOrder, TestUser>(ordersArray, usersArray, {
                type: 'inner',
                leftFields: ['userId'],
                rightFields: ['id'],
            })

            const resultArray = result.value()
            expect(resultArray).toHaveLength(1)
            expect(resultArray[0].left.userId).toBe(resultArray[0].right?.id)
        })
    })

    describe('Join with filtering', () => {
        it('should join with left filter', async () => {
            const users: TestUser[] = [
                {
                    id: 1,
                    username: 'john',
                    email: 'john@example.com',
                    isActive: true,
                    role: 'user',
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    username: 'jane',
                    email: 'jane@example.com',
                    isActive: true,
                    role: 'admin',
                    timestamp: Date.now(),
                },
            ]

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

            await db.insert<TestUser>(users, 'users')
            await db.insert<TestOrder>(orders, 'orders')

            const result = await db.join<TestOrder, TestUser>('orders', 'users', {
                type: 'inner',
                leftFields: ['userId'],
                rightFields: ['id'],
                leftFilter: { status: 'pending' },
            })

            const resultArray = result.value()
            expect(resultArray).toHaveLength(1)
            expect(resultArray[0].left.status).toBe('pending')
        })

        it('should join with right filter', async () => {
            const users: TestUser[] = [
                {
                    id: 1,
                    username: 'john',
                    email: 'john@example.com',
                    isActive: true,
                    role: 'user',
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    username: 'jane',
                    email: 'jane@example.com',
                    isActive: true,
                    role: 'admin',
                    timestamp: Date.now(),
                },
            ]

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

            await db.insert<TestUser>(users, 'users')
            await db.insert<TestOrder>(orders, 'orders')

            const result = await db.join<TestOrder, TestUser>('orders', 'users', {
                type: 'inner',
                leftFields: ['userId'],
                rightFields: ['id'],
                rightFilter: { role: 'admin' },
            })

            const resultArray = result.value()
            expect(resultArray).toHaveLength(1)
            expect(resultArray[0].right?.role).toBe('admin')
        })
    })

    describe('Join with onlyOneFromRight option', () => {
        it('should limit right side matches to one per left record', async () => {
            const users: TestUser[] = [
                {
                    id: 1,
                    username: 'john',
                    email: 'john@example.com',
                    isActive: true,
                    role: 'user',
                    timestamp: Date.now(),
                },
            ]

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
                    userId: 1,
                    status: 'completed',
                    amount: 200,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestUser>(users, 'users')
            await db.insert<TestOrder>(orders, 'orders')

            const result = await db.join<TestOrder, TestUser>('orders', 'users', {
                type: 'inner',
                leftFields: ['userId'],
                rightFields: ['id'],
                onlyOneFromRight: true,
            })

            const resultArray = result.value()
            expect(resultArray).toHaveLength(1) // Только одна запись, так как onlyOneFromRight = true
        })
    })

    describe('Join with transactions', () => {
        it('should perform join within transaction', async () => {
            const users: TestUser[] = [
                {
                    id: 1,
                    username: 'john',
                    email: 'john@example.com',
                    isActive: true,
                    role: 'user',
                    timestamp: Date.now(),
                },
            ]

            const orders: TestOrder[] = [
                {
                    id: 1,
                    userId: 1,
                    status: 'pending',
                    amount: 100,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestUser>(users, 'users')
            await db.insert<TestOrder>(orders, 'orders')

            const result = await db.join<TestOrder, TestUser>('orders', 'users', {
                type: 'inner',
                leftFields: ['userId'],
                rightFields: ['id'],
                inTransaction: true,
            })

            const resultArray = result.value()
            expect(resultArray).toHaveLength(1)
            expect(resultArray[0].left.userId).toBe(resultArray[0].right?.id)
        })
    })

    describe('Join edge cases', () => {
        it('should handle empty collections', async () => {
            const result = await db.join<TestOrder, TestUser>('orders', 'users', {
                type: 'inner',
                leftFields: ['userId'],
                rightFields: ['id'],
            })

            const resultArray = result.value()
            expect(resultArray).toHaveLength(0)
        })

        it('should handle empty arrays', async () => {
            const result = await db.join<TestOrder, TestUser>([], [], {
                type: 'inner',
                leftFields: ['userId'],
                rightFields: ['id'],
            })

            const resultArray = result.value()
            expect(resultArray).toHaveLength(0)
        })

        it('should handle join with no matching records', async () => {
            const users: TestUser[] = [
                {
                    id: 1,
                    username: 'john',
                    email: 'john@example.com',
                    isActive: true,
                    role: 'user',
                    timestamp: Date.now(),
                },
            ]

            const orders: TestOrder[] = [
                {
                    id: 1,
                    userId: 999, // Несуществующий пользователь
                    status: 'pending',
                    amount: 100,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestUser>(users, 'users')
            await db.insert<TestOrder>(orders, 'orders')

            const result = await db.join<TestOrder, TestUser>('orders', 'users', {
                type: 'inner',
                leftFields: ['userId'],
                rightFields: ['id'],
            })

            const resultArray = result.value()
            expect(resultArray).toHaveLength(0)
        })
    })
})