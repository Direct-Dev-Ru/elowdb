import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { LineDb, LineDbAdapter, LineDbInitOptions } from './LineDbv2.js'
import { JSONLFile } from '../adapters/node/JSONLFile.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { logTest } from '../common/utils/log.js'
import { JSONLFileOptions } from '../common/interfaces/jsonl-file.js'

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

describe('LineDb - Update Method Tests', () => {
    const testDbFolder = path.join(process.cwd(), 'test-linedb-update')

    let db: LineDb

    beforeEach(async () => {
        // Clear test folder
        try {
            await fs.rm(testDbFolder, { recursive: true, force: true })
        } catch (error) {
            // Ignore error if folder doesn't exist
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
    })

    afterEach(async () => {
        try {
            if (!shouldKeepTestFiles()) {
                await fs.rm(testDbFolder, { recursive: true, force: true })
            }
        } catch (error) {
            // Ignore error
        }
    })

    describe('Base update operations', () => {
        it('should update single record by ID', async () => {
            const data: TestData = {
                id: 1,
                name: 'Original Name',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(data, 'testData')

            const updateData: Partial<TestData> = {
                id: 1,
                name: 'Updated Name',
                age: 30,
            }

            const updated = await db.update<TestData>(updateData, 'testData')

            expect(updated).toHaveLength(1)
            expect(updated[0].id).toBe(1)
            expect(updated[0].name).toBe('Updated Name')
            expect(updated[0].age).toBe(30)
            expect(updated[0].userId).toBe(1) // Unchanged field

            const result = await db.read<TestData>('testData')
            expect(result[0].name).toBe('Updated Name')
        })

        it('should update multiple records by filter', async () => {
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

            const updateData: Partial<TestData> = {
                age: 40,
            }

            const updated = await db.update<TestData>(updateData, 'testData', {
                userId: 1,
            })

            expect(updated).toHaveLength(2)
            expect(updated[0].age).toBe(40)
            expect(updated[1].age).toBe(40)

            const result = await db.read<TestData>('testData')
            expect(result[0].age).toBe(40)
            expect(result[1].age).toBe(40)
            expect(result[2].age).toBe(35) // Unchanged
        })

        it('should update records by string filter', async () => {
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
                    name: 'Jane',
                    age: 30,
                    userId: 1,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestData>(dataArray, 'testData')

            const updateData: Partial<TestData> = {
                age: 40,
            }

            const updated = await db.update<TestData>(
                updateData,
                'testData',
                'name == "John"',
            )

            expect(updated).toHaveLength(1)
            expect(updated[0].name).toBe('John')
            expect(updated[0].age).toBe(40)
        })

        it('should update multiple records in array', async () => {
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

            const updateDataArray: Partial<TestData>[] = [
                { id: 1, name: 'Updated User 1', age: 35 },
                { id: 2, name: 'Updated User 2', age: 40 },
            ]

            const updated = await db.update<TestData>(
                updateDataArray,
                'testData',
            )

            expect(updated).toHaveLength(2)
            expect(updated[0].name).toBe('Updated User 1')
            expect(updated[0].age).toBe(35)
            expect(updated[1].name).toBe('Updated User 2')
            expect(updated[1].age).toBe(40)
        })

        it('should throw error when updating ID with different filter ID', async () => {
            const data: TestData = {
                id: 1,
                name: 'Original Name',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(data, 'testData')

            const updateData: Partial<TestData> = {
                id: 2, // New ID
            }

            await expect(
                db.update<TestData>(updateData, 'testData', { id: 1 }),
            ).rejects.toThrow(
                'You can not update record id with filter by another id. Use delete and insert instead',
            )
        })

        it('should return empty array when no records match filter', async () => {
            const data: TestData = {
                id: 1,
                name: 'User 1',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(data, 'testData')

            const updateData: Partial<TestData> = {
                age: 40,
            }

            const updated = await db.update<TestData>(updateData, 'testData', {
                id: 999,
            })

            expect(updated).toHaveLength(0)
        })
    })

    describe('Update with partitions', () => {
        it('should update records within same partition', async () => {
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
                    status: 'pending',
                    amount: 200,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestOrder>(orders, 'orders')

            const updateData: Partial<TestOrder> = {
                status: 'completed',
            }

            const updated = await db.update<TestOrder>(updateData, 'orders', {
                userId: 1,
            })

            expect(updated).toHaveLength(2)
            expect(updated[0].status).toBe('completed')
            expect(updated[1].status).toBe('completed')
        },10_000_000)

        it('should move records between partitions when partition key changes', async () => {
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
                    status: 'pending',
                    amount: 200,
                    timestamp: Date.now(),
                },
            ]

            await db.insert<TestOrder>(orders, 'orders')

            const partitionUser1Adapter = await db.getPartitionAdapter(
                orders[0],
                'orders',
            )
            const partitionUser2Adapter = await db.getPartitionAdapter(
                orders[1],
                'orders',
            )

            const resultRead1 = await partitionUser1Adapter.readByFilter({
                id: 1,
            })
            expect(resultRead1).toHaveLength(1)
            expect(resultRead1[0].userId).toBe(1)
            expect(resultRead1[0].id).toBe(1)

            const resultRead2 = await partitionUser2Adapter.readByFilter({
                id: 2,
            })
            expect(resultRead2).toHaveLength(1)
            expect(resultRead2[0].userId).toBe(2)
            expect(resultRead2[0].id).toBe(2)

            const updateData: Partial<TestOrder> = {
                userId: 1, // Change userId, which should move the record to another partition
                status: 'completed',
            }

            await db.update<TestOrder>(updateData, 'orders', {
                userId: 2,
            })

            const resultRead1AfterUpdate =
                await partitionUser1Adapter.readByFilter('')
            expect(resultRead1AfterUpdate).toHaveLength(2)
            expect(resultRead1AfterUpdate[0].userId).toBe(1)
            expect(resultRead1AfterUpdate[0].id).toBe(1)
            expect(resultRead1AfterUpdate[1].userId).toBe(1)
            expect(resultRead1AfterUpdate[1].id).toBe(2)

            const resultRead2AfterUpdate =
                await partitionUser2Adapter.readByFilter({
                    id: 2,
                })
            expect(resultRead2AfterUpdate).toHaveLength(0)
        })
    })

    describe('Update with transactions', () => {
        it('should update within transaction', async () => {
            const data: TestData = {
                id: 1,
                name: 'Original Name',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(data, 'testData')

            const updateData: Partial<TestData> = {
                id: 1,
                name: 'Updated Name',
            }

            const updated = await db.update<TestData>(
                updateData,
                'testData',
                undefined,
                { inTransaction: true },
            )

            expect(updated).toHaveLength(1)
            expect(updated[0].name).toBe('Updated Name')
        })
    })

    describe('Update cache behavior', () => {
        it('should update cache after record update', async () => {
            const data: TestData = {
                id: 1,
                name: 'Original Name',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(data, 'testData')

            // First request to load into cache
            await db.select<TestData>('id === 1', 'testData')

            const updateData: Partial<TestData> = {
                id: 1,
                name: 'Updated Name',
            }

            await db.update<TestData>(updateData, 'testData')

            // Second request should return updated data from cache
            const result = await db.select<TestData>('id === 1', 'testData')
            const resultArray = db.selectResultArray(result)

            expect(resultArray[0].name).toBe('Updated Name')
        })
    })

    describe('Update edge cases', () => {
        it('should handle partial updates with undefined values', async () => {
            const data: TestData = {
                id: 1,
                name: 'Original Name',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
                value: 100,
            }

            await db.insert<TestData>(data, 'testData')

            const updateData: Partial<TestData> = {
                id: 1,
                name: 'Updated Name',
                value: undefined,
            }

            const updated = await db.update<TestData>(updateData, 'testData')

            expect(updated).toHaveLength(1)
            expect(updated[0].name).toBe('Updated Name')
            expect(updated[0].value).toBeUndefined()
        })

        it('should handle update with empty filter (update by ID in data)', async () => {
            const data: TestData = {
                id: 1,
                name: 'Original Name',
                age: 25,
                userId: 1,
                timestamp: Date.now(),
            }

            await db.insert<TestData>(data, 'testData')

            const updateData: Partial<TestData> = {
                id: 1,
                name: 'Updated Name',
            }

            const updated = await db.update<TestData>(updateData, 'testData')

            expect(updated).toHaveLength(1)
            expect(updated[0].name).toBe('Updated Name')
        })
    })
})
