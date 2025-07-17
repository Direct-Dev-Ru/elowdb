import {
    describe,
    it,
    expect,
    beforeEach,
    afterEach,
    beforeAll,
    afterAll,
} from 'vitest'
import { LineDb, LineDbAdapter, LineDbInitOptions } from './LineDbv2.js'
import { JSONLFileOptions } from '../common/interfaces/jsonl-file.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { logTest } from '../common/utils/log.js'
import {
    Server,
    createServer,
    IncomingMessage,
    ServerResponse,
} from 'node:http'
import { AddressInfo } from 'node:net'
import { URL } from 'node:url'
import { log } from 'node:console'

// Интерфейсы для тестовых данных
interface User extends LineDbAdapter {
    id: number
    username: string
    email: string
    isActive: boolean
    role: string
    createdAt: number
    lastLogin?: number
}

interface Product extends LineDbAdapter {
    id: number
    name: string
    price: number
    category: string
    inStock: boolean
    sellerId: number
    createdAt: number
}

interface Order extends LineDbAdapter {
    id: number
    userId: number
    productId: number
    quantity: number
    totalPrice: number
    status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
    createdAt: number
    updatedAt: number
}

interface OrderItem extends LineDbAdapter {
    id: number
    orderId: number
    productId: number
    quantity: number
    price: number
}

// Глобальные переменные для сервера
let server: Server
let serverUrl: string = 'http://localhost:3001'
let db: LineDb

function shouldKeepTestFiles(): boolean {
    const keepFiles = process.env.KEEP_TEST_FILES
    return keepFiles === 'true' || keepFiles === '1'
}

// Функция для парсинга JSON тела запроса
async function parseRequestBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
        let body = ''
        req.on('data', (chunk) => {
            if (chunk) {
                body += chunk?.toString()
            }
        })
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {})
            } catch (error) {
                reject(error)
            }
        })
        req.on('error', reject)
    })
}

// Функция для отправки JSON ответа
function sendJsonResponse(
    res: ServerResponse,
    statusCode: number,
    data: any,
): void {
    // Проверяем, что data не undefined
    if (data === undefined) {
        logTest(
            true,
            `Попытка отправить undefined данные с кодом ${statusCode}`,
        )
        data = { error: 'Данные не найдены' }
    }

    const jsonData = JSON.stringify(data)
    logTest(true, `Отправляем ответ ${statusCode}:`, jsonData)

    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(jsonData),
    })
    res.end(jsonData)
}

// Функция для создания HTTP запросов
async function makeRequest(
    method: string,
    endpoint: string,
    data?: any,
): Promise<any> {
    const url = `${serverUrl}${endpoint}`
    const options: RequestInit = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    }

    if (data) {
        options.body = JSON.stringify(data)
    }

    const response = await fetch(url, options)

    // Проверяем, есть ли тело ответа
    const text = await response.text()
    let responseData: any

    try {
        responseData = text ? JSON.parse(text) : {}
    } catch (error) {
        logTest(true, `Ошибка парсинга JSON для ${url}:`, text)
        throw new Error(`Не удалось распарсить JSON ответ: ${text}`)
    }

    return {
        status: response.status,
        data: responseData,
    }
}

// Функция для создания конкурентных запросов a
async function makeConcurrentRequests(
    requests: Array<{ method: string; endpoint: string; data?: any }>,
    concurrency: number = 5,
): Promise<any[]> {
    const results: any[] = []

    for (let i = 0; i < requests.length; i += concurrency) {
        const batch = requests.slice(i, i + concurrency)
        const batchPromises = batch.map((req) =>
            makeRequest(req.method, req.endpoint, req.data),
        )
        const batchResults = await Promise.allSettled(batchPromises)
        results.push(...batchResults)
    }

    return results
}

async function makeConcurrentRequestsAll(
    requests: Array<{ method: string; endpoint: string; data?: any }>,
    concurrency: number = 5,
): Promise<any[]> {
    const results: any[] = []

    for (let i = 0; i < requests.length; i += concurrency) {
        const batch = requests.slice(i, i + concurrency)
        const batchPromises = batch.map((req) =>
            makeRequest(req.method, req.endpoint, req.data),
        )
        const batchResults = await Promise.all(batchPromises)
        results.push(...batchResults)
    }

    return results
}

