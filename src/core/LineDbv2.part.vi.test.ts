import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { LineDb } from './LineDbv2.js'
import { LineDbAdapter, LineDbInitOptions } from '../common/interfaces/lineDb.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { logTest } from '../common/utils/log.js'
import { JSONLFile } from '../adapters/node/JSONLFile.js'
import { JSONLFileOptions } from '../common/interfaces/jsonl-file.js'
import crypto from 'node:crypto'

// Test data type with required timestamp field
interface TestData extends LineDbAdapter {
    id: number | string // Must match LineDbAdapter
    name: string
    age?: number
    value?: number
    userId?: number
    timestamp: number // timestamp in milliseconds
}

interface User extends LineDbAdapter {
    id: number | string // Must match LineDbAdapter
    name: string
    email: string
    age?: number
    roles?: string[]
    timestamp: number // timestamp in milliseconds
}

function shouldKeepTestFiles(): boolean {
    const keepFiles = process.env.KEEP_TEST_FILES
    return keepFiles === 'true' || keepFiles === '1'
}

describe('LineDb Partitioning Tests', () => {
    const dbFolder = path.join(process.cwd(), 'test-part-linedb')
    let db: LineDb

    beforeEach(async () => {
        // Clear test directory before each test
        try {
            await fs.rm(dbFolder, { recursive: true, force: true })
        } catch (error) {
            // Ignore error if directory doesn't exist
        }
        await fs.mkdir(dbFolder, { recursive: true })

        const adapterTestDataOptions: JSONLFileOptions<TestData> = {
            collectionName: 'test',
            encryptKeyForLineDb: '',
            indexedFields: ['id', 'name'],
        }
        const initLineDBOptions: LineDbInitOptions = {
            dbFolder,
            collections: [
                adapterTestDataOptions as unknown as JSONLFileOptions<unknown>,
            ],
            partitions: [
                {
                    collectionName: 'test',
                    partIdFn: (item: Partial<TestData>) => {
                        if (!item.timestamp) return 'default'
                        const year = new Date(item.timestamp).getFullYear()
                        return year.toString()
                    },
                },
            ],
        }
        db = new LineDb(initLineDBOptions)
        await db.init(true)
    })

    afterEach(async () => {
        // Clear test directory after each test
        try {
            if (!shouldKeepTestFiles()) {
                await fs.rm(dbFolder, { recursive: true, force: true })
            }
        } catch (error) {
            // Ignore error
        }
    })

    it.only('should create partition files based on timestamp year', async () => {
        const testData: Partial<TestData>[] = [
            {
                id: 1,
                name: 'Item 10',
                timestamp: new Date('2023-01-01').getTime(),
            },
            {
                id: 2,
                name: 'Item 20',
                timestamp: new Date('2023-06-15').getTime(),
            },
            {
                id: 3,
                name: 'Item 30',
                timestamp: new Date('2024-01-01').getTime(),
            },
        ]

        await db.insert(testData, 'test')

        // Check that files for different partitions were created
        const files = await fs.readdir(dbFolder)
        expect(files).toContain('test_2023.jsonl')
        expect(files).toContain('test_2024.jsonl')

        // Check data through separate JSONLFile adapters
        const adapter2023 = new JSONLFile(
            path.join(dbFolder, 'test_2023.jsonl'),
            '',
            { collectionName: 'test_2023' },
        )
        const adapter2024 = new JSONLFile(
            path.join(dbFolder, 'test_2024.jsonl'),
            '',
            { collectionName: 'test_2024' },
        )

        await adapter2023.init(true)
        await adapter2024.init(true)

        const data2023 = await adapter2023.read()
        const data2024 = await adapter2024.read()

        // Check 2023 data
        expect(data2023).toHaveLength(2)
        expect(data2023).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 1,
                    name: 'Item 10',
                    timestamp: new Date('2023-01-01').getTime(),
                }),
                expect.objectContaining({
                    id: 2,
                    name: 'Item 20',
                    timestamp: new Date('2023-06-15').getTime(),
                }),
            ]),
        )

        // Check 2024 data
        expect(data2024).toHaveLength(1)
        expect(data2024).toEqual([
            expect.objectContaining({
                id: 3,
                name: 'Item 30',
                timestamp: new Date('2024-01-01').getTime(),
            }),
        ])

        // Check data insertion without ID and sequential numbering
        const testData2: Partial<TestData>[] = [
            {
                name: 'Item 40',
                timestamp: new Date('2023-03-01').getTime(),
            },
            {
                id: 5,
                name: 'Item 50',
                timestamp: new Date('2024-03-01').getTime(),
            },
            {
                name: 'Item 60',
                timestamp: new Date('2023-09-01').getTime(),
            },
        ]

        await db.insert(testData2, 'test')

        // Check data through separate JSONLFile adapters after insertion
        const data2023AfterInsert = (await adapter2023.read()) as TestData[]
        const data2024AfterInsert = (await adapter2024.read()) as TestData[]

        // Check that all records have unique IDs
        const allIds = [...data2023AfterInsert, ...data2024AfterInsert].map(
            (item) => item.id,
        )
        const uniqueIds = new Set(allIds)
        expect(allIds.length).toBe(uniqueIds.size)

        // Check that IDs are sequential
        const sortedIds = [...uniqueIds].sort((a, b) => Number(a) - Number(b))
        expect(sortedIds).toEqual([1, 2, 3, 4, 5, 6])

        // Check that data is distributed across correct partitions
        expect(data2023AfterInsert).toHaveLength(4) // 2 original + 2 new 2023 records
        expect(data2024AfterInsert).toHaveLength(2) // 1 original + 1 new 2024 record

        // Check that new records have correct IDs and are in correct partitions
        const newItem2023 = data2023AfterInsert.find(
            (item) => item.name === 'Item 40',
        )
        const newItem2024 = data2024AfterInsert.find(
            (item) => item.name === 'Item 50',
        )
        const newItem2023_2 = data2023AfterInsert.find(
            (item) => item.name === 'Item 60',
        )

        expect(newItem2023).toBeDefined()
        expect(newItem2024).toBeDefined()
        expect(newItem2023_2).toBeDefined()

        expect(newItem2023?.id).toBeDefined()
        expect(newItem2024?.id).toBeDefined()
        expect(newItem2023_2?.id).toBeDefined()

        // Check that timestamp matches partition
        expect(new Date(newItem2023!.timestamp).getFullYear()).toBe(2023)
        expect(new Date(newItem2024!.timestamp).getFullYear()).toBe(2024)
        expect(new Date(newItem2023_2!.timestamp).getFullYear()).toBe(2023)

        // Check data sorting within partitions
        const sorted2023 = data2023AfterInsert.sort(
            (a, b) => a.timestamp - b.timestamp,
        )
        expect(sorted2023).toEqual(data2023AfterInsert)

        const sorted2024 = data2024AfterInsert.sort(
            (a, b) => a.timestamp - b.timestamp,
        )
        expect(sorted2024).toEqual(data2024AfterInsert)

        // Check preservation of all data fields
        const itemWithAllFields = data2023AfterInsert.find(
            (item) => item.name === 'Item 20',
        )
        expect(itemWithAllFields).toHaveProperty('id')
        expect(itemWithAllFields).toHaveProperty('name')
        expect(itemWithAllFields).toHaveProperty('timestamp')

        // Check handling of empty values
        const testData3: Partial<TestData>[] = [
            {
                name: 'Item 70',
                timestamp: new Date('2023-12-31').getTime(),
                age: undefined,
                value: null as any,
                userId: 0,
            },
        ]

        await db.insert(testData3, 'test')
        await adapter2023.init(true)
        const data2023AfterEmptyInsert =
            (await adapter2023.read()) as TestData[]
        const itemWithEmptyFields = data2023AfterEmptyInsert.find(
            (item) => item.name === 'Item 70',
        )

        expect(itemWithEmptyFields).toBeDefined()
        expect(itemWithEmptyFields?.age).toBeUndefined()
        expect(itemWithEmptyFields?.value).toBeNull()
        expect(itemWithEmptyFields?.userId).toBe(0)

        // Check handling of large numbers
        const testData4: Partial<TestData>[] = [
            {
                name: 'Item 80',
                timestamp: new Date('2023-12-31').getTime(),
                value: Number.MAX_SAFE_INTEGER,
            },
        ]

        await db.insert(testData4, 'test')
        await adapter2023.init(true)
        const data2023AfterBigIntInsert =
            (await adapter2023.read()) as TestData[]
        const itemWithBigInt = data2023AfterBigIntInsert.find(
            (item) => item.name === 'Item 80',
        )

        expect(itemWithBigInt).toBeDefined()
        expect(itemWithBigInt?.value).toBe(Number.MAX_SAFE_INTEGER)

        // Check handling of negative values
        const testData5: Partial<TestData>[] = [
            {
                name: 'Item 90',
                timestamp: new Date('2023-12-31').getTime(),
                value: -999999,
            },
        ]

        await db.insert(testData5, 'test')
        await adapter2023.init(true)
        const data2023AfterNegativeInsert =
            (await adapter2023.read()) as TestData[]
        const itemWithNegative = data2023AfterNegativeInsert.find(
            (item) => item.name === 'Item 90',
        )

        expect(itemWithNegative).toBeDefined()
        expect(itemWithNegative?.value).toBe(-999999)

        // Check handling of very long strings
        const longString = 'a'.repeat(10000)
        const testData6: Partial<TestData>[] = [
            {
                name: longString,
                timestamp: new Date('2023-12-31').getTime(),
            },
        ]

        await db.insert(testData6, 'test')
        await adapter2023.init(true)
        const data2023AfterLongStringInsert =
            (await adapter2023.read()) as TestData[]
        const itemWithLongString = data2023AfterLongStringInsert.find(
            (item) => item.name === longString,
        )

        expect(itemWithLongString).toBeDefined()
        expect(itemWithLongString?.name).toHaveLength(10000)
    })

    it.only('should read data from correct partitions', async () => {
        const testData: TestData[] = [
            {
                id: 1,
                name: 'Item 1',
                timestamp: new Date('2023-01-01').getTime(),
            },
            {
                id: 2,
                name: 'Item 2',
                timestamp: new Date('2023-06-15').getTime(),
            },
            {
                id: 3,
                name: 'Item 3',
                timestamp: new Date('2024-01-01').getTime(),
            },
        ]

        await db.write(testData, 'test')

        // Read 2023 data
        const results2023 = await db.readByFilter<TestData>(
            `getFullYear(timestamp) == 2023`,
            'test',
        )
        // const firstItem = results2023[0]

        expect(results2023).toHaveLength(2)
        expect(
            results2023.every(
                (item) => new Date(item.timestamp).getFullYear() === 2023,
            ),
        ).toBe(true)

        // Read 2024 data
        const results2024 = await db.readByFilter<TestData>(
            `getFullYear(timestamp) == 2024`,
            'test',
        )
        expect(results2024).toHaveLength(1)
        expect(results2024[0].timestamp).toBe(new Date('2024-01-01').getTime())

        // Проверка поиска по нескольким полям
        const resultsMultiField = await db.readByFilter<TestData>(
            { name: 'Item 1', timestamp: new Date('2023-01-01').getTime() },
            'test',
        )
        expect(resultsMultiField).toHaveLength(1)
        expect(resultsMultiField[0].name).toBe('Item 1')
        // Проверка поиска по нескольким полям c использованием фильтрации filtrex
        const resultsMultiField2 = await db.readByFilter<TestData>(
            `name == 'Item 2' and getFullYear(timestamp) == 2023`,
            'test',
        )
        expect(resultsMultiField2).toHaveLength(1)
        expect(resultsMultiField2[0].name).toBe('Item 2')

        // Проверка поиска с использованием операторов сравнения
        const resultsComparison = await db.readByFilter<TestData>(
            `timestamp > ${new Date('2023-06-01').getTime()}`,
            'test',
        )
        expect(resultsComparison).toHaveLength(2) // Item 2 (2023-06-15) и Item 3 (2024-01-01)

        // Проверка поиска с использованием логических операторов
        const resultsLogical = await db.readByFilter<TestData>(
            `(timestamp > ${new Date(
                '2023-06-01',
            ).getTime()}) and (timestamp < ${new Date(
                '2024-01-01',
            ).getTime()})`,
            'test',
        )
        expect(resultsLogical).toHaveLength(1) // Только Item 2 (2023-06-15)

        // Проверка поиска с использованием функций для работы с датами
        const resultsDateFunc = await db.readByFilter<TestData>(
            `getMonth(timestamp) == 0`, // Январь
            'test',
        )
        expect(resultsDateFunc).toHaveLength(2) // Item 1 (2023-01-01) и Item 3 (2024-01-01)

        // Проверка поиска с использованием функций для работы со строками
        const resultsStringFunc = await db.readByFilter<TestData>(
            `strLen(name) == 6`,
            'test',
        )
        expect(resultsStringFunc).toHaveLength(3) // Все имена имеют длину 6 символов

        // Проверка поиска с использованием комбинации условий
        const resultsComplex = await db.readByFilter<TestData>(
            `(getFullYear(timestamp) == 2023) and (strLen(name) == 6)`,
            'test',
        )
        expect(resultsComplex).toHaveLength(2) // Item 1 и Item 2 из 2023 года
    })

    it.only('should handle items (write and read) without partitioning', async () => {
        const db = new LineDb()
        await db.init(true, {
            dbFolder,
            collections: [
                {
                    collectionName: 'test',
                    encryptKeyForLineDb: '',
                },
            ],
        })
        const testData: TestData[] = [
            {
                id: 1,
                name: 'Item 1',
                timestamp: new Date('2023-01-01').getTime(),
            },
            { id: 2, name: 'Item 2', timestamp: 0 },
        ]

        await db.write(testData, 'test')

        // Check that default partition file was created
        const files = await fs.readdir(dbFolder)
        expect(files).toContain('test.jsonl')

        // Read data from default partition
        const noPartitionResults = await db.readByFilter<TestData>(
            { name: 'Item 2' },
            'test',
        )
        expect(noPartitionResults).toHaveLength(1)
        expect(noPartitionResults[0].name).toBe('Item 2')
    })

    it.only('should handle backup with partitioning', async () => {
        const db = new LineDb()

        const adapterUserOptions: JSONLFileOptions<User> = {
            collectionName: 'users',
            encryptKeyForLineDb: 'testkeyforusers',
            indexedFields: ['name'],
        }
        const adapterTestDataOptions: JSONLFileOptions<TestData> = {
            collectionName: 'partitioned',
            encryptKeyForLineDb: '',
            indexedFields: ['value'],
        }

        await db.init(true, {
            dbFolder,
            collections: [
                adapterUserOptions as unknown as JSONLFileOptions<unknown>,
                adapterTestDataOptions as unknown as JSONLFileOptions<unknown>,
            ],
            partitions: [
                {
                    collectionName: 'partitioned',
                    partIdFn: (item: Partial<TestData>) => {
                        if (!item.timestamp) return 'default'
                        const year = new Date(item.timestamp).getFullYear()
                        return year.toString()
                    },
                },
            ],
        })

        const testData: TestData[] = [
            {
                id: 1,
                name: 'Item 1',
                timestamp: new Date('2023-01-01').getTime(),
            },
            {
                id: 2,
                name: 'Item 2',
                timestamp: new Date('2024-01-01').getTime(),
            },
            {
                id: 3,
                name: 'Item 3',
                timestamp: new Date('2023-01-01').getTime(),
            },
        ]

        const testUserData: User[] = [
            {
                id: 1,
                name: 'User 1',
                email: 'user1@example.com',
                age: 25,
                roles: ['admin', 'user'],
                timestamp: new Date('2023-01-01').getTime(),
            },
            {
                id: 2,
                name: 'User 2',
                email: 'user2@example.com',
                age: 30,
                roles: ['user'],
                timestamp: new Date('2024-01-01').getTime(),
            },
        ]

        await db.write(testData, 'partitioned')
        await db.write(testUserData, 'users')

        const resBeforeBackup = await db.readByFilter<TestData>(
            { id: 1 },
            'partitioned',
            { optimisticRead: false },
        )
        logTest(true, 'resBeforeBackup', resBeforeBackup)
        expect(resBeforeBackup).toHaveLength(1)
        expect(resBeforeBackup[0].name).toBe('Item 1')

        // Check that default partition file was created
        const files = await fs.readdir(dbFolder)
        expect(files).toContain('partitioned_2023.jsonl')
        expect(files).toContain('partitioned_2024.jsonl')
        expect(files).toContain('users.jsonl')

        const backupFile = path.join(
            'test-part-linedb',
            `${crypto.randomBytes(4).toString('hex')}-linedb-backup.backup`,
        )
        await db.createBackup(backupFile, {
            collectionNames: ['partitioned', 'users'],
            // encryptKey: 'testsecretkey',
            gzip: true,
        })
        const filesBeforeRestore = await fs.readdir(dbFolder)
        expect(filesBeforeRestore).toContain('partitioned_2023.jsonl')
        expect(filesBeforeRestore).toContain('partitioned_2024.jsonl')
        expect(filesBeforeRestore).toContain('users.jsonl')
        await fs.unlink(path.join(dbFolder, 'partitioned_2023.jsonl'))
        await fs.unlink(path.join(dbFolder, 'partitioned.jsonl'))
        await fs.unlink(path.join(dbFolder, 'test.jsonl'))
        await fs.unlink(path.join(dbFolder, 'partitioned_2024.jsonl'))
        // await fs.unlink(path.join(dbFolder, 'users.jsonl'))
        await db.restoreFromBackup(backupFile, {
            collectionNames: ['partitioned', 'users'],
            keepBackup: true,
            // encryptKey: 'testsecretkey',
            gzip: true,
        })

        const filesAfterBackup = await fs.readdir(dbFolder)
        expect(filesAfterBackup).toContain('partitioned_2023.jsonl')
        expect(filesAfterBackup).toContain('partitioned_2024.jsonl')
        expect(filesAfterBackup).toContain('users.jsonl')

        const resAfterBackup = await db.readByFilter<TestData>(
            { id: 1 },
            'partitioned_2023',
        )
        logTest(true, resAfterBackup)
        expect(resAfterBackup).toHaveLength(1)
        expect(resAfterBackup[0].name).toBe('Item 1')
    }, 1_000_000)

    it.only('should handle items without timestamp in default partition', async () => {
        const testData: TestData[] = [
            {
                id: 1,
                name: 'Item 1',
                timestamp: new Date('2023-01-01').getTime(),
            },
            { id: 2, name: 'Item 2', timestamp: 0 }, // Without timestamp
        ]

        await db.write(testData, 'test')

        // Check that default partition file was created
        const files = await fs.readdir(dbFolder)
        expect(files).toContain('test_default.jsonl')

        // Read data from default partition
        const defaultResults = await db.readByFilter<TestData>(
            { name: 'Item 2' },
            'test_default',
        )
        expect(defaultResults).toHaveLength(1)
        expect(defaultResults[0].name).toBe('Item 2')

        const notDefaultResults = await db.readByFilter<TestData>(
            `name == 'Item 1'`,
            'test',
        )
        expect(notDefaultResults).toHaveLength(1)
        expect(notDefaultResults[0].name).toBe('Item 1')
    })

    it.only('should update items in correct partitions', async () => {
        const logThisTest = true
        const testData: TestData[] = [
            {
                id: 1,
                name: 'Item 1',
                timestamp: new Date('2023-01-01').getTime(),
            },
            {
                id: 2,
                name: 'Item 2',
                timestamp: new Date('2024-01-01').getTime(),
            },
            {
                id: 3,
                name: 'Item 3',
                timestamp: new Date('2023-01-01').getTime(),
            },
        ]

        await db.insert(testData, 'test')

        // Update first item's timestamp to 2024
        const updatedItem = {
            // ...testData[0],
            name: 'Item updated',
            timestamp: new Date('2024-06-01').getTime(),
        }
        await db.update(
            updatedItem,
            'test',
            {
                inTransaction: false,
            },
            'id == 1',
        )

        // Check that item moved to 2024 partition
        const results2023 = await db.readByFilter<TestData>(
            `getFullYear(timestamp) == 2023`,
            'test_2023',
            { optimisticRead: false },
        )
        expect(results2023).toHaveLength(1)

        const results2024 = await db.readByFilter<TestData>(
            `getFullYear(timestamp) == 2024`,
            'test_2024',
            { optimisticRead: false },
        )
        expect(results2024).toHaveLength(2)
        expect(results2024.find((item) => item.id === 1)?.name).toBe(
            'Item updated',
        )

        await db.insert<TestData>(
            [
                {
                    // id: 4,
                    name: 'Item 4',
                    timestamp: new Date('2024-01-01').getTime(),
                },
                {
                    // id: 4,
                    name: 'Item 5',
                    timestamp: new Date('2023-01-01').getTime(),
                },
            ],
            'test',
        )

        const adapter2023 = await db.getPartitionAdapter<TestData>(
            testData[0],
            'test',
        )
        logTest(logThisTest, (await adapter2023.getPositionsNoLock()) as any)
        const res2023ByAdapter = await adapter2023.read()
        expect(res2023ByAdapter).toHaveLength(2)
        expect(res2023ByAdapter.find((item) => item.id === 3)?.name).toBe(
            'Item 3',
        )
        expect(res2023ByAdapter.find((item) => item.id === 5)?.name).toBe(
            'Item 5',
        )
        const adapter2024 = await db.getPartitionAdapter<TestData>(
            testData[1],
            'test',
        )
        logTest(logThisTest, (await adapter2024.getPositionsNoLock()) as any)
        const res2024ByAdapter = await adapter2024.read()
        expect(res2024ByAdapter).toHaveLength(3)
        expect(res2024ByAdapter.find((item) => item.id === 1)?.name).toBe(
            'Item updated',
        )
        expect(res2024ByAdapter.find((item) => item.id === 4)?.name).toBe(
            'Item 4',
        )

        db.close()
    })

    it.only('should delete items from correct partitions', async () => {
        const testData: TestData[] = [
            {
                id: 1,
                name: 'Item 1',
                timestamp: new Date('2023-01-01').getTime(),
            },
            {
                id: 2,
                name: 'Item 2',
                timestamp: new Date('2023-06-15').getTime(),
            },
            {
                id: 3,
                name: 'Item 3',
                timestamp: new Date('2024-01-01').getTime(),
            },
        ]

        await db.insert(testData, 'test')

        // Delete item from 2023 partition
        await db.delete({ timestamp: new Date('2023-01-01').getTime() }, 'test')

        // Check that item was deleted from 2023 partition
        const results2023 = await db.readByFilter<TestData>(
            { timestamp: new Date('2023-06-15').getTime() },
            'test',
        )
        expect(results2023).toHaveLength(1)
        expect(results2023[0].name).toBe('Item 2')

        // Check that item in 2024 partition remains
        const results2024 = await db.readByFilter<TestData>(
            { timestamp: new Date('2024-01-01').getTime() },
            'test',
        )
        expect(results2024).toHaveLength(1)
        expect(results2024[0].name).toBe('Item 3')
    })
})

