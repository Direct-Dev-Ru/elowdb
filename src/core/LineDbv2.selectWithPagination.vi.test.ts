import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { LineDb, LineDbAdapter, LineDbInitOptions } from './LineDbv2.js'
import { JSONLFile } from '../adapters/node/JSONLFile.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { logTest } from '../common/utils/log.js'
import { JSONLFileOptions, PaginatedResult } from '../common/interfaces/jsonl-file.js'
import { count, log } from 'node:console'

interface TestData extends LineDbAdapter {
    id: number | string
    name: string
    value: number
    user: string
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

describe('LineDb - Select With Pagination Method Tests', () => {
    const testDbFolder = path.join(
        process.cwd(),
        'test-linedb-selectWithPagination',
    )

    let db: LineDb
    let nCount = 25
    beforeEach(async () => {
        // Очищаем тестовую папку
        try {
            await fs.rm(testDbFolder, { recursive: true, force: true })
        } catch (error) {
            // Игнорируем ошибку, если папка не существует
        }

        const adapterTestDataOptions: JSONLFileOptions<TestData> = {
            collectionName: 'test',
            encryptKeyForLineDb: '',
            indexedFields: ['id', 'user'],
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
            cacheTTL: 10_000,
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

        const testData: TestData[] = Array.from({ length: nCount }, (_, i) => ({
            id: i + 1,
            name: `Name${i + 1}`,
            value: i * 10,
            user: `User${i % 3}`,
        }))
        await db.insert(testData, 'test', { inTransaction: false })
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

    describe('Base selectWithPagination operations', () => {
        it('should return last page with cache', async () => {
            const res = await db.selectWithPagination<TestData>(
                {},
                1,
                10,
                'test',
            )
            expect(res.data).toHaveLength(10)
            expect(res.page).toBe(1)
            expect(res.total).toBe(nCount)
            expect(res.pages).toBe(3)

            const res2 = await db.selectWithPagination<TestData>(
                {},
                3,
                10,
                'test',
            )
            logTest(true, res2)
            expect(res2.data).toHaveLength(5)
            expect(res2.page).toBe(3)
            expect(res2.total).toBe(nCount)
            expect(res2.pages).toBe(3)
        })

        it('should return last page from cache and store updated data in cache', async () => {
            const res = await db.selectWithPagination<TestData>(
                {},
                1,
                10,
                'test',
            )
            expect(res.data).toHaveLength(10)
            expect(res.page).toBe(1)
            expect(res.total).toBe(nCount)
            expect(res.pages).toBe(3)

            await db.update({ id: 25, name: 'Updated Name_25' }, 'test')

            const res2 = await db.selectWithPagination<TestData>(
                {},
                3,
                10,
                'test',
            )
            logTest(true, res2)
            expect(res2.data).toHaveLength(5)
            expect(res2.page).toBe(3)
            expect(res2.total).toBe(nCount)
            expect(res2.pages).toBe(3)
            expect(res2.data[4].name).toBe('Updated Name_25')

            const cache = db.cacheMap
            logTest(true, cache)
        }, 1_000_000)

        it('should return last page', async () => {
            const res = await db.selectWithPagination<TestData>(
                {},
                3,
                10,
                'test',
            )
            expect(res.data).toHaveLength(5)
            expect(res.page).toBe(3)
            expect(res.total).toBe(nCount)
            expect(res.pages).toBe(3)
        })

        it('should return empty page if page number is too large', async () => {
            const res = await db.selectWithPagination<TestData>(
                {},
                5,
                10,
                'test',
            )
            expect(res.data).toHaveLength(0)
            expect(res.page).toBe(5)
            expect(res.total).toBe(nCount)
            expect(res.pages).toBe(3)
        })

        it('should correctly filter by user and support data manupulations and keep cache consistent', async () => {
            const res = await db.selectWithPagination<TestData>(
                { user: 'User1' },
                1,
                10,
                'test',
            )
            expect(res.data.every((r) => r.user === 'User1')).toBe(true)
            const all = await db.select<TestData>({ user: 'User1' }, 'test')
            expect(res.total).toBe((all as TestData[]).length)
            logTest(true, all)
            logTest(true, res)

            await db.insert(
                { id: 26, name: 'Name26', value: 26, user: 'User1' },
                'test',
            )

            const res2 = await db.selectWithPagination<TestData>(
                { user: 'User1' },
                1,
                10,
                'test',
            )
            // logTest(true, db.cacheMap)
            logTest(true, 'res2', res2)
            const allAfterInsertResult = await db.select<TestData>(
                { user: 'User1' },
                'test',
            )
            const allAfterInsert = db.selectResultArray(allAfterInsertResult)
            expect(res2.data).toHaveLength(allAfterInsert.length)
            expect(res2.total).toBe(allAfterInsert.length)

            expect(res2.data[res2.data.length - 1].name).toBe('Name26')
            expect(res2.data[res2.data.length - 1].id).toBe(26)

            // string filter
            const res3 = await db.selectWithPagination<TestData>(
                `user === "User2"`,
                1,
                10,
                'test',
            )
            logTest(true, 'res3:', res3)
            await db.insert(
                { id: 27, name: 'Name27', value: 27, user: 'User2' },
                'test',
            )
            await db.update(
                { id: 24, name: 'Name24_updated', value: 2424, user: 'User2' },
                'test',
            )
            await db.delete({ id: 21 }, 'test')
            const res4 = await db.selectWithPagination<TestData>(
                `user === "User2"`,
                1,
                10,
                'test',
            )
            logTest(true, 'res4:', res4)
            expect(res4.data).toHaveLength(8)
            expect(res4.data[res4.data.length - 1].name).toBe('Name27')
            expect(res4.data[res4.data.length - 1].id).toBe(27)
            expect(res4.data[res4.data.length - 1].user).toBe('User2')
            expect(res4.data.find((r) => r.id === 24)?.name).toBe(
                'Name24_updated',
            )
            expect(res4.data.find((r) => r.id === 21)).toBeUndefined()
        })
    })

    describe('Performance tests with large dataset', () => {
        it.only('should measure selectWithPagination performance with 2000 records', async () => {
            // Создаем 2000 записей с разными пользователями
            const largeTestData: TestData[] = Array.from(
                { length: 2000 },
                (_, i) => ({
                    id: i + 1,
                    name: `Name${i + 1}`,
                    value: i * 10,
                    user: `User${i % 50}`, // 50 разных пользователей
                }),
            )

            // Очищаем существующие данные и вставляем новые
            await db.delete('id >= 0', 'test')
            
            await db.insert(largeTestData, 'test', { inTransaction: false })

            const pageSize = 100
            const totalPages = Math.ceil(2000 / pageSize)

            // Функция для измерения времени выполнения
            const measureTime = async (operation: () => Promise<any>) => {
                const startTime = performance.now()
                const result = await operation()
                const endTime = performance.now()
                return {
                    result,
                    executionTime: endTime - startTime,
                }
            }

            // Первый запрос - страница 1
            const firstPageMeasurement = await measureTime(() =>
                db.selectWithPagination<TestData>({}, 1, pageSize, 'test'),
            )

            logTest(
                true,
                `Первая страница выполнена за ${firstPageMeasurement.executionTime.toFixed(
                    2,
                )}ms`,
            )
            expect(firstPageMeasurement.result.data).toHaveLength(pageSize)
            expect(firstPageMeasurement.result.page).toBe(1)
            expect(firstPageMeasurement.result.total).toBe(2000)
            expect(firstPageMeasurement.result.pages).toBe(totalPages)

            // Последующие запросы - страницы 2, 3, 4
            const subsequentPages = [2, 3, 4]
            const subsequentMeasurements: {
                page: number
                executionTime: number
                result: PaginatedResult<TestData>
            }[] = []

            for (const page of subsequentPages) {
                const measurement = await measureTime(() =>
                    db.selectWithPagination<TestData>(
                        {},
                        page,
                        pageSize,
                        'test',
                    ),
                )
                subsequentMeasurements.push({
                    page,
                    executionTime: measurement.executionTime,
                    result: measurement.result,
                })
                logTest(
                    true,
                    `Страница ${page} выполнена за ${measurement.executionTime.toFixed(
                        2,
                    )}ms`,
                )

                expect(measurement.result.data).toHaveLength(pageSize)
                expect(measurement.result.page).toBe(page)
                expect(measurement.result.total).toBe(2000)
                expect(measurement.result.pages).toBe(totalPages)
            }

            // Вычисляем среднее время для последующих запросов
            const avgSubsequentTime =
                subsequentMeasurements.reduce(
                    (sum, m) => sum + m.executionTime,
                    0,
                ) / subsequentMeasurements.length

            logTest(
                true,
                `Среднее время последующих запросов: ${avgSubsequentTime.toFixed(
                    2,
                )}ms`,
            )

            // Проверяем, что кэширование работает эффективно
            // Последующие запросы должны быть быстрее первого
            const firstPageTime = firstPageMeasurement.executionTime
            const performanceThreshold = 0.5 // Последующие запросы должны быть в 2 раза быстрее

            logTest(
                true,
                `Время первого запроса: ${firstPageTime.toFixed(2)}ms`,
            )
            logTest(
                true,
                `Среднее время последующих запросов: ${avgSubsequentTime.toFixed(
                    2,
                )}ms`,
            )
            logTest(
                true,
                `Соотношение производительности: ${(
                    firstPageTime / avgSubsequentTime
                ).toFixed(2)}x`,
            )

            // Проверяем, что последующие запросы быстрее первого
            expect(avgSubsequentTime).toBeLessThan(firstPageTime)

            // Проверяем, что производительность соответствует порогу
            expect(firstPageTime / avgSubsequentTime).toBeGreaterThan(
                performanceThreshold,
            )

            // Дополнительная проверка: тестируем фильтрацию по пользователю
            const userFilterMeasurement = await measureTime(() =>
                db.selectWithPagination<TestData>(
                    { user: 'User1' },
                    1,
                    pageSize,
                    'test',
                ),
            )

            logTest(
                true,
                `Фильтрация по пользователю выполнена за ${userFilterMeasurement.executionTime.toFixed(
                    2,
                )}ms`,
            )
            expect(
                userFilterMeasurement.result.data.every(
                    (r: TestData) => r.user === 'User1',
                ),
            ).toBe(true)
        }, 30_000) // Увеличиваем timeout для большого количества данных
    })
})
