import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { JSONLFile } from './JSONLFile.js'
import { TestData } from '../../common/interfaces/test-data.js'

export const sortFn = (a: TestData, b: TestData) =>
    (a.id as string).localeCompare(b.id as string)

function getRandom(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1) + min)
}

function logTest(log: boolean = true, ...args: unknown[]): void {
    if (process.env.NODE_ENV === 'test' && log) {
        console.log(...args)
    }
}

function shouldKeepTestFiles(): boolean {
    const keepFiles = process.env.KEEP_TEST_FILES
    return keepFiles === 'true' || keepFiles === '1'
}

async function safeUnlink(
    filePath: string,
    force: boolean = false,
): Promise<void> {
    if (!shouldKeepTestFiles() || force) {
        try {
            await fs.promises.unlink(filePath)
        } catch (error) {
            // Игнорируем ошибку, если файл не существует
        }
    }
}

describe('JSONLFile Concurrent Transactions', () => {
    const testDir = path.join('test-data-concurrent')
    const testFileMain = path.join(testDir, 'concurrent-test')
    let jsonlFile: JSONLFile<TestData>

    beforeEach(async () => {
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true })
        }
    })

    afterAll(async () => {
        if (!shouldKeepTestFiles()) {
            const files = await fs.promises.readdir(testDir)
            await Promise.all(
                files.map((file) => safeUnlink(path.join(testDir, file))),
            )
        }
    })

    describe('Concurrent Insert Operations', () => {
        it('01.should handle concurrent insert transactions', async () => {
            const testFile = `${testFileMain}_01_insert.jsonl`
            await safeUnlink(testFile, true)

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const initialData: TestData = {
                id: 'init',
                name: 'Initial',
                value: 0,
                user: 'System',
            }
            await jsonlFile.write(initialData)

            const concurrentCount = 100
            const testData: TestData[] = Array.from(
                { length: concurrentCount },
                (_, i) => ({
                    id: `id_${i}`,
                    name: `Test ${i}`,
                    value: i * 10,
                    user: `User${i}`,
                }),
            )

            await Promise.allSettled(
                testData.map(async (data) => {
                    try {
                        return jsonlFile.withTransaction(
                            async (tx, opt) => {
                                await tx.insert(data, opt)
                            },
                            {
                                rollback: true,
                                timeout: 100_000,
                            },
                        )
                    } catch (error) {
                        console.error('Error in transaction:', error)
                        throw error
                    } finally {
                        await jsonlFile.endTransactionV2()
                    }
                }),
            )

            const result = await jsonlFile.select('')
            expect(result).toHaveLength(concurrentCount + 1)

            // Проверяем, что все записи уникальны
            const ids = result.map((r) => r.id)
            const uniqueIds = new Set(ids)
            expect(uniqueIds.size).toBe(result.length)
        })

        it('02.should handle concurrent insert transactions with conflicts', async () => {
            const testFile = `${testFileMain}_02_insert_conflicts.jsonl`
            await safeUnlink(testFile, true)

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const concurrentCount = 50
            const conflictingData: TestData[] = Array.from(
                { length: concurrentCount },
                (_, i) => ({
                    id: `conflict_${i % 10}`, // Только 10 уникальных ID
                    name: `Test ${i}`,
                    value: i * 10,
                    user: `User${i}`,
                }),
            )

            const results = await Promise.allSettled(
                conflictingData.map(async (data) => {
                    try {
                        return jsonlFile.withTransaction(
                            async (tx, opt) => {
                                await tx.insert(data, opt)
                            },
                            {
                                rollback: true,
                                timeout: 100_000,
                            },
                        )
                    } catch (error) {
                        return { error: error.message }
                    } finally {
                        await jsonlFile.endTransactionV2()
                    }
                }),
            )

            const result = await jsonlFile.select('')
            // Должно быть только 10 записей (по количеству уникальных ID)
            expect(result).toHaveLength(10)

            // Проверяем, что все ID уникальны
            const ids = result.map((r) => r.id)
            const uniqueIds = new Set(ids)
            expect(uniqueIds.size).toBe(10)
        })
    })

    describe('Concurrent Update Operations', () => {
        it('03.should handle concurrent update transactions', async () => {
            const testFile = `${testFileMain}_03_update.jsonl`
            await safeUnlink(testFile, true)

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const concurrentCount = 100
            const testData: TestData[] = Array.from(
                { length: concurrentCount },
                (_, i) => ({
                    id: `${i}`,
                    name: `Test ${i}`,
                    value: i * 10,
                    user: `User${i}`,
                }),
            )
            await jsonlFile.insert(testData)

            const updateData: Partial<TestData>[] = Array.from(
                { length: concurrentCount },
                (_, i) => ({
                    id: `${i}`,
                    name: `Updated ${i}`,
                    value: i * 100,
                }),
            )

            await Promise.allSettled(
                updateData.map(async (data) => {
                    return jsonlFile.withTransaction(async (tx, opt) => {
                        await tx.update(
                            { name: data.name, value: data.value },
                            { id: data.id },
                            opt,
                        )
                    })
                }),
            )

            const result = await jsonlFile.select('')
            expect(result).toHaveLength(concurrentCount)

            // Проверяем, что все записи обновлены
            result.forEach((record, index) => {
                expect(record.name).toBe(`Updated ${index}`)
                expect(record.value).toBe(index * 100)
            })
        })

        it('04.should handle concurrent update transactions with partial updates', async () => {
            const testFile = `${testFileMain}_04_update_partial.jsonl`
            await safeUnlink(testFile, true)

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const concurrentCount = 50
            const testData: TestData[] = Array.from(
                { length: concurrentCount },
                (_, i) => ({
                    id: `${i}`,
                    name: `Test ${i}`,
                    value: i * 10,
                    user: `User${i}`,
                }),
            )
            await jsonlFile.insert(testData)

            // Создаем разные типы обновлений
            const updateOperations = testData.map((data, index) => {
                if (index % 3 === 0) {
                    return jsonlFile.withTransaction(async (tx, opt) => {
                        await tx.update(
                            { name: `Updated ${index}` },
                            { id: data.id },
                            opt,
                        )
                    })
                } else if (index % 3 === 1) {
                    return jsonlFile.withTransaction(async (tx, opt) => {
                        await tx.update(
                            { value: index * 100 },
                            { id: data.id },
                            opt,
                        )
                    })
                } else {
                    return jsonlFile.withTransaction(async (tx, opt) => {
                        await tx.update(
                            { user: `UpdatedUser${index}` },
                            { id: data.id },
                            opt,
                        )
                    })
                }
            })

            await Promise.allSettled(updateOperations)

            const result = await jsonlFile.select('')
            expect(result).toHaveLength(concurrentCount)

            // Проверяем, что обновления применились
            result.forEach((record, index) => {
                if (index % 3 === 0) {
                    expect(record.name).toBe(`Updated ${index}`)
                } else if (index % 3 === 1) {
                    expect(record.value).toBe(index * 100)
                } else {
                    expect(record.user).toBe(`UpdatedUser${index}`)
                }
            })
        })
    })

    describe('Concurrent Delete Operations', () => {
        it('05.should handle concurrent delete transactions', async () => {
            const testFile = `${testFileMain}_05_delete.jsonl`
            await safeUnlink(testFile, true)

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const concurrentCount = 100
            const testData: TestData[] = Array.from(
                { length: concurrentCount },
                (_, i) => ({
                    id: `${i}`,
                    name: `Test ${i}`,
                    value: i * 10,
                    user: `User${i}`,
                }),
            )
            await jsonlFile.insert(testData)

            // Удаляем каждую вторую запись
            const deleteOperations = testData
                .filter((_, index) => index % 2 === 0)
                .map((data) => {
                    return jsonlFile.withTransaction(async (tx, opt) => {
                        await tx.delete({ id: data.id }, opt)
                    })
                })

            await Promise.allSettled(deleteOperations)

            const result = await jsonlFile.select('')
            expect(result).toHaveLength(concurrentCount / 2)

            // Проверяем, что удалены только четные записи
            result.forEach((record) => {
                const id = parseInt(record.id as string)
                expect(id % 2).toBe(1) // Остались только нечетные
            })
        })

        it('06.should handle concurrent delete transactions with filters', async () => {
            const testFile = `${testFileMain}_06_delete_filters.jsonl`
            await safeUnlink(testFile, true)

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const concurrentCount = 100
            const testData: TestData[] = Array.from(
                { length: concurrentCount },
                (_, i) => ({
                    id: `${i}`,
                    name: `Test ${i}`,
                    value: i * 10,
                    user: `User${i % 3}`, // 3 разных пользователя
                }),
            )
            await jsonlFile.insert(testData)

            // Удаляем записи по разным фильтрам конкурентно
            const deleteOperations = [
                jsonlFile.withTransaction(async (tx, opt) => {
                    await tx.delete({ user: 'User0' }, opt)
                }),
                jsonlFile.withTransaction(async (tx, opt) => {
                    await tx.delete({ user: 'User1' }, opt)
                }),
                jsonlFile.withTransaction(async (tx, opt) => {
                    await tx.delete({ user: 'User2' }, opt)
                }),
            ]

            await Promise.allSettled(deleteOperations)

            const result = await jsonlFile.select('')
            expect(result).toHaveLength(0) // Все записи должны быть удалены
        })
    })

    describe('Mixed Concurrent Operations', () => {
        it('07.should handle mixed concurrent operations (insert, update, delete)', async () => {
            const testFile = `${testFileMain}_07_mixed.jsonl`
            await safeUnlink(testFile, true)

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const initialData: TestData[] = Array.from(
                { length: 50 },
                (_, i) => ({
                    id: `${i}`,
                    name: `Initial ${i}`,
                    value: i * 10,
                    user: `User${i % 3}`,
                }),
            )
            await jsonlFile.insert(initialData)

            const operations: Promise<void>[] = []

            // Операции вставки
            for (let i = 50; i < 100; i++) {
                operations.push(
                    jsonlFile.withTransaction(async (tx, opt) => {
                        await tx.insert(
                            {
                                id: `${i}`,
                                name: `New ${i}`,
                                value: i * 10,
                                user: `User${i % 3}`,
                            },
                            opt,
                        )
                    }),
                )
            }

            // Операции обновления
            for (let i = 0; i < 25; i++) {
                operations.push(
                    jsonlFile.withTransaction(async (tx, opt) => {
                        await tx.update(
                            { name: `Updated ${i}`, value: i * 100 },
                            { id: `${i}` },
                            opt,
                        )
                    }),
                )
            }

            // Операции удаления
            for (let i = 25; i < 50; i++) {
                operations.push(
                    jsonlFile.withTransaction(async (tx, opt) => {
                        await tx.delete({ id: `${i}` }, opt)
                    }),
                )
            }

            await Promise.allSettled(operations)

            const result = await jsonlFile.select('')
            expect(result).toHaveLength(75) // 25 обновленных + 50 новых

            // Проверяем результаты
            result.forEach((record) => {
                const id = parseInt(record.id as string)
                if (id < 25) {
                    // Обновленные записи
                    expect(record.name).toBe(`Updated ${id}`)
                    expect(record.value).toBe(id * 100)
                } else if (id >= 50) {
                    // Новые записи
                    expect(record.name).toBe(`New ${id}`)
                    expect(record.value).toBe(id * 10)
                }
                // Записи с id 25-49 должны быть удалены
            })

            // Проверяем, что записи 25-49 удалены
            const deletedRecords = result.filter((r) => {
                const id = parseInt(r.id as string)
                return id >= 25 && id < 50
            })
            expect(deletedRecords).toHaveLength(0)
        })

        it('08.should handle complex mixed operations with rollbacks', async () => {
            const testFile = `${testFileMain}_08_mixed_rollback.jsonl`
            await safeUnlink(testFile, true)

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const initialData: TestData[] = Array.from(
                { length: 30 },
                (_, i) => ({
                    id: `${i}`,
                    name: `Initial ${i}`,
                    value: i * 10,
                    user: `User${i % 3}`,
                }),
            )
            await jsonlFile.insert(initialData)

            const operations: Promise<void>[] = []

            // Операции, которые должны выполниться успешно
            for (let i = 0; i < 10; i++) {
                operations.push(
                    jsonlFile.withTransaction(
                        async (tx, opt) => {
                            await tx.insert(
                                {
                                    id: `new_${i}`,
                                    name: `New ${i}`,
                                    value: i * 10,
                                    user: `User${i % 3}`,
                                },
                                opt,
                            )
                        },
                        {
                            rollback: true,
                            timeout: 10_000,
                        },
                    ),
                )
            }

            // Операции, которые должны завершиться с ошибкой и откатом
            for (let i = 0; i < 10; i++) {
                operations.push(
                    jsonlFile.withTransaction(
                        async (tx, opt) => {
                            await tx.insert(
                                {
                                    id: `error_${i}`,
                                    name: `Error ${i}`,
                                    value: i * 10,
                                    user: `User${i % 3}`,
                                },
                                opt,
                            )
                            // Имитируем ошибку
                            if (i % 2 === 0) {
                                throw new Error(`Simulated error for ${i}`)
                            }
                        },
                        {
                            rollback: true,
                            timeout: 10_000,
                        },
                    ),
                )
            }

            // Операции обновления
            for (let i = 0; i < 15; i++) {
                operations.push(
                    jsonlFile.withTransaction(
                        async (tx, opt) => {
                            await tx.update(
                                { name: `Updated ${i}`, value: i * 100 },
                                { id: `${i}` },
                                opt,
                            )
                        },
                        {
                            rollback: true,
                            timeout: 10_000,
                        },
                    ),
                )
            }

            const results = await Promise.allSettled(operations)

            // Подсчитываем успешные и неуспешные операции
            const successful = results.filter(
                (r) => r.status === 'fulfilled',
            ).length
            const failed = results.filter((r) => r.status === 'rejected').length

            expect(successful).toBeGreaterThan(0)
            expect(failed).toBeGreaterThan(0)

            const result = await jsonlFile.select('')

            // Проверяем, что записи с error_ префиксом добавлены только в количестве 5ти
            const errorRecords = result.filter((r) =>
                r.id.toString().startsWith('error_'),
            )
            expect(errorRecords).toHaveLength(5)

            // Проверяем, что записи с new_ префиксом добавлены
            const newRecords = result.filter((r) =>
                r.id.toString().startsWith('new_'),
            )
            expect(newRecords.length).toBeGreaterThan(0)
        })
    })

    describe('Error Handling and Rollbacks', () => {
        it('09.should handle transaction rollback on error', async () => {
            const testFile = `${testFileMain}_09_rollback.jsonl`
            await safeUnlink(testFile, true)

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const initialData: TestData = {
                id: '1',
                name: 'Initial',
                value: 42,
                user: 'User1',
            }
            await jsonlFile.write(initialData)

            // Попытка выполнить транзакцию с ошибкой
            try {
                await jsonlFile.withTransaction(async (tx, opt) => {
                    await tx.insert(
                        {
                            id: '2',
                            name: 'Should be rolled back',
                            value: 100,
                            user: 'User2',
                        },
                        opt,
                    )
                    throw new Error('Simulated transaction error')
                })
            } catch (error) {
                expect(error).toBeInstanceOf(Error)
                // expect(error.message).toBe('Simulated transaction error')
            }

            const result = await jsonlFile.select('')
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual(initialData)
        })

        it('10.should handle partial rollback in complex transactions', async () => {
            const testFile = `${testFileMain}_10_partial_rollback.jsonl`
            await safeUnlink(testFile, true)

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const initialData: TestData[] = Array.from(
                { length: 10 },
                (_, i) => ({
                    id: `${i}`,
                    name: `Initial ${i}`,
                    value: i * 10,
                    user: `User${i % 3}`,
                }),
            )
            await jsonlFile.insert(initialData)

            // Создаем транзакцию, которая выполнит несколько операций, но завершится ошибкой
            try {
                await jsonlFile.withTransaction(async (tx, opt) => {
                    // Успешные операции
                    await tx.insert(
                        {
                            id: 'new_1',
                            name: 'New 1',
                            value: 100,
                            user: 'User1',
                        },
                        opt,
                    )

                    await tx.update(
                        { name: 'Updated 0', value: 1000 },
                        { id: '0' },
                        opt,
                    )

                    await tx.delete({ id: '1' }, opt)

                    // Операция, которая вызовет ошибку
                    throw new Error('Complex transaction error')
                })
            } catch (error) {
                expect(error).toBeInstanceOf(Error)
            }

            const result = await jsonlFile.select('')
            // Все изменения должны быть откачены
            expect(result).toHaveLength(10)
            expect(result).toEqual(initialData)
        })

        it.skip('11.should handle timeout in concurrent transactions', async () => {
            const testFile = `${testFileMain}_11_timeout.jsonl`
            await safeUnlink(testFile, true)

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const initialData: TestData = {
                id: '1',
                name: 'Initial',
                value: 42,
                user: 'User1',
            }
            await jsonlFile.write(initialData)

            // Создаем транзакцию с очень коротким таймаутом
            try {
                await jsonlFile.withTransaction(
                    async (tx, opt) => {
                        await tx.insert(
                            {
                                id: '2',
                                name: 'Timeout test',
                                value: 100,
                                user: 'User2',
                            },
                            opt,
                        )
                        // Имитируем долгую операцию
                        await new Promise((resolve) => setTimeout(resolve, 200))
                    },
                    {
                        rollback: true,
                        timeout: 150, // Очень короткий таймаут
                    },
                )
            } catch (error) {
                expect(error).toBeInstanceOf(Error)
                expect(error.message).toContain('timeout')
            }

            const result = await jsonlFile.select('')
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual(initialData)
        })
    })

    describe('Stress Testing', () => {
        it('12.should handle high load concurrent operations', async () => {
            const testFile = `${testFileMain}_12_stress.jsonl`
            await safeUnlink(testFile, true)

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 1024,
            })
            await jsonlFile.init()

            const operationCount = 500
            const operations: Promise<void>[] = []

            // Создаем смесь операций
            for (let i = 0; i < operationCount; i++) {
                if (i % 4 === 0) {
                    // Вставка
                    operations.push(
                        jsonlFile.withTransaction(async (tx, opt) => {
                            await tx.insert(
                                {
                                    id: `stress_${i}`,
                                    name: `Stress ${i}`,
                                    value: i * 10,
                                    user: `User${i % 5}`,
                                },
                                opt,
                            )
                        }),
                    )
                } else if (i % 4 === 1) {
                    // Обновление (если запись существует)
                    operations.push(
                        jsonlFile.withTransaction(async (tx, opt) => {
                            const existing = await tx.select(
                                `id === "stress_${i - 1}"`,
                                opt,
                            )
                            if (existing.length > 0) {
                                await tx.update(
                                    { name: `Updated Stress ${i - 1}` },
                                    { id: `stress_${i - 1}` },
                                    opt,
                                )
                            }
                        }),
                    )
                } else if (i % 4 === 2) {
                    // Удаление
                    operations.push(
                        jsonlFile.withTransaction(async (tx, opt) => {
                            await tx.delete({ id: `stress_${i - 2}` }, opt)
                        }),
                    )
                } else {
                    // Чтение
                    operations.push(
                        jsonlFile.withTransaction(async (tx, opt) => {
                            await tx.select(`id === "stress_${i - 3}"`, opt)
                        }),
                    )
                }
            }

            const startTime = Date.now()
            const results = await Promise.allSettled(operations)
            const endTime = Date.now()

            const successful = results.filter(
                (r) => r.status === 'fulfilled',
            ).length
            const failed = results.filter((r) => r.status === 'rejected').length

            logTest(true, `Stress test completed in ${endTime - startTime}ms`)
            logTest(true, `Successful operations: ${successful}`)
            logTest(true, `Failed operations: ${failed}`)

            expect(successful).toBeGreaterThan(0)
            expect(endTime - startTime).toBeLessThan(30000) // Не более 30 секунд
        })

        it.skip('13.should handle concurrent transactions with large data', async () => {
            const testFile = `${testFileMain}_13_large_data.jsonl`
            await safeUnlink(testFile, true)

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 1024 * 1024, // 1MB
            })
            await jsonlFile.init()

            const largeDataSize = 20
            const operations: Promise<void>[] = []

            // Создаем операции с большими данными
            for (let i = 0; i < 10; i++) {
                operations.push(
                    jsonlFile.withTransaction(
                        async (tx, opt) => {
                            const largeData: TestData[] = Array.from(
                                { length: largeDataSize },
                                (_, j) => ({
                                    id: `large_${i}_${j}`,
                                    name: 'x'.repeat(1000), // Большая строка
                                    value: i * j,
                                    user: `User${i % 3}`,
                                }),
                            )
                            await tx.insert(largeData, opt)
                        },
                        {
                            rollback: true,
                            timeout: 55_000,
                        },
                    ),
                )
            }

            const startTime = Date.now()
            await Promise.allSettled(operations)
            const endTime = Date.now()

            const result = await jsonlFile.select('')
            expect(result.length).toBeGreaterThan(0)

            logTest(
                true,
                `Large data test completed in ${endTime - startTime}ms`,
            )
            expect(endTime - startTime).toBeLessThan(60000) // Не более 60 секунд
            await safeUnlink(testFile, true)
        })
    })
}, 2_000_000) // Увеличиваем таймаут для тестов
