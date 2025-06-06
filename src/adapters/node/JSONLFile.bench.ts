/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { log } from 'console'
import { promises as fs } from 'fs'
import path from 'path'
import { bench, describe, expect, test } from 'vitest'

import { LineDbAdapter } from '../../common/interfaces/jsonl-file'
import { JSONLFile } from './JSONLFile'

interface TestData extends LineDbAdapter {
    id: string
    name: string
    value: number
    user?: string
    timestamp?: number
}

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
            await fs.unlink(filePath)
        } catch (error) {
            // Игнорируем ошибку, если файл не существует
        }
    }
}

describe('JSONLFile Benchmarks', () => {
    const testFile = path.join('test-data-jsonl', 'test-bench.jsonl')
    let db: JSONLFile<TestData>
    let countUser1: number
    let countUser2: number
    let countUser3: number
    let countUser4: number
    let iterations: number = 1000
    const deleted: number[] = []

    const teardown = async (): Promise<void> => {
        try {
            await safeUnlink(testFile)
        } catch (err) {
            // Игнорируем ошибку если файл не существует
        }
    }

    bench(
        'write single record',
        async () => {
            const data: TestData = {
                id: '1',
                name: 'Test',
                value: 42,
            }
            await db.write(data)
        },
        {
            time: 1000,
            iterations: 10_000,
            setup: async () => {
                db = new JSONLFile<TestData>(testFile)
                await db.init(true)
            },
            teardown,
        },
    )

    bench(
        'write multiple records',
        async () => {
            const data: TestData[] = Array.from({ length: 100 }, (_, i) => ({
                id: `id-${i}`,
                name: `Test-${i}`,
                value: i,
            }))
            await db.write(data)
        },
        {
            time: 1000,
            iterations: 1_000,
            setup: async () => {
                db = new JSONLFile<TestData>(testFile)
                await db.init(true)
            },
            teardown,
        },
    )

    // read by id - base filtering
    iterations = 2000
    bench(
        'read by id - base filtering',
        async () => {
            const result = await db.readByFilter(
                { id: 'id-10' },
                {
                    strictCompare: false,
                    inTransaction: false,
                    filterType: 'base',
                },
            )
            // logTest(true, 'result: ', result)
            expect(result).toHaveLength(1)
        },
        {
            time: 1000,
            iterations,
            setup: async () => {
                db = new JSONLFile<TestData>(testFile, '', {
                    allocSize: 256 * 1,
                    indexedFields: ['id'],
                })
                await db.init(true)
                const count = iterations
                const data: TestData[] = Array.from(
                    { length: count },
                    (_, i) => ({
                        id: `id-${i}`,
                        name: `Test-${i}`,
                        value: i,
                    }),
                )
                await db.write(data)
            },
            teardown,
        },
    )

    // read by id - mongodb filtering
    iterations = 2000
    bench(
        'read by id - mongodb filtering',
        async () => {
            const result = await db.readByFilter(
                { id: { $eq: 'id-100' } } as Record<string, unknown>,
                {
                    inTransaction: false,
                    filterType: 'mongodb',
                },
            )
            // logTest(true, 'result: ', result)
            expect(result).toHaveLength(1)
        },
        {
            time: 1000,
            iterations,
            setup: async () => {
                db = new JSONLFile<TestData>(testFile, '', {
                    allocSize: 256 * 1,
                    indexedFields: ['id'],
                })
                await db.init(true)
                const count = iterations
                const data: TestData[] = Array.from(
                    { length: count },
                    (_, i) => ({
                        id: `id-${i}`,
                        name: `Test-${i}`,
                        value: i,
                    }),
                )
                await db.write(data)
            },
            teardown,
        },
    )

    // read by id - filtrex filtering
    iterations = 2000
    bench(
        'read by id - filtrex filtering',
        async () => {
            const result = await db.readByFilter('id === "id-100"', {
                inTransaction: false,
                filterType: 'filtrex',
            })
            // logTest(true, 'result: ', result)
            expect(result).toHaveLength(1)
        },
        {
            time: 1000,
            iterations,
            setup: async () => {
                db = new JSONLFile<TestData>(testFile, '', {
                    allocSize: 256 * 1,
                    indexedFields: ['id'],
                })
                await db.init(true)
                const count = iterations
                const data: TestData[] = Array.from(
                    { length: count },
                    (_, i) => ({
                        id: `id-${i}`,
                        name: `Test-${i}`,
                        value: i,
                    }),
                )
                await db.write(data)
            },
            teardown,
        },
    )

    // read many block
    // const indexedFieldsForReadMany: (keyof TestData)[] = ['id', 'user']
    const indexedFieldsForReadMany: (keyof TestData)[] = ['id']
    iterations = 500
    const recordsCount = 5000
    // read many by base filtering
    const setupReadMany = async () => {
        await safeUnlink(testFile)
        const count = recordsCount
        const data: TestData[] = Array.from({ length: count }, (_, i) => ({
            id: `id-${i}`,
            name: `Test-${i}`,
            value: i,
            user: `User${getRandom(1, 4)}`,
        }))
        countUser1 = data.filter((item) => item.user === 'User1').length
        countUser2 = data.filter((item) => item.user === 'User2').length
        countUser3 = data.filter((item) => item.user === 'User3').length
        countUser4 = data.filter((item) => item.user === 'User4').length

        db = new JSONLFile<TestData>(testFile, '', {
            allocSize: 256 * 1,
            indexedFields: indexedFieldsForReadMany,
            idFn: (data) =>
                indexedFieldsForReadMany.includes('user')
                    ? [`byId:${data.id}`, `byUser:${data.user}`]
                    : [`byId:${data.id}`],
        })
        await db.init(true)
        await db.write(data)
    }

    bench.only(
        'read many records - base filtering',
        async () => {
            const result = await db.readByFilter(
                { user: 'User1' },
                {
                    strictCompare: false,
                    inTransaction: false,
                    filterType: 'base',
                },
            )
            // logTest(true, 'result: ', result)
            expect(result).toHaveLength(countUser1)
        },
        {
            time: 1000,
            iterations,
            setup: setupReadMany,
            teardown: async () => {
                try {
                    await safeUnlink(testFile)
                } catch (err) {
                    // Игнорируем ошибку если файл не существует
                }
            },
        },
    )

    // read many records - mongodb filtering
    bench.only(
        'read many records - mongodb filtering',
        async () => {
            const result = await db.readByFilter(
                { user: { $eq: 'User1' } } as Record<string, unknown>,
                {
                    inTransaction: false,
                    filterType: 'mongodb',
                },
            )
            // logTest(true, 'result: ', result)
            expect(result).toHaveLength(countUser1)
        },
        {
            time: 1000,
            iterations,
            setup: setupReadMany,
            teardown,
        },
    )
    // read many records - filtrex filtering
    bench.only(
        'read many records - filtrex filtering',
        async () => {
            const result = await db.readByFilter('user === "User1"', {
                inTransaction: false,
                filterType: 'filtrex',
            })
            // logTest(true, 'result: ', result)
            expect(result).toHaveLength(countUser1)
        },
        {
            time: 1000,
            iterations,
            setup: setupReadMany,
            teardown,
        },
    )

    bench.only(
        'select with filter by full scan',
        async () => {
            const result = await db.select((item) => item.user === 'User1')
            expect(result.length).toBe(countUser1)
        },
        {
            time: 1000,
            iterations,
            setup: setupReadMany,
            teardown,
        },
    )

    bench(
        'delete records',
        async () => {
            let valueToDelete = getRandom(1, 1999)
            let needGeneration = true
            while (needGeneration) {
                if (deleted.includes(valueToDelete)) {
                    valueToDelete = getRandom(1, 1999)
                } else {
                    needGeneration = false
                }
            }
            logTest(true, 'valueToDelete: ', valueToDelete)
            const deletedCount = await db.delete({ value: valueToDelete })
            // const deletedCount = await db.delete({ id: `id-${valueToDelete}` })
            expect(deletedCount).toBeGreaterThan(0)
            deleted.push(valueToDelete)
        },
        {
            time: 1000,
            iterations: 100,
            setup: async () => {
                db = new JSONLFile<TestData>(testFile)
                await db.init(true)
                const data: TestData[] = Array.from(
                    { length: 2000 },
                    (_, i) => ({
                        id: `id-${i}`,
                        name: `Test-${i}`,
                        value: i,
                    }),
                )
                await db.write(data)
            },
            teardown: async () => {
                try {
                    // await fs.unlink(testFile)
                } catch (err) {
                    // Игнорируем ошибку если файл не существует
                }
            },
        },
    )

    bench(
        'single record update',
        async () => {
            const maxId = 5000
            const id = `id-${getRandom(1, maxId)}`
            const result = await db.update(
                [
                    {
                        name: 'Updated Test',
                        value: getRandom(1, maxId),
                        timestamp: Date.now(),
                    },
                ],
                {
                    id,
                },
            )
            // logTest(true, 'result: ', result)
            if (result.length !== 1) {
                // logTest(true, 'result: ', result, 'id', id)
            }
            expect(result).toHaveLength(1)
        },
        {
            time: 1000,
            iterations: 2500,
            setup: async () => {
                const maxId = 5000
                db = new JSONLFile<TestData>(testFile)
                await db.init(true)
                const data: TestData[] = Array.from(
                    { length: maxId },
                    (_, i) => ({
                        id: `id-${i + 1}`,
                        name: `name-from-${i + 1}`,
                        value: i,
                        user: `User${getRandom(1, 4)}`,
                        timestamp: Date.now(),
                    }),
                )
                await db.write(data)
            },
            teardown: async () => {
                try {
                    // await fs.unlink(testFile)
                } catch (err) {
                    // Игнорируем ошибку если файл не существует
                }
            },
        },
    )

    // bench(
    //     'update with indexes',
    //     async () => {
    //         const testFile = `${testFile}_update_index_bench.jsonl`
    //         try {
    //             await safeUnlink(testFile, true)
    //         } catch (error) {
    //             // Игнорируем ошибку, если файл не существует
    //         }

    //         const jsonlFile = new JSONLFile<TestData>(testFile, '', {
    //             allocSize: 512,
    //             idFn: (data) => [`byName:${data.name}`],
    //         })
    //         await jsonlFile.init()

    //         // Подготовка данных
    //         const initialData: TestData[] = Array.from(
    //             { length: 1000 },
    //             (_, i) => ({
    //                 id: i.toString(),
    //                 name: `Test${i % 100}`,
    //                 value: i,
    //             }),
    //         )
    //         await jsonlFile.write(initialData)

    //         const updateData: Partial<TestData> = {
    //             name: 'Updated Test',
    //             value: 1000,
    //         }

    //         // Бенчмарк
    //         const startTime = performance.now()
    //         for (let i = 0; i < 100; i++) {
    //             await jsonlFile.update(updateData, { id: i.toString() })
    //         }
    //         const endTime = performance.now()
    //         const avgTime = (endTime - startTime) / 100

    //         console.log(
    //             `Average indexed update time: ${avgTime.toFixed(2)}ms`,
    //         )
    //     },
    //     {
    //         time: 1000,
    //         iterations: 10,
    //     },
    // )
})