describe('LineDb select', () => {
    const dbFolder = path.join(process.cwd(), 'test-part-linedb-select')
    let db: LineDb

    beforeEach(async () => {
        try {
            await fs.rm(dbFolder, { recursive: true, force: true })
        } catch {}
        await fs.mkdir(dbFolder, { recursive: true })

        const adapterTestDataOptions: JSONLFileOptions<TestData> = {
            collectionName: 'test',
            encryptKeyForLineDb: '',
            indexedFields: ['timestamp'],
        }

        db = new LineDb()
        await db.init(true, {
            dbFolder,
            collections: [
                adapterTestDataOptions as unknown as JSONLFileOptions<unknown>,
            ],
            partitions: [
                {
                    collectionName: 'test',
                    partIdFn: (item: Partial<TestData>) => {
                        if (!item.timestamp) return 'default'
                        const year = new Date(item.timestamp).getFullYear()
                        return year.toString()
                    },
                },
            ],
        })
    })

    afterEach(async () => {
        try {
            if (!shouldKeepTestFiles()) {
                await fs.rm(dbFolder, { recursive: true, force: true })
            }
        } catch {}
    })

    it.only('should return lodash chain and correctly filter', async () => {
        const testData: TestData[] = [
            {
                id: 1,
                name: 'Test-1',
                age: 25,
                timestamp: new Date('2023-01-01').getTime(),
            },
            {
                id: 2,
                name: 'Test-2',
                age: 35,
                timestamp: new Date('2023-01-02').getTime(),
            },
            {
                id: 3,
                name: 'Test-3',
                age: 45,
                timestamp: new Date('2024-01-01').getTime(),
            },
        ]
        await db.insert(testData, 'test')

        const result = await db.select<TestData>({ name: 'Test-1' }, 'test', {
            returnChain: true,
        })
        expect(result).toBeDefined()
        // Исправлено: убрана обёртка chain, так как result уже является lodash chain
        if (typeof result === 'object' && 'value' in result) {
            expect(result.value()).toEqual([testData[0]])
        } else {
            expect(result).toEqual([testData[0]])
        }

        const result2 = await db.select<TestData>({ name: 'Test-1' }, 'test', {
            returnChain: false,
        })
        expect(result2).toBeDefined()
        if (typeof result2 === 'object' && 'value' in result2) {
            expect(result2.value()).toEqual([testData[0]])
        } else {
            expect(result2).toEqual([testData[0]])
        }
    })

    it.only('should allow using lodash chains', async () => {
        const testData: TestData[] = [
            {
                id: 1,
                name: 'Test-1',
                age: 25,
                timestamp: new Date('2023-01-01').getTime(),
            },
            {
                id: 2,
                name: 'Test-2',
                age: 35,
                timestamp: new Date('2023-01-02').getTime(),
            },
            {
                id: 3,
                name: 'Test-3',
                age: 45,
                timestamp: new Date('2024-01-01').getTime(),
            },
        ]
        await db.insert(testData, 'test')

        const result = await db.select<TestData>({}, 'test', {
            returnChain: true,
        })
        if (typeof result === 'object' && 'value' in result) {
            const ages = result.map((x) => x.age).value()
            expect(ages).toEqual([25, 35, 45])
        } else {
            const ages = result.map((x) => x.age)
            expect(ages).toEqual([25, 35, 45])
        }
    })

    it.only('should return empty chain if there are no matches', async () => {
        const testData: TestData[] = [
            {
                id: 1,
                name: 'Test-1',
                age: 25,
                timestamp: new Date('2023-01-01').getTime(),
            },
        ]
        await db.write(testData, 'test')
        const result = await db.select<TestData>({ name: 'NotExist' }, 'test')
        if (typeof result === 'object' && 'value' in result) {
            expect(result.value()).toEqual([])
        } else {
            expect(result).toEqual([])
        }
    })

    it.only('should work with partitioning', async () => {
        const adapterLocalTestDataOptions: JSONLFileOptions<TestData> = {
            collectionName: 'test',
            encryptKeyForLineDb: '',
            indexedFields: ['timestamp'],
        }
        const db = new LineDb()
        await db.init(true, {
            dbFolder,
            collections: [
                adapterLocalTestDataOptions as unknown as JSONLFileOptions<unknown>,
            ],
            partitions: [
                {
                    collectionName: 'test',
                    partIdFn: (item: Partial<TestData>) => {
                        const partValue = item?.value
                            ? item.value.toString()
                            : 'defValue'
                        if (!item.timestamp) return `${partValue}-defYear`
                        const year = new Date(item.timestamp).getFullYear()
                        return `${partValue}-${year}`
                    },
                },
            ],
        })
        const testData: TestData[] = [
            {
                id: 1,
                name: 'Test-1-value-1',
                age: 25,
                value: 1,
                timestamp: new Date('2023-01-01').getTime(),
            },
            {
                id: 2,
                name: 'Test-1-value-2',
                age: 26,
                value: 2,
                timestamp: new Date('2023-01-01').getTime(),
            },
            {
                id: 3,
                name: 'Test-3-value-1',
                age: 35,
                value: 1,
                timestamp: new Date('2024-01-01').getTime(),
            },
            {
                id: 4,
                name: 'Test-4-value-2',
                age: 45,
                value: 2,
                timestamp: new Date('2024-01-01').getTime(),
            },
            {
                id: -1,
                name: 'Test-5-value-default',
                age: 45,
                timestamp: new Date('2025-01-01').getTime(),
                value: undefined,
            },
        ]
        await db.insert(testData, 'test')

        const result2023 = await db.select<TestData>(
            'getFullYear(timestamp) == 2023',
            'test',
            {
                returnChain: true,
            },
        )
        if (typeof result2023 === 'object' && 'value' in result2023) {
            expect(result2023.value().length).toEqual(2)
            expect(result2023.value()[0]).toEqual(testData[0])
            expect(result2023.value()[1]).toEqual(testData[1])
        } else {
            expect(result2023).toEqual([testData[0], testData[1]])
        }

        const result2024 = await db.select<TestData>(
            'getFullYear(timestamp) == 2024',
            'test_2-2024',
            {
                returnChain: true,
            },
        )
        if (typeof result2024 === 'object' && 'value' in result2024) {
            expect(result2024.value()).toEqual([testData[3]])
        } else {
            expect(result2024).toEqual([testData[3]])
        }
    })
    it.only('should work with partitioning by id', async () => {
        const adapterLocalTestDataOptions: JSONLFileOptions<TestData> = {
            collectionName: 'test',
            encryptKeyForLineDb: '',
            indexedFields: ['timestamp'],
        }
        const db = new LineDb()
        await db.init(true, {
            dbFolder,
            collections: [
                adapterLocalTestDataOptions as unknown as JSONLFileOptions<unknown>,
            ],
            partitions: [
                {
                    collectionName: 'test',
                    partIdFn: (item: Partial<TestData>) => {
                        return item.id?.toString() ?? 'default'
                    },
                },
            ],
        })
        const testData: TestData[] = [
            {
                id: 1,
                name: 'Test-1-value-1',
                age: 25,
                value: 1,
                timestamp: new Date('2023-01-01').getTime(),
            },
            {
                id: 2,
                name: 'Test-1-value-2',
                age: 26,
                value: 2,
                timestamp: new Date('2023-01-01').getTime(),
            },
            {
                id: 3,
                name: 'Test-3-value-1',
                age: 35,
                value: 1,
                timestamp: new Date('2024-01-01').getTime(),
            },
            {
                id: 4,
                name: 'Test-4-value-2',
                age: 45,
                value: 2,
                timestamp: new Date('2024-01-01').getTime(),
            },
            {
                id: -1,
                name: 'Test-5-value-default',
                age: 45,
                timestamp: new Date('2025-01-01').getTime(),
                value: undefined,
            },
        ]
        await db.insert(testData, 'test')
    })
})
