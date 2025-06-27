import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LineDb, LineDbAdapter } from './LineDbv2.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import fsClassic from 'node:fs'

// Тесты используют переменную окружения LINEDB_INITFILE_PATH для указания пути к конфигурационному файлу и
// проверяют все аспекты инициализации LineDB из YAML файла.
function shouldKeepTestFiles(): boolean {
    const keepFiles = process.env.KEEP_TEST_FILES
    return keepFiles === 'true' || keepFiles === '1'
}

interface TestUser extends LineDbAdapter {
    id: number
    email: string
    name: string
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
    category: string
    price: number
    name: string
    timestamp: number
}

describe('LineDb - Инициализация из YAML файла', () => {
    const testDbFolder = path.join(process.cwd(), 'test-linedb-yaml')
    const configFilePath = path.join(
        process.cwd(),
        'linedb-config-example.yaml',
    )
    const originalEnv = process.env.LINEDB_INITFILE_PATH

    let db: LineDb

    beforeEach(async () => {
        // Очищаем тестовую папку
        try {
            await fs.rm(testDbFolder, { recursive: true, force: true })
        } catch (error) {
            // Игнорируем ошибку, если папка не существует
        }

        // Устанавливаем переменную окружения для тестирования
        process.env.LINEDB_INITFILE_PATH = configFilePath

        // Создаем экземпляр LineDb без параметров для тестирования чтения из YAML
        db = new LineDb()
        // await db.init(true)
    })

    afterEach(async () => {
        // Восстанавливаем оригинальную переменную окружения
        if (originalEnv) {
            process.env.LINEDB_INITFILE_PATH = originalEnv
        } else {
            delete process.env.LINEDB_INITFILE_PATH
        }

        // Очищаем ресурсы
        if (db) {
            db.close()
        }

        // Очищаем тестовую папку
        try {
            if (!shouldKeepTestFiles()) {
                await fs.rm(testDbFolder, { recursive: true, force: true })
            }
        } catch (error) {
            // Игнорируем ошибку
        }
    })

    describe('Read init options from YAML file', () => {
        it('should successfully read init options from linedb-config-example.yaml', async () => {
            // Check that the configuration file exists
            const configExists = fsClassic.existsSync(configFilePath)
            expect(configExists).toBe(true)

            // Initialize the DB - this should read the configuration from the YAML file
            await expect(db.init(true)).resolves.not.toThrow()

            // Check that the collections were created
            const usersFile = path.join(testDbFolder, 'users.jsonl')
            const ordersFile = path.join(testDbFolder, 'orders.jsonl')
            const productsFile = path.join(testDbFolder, 'products.jsonl')

            const usersExists = fsClassic.existsSync(usersFile)
            const ordersExists = fsClassic.existsSync(ordersFile)
            const productsExists = fsClassic.existsSync(productsFile)

            expect(usersExists).toBe(true)
            expect(ordersExists).toBe(true)
            expect(productsExists).toBe(true)
        })

        it('should create correct folder structure', async () => {
            await fs.rm(testDbFolder, { recursive: true, force: true })
            await db.init(true)

            // Проверяем, что папка data была создана
            const dataFolderExists = fsClassic.existsSync(testDbFolder)
            expect(dataFolderExists).toBe(true)
        })

        it('should initialize collections with correct settings', async () => {
            await db.init()

            // Test inserting data into the users collection
            const user: TestUser = {
                id: 1,
                email: 'test@example.com',
                name: 'Test User',
                timestamp: Date.now(),
            }

            await expect(db.insert(user, 'users')).resolves.not.toThrow()

            // Check that the data was written
            const resultUsers = await db.read<TestUser>('users')
            expect(resultUsers).toHaveLength(1)
            expect(resultUsers[0].email).toBe('test@example.com')
            expect(resultUsers[0].name).toBe('Test User')

            const product: Partial<TestProduct>[] = [
                {
                    id: -1,
                    category: 'electronics',
                    price: 999.99,
                    name: 'Iphone 16 Pro Max',
                    timestamp: Date.now(),
                },
                {
                    id: -1,
                    category: 'electronics',
                    price: 888.99,
                    name: 'Samsung Galaxy S24 Ultra',
                    timestamp: Date.now(),
                },
            ]

            await expect(db.insert(product, 'products')).resolves.not.toThrow()

            const resultProducts = await db.read<TestProduct>('products')
            expect(resultProducts).toHaveLength(2)
            expect(resultProducts[0].category).toBe('electronics')
            expect(resultProducts[0].price).toBe(999.99)
            expect(resultProducts[1].category).toBe('electronics')
            expect(resultProducts[1].price).toBe(888.99)
        })

        it('should support partitioning for orders', async () => {
            await db.init()

            // Test inserting orders with different userId to check partitioning
            const order1: TestOrder = {
                id: -1,
                userId: 100,
                status: 'pending',
                amount: 100.5,
                timestamp: Date.now(),
            }

            const order2: TestOrder = {
                id: -2,
                userId: 200,
                status: 'completed',
                amount: 250.75,
                timestamp: Date.now(),
            }

            await expect(db.insert(order1, 'orders')).resolves.not.toThrow()
            await expect(db.insert(order2, 'orders')).resolves.not.toThrow()

            // Проверяем, что файлы партиций были созданы
            const ordersPartition100 = path.join(
                testDbFolder,
                'orders_100.jsonl',
            )
            const ordersPartition200 = path.join(
                testDbFolder,
                'orders_200.jsonl',
            )

            const partition100Exists = fsClassic.existsSync(ordersPartition100)
            const partition200Exists = fsClassic.existsSync(ordersPartition200)

            expect(partition100Exists).toBe(true)
            expect(partition200Exists).toBe(true)

            // Проверяем, что данные находятся в правильных партициях
            const result1 = await db.readByFilter<TestOrder>(
                { userId: 100 },
                'orders',
                { optimisticRead: true },
            )
            expect(result1).toHaveLength(1)
            expect(result1[0].id).toBe(1)

            const result2 = await db.readByFilter<TestOrder>(
                `userId == 200`,
                'orders',
                { optimisticRead: true },
            )

            expect(result2).toHaveLength(1)
            expect(result2[0].id).toBe(2)
        })

        it('should work with products collection', async () => {
            await db.init()

            const product: TestProduct = {
                id: 1,
                category: 'electronics',
                price: 999.99,
                name: 'Smartphone',
                timestamp: Date.now(),
            }

            await expect(db.insert(product, 'products')).resolves.not.toThrow()

            const result = await db.read<TestProduct>('products')
            expect(result).toHaveLength(1)
            expect(result[0].category).toBe('electronics')
            expect(result[0].price).toBe(999.99)
        })

        it('should use cache settings from YAML', async () => {
            await db.init()

            // Проверяем, что настройки кэша были применены
            expect(db.limitCacheSize).toBe(2000)
            expect(db.actualCacheSize).toBe(0) // Кэш пустой в начале
        })

        it('should handle case of missing environment variable', async () => {
            // Удаляем переменную окружения
            delete process.env.LINEDB_INITFILE_PATH

            // Создаем новый экземпляр без переменной окружения
            const dbWithoutEnv = new LineDb()

            // Должен выбросить ошибку, так как нет опций инициализации
            await expect(dbWithoutEnv.init()).rejects.toThrow()
        })

        it('should handle case of missing configuration file', async () => {
            // Устанавливаем путь к несуществующему файлу
            process.env.LINEDB_INITFILE_PATH = '/path/to/nonexistent/file.yaml'

            // Создаем новый экземпляр
            const dbWithInvalidPath = new LineDb()

            // Должен выбросить ошибку, так как нет опций инициализации
            await expect(dbWithInvalidPath.init()).rejects.toThrow()
        })

        it('should work with indexing', async () => {
            await db.init()

            // Добавляем несколько пользователей
            const users: TestUser[] = [
                {
                    id: 1,
                    email: 'user1@example.com',
                    name: 'User One',
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    email: 'user2@example.com',
                    name: 'User Two',
                    timestamp: Date.now(),
                },
            ]

            await db.insert(users, 'users')

            // Тестируем поиск по индексированным полям
            const resultById = await db.readByFilter<TestUser>(
                { id: 1 },
                'users',
            )
            const resultByEmail = await db.readByFilter<TestUser>(
                { email: 'user2@example.com' },
                'users',
            )
            const resultByName = await db.readByFilter<TestUser>(
                { name: 'User One' },
                'users',
            )

            expect(resultById).toHaveLength(1)
            expect(resultById[0].id).toBe(1)
            expect(resultByEmail).toHaveLength(1)
            expect(resultByEmail[0].email).toBe('user2@example.com')
            expect(resultByName).toHaveLength(1)
            expect(resultByName[0].name).toBe('User One')
        })
    })

    describe('Интеграционные тесты с YAML конфигурацией', () => {
        it('should perform full CRUD cycle with configuration from YAML', async () => {
            await db.init()

            // CREATE - Создание записей
            const user: TestUser = {
                id: 1,
                email: 'test@example.com',
                name: 'Test User',
                timestamp: Date.now(),
            }

            await db.insert(user, 'users')

            // READ - Чтение записей
            const readResult = await db.read<TestUser>('users')
            expect(readResult).toHaveLength(1)
            expect(readResult[0].email).toBe('test@example.com')

            // UPDATE - Обновление записей
            await db.update({ id: 1, name: 'Updated User' }, 'users')
            const updatedResult = await db.readByFilter<TestUser>(
                { id: 1 },
                'users',
            )
            expect(updatedResult[0].name).toBe('Updated User')

            // DELETE - Удаление записей
            await db.delete({ id: 1 }, 'users')
            const afterDeleteResult = await db.read<TestUser>('users')
            expect(afterDeleteResult).toHaveLength(0)
        })

        it('should work with multiple collections simultaneously', async () => {
            await db.init()

            // Добавляем пользователя
            const user: TestUser = {
                id: 1,
                email: 'user@example.com',
                name: 'Test User',
                timestamp: Date.now(),
            }
            await db.insert(user, 'users')

            // Добавляем заказ для этого пользователя
            const order: TestOrder = {
                id: 1,
                userId: 1,
                status: 'pending',
                amount: 100.0,
                timestamp: Date.now(),
            }
            await db.insert(order, 'orders')

            // Добавляем продукт
            const product: TestProduct = {
                id: 1,
                category: 'electronics',
                price: 500.0,
                name: 'Laptop',
                timestamp: Date.now(),
            }
            await db.insert(product, 'products')

            // Проверяем все коллекции
            const users = await db.read<TestUser>('users')
            // read from specific partition
            const orders = await db.read<TestOrder>('orders_1')
            const products = await db.read<TestProduct>('products')

            expect(users).toHaveLength(1)
            expect(orders).toHaveLength(1)
            expect(products).toHaveLength(1)

            expect(users[0].email).toBe('user@example.com')
            expect(orders[0].userId).toBe(1)
            expect(products[0].category).toBe('electronics')
        })
    })

    describe('withMultyAdaptersTransaction', () => {
        beforeEach(async () => {
            await db.init()
        })

        it.only('should execute transaction with multiple adapters successfully', async () => {
            // Создаем тестовые данные
            const user: TestUser = {
                id: 1,
                email: 'user@example.com',
                name: 'Test User',
                timestamp: Date.now(),
            }
            const user2: TestUser = {
                id: 2,
                email: 'user2@example.com',
                name: 'Test User 2',
                timestamp: Date.now(),
            }
            const order: TestOrder = {
                id: 1,
                userId: 1,
                status: 'pending',
                amount: 100.5,
                timestamp: Date.now(),
            }
            const order2: TestOrder = {
                id: 2,
                userId: 2,
                status: 'pending',
                amount: 100.5,
                timestamp: Date.now(),
            }

            const product: TestProduct = {
                id: 1,
                category: 'electronics',
                price: 500.0,
                name: 'Laptop',
                timestamp: Date.now(),
            }
            const product2: TestProduct = {
                id: 2,
                category: 'electronics',
                price: 500.0,
                name: 'Laptop 2',
                timestamp: Date.now(),
            }
            await db.insert(user, 'users')
            await db.insert(order, 'orders')
            await db.insert(product, 'products')

            // Create Map of adapters for transaction
            const adapters = ['users', 'orders', 'products']

            // Execute transaction
            await db.withMultyAdaptersTransaction(
                async (adapterMap, dbInstance) => {
                    // Записываем данные в разные коллекции
                    dbInstance.insert(order2, 'orders')
                    await adapterMap.get('users')?.adapter.insert(user2)                    
                    await adapterMap.get('products')?.adapter.insert(product2)
                    // await adapterMap.get('orders')?.adapter.insert(order)
                },
                adapters,
                { rollback: true }, // Отключаем rollback для успешного теста
            )

            // Проверяем, что данные были записаны
            const users = await db.read<TestUser>('users')
            const orders = await db.read<TestOrder>('orders')
            const products = await db.read<TestProduct>('products')

            expect(users).toHaveLength(2)
            expect(users[0].email).toBe('user@example.com')
            expect(orders).toHaveLength(2)
            expect(orders[0].userId).toBe(1)
            expect(products).toHaveLength(2)
            expect(products[0].name).toBe('Laptop')
        },1_000_000)

        it('should rollback transaction on error when rollback is enabled', async () => {
            // Создаем тестовые данные
            const user: TestUser = {
                id: 1,
                email: 'user@example.com',
                name: 'Test User',
                timestamp: Date.now(),
            }

            // Создаем Map адаптеров для транзакции
            const adapters = new Map()
            const usersAdapter = db['#adapters'].get('users') as any
            adapters.set('users', usersAdapter)

            // Проверяем, что коллекция пуста перед транзакцией
            const usersBefore = await db.read<TestUser>('users')
            expect(usersBefore).toHaveLength(0)

            // Выполняем транзакцию с ошибкой
            await expect(
                db.withMultyAdaptersTransaction(
                    async (adapterMap, dbInstance) => {
                        // Записываем данные
                        await adapterMap.get('users')?.adapter.insert(user)

                        // Вызываем ошибку
                        throw new Error('Transaction error')
                    },
                    ['users', 'orders', 'products'],
                    { rollback: true }, // Включаем rollback
                ),
            ).rejects.toThrow('Transaction error')

            // Проверяем, что данные были откачены
            const usersAfter = await db.read<TestUser>('users')
            expect(usersAfter).toHaveLength(0)
        })

        it('should not rollback transaction on error when rollback is disabled', async () => {
            // Создаем тестовые данные
            const user: TestUser = {
                id: 1,
                email: 'user@example.com',
                name: 'Test User',
                timestamp: Date.now(),
            }

            // Создаем Map адаптеров для транзакции
            const adapters = new Map()
            const usersAdapter = db['#adapters'].get('users') as any
            adapters.set('users', usersAdapter)

            // Выполняем транзакцию с ошибкой, но без rollback
            await expect(
                db.withMultyAdaptersTransaction(
                    async (adapterMap, dbInstance) => {
                        // Записываем данные
                        await adapterMap.get('users').adapter.write(user)

                        // Вызываем ошибку
                        throw new Error('Transaction error')
                    },
                    adapters,
                    { rollback: false }, // Отключаем rollback
                ),
            ).rejects.toThrow('Transaction error')

            // Проверяем, что данные остались (rollback не выполнился)
            const usersAfter = await db.read<TestUser>('users')
            expect(usersAfter).toHaveLength(1)
            expect(usersAfter[0].email).toBe('user@example.com')
        })

        it('should handle timeout in transaction', async () => {
            // Создаем Map адаптеров для транзакции
            const adapters = new Map()
            const usersAdapter = db['#adapters'].get('users') as any
            adapters.set('users', usersAdapter)

            // Выполняем транзакцию с очень коротким таймаутом
            await expect(
                db.withMultyAdaptersTransaction(
                    async (adapterMap, dbInstance) => {
                        // Имитируем долгую операцию
                        await new Promise((resolve) => setTimeout(resolve, 100))
                    },
                    adapters,
                    { timeout: 10 }, // Очень короткий таймаут
                ),
            ).rejects.toThrow()
        })

        it('should work with backup file option', async () => {
            // Создаем тестовые данные
            const user: TestUser = {
                id: 1,
                email: 'user@example.com',
                name: 'Test User',
                timestamp: Date.now(),
            }

            // Создаем Map адаптеров для транзакции
            const adapters = new Map()
            const usersAdapter = db['#adapters'].get('users') as any
            adapters.set('users', usersAdapter)

            const backupFile = path.join(testDbFolder, 'test-backup.backup')

            // Выполняем транзакцию с указанием backup файла
            await db.withMultyAdaptersTransaction(
                async (adapterMap, dbInstance) => {
                    await adapterMap.get('users').adapter.write(user)
                },
                adapters,
                {
                    rollback: true,
                    backupFile,
                    doNotDeleteBackupFile: true,
                },
            )

            // Проверяем, что backup файл был создан
            const backupExists = fsClassic.existsSync(backupFile)
            expect(backupExists).toBe(true)

            // Очищаем backup файл
            await fs.unlink(backupFile)
        })

        it('should handle complex transaction with multiple operations', async () => {
            // Создаем тестовые данные
            const users: TestUser[] = [
                {
                    id: 1,
                    email: 'user1@example.com',
                    name: 'User 1',
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    email: 'user2@example.com',
                    name: 'User 2',
                    timestamp: Date.now(),
                },
            ]

            const orders: TestOrder[] = [
                {
                    id: 1,
                    userId: 1,
                    status: 'pending',
                    amount: 100.5,
                    timestamp: Date.now(),
                },
                {
                    id: 2,
                    userId: 2,
                    status: 'completed',
                    amount: 250.75,
                    timestamp: Date.now(),
                },
            ]

            // Создаем Map адаптеров для транзакции
            const adapters = new Map()
            const usersAdapter = db['#adapters'].get('users') as any
            const ordersAdapter = db['#adapters'].get('orders') as any

            adapters.set('users', usersAdapter)
            adapters.set('orders', ordersAdapter)

            // Выполняем сложную транзакцию
            await db.withMultyAdaptersTransaction(
                async (adapterMap, dbInstance) => {
                    // Записываем пользователей
                    await adapterMap.get('users').adapter.write(users)

                    // Записываем заказы
                    await adapterMap.get('orders').adapter.write(orders)

                    // Обновляем статус первого заказа
                    await adapterMap
                        .get('orders')
                        .adapter.update({ id: 1, status: 'processing' }, '', {
                            inTransaction: true,
                        })
                },
                adapters,
                { rollback: false },
            )

            // Проверяем результаты
            const resultUsers = await db.read<TestUser>('users')
            const resultOrders = await db.read<TestOrder>('orders')

            expect(resultUsers).toHaveLength(2)
            expect(resultOrders).toHaveLength(2)

            // Проверяем, что статус был обновлен
            const updatedOrder = resultOrders.find((o) => o.id === 1)
            expect(updatedOrder?.status).toBe('processing')
        })

        it('should handle empty adapters map', async () => {
            const emptyAdapters = new Map()

            // Транзакция с пустым Map должна выполниться без ошибок
            await expect(
                db.withMultyAdaptersTransaction(
                    async (adapterMap, dbInstance) => {
                        // Ничего не делаем
                    },
                    emptyAdapters,
                ),
            ).resolves.not.toThrow()
        })

        it('should provide correct adapter options in callback', async () => {
            // Создаем Map адаптеров для транзакции
            const adapters = new Map()
            const usersAdapter = db['#adapters'].get('users') as any
            adapters.set('users', usersAdapter)

            let receivedAdapterOptions: any = null

            await db.withMultyAdaptersTransaction(
                async (adapterMap, dbInstance) => {
                    const adapterEntry = adapterMap.get('users')
                    receivedAdapterOptions = adapterEntry.adapterOptions

                    // Проверяем, что опции содержат правильные значения
                    expect(receivedAdapterOptions.inTransaction).toBe(true)
                    expect(receivedAdapterOptions.transactionId).toBeDefined()
                },
                adapters,
            )

            expect(receivedAdapterOptions).toBeDefined()
        })
    })
})
