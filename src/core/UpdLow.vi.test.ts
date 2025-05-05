import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { UpdLow } from './UpdLow.js'
import { JSONFile } from '../adapters/node/JSONFile.js'

interface TestData {
    value?: number
    items?: string[]
}

function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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

    describe('initialization', () => {
        it.skip('should initialize with default data', () => {
            expect(updLow.data).toEqual({ value: 0 })
            expect(updLow.isDirty).toBe(false)
        })

        it.skip('should initialize without default data', async () => {
            const testFilePathLocal = join(tmpdir(), `test-${Date.now()}.json`)
            const adapterLocal = new JSONFile<TestData>(testFilePathLocal)
            const emptyUpdLow = new UpdLow(adapterLocal, 5000)            
            await vi.advanceTimersByTimeAsync(100) // Wait for setImmediate
            
            expect(emptyUpdLow.data).toBeDefined()
            emptyUpdLow.destroy()
        })

        it('should auto-read when no default data provided', async () => {
            writeFileSync(testFilePath, JSON.stringify({ value: 100 }))
            const db = new UpdLow(adapter, 5000)
            await vi.advanceTimersByTimeAsync(5000) 
            // await db.waitForData()
            console.log("db.data", db.data)
            expect(db.data?.value).toBe(100)
            expect(db.lastFetch).toBeGreaterThan(0)
            db.destroy()
        })
    })

    describe('data management', () => {
        it.skip('should update data and mark as dirty', () => {
            updLow.data = { value: 1 }
            expect(updLow.data).toEqual({ value: 1 })
            expect(updLow.isDirty).toBe(true)
        })

        it.skip('should read data from file', async () => {
            writeFileSync(testFilePath, JSON.stringify({ value: 2 }))
            await updLow.read()
            expect(updLow.data).toEqual({ value: 2 })
            expect(updLow.isDirty).toBe(false)
        })

        it.skip('should write data to file', async () => {
            updLow.data = { value: 3 }
            await updLow.write()
            const fileContent = JSON.parse(writeFileSync.toString())
            expect(fileContent).toEqual({ value: 3 })
            expect(updLow.isDirty).toBe(false)
        })

        it.skip('should handle read errors gracefully', async () => {
            unlinkSync(testFilePath) // Delete the file to cause read error
            await expect(updLow.read()).rejects.toThrow()
        })
    })

    describe('update method', () => {
        it.skip('should update data using provided function and data', async () => {
            const result = await updLow.update(
                { value: 5 },
                async (data) => {
                    return { result: true, data };
                }
            );
            expect(result).toEqual({ result: true, error: '' });
            expect(updLow.data).toEqual({ value: 5 });
            expect(updLow.isDirty).toBe(false);
        });

        it.skip('should not update if function returns result: false', async () => {
            const result = await updLow.update(
                { value: 10 },
                async (data) => {
                    return { result: false, data };
                }
            );
            expect(result).toEqual({ result: false, error: 'no data provided for update' });
            expect(updLow.data).toEqual({ value: 0 });
        });

        it.skip('should return error if function throws', async () => {
            const result = await updLow.update(
                { value: 20 },
                async () => {
                    throw new Error('test error');
                }
            );
            expect(result.result).toBe(true); // The method returns result: true even on error
            expect(result.error).toBe('test error');
        });

        it.skip('should return error if no data provided', async () => {
            // @ts-expect-error purposely passing undefined
            const result = await updLow.update(undefined, async () => ({ result: true, data: {} }));
            expect(result).toEqual({ result: false, error: 'no data provided for update' });
        });
    })

    describe('smart refresh', () => {
        it.skip('should start and stop refresh interval', () => {
            updLow.startSmartRefresh(100)
            expect(updLow['cronJob']).toBeDefined()
            
            updLow.stopSmartRefresh()
            expect(updLow['cronJob']).toBeUndefined()
        })

        it.skip('should not update if data is dirty', async () => {
            updLow.startSmartRefresh(100)
            updLow.data = { value: 6 }
            
            writeFileSync(testFilePath, JSON.stringify({ value: 7 }))
            await vi.advanceTimersByTime(100)
            
            expect(updLow.data).toEqual({ value: 6 })
        })

        it.skip('should update if data is not dirty', async () => {
            updLow.startSmartRefresh(100)
            writeFileSync(testFilePath, JSON.stringify({ value: 8 }))
            
            await vi.advanceTimersByTime(100)
            expect(updLow.data).toEqual({ value: 8 })
        })

        it.skip('should handle read errors during refresh', async () => {
            updLow.startSmartRefresh(100)
            unlinkSync(testFilePath) // Delete the file to cause read error
            
            await vi.advanceTimersByTime(100)
            expect(updLow['cronJob']).toBeUndefined()
        })

        it.skip('should restart refresh after write', async () => {
            updLow.startSmartRefresh(100)
            updLow.data = { value: 9 }
            await updLow.write()
            
            expect(updLow['cronJob']).toBeDefined()
        })
    })

    describe('timestamps', () => {
        it.skip('should track last modification time', () => {
            const before = Date.now()
            updLow.data = { value: 10 }
            const after = Date.now()
            
            expect(updLow.lastMod).toBeGreaterThanOrEqual(before)
            expect(updLow.lastMod).toBeLessThanOrEqual(after)
        })

        it.skip('should track last fetch time', async () => {
            const before = Date.now()
            await updLow.read()
            const after = Date.now()
            
            expect(updLow.lastFetch).toBeGreaterThanOrEqual(before)
            expect(updLow.lastFetch).toBeLessThanOrEqual(after)
        })
    })

    describe('disposal', () => {
        it.skip('should clean up resources on destroy', async () => {
            updLow.startSmartRefresh(100)
            await updLow.destroy()
            
            expect(updLow['cronJob']).toBeUndefined()
        })

        it.skip('should support async disposal', async () => {
            updLow.startSmartRefresh(100)
            await updLow[Symbol.asyncDispose]()
            
            expect(updLow['cronJob']).toBeUndefined()
        })
    })
}) 