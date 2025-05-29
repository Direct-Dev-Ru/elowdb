/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { log } from 'console'
import { promises as fs } from 'fs'
import path from 'path'
import { bench, describe, expect } from 'vitest'

import { LineDbAdapter } from '../../common/interfaces/jsonl-file'
import { JSONLFile } from './JSONLFile'

interface TestData extends LineDbAdapter {
    id: string
    name: string
    value: number
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
    const deleted: number[] = []
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
            teardown: async () => {
                try {
                    await fs.unlink(testFile)
                } catch (err) {
                    // Игнорируем ошибку если файл не существует
                }
            },
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
            teardown: async () => {
                try {
                    await fs.unlink(testFile)
                } catch (err) {
                    // Игнорируем ошибку если файл не существует
                }
            },
        },
    )

    bench(
        'read by id',
        async () => {
            const result = await db.readByData(
                { id: 'id-10' },
                { strictCompare: false, inTransaction: false },
            )
            logTest(true, 'result: ', result)
            expect(result).toHaveLength(1)
        },
        {
            time: 1000,
            iterations: 2000,
            setup: async () => {
                db = new JSONLFile<TestData>(testFile)
                await db.init(true)
                const data: TestData[] = Array.from(
                    { length: 1000 },
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
        'read with filter',
        async () => {
            const result = await db.read((item) => item.value > 50)
            expect(result.length).toBeGreaterThan(0)
        },
        {
            time: 1000,
            iterations: 100,
            setup: async () => {
                db = new JSONLFile<TestData>(testFile)
                await db.init(true)
                const data: TestData[] = Array.from(
                    { length: 100 },
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
                    await fs.unlink(testFile)
                } catch (err) {
                    // Игнорируем ошибку если файл не существует
                }
            },
        },
    )

    bench.only(
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
})