describe('LineDb - Интеграционные тесты с HTTP сервером', () => {
    const testDbFolder = path.join(process.cwd(), 'test-linedb-integration')

    beforeEach(async () => {
        // Очищаем тестовую папку
        try {
            await fs.rm(testDbFolder, { recursive: true, force: true })
        } catch (error) {
            // Игнорируем ошибку, если папка не существует
        }

        // Настройка базы данных
        const userOptions: JSONLFileOptions<User> = {
            collectionName: 'users',
            encryptKeyForLineDb: '',
            indexedFields: ['id', 'username', 'email'],
        }

        const productOptions: JSONLFileOptions<Product> = {
            collectionName: 'products',
            encryptKeyForLineDb: '',
            indexedFields: ['id', 'name', 'category', 'sellerId'],
        }

        const orderOptions: JSONLFileOptions<Order> = {
            collectionName: 'orders',
            encryptKeyForLineDb: '',
            indexedFields: ['id', 'userId', 'status'],
        }

        const orderItemOptions: JSONLFileOptions<OrderItem> = {
            collectionName: 'orderItems',
            encryptKeyForLineDb: '',
            indexedFields: ['id', 'orderId', 'productId'],
        }

        const initOptions: LineDbInitOptions = {
            dbFolder: testDbFolder,
            cacheSize: 1000, // Отключаем кэш для отладки
            cacheTTL: 3_000_000,
            collections: [
                userOptions as unknown as JSONLFileOptions<unknown>,
                productOptions as unknown as JSONLFileOptions<unknown>,
                orderOptions as unknown as JSONLFileOptions<unknown>,
                orderItemOptions as unknown as JSONLFileOptions<unknown>,
            ],
            partitions: [
                {
                    collectionName: 'orders',
                    partIdFn: 'userId',
                },
                {
                    collectionName: 'orderItems',
                    partIdFn: 'orderId',
                },
            ],
        }

        db = new LineDb(initOptions)
        await db.init(true)

        // Создание HTTP сервера
        server = createServer(
            async (req: IncomingMessage, res: ServerResponse) => {
                try {
                    const url = new URL(
                        req.url || '',
                        `http://${req.headers.host}`,
                    )
                    const pathname = url.pathname
                    const method = req.method || 'GET'

                    logTest(true, `${method} ${pathname}`)

                    // CORS headers
                    res.setHeader('Access-Control-Allow-Origin', '*')
                    res.setHeader(
                        'Access-Control-Allow-Methods',
                        'GET, POST, PUT, DELETE, OPTIONS',
                    )
                    res.setHeader(
                        'Access-Control-Allow-Headers',
                        'Content-Type',
                    )

                    if (method === 'OPTIONS') {
                        res.writeHead(200)
                        res.end()
                        return
                    }

                    // API routes for users
                    if (pathname === '/api/users' && method === 'GET') {
                        const { searchParams } = url
                        const page = Number(searchParams.get('page')) || 1
                        const limit = Number(searchParams.get('limit')) || 10
                        const role = searchParams.get('role')
                        const isActive = searchParams.get('isActive')

                        const filter: Partial<User> = {}
                        if (role) filter.role = role
                        if (isActive !== null)
                            filter.isActive = isActive === 'true'

                        const users = await db.select<User>(filter, 'users')
                        const usersArray = db.selectResultArray(users)

                        const startIndex = (page - 1) * limit
                        const endIndex = startIndex + limit
                        const paginatedUsers = usersArray.slice(
                            startIndex,
                            endIndex,
                        )

                        const responseData = {
                            users: paginatedUsers,
                            total: usersArray.length,
                            page,
                            limit,
                        }

                        logTest(
                            true,
                            'Отправляем ответ GET /api/users:',
                            responseData,
                        )
                        sendJsonResponse(res, 200, responseData)
                        return
                    }

                    if (
                        pathname.startsWith('/api/users/') &&
                        method === 'GET'
                    ) {
                        const userId = Number(pathname.split('/').pop())
                        logTest(true, `Получаем пользователя с ID: ${userId}`)

                        const userSelectResult = await db.select<User>(
                            { id: userId },
                            'users',
                        )
                        const user = db.selectResultArray(userSelectResult)
                        if (user.length === 0) {
                            logTest(
                                true,
                                `Пользователь с ID ${userId} не найден`,
                            )
                            sendJsonResponse(res, 404, {
                                error: 'Пользователь не найден',
                            })
                            return
                        }

                        // Проверяем, что пользователь не undefined
                        if (!user[0]) {
                            logTest(
                                true,
                                `Пользователь с ID ${userId} найден, но данные undefined:`,
                                user,
                            )
                            sendJsonResponse(res, 500, {
                                error: 'Ошибка получения данных пользователя',
                            })
                            return
                        }

                        logTest(true, 'Отправляем пользователя:', user[0])
                        sendJsonResponse(res, 200, user[0])
                        return
                    }

                    if (pathname === '/api/users' && method === 'POST') {
                        const body = await parseRequestBody(req)
                        logTest(
                            true,
                            'Получены данные для создания пользователя:',
                            body,
                        )

                        const userData: Partial<User> = {
                            ...body,
                            createdAt: Date.now(),
                        }

                        await db.insert<User>(userData, 'users', {
                            inTransaction: false,
                            debugTag: userData.email?.includes('error.com')
                                ? 'error'
                                : undefined,
                        })

                        // Очищаем кэш после вставки
                        // await db.clearCache('users')

                        const newUser = await db.readByFilter<User>(
                            { username: userData.username },
                            'users',
                        )

                        logTest(true, 'Создан новый пользователь:', newUser[0])
                        sendJsonResponse(res, 201, newUser[0])
                        return
                    }

                    if (
                        pathname.startsWith('/api/users/') &&
                        method === 'PUT'
                    ) {
                        const userId = Number(pathname.split('/').pop())
                        const body = await parseRequestBody(req)
                        logTest(
                            true,
                            `Обновляем пользователя с ID ${userId}:`,
                            body,
                        )

                        const updateData: Partial<User> = {
                            ...body,
                            id: userId,
                        }

                        const updated = await db.update<User>(
                            updateData,
                            'users',
                            { id: userId },
                        )

                        if (updated.length === 0) {
                            logTest(
                                true,
                                `Пользователь с ID ${userId} не найден для обновления`,
                            )
                            sendJsonResponse(res, 404, {
                                error: 'Пользователь не найден',
                            })
                            return
                        }

                        logTest(true, 'Пользователь обновлен:', updated[0])
                        sendJsonResponse(res, 200, updated[0])
                        return
                    }

                    if (
                        pathname.startsWith('/api/users/') &&
                        method === 'DELETE'
                    ) {
                        const userId = Number(pathname.split('/').pop())
                        logTest(true, `Удаляем пользователя с ID: ${userId}`)

                        const deleted = await db.delete<User>(
                            { id: userId },
                            'users',
                        )

                        if (deleted.length === 0) {
                            logTest(
                                true,
                                `Пользователь с ID ${userId} не найден для удаления`,
                            )
                            sendJsonResponse(res, 404, {
                                error: 'Пользователь не найден',
                            })
                            return
                        }

                        logTest(true, 'Пользователь удален:', deleted[0])
                        sendJsonResponse(res, 200, {
                            message: 'Пользователь удален',
                            user: deleted[0],
                        })
                        return
                    }

                    // API роуты для продуктов
                    if (pathname === '/api/products' && method === 'GET') {
                        const { searchParams } = url
                        const category = searchParams.get('category')
                        const sellerId = searchParams.get('sellerId')
                        const inStock = searchParams.get('inStock')

                        const filter: Partial<Product> = {}
                        if (category) filter.category = category
                        if (sellerId) filter.sellerId = Number(sellerId)
                        if (inStock !== null)
                            filter.inStock = inStock === 'true'

                        const products = await db.readByFilter<Product>(
                            filter,
                            'products',
                        )
                        sendJsonResponse(res, 200, products)
                        return
                    }

                    if (pathname === '/api/products' && method === 'POST') {
                        const body = await parseRequestBody(req)
                        const productData: Partial<Product> = {
                            ...body,
                            createdAt: Date.now(),
                        }

                        await db.insert<Product>(productData, 'products')
                        const newProduct = await db.readByFilter<Product>(
                            { name: productData.name },
                            'products',
                        )

                        sendJsonResponse(res, 201, newProduct[0])
                        return
                    }

                    // API роуты для заказов
                    if (pathname === '/api/orders' && method === 'GET') {
                        const { searchParams } = url
                        const userId = searchParams.get('userId')
                        const status = searchParams.get('status')

                        const filter: Partial<Order> = {}
                        if (userId) filter.userId = Number(userId)
                        if (status) filter.status = status as Order['status']

                        const orders = await db.readByFilter<Order>(
                            filter,
                            'orders',
                        )
                        sendJsonResponse(res, 200, orders)
                        return
                    }

                    if (pathname === '/api/orders' && method === 'POST') {
                        const body = await parseRequestBody(req)
                        const { userId, items, id } = body

                        // Создаем заказ
                        const orderData: Partial<Order> = {
                            id,
                            userId,
                            productId: items[0].productId, // Упрощенно для теста
                            quantity: items.reduce(
                                (sum: number, item: any) => sum + item.quantity,
                                0,
                            ),
                            totalPrice: items.reduce(
                                (sum: number, item: any) =>
                                    sum + item.price * item.quantity,
                                0,
                            ),
                            status: 'pending',
                            createdAt: Date.now(),
                            updatedAt: Date.now(),
                        }

                        await db.insert<Order>(orderData, 'orders')
                        const newOrder = await db.readByFilter<Order>(
                            { id },
                            'orders',
                        )
                        if (newOrder[0].id !== id) {
                            logTest(
                                true,
                                'newOrder[0].id !== id',
                                newOrder[0].id,
                                id,
                            )
                            sendJsonResponse(res, 500, {
                                error: 'Не удалось создать заказ',
                            })
                            return
                        }
                        // Создаем элементы заказа
                        for (const item of items) {
                            const orderItemData: Partial<OrderItem> = {
                                orderId: newOrder[0].id,
                                productId: item.productId,
                                quantity: item.quantity,
                                price: item.price,
                            }
                            await db.insert<OrderItem>(
                                orderItemData,
                                'orderItems',
                            )
                        }

                        sendJsonResponse(res, 201, newOrder[0])
                        return
                    }

                    if (
                        pathname.match(/\/api\/orders\/\d+\/status$/) &&
                        method === 'PUT'
                    ) {
                        const orderId = Number(pathname.split('/')[3])
                        const body = await parseRequestBody(req)
                        const { status } = body
                        const updateData: Partial<Order> = {
                            status,
                            updatedAt: Date.now(),
                        }

                        const updated = await db.update<Order>(
                            updateData,
                            'orders',
                            { id: orderId },
                        )

                        if (updated.length === 0) {
                            sendJsonResponse(res, 404, {
                                error: 'Заказ не найден',
                            })
                            return
                        }

                        sendJsonResponse(res, 200, updated[0])
                        return
                    }

                    // 404 для неизвестных роутов
                    logTest(true, `Маршрут не найден: ${method} ${pathname}`)
                    sendJsonResponse(res, 404, { error: 'Маршрут не найден' })
                } catch (error) {
                    logTest(true, 'Ошибка сервера:', error)
                    sendJsonResponse(res, 500, {
                        error: 'Внутренняя ошибка сервера',
                    })
                }
            },
        )

        // Запуск сервера
        const PORT = 3001 // или любой другой свободный порт
        server.listen(PORT, () => {
            serverUrl = `http://localhost:${PORT}`
            logTest(true, `Сервер запущен на ${serverUrl}`)
        })
    })

    afterEach(async () => {
        // Остановка сервера
        if (server) {
            server.close()
        }

        // Очистка базы данных
        if (db) {
            db.close()
        }

        // Удаление тестовых файлов
        try {
            if (!shouldKeepTestFiles()) {
                await fs.rm(testDbFolder, { recursive: true, force: true })
            }
        } catch (error) {
            // Игнорируем ошибку
        }
    })

    describe('Базовые CRUD операции через API', () => {
        it('should create, read, update and delete users', async () => {
            // create user
            const createResponse = await makeRequest('POST', '/api/users', {
                username: 'testuser',
                email: 'test@example.com',
                isActive: true,
                role: 'user',
            })

            expect(createResponse.status).toBe(201)
            expect(createResponse.data.username).toBe('testuser')
            expect(createResponse.data.id).toBeDefined()

            const userId_1 = createResponse.data.id

            const createResponse_2 = await makeRequest('POST', '/api/users', {
                username: 'testuser_2',
                email: 'test2@example.com',
                isActive: true,
                role: 'admin',
            })
            // const role_2 = createResponse_2.data.role

            // read user
            const readResponse = await makeRequest(
                'GET',
                `/api/users/${userId_1}`,
            )
            expect(readResponse.status).toBe(200)
            expect(readResponse.data.id).toBe(userId_1)
            expect(readResponse.data.username).toBe('testuser')

            let readResponse_2 = await makeRequest(
                'GET',
                `/api/users?limit=100`,
            )

            // logTest(true, 'readResponse_2', readResponse_2.data)

            const adminUser = readResponse_2.data.users.find(
                (user: User) => user.role === 'admin',
            )
            expect(adminUser).toBeDefined()
            expect(adminUser.id).toBe(createResponse_2.data.id)
            expect(adminUser.username).toBe('testuser_2')
            expect(adminUser.role).toBe('admin')

            // update user
            const updateResponse = await makeRequest(
                'PUT',
                `/api/users/${userId_1}`,
                {
                    email: 'updated@example.com',
                    isActive: false,
                },
            )
            readResponse_2 = await makeRequest('GET', `/api/users?limit=100`)

            // logTest(true, 'readResponse_2', readResponse_2.data)

            const updateUser = readResponse_2.data.users.find(
                (user: User) => user.id === userId_1,
            )
            expect(updateUser).toBeDefined()
            expect(updateUser.email).toBe('updated@example.com')
            expect(updateUser.isActive).toBe(false)

            expect(updateResponse.status).toBe(200)
            expect(updateResponse.data.email).toBe('updated@example.com')
            expect(updateResponse.data.isActive).toBe(false)

            // delete user
            const deleteResponse = await makeRequest(
                'DELETE',
                `/api/users/${userId_1}`,
            )
            expect(deleteResponse.status).toBe(200)
            expect(deleteResponse.data.message).toBe('Пользователь удален')

            // check that user is deleted
            const notFoundResponse = await makeRequest(
                'GET',
                `/api/users/${userId_1}`,
            )
            expect(notFoundResponse.status).toBe(404)
            readResponse_2 = await makeRequest('GET', `/api/users?limit=100`)

            // logTest(true, 'readResponse_2', readResponse_2.data)

            const deletedUser = readResponse_2.data.users.find(
                (user: User) => user.id === userId_1,
            )
            expect(deletedUser).toBeUndefined()
        },100000000)

        it('should work with products and orders', async () => {
            // create seller
            const sellerResponse = await makeRequest('POST', '/api/users', {
                username: 'seller',
                email: 'seller@example.com',
                isActive: true,
                role: 'seller',
            })
            const sellerId = sellerResponse.data.id

            // create product
            const productResponse = await makeRequest('POST', '/api/products', {
                name: 'Test Product',
                price: 100,
                category: 'electronics',
                inStock: true,
                sellerId,
            })
            expect(productResponse.status).toBe(201)
            const productId = productResponse.data.id

            // create buyer
            const buyerResponse = await makeRequest('POST', '/api/users', {
                username: 'buyer',
                email: 'buyer@example.com',
                isActive: true,
                role: 'user',
            })
            const buyerId = buyerResponse.data.id

            // create order
            const orderResponse = await makeRequest('POST', '/api/orders', {
                id: 1,
                userId: buyerId,
                items: [
                    {
                        productId,
                        quantity: 2,
                        price: 100,
                    },
                ],
            })
            expect(orderResponse.status).toBe(201)
            const orderId = orderResponse.data.id

            // update order status
            const statusResponse = await makeRequest(
                'PUT',
                `/api/orders/${orderId}/status`,
                {
                    status: 'confirmed',
                },
            )
            expect(statusResponse.status).toBe(200)
            expect(statusResponse.data.status).toBe('confirmed')

            // create order
            const orderResponse_2 = await makeRequest('POST', '/api/orders', {
                id: 2,
                userId: buyerId,
                items: [
                    {
                        productId,
                        quantity: 5,
                        price: 500,
                    },
                    {
                        productId,
                        quantity: 3,
                        price: 300,
                    },
                ],
            })
            expect(orderResponse_2.status).toBe(201)
            
            // read order
            const readOrderResponse = await makeRequest('GET', `/api/orders`)
            expect(readOrderResponse.status).toBe(200)
        })
    })

    describe('Concurrent operations', () => {
        it('should handle multiple concurrent requests to create users', async () => {
            const count = 5

            const requests = Array.from({ length: count }, (_, i) => ({
                method: 'POST',
                endpoint: '/api/users',
                data: {
                    username: `concurrent_user_${i}`,
                    email:
                        Math.random() < 0.05
                            ? `user${i}@error.com`
                            : `user${i}@example.com`,
                    isActive: true,
                    role: 'user',
                },
            }))

            const startTime = Date.now()
            const results = await makeConcurrentRequests(requests, 5)
            const endTime = Date.now()

            logTest(
                true,
                `Время выполнения ${requests.length} запросов: ${
                    endTime - startTime
                }ms`,
            )

            // logTest(true, `results:`, results)
            const lengthSuccess = requests.filter(
                (req) => !req.data.email.includes('error.com'),
            ).length
            // logTest(true, 'lengthSuccess', lengthSuccess)
            // logTest(true, 'results', results)
            // logTest(true, 'results.filter((r) => r.value.status === 201)', results.filter((r) => r.value.status === 201))

            // check that all requests with no error.com in email are successful
            const successResults = results.filter(
                (r) =>
                    r.value.status === 201 &&
                    !r.value.data.email.includes('error.com'),
            )
            expect(lengthSuccess).toBe(successResults.length)

            // Check that all users are created
            const allUsersResponse = await makeRequest(
                'GET',
                '/api/users?limit=100',
            )
            logTest(true, 'allUsersResponse', allUsersResponse)
            logTest(true, 'lengthSuccess', lengthSuccess)
            logTest(
                true,
                'allUsersResponse.data.users.length',
                allUsersResponse.data.users.length,
            )
            expect(allUsersResponse.data.total).toBe(lengthSuccess)

            // Check that all users have unique IDs
            const userIds = successResults.map((r) => r.value.data.id)
            const uniqueIds = new Set(userIds)
            expect(uniqueIds.size).toBe(userIds.length)
        })

        it('should handle concurrent read and update operations', async () => {
            // create test user
            const createResponse = await makeRequest('POST', '/api/users', {
                username: 'concurrent_test_user',
                email: 'concurrent@example.com',
                isActive: true,
                role: 'user',
            })
            const userId = createResponse.data.id

            // create mixed requests: read and update
            const requests: { method: string; endpoint: string; data?: any }[] =
                []

            // n read requests
            const n = 10
            for (let i = 0; i < n; i++) {
                requests.push({
                    method: 'GET',
                    endpoint: `/api/users/${userId}`,
                })
            }

            // m update requests
            const m = 10
            for (let i = 0; i < m; i++) {
                requests.push({
                    method: 'PUT',
                    endpoint: `/api/users/${userId}`,
                    data: {
                        lastLogin: Date.now() + i,
                    },
                })
            }

            // shuffle requests
            for (let i = requests.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1))
                ;[requests[i], requests[j]] = [requests[j], requests[i]]
            }

            const results = await makeConcurrentRequests(requests, 8)

            // check that all requests are successful
            const readResults = results.filter(
                (r) =>
                    r.value.data &&
                    r.value.data.username === 'concurrent_test_user',
            )
            const updateResults = results.filter((r) => r.value.data?.lastLogin)

            expect(readResults.length).toBeGreaterThan(0)
            expect(updateResults.length).toBeGreaterThan(0)

            // Проверяем финальное состояние
            const finalResponse = await makeRequest(
                'GET',
                `/api/users/${userId}`,
            )
            expect(finalResponse.status).toBe(200)
            expect(finalResponse.data.lastLogin).toBeDefined()
        })

        it('should handle partitioned data correctly when accessed concurrently', async () => {
            // create several users
            const users: User[] = []
            const n = 5
            for (let i = 0; i < n; i++) {
                const response = await makeRequest('POST', '/api/users', {
                    username: `partition_user_${i}`,
                    email: `partition${i}@example.com`,
                    isActive: true,
                    role: 'user',
                })
                users.push(response.data)
            }

            // create products
            const products: Product[] = []
            for (let i = 0; i < 3; i++) {
                const response = await makeRequest('POST', '/api/products', {
                    name: `Product ${i}`,
                    price: 50 + i * 10,
                    category: 'test',
                    inStock: true,
                    sellerId: users[0].id,
                })
                products.push(response.data)
            }

            // create concurrent orders from different users
            const orderRequests: {
                method: string
                endpoint: string
                data?: any
            }[] = []
            const orderCount = 15
            for (let i = 0; i < orderCount; i++) {
                const userId = users[i % users.length].id
                const productId = products[i % products.length].id

                orderRequests.push({
                    method: 'POST',
                    endpoint: '/api/orders',
                    data: {
                        id: (i+1)*1,
                        userId,
                        items: [
                            {
                                productId,
                                quantity: 1 + (i % 3),
                                price: products[i % products.length].price,
                            },
                        ],
                    },
                })
            }

            const orderResults = await makeConcurrentRequests(orderRequests, 6)
            expect(orderResults.every((r) => r.value.status === 201)).toBe(true)

            // check that orders are created in the correct partitions
            for (const user of users) {
                const userOrdersResponse = await makeRequest(
                    'GET',
                    `/api/orders?userId=${user.id}`,
                )
                expect(userOrdersResponse.data.length).toBeGreaterThan(0)

                // check that all orders belong to this user
                userOrdersResponse.data.forEach((order: Order) => {
                    expect(order.userId).toBe(user.id)
                })
            }
        })
    })

    describe('Error handling and edge cases', () => {
        it('should correctly handle non-existent resources when accessed concurrently', async () => {
            const requests: { method: string; endpoint: string; data?: any }[] =
                []

            // mix requests to existing and non-existing resources
            for (let i = 0; i < 20; i++) {
                if (i % 2 === 0) {
                    // request to non-existing user
                    requests.push({
                        method: 'GET',
                        endpoint: `/api/users/${999999 + i}`,
                    })
                } else {
                    // create new user
                    requests.push({
                        method: 'POST',
                        endpoint: '/api/users',
                        data: {
                            username: `error_test_user_${i}`,
                            email: `error${i}@example.com`,
                            isActive: true,
                            role: 'user',
                        },
                    })
                }
            }

            const results = await makeConcurrentRequests(requests, 5)

            // check that requests to non-existing resources return 404
            const notFoundResults = results.filter(
                (r) => r.value.status === 404,
            )
            expect(notFoundResults.length).toBeGreaterThan(0)

            // check that creation of users was successful
            const createdResults = results.filter((r) => r.value.status === 201)
            expect(createdResults.length).toBeGreaterThan(0)
        })

        it('должен корректно обрабатывать некорректные данные при конкурентном доступе', async () => {
            const requests: { method: string; endpoint: string; data?: any }[] =
                []

            // Создаем смешанные запросы с корректными и некорректными данными
            for (let i = 0; i < 15; i++) {
                if (i % 3 === 0) {
                    // Корректный запрос
                    requests.push({
                        method: 'POST',
                        endpoint: '/api/users',
                        data: {
                            username: `valid_user_${i}`,
                            email: `valid${i}@example.com`,
                            isActive: true,
                            role: 'user',
                        },
                    })
                } else if (i % 3 === 1) {
                    // Запрос с некорректными данными (отсутствует обязательное поле)
                    requests.push({
                        method: 'POST',
                        endpoint: '/api/users',
                        data: {
                            email: `invalid${i}@example.com`,
                            // Отсутствует username
                        },
                    })
                } else {
                    // Запрос с некорректным методом
                    requests.push({
                        method: 'PUT',
                        endpoint: '/api/users/999',
                        data: {
                            invalidField: 'invalid_value',
                        },
                    })
                }
            }

            const results = await makeConcurrentRequests(requests, 4)
            logTest(
                true,
                'results',
                results.map((r) => r.value.status),
            )
            // Проверяем, что корректные запросы прошли успешно
            const validResults = results.filter((r) => r.value.status === 201)
            expect(validResults.length).toBeGreaterThan(0)

            // Проверяем, что некорректные запросы обработаны корректно
            const errorResults = results.filter((r) => r.value.status >= 400)
            expect(errorResults.length).toBeGreaterThan(0)
        })
    })

    describe('Complex scenarios', () => {
        it('should correctly work with cache under high load', async () => {
            // create users for cache testing
            const users: User[] = []
            const count = 10
            for (let i = 0; i < count; i++) {
                const response = await makeRequest('POST', '/api/users', {
                    username: `cache_user_${i}`,
                    email: `cache${i}@example.com`,
                    isActive: true,
                    role: 'user',
                })
                users.push(response.data)
            }

            // Создаем множество запросов на чтение одних и тех же пользователей
            const readRequests: {
                method: string
                endpoint: string
                data?: any
            }[] = []
            const readCount = 50
            for (let i = 0; i < readCount; i++) {
                const userId = users[i % users.length].id
                readRequests.push({
                    method: 'GET',
                    endpoint: `/api/users/${userId}`,
                })
            }

            const startTime = Date.now()
            const readResults = await makeConcurrentRequests(readRequests, 10)
            const endTime = Date.now()

            logTest(
                true,
                `Время выполнения ${readRequests.length} запросов на чтение: ${
                    endTime - startTime
                }ms`,
            )
            logTest(
                true,
                'readResults',
                readResults.map((r) => r.value.data.id),
            )
            expect(readResults.every((r) => r.value.status === 200)).toBe(true)

            // check that cache is working (second request should be faster)
            const cacheTestStart = Date.now()
            await makeConcurrentRequests(readRequests.slice(0, 10), 5)
            const cacheTestEnd = Date.now()

            logTest(
                true,
                `Время выполнения 10 кэшированных запросов: ${
                    cacheTestEnd - cacheTestStart
                }ms`,
            )

            // Второй запрос должен быть быстрее первого
            expect(cacheTestEnd - cacheTestStart).toBeLessThan(
                endTime - startTime,
            )
        })

        it('should handle the full lifecycle of an order with concurrent operations', async () => {

            // create infrastructure
            const sellerResponse = await makeRequest('POST', '/api/users', {
                username: 'ecommerce_seller',
                email: 'seller@ecommerce.com',
                isActive: true,
                role: 'seller',
            })
            const sellerId = sellerResponse.data.id

            const buyerResponse = await makeRequest('POST', '/api/users', {
                username: 'ecommerce_buyer',
                email: 'buyer@ecommerce.com',
                isActive: true,
                role: 'user',
            })
            const buyerId = buyerResponse.data.id

            // Создаем несколько продуктов
            const products: Product[] = []
            const productCount = 5
            for (let i = 0; i < productCount; i++) {
                const response = await makeRequest('POST', '/api/products', {
                    name: `E-commerce Product ${i}`,
                    price: 100 + i * 25,
                    category: 'electronics',
                    inStock: true,
                    sellerId,
                })
                products.push(response.data)
            }
            
            // Создаем несколько заказов одновременно
            const orderRequests: {
                method: string
                endpoint: string
                data?: any
            }[] = []
            const orderCount = 8
            for (let i = 0; i < orderCount; i++) {
                orderRequests.push({
                    method: 'POST',
                    endpoint: '/api/orders',
                    data: {
                        id: (i + 1) * 10,
                        userId: buyerId,
                        items: [
                            {
                                productId: products[i % products.length].id,
                                quantity: 1 + (i % 3),
                                price: products[i % products.length].price,
                            },
                        ],
                    },
                })
            }

            const orderResults = await makeConcurrentRequests(orderRequests, 4)
            // logTest(true, 'orderResults', JSON.stringify(orderResults, null, 2))
            logTest(
                true,
                'orderResults compact',
                orderResults,
                orderResults.map((r) => r.value.data.id),
            )
            expect(orderResults.every((r) => r.value.status === 201)).toBe(true)

            const orders = await makeRequest('GET', '/api/orders')
            logTest(true, 'orders', JSON.stringify(orders, null, 2))

            const orderIds = orders.data.map((r: Order) => r.id)
            // logTest(true, 'orderIds', orderIds)
            // simulate order processing: update statuses concurrently
            const statuses: Order['status'][] = [
                // 'confirmed',
                'shipped',
                // 'delivered',
            ]

            const statusRequests: {
                method: string
                endpoint: string
                data?: any
            }[] = []

            for (const orderId of orderIds) {
                for (const status of statuses) {
                    statusRequests.push({
                        method: 'PUT',
                        endpoint: `/api/orders/${orderId}/status`,
                        data: { status },
                    })
                }
            }

            // execute status updates concurrently
            const statusResults = await makeConcurrentRequests(
                statusRequests,
                6,
            )
            logTest(true, 'statusResults', statusResults)
            expect(statusResults.every((r) => r.value.status === 200)).toBe(
                true,
            )

            // check final state
            const finalOrdersResponse = await makeRequest(
                'GET',
                `/api/orders?userId=${buyerId}`,
            )
            expect(finalOrdersResponse.data.length).toBe(orderCount)

            // all orders should be in status 'shipped'
            finalOrdersResponse.data.forEach((order: Order) => {
                expect(order.status).toBe('shipped')
            })
        })
    })
})
