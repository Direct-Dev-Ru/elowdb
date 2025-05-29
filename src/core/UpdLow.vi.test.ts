/* eslint-disable @typescript-eslint/require-await */
import { TestData } from '../../common/interfaces/test-data.js'
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { JSONFile } from '../adapters/node/JSONFile.js'
import { UpdLow } from './UpdLow.js'



const skipTop: boolean = false

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('UpdLow class testing with JSONFile', () => {
    let testFilePath: string
    let adapter: JSONFile<TestData>
    let updLow: UpdLow<TestData>

    beforeEach(() => {
        testFilePath = join(tmpdir(), `test-${Date.now()}.json`)
        adapter = new JSONFile<TestData>(testFilePath)
        updLow = new UpdLow(adapter, 5000, { value: 0 })
        vi.useFakeTimers()
    })

    afterEach(() => {
        // updLow.destroy()
        vi.useRealTimers()
        try {
            unlinkSync(testFilePath)
        } catch (e) {
            // Ignore file not found errors
        }
    })

    describe.skipIf(skipTop)('initialization', () => {
        it('should initialize with default data', () => {
            expect(updLow.data).toEqual({ value: 0 })
            expect(updLow.isDirty).toBe(false)
        })

        it('should initialize without default data', async () => {
            const testFilePathLocal = join(tmpdir(), `test-${Date.now()}.json`)
            const adapterLocal = new JSONFile<TestData>(testFilePathLocal)
            const emptyUpdLow = new UpdLow(adapterLocal, 5000)
            await vi.advanceTimersByTimeAsync(5000)
            // await vi.waitFor(() => emptyUpdLow.data !== undefined)
            expect(emptyUpdLow.data).toBeDefined()
            emptyUpdLow.destroy()
        })

        it('should auto-read when no default data provided', async () => {
            writeFileSync(testFilePath, JSON.stringify({ value: 100 }))
            const db = new UpdLow(adapter, 5000)
            await vi.advanceTimersByTimeAsync(15_000)
            // await db.waitForData()
            // console.log('db.data', db.data)
            expect(db.data?.value).toBe(100)
            expect(db.lastFetch).toBeGreaterThan(0)
            db.destroy()
        })
    })

    describe.skipIf(skipTop)('data management', () => {
        it('should update data and mark as dirty', () => {
            updLow.data = { value: 1 }
            expect(updLow.data).toEqual({ value: 1 })
            expect(updLow.isDirty).toBe(true)
        })

        it('should read data from file', async () => {
            writeFileSync(testFilePath, JSON.stringify({ value: 2 }))
            await updLow.read()
            expect(updLow.data).toEqual({ value: 2 })
            expect(updLow.isDirty).toBe(false)
        })

        it('should write data to file', async () => {
            updLow.data = { value: 3 }
            await updLow.write()
            const fileContent: TestData = JSON.parse(
                readFileSync(testFilePath, 'utf8'),
            ) as TestData
            expect(fileContent).toEqual({ value: 3 })
            expect(updLow.isDirty).toBe(false)
        })
    })

    describe.skipIf(skipTop)('update method', () => {
        it('should update data using provided function and data', async () => {
            const result = await updLow.update({ value: 5 }, async (data) => {
                return { result: true, data }
            })
            expect(result).toEqual({ result: true, error: '' })
            expect(updLow.data).toEqual({ value: 5 })
            expect(updLow.lastFetch).toEqual(updLow.lastMod)
            expect(updLow.isDirty).toBe(false)
            const fileContent: TestData = JSON.parse(
                readFileSync(testFilePath, 'utf8'),
            ) as TestData
            expect(fileContent).toEqual({ value: 5 })
        })

        it('should not update if function returns result: false', async () => {
            const result = await updLow.update({ value: 10 }, async (data) => {
                return { result: false, data }
            })
            expect(result).toEqual({
                result: false,
                error: 'result of fn is false',
            })
            expect(updLow.data).toEqual({ value: 0 })
        })

        it('should return error if function throws', async () => {
            const result = await updLow.update({ value: 20 }, async () => {
                throw new Error('test error')
            })
            expect(result.result).toBe(true) // The method returns result: true even on error
            expect(result.error).toBe('test error')
        })

        it('should return error if no data provided', async () => {            
            const result = await updLow.update(undefined, async () => ({
                result: true,
                data: {},
            }))
            expect(result).toEqual({
                result: false,
                error: 'no data provided for update',
            })
        })
    })

    describe.skipIf(skipTop)('smart refresh', () => {
        it('should start and stop refresh interval', () => {
            updLow.startSmartRefresh(3000)
            expect(updLow['cronJob']).toBeDefined()

            updLow.stopSmartRefresh()
            expect(updLow['cronJob']).toBeUndefined()
        })

        it('should not update if data is dirty', async () => {
            updLow.startSmartRefresh(3000)
            updLow.data = { value: 6 }

            writeFileSync(testFilePath, JSON.stringify({ value: 7 }))
            await vi.advanceTimersByTimeAsync(4000)

            expect(updLow.data).toEqual({ value: 6 })
        })

        it('should update if data is not dirty', async () => {
            updLow.startSmartRefresh(1000)
            writeFileSync(testFilePath, JSON.stringify({ value: 8 }))
            expect(updLow.data).toEqual({ value: 0 })
            await vi.advanceTimersByTimeAsync(10_000)
            expect(updLow.data).toEqual({ value: 8 })
        })

        it('should restart refresh after write', async () => {
            updLow.startSmartRefresh(1000)
            updLow.data = { value: 9 }
            await updLow.write()
            expect(updLow['cronJob']).toBeDefined()
        })
    })

    describe.skipIf(skipTop)('timestamps', () => {
        it('should track last modification time', () => {
            const before = Date.now()
            updLow.data = { value: 10 }
            const after = Date.now()

            expect(updLow.lastMod).toBeGreaterThanOrEqual(before)
            expect(updLow.lastMod).toBeLessThanOrEqual(after)
        })

        it('should track last fetch time', async () => {
            const before = Date.now()
            updLow.data = { value: 10 }
            await updLow.write()
            await updLow.read()
            const after = Date.now()

            expect(updLow.lastFetch).toBeGreaterThanOrEqual(before)
            expect(updLow.lastFetch).toBeLessThanOrEqual(after)
        })
    })

    describe.skipIf(skipTop)('disposal', () => {
        it('should clean up resources on destroy', async () => {
            updLow.startSmartRefresh(100)
            updLow.destroy()

            expect(updLow['cronJob']).toBeUndefined()
        })

        it('should support async disposal', async () => {
            updLow.startSmartRefresh(100)
            await updLow[Symbol.asyncDispose]()

            expect(updLow['cronJob']).toBeUndefined()
        })
    })
})
