import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { LineDb } from './LineDbv2.js'
import { LineDbAdapter } from '../common/interfaces/lineDb.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { logTest } from '../common/utils/log.js'
import { JSONLFile } from '../adapters/node/JSONLFile.js'

// Test data type with required timestamp field
interface TestData extends LineDbAdapter {
    id: number | string // Must match LineDbAdapter
    name: string
    age?: number
    value?: number
    userId?: number
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

        db = new LineDb()
        await db.init(true, {
            dbFolder,
            collections: [
                {
                    collectionName: 'test',
                    encryptKeyForLineDb: '',
                },
            ],
            partitions: [
                {
                    collectionName: 'test',
                    partIdFn: (item: Partial<TestData>) => {
                        if (!item.timestamp) return '_default'
                        const year = new Date(item.timestamp).getFullYear()
                        return year.toString()
                    },
                },
            ],
        })
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

    it('should create partition files based on timestamp year', async () => {
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
            { collectionName: 'test_2023' }
        )
        const adapter2024 = new JSONLFile(
            path.join(dbFolder, 'test_2024.jsonl'),
            '',
            { collectionName: 'test_2024' }
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
            ])
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
            }
        ]

        await db.insert(testData2, 'test')

        // Check data through separate JSONLFile adapters after insertion
        const data2023AfterInsert = await adapter2023.read() as TestData[]
        const data2024AfterInsert = await adapter2024.read() as TestData[]

        // Check that all records have unique IDs
        const allIds = [...data2023AfterInsert, ...data2024AfterInsert].map(item => item.id)
        const uniqueIds = new Set(allIds)
        expect(allIds.length).toBe(uniqueIds.size)

        // Check that IDs are sequential
        const sortedIds = [...uniqueIds].sort((a, b) => Number(a) - Number(b))
        expect(sortedIds).toEqual([1, 2, 3, 4, 5, 6])

        // Check that data is distributed across correct partitions
        expect(data2023AfterInsert).toHaveLength(4) // 2 original + 2 new 2023 records
        expect(data2024AfterInsert).toHaveLength(2) // 1 original + 1 new 2024 record

        // Check that new records have correct IDs and are in correct partitions
        const newItem2023 = data2023AfterInsert.find(item => item.name === 'Item 40')
        const newItem2024 = data2024AfterInsert.find(item => item.name === 'Item 50')
        const newItem2023_2 = data2023AfterInsert.find(item => item.name === 'Item 60')

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
        const sorted2023 = data2023AfterInsert.sort((a, b) => a.timestamp - b.timestamp)
        expect(sorted2023).toEqual(data2023AfterInsert)

        const sorted2024 = data2024AfterInsert.sort((a, b) => a.timestamp - b.timestamp)
        expect(sorted2024).toEqual(data2024AfterInsert)

        // Check preservation of all data fields
        const itemWithAllFields = data2023AfterInsert.find(item => item.name === 'Item 20')
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
                userId: 0
            }
        ]

        await db.insert(testData3, 'test')
        await adapter2023.init(true)
        const data2023AfterEmptyInsert = await adapter2023.read() as TestData[]
        const itemWithEmptyFields = data2023AfterEmptyInsert.find(item => item.name === 'Item 70')

        expect(itemWithEmptyFields).toBeDefined()
        expect(itemWithEmptyFields?.age).toBeUndefined()
        expect(itemWithEmptyFields?.value).toBeNull()
        expect(itemWithEmptyFields?.userId).toBe(0)

        // Check handling of large numbers
        const testData4: Partial<TestData>[] = [
            {
                name: 'Item 80',
                timestamp: new Date('2023-12-31').getTime(),
                value: Number.MAX_SAFE_INTEGER
            }
        ]

        await db.insert(testData4, 'test')
        await adapter2023.init(true)
        const data2023AfterBigIntInsert = await adapter2023.read() as TestData[]
        const itemWithBigInt = data2023AfterBigIntInsert.find(item => item.name === 'Item 80')

        expect(itemWithBigInt).toBeDefined()
        expect(itemWithBigInt?.value).toBe(Number.MAX_SAFE_INTEGER)

        // Check handling of negative values
        const testData5: Partial<TestData>[] = [
            {
                name: 'Item 90',
                timestamp: new Date('2023-12-31').getTime(),
                value: -999999
            }
        ]

        await db.insert(testData5, 'test')
        await adapter2023.init(true)
        const data2023AfterNegativeInsert = await adapter2023.read() as TestData[]
        const itemWithNegative = data2023AfterNegativeInsert.find(item => item.name === 'Item 90')

        expect(itemWithNegative).toBeDefined()
        expect(itemWithNegative?.value).toBe(-999999)

        // Check handling of very long strings
        const longString = 'a'.repeat(10000)
        const testData6: Partial<TestData>[] = [
            {
                name: longString,
                timestamp: new Date('2023-12-31').getTime()
            }
        ]

        await db.insert(testData6, 'test')
        await adapter2023.init(true)
        const data2023AfterLongStringInsert = await adapter2023.read() as TestData[]
        const itemWithLongString = data2023AfterLongStringInsert.find(item => item.name === longString)

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
            `(timestamp > ${new Date('2023-06-01').getTime()}) and (timestamp < ${new Date('2024-01-01').getTime()})`,
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

    it('should handle items without timestamp in default partition', async () => {
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
        expect(files).toContain('test__default.jsonl')

        // Read data from default partition
        const defaultResults = await db.readByFilter<TestData>(
            { name: 'Item 2' },
            'test',
        )
        expect(defaultResults).toHaveLength(1)
        expect(defaultResults[0].name).toBe('Item 2')
    })

    it('should update items in correct partitions', async () => {
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
        ]

        await db.write(testData, 'test')

        // Update first item's timestamp to 2024
        const updatedItem = {
            ...testData[0],
            timestamp: new Date('2024-06-01').getTime(),
        }
        await db.update(updatedItem, 'test')

        // Check that item moved to 2024 partition
        const results2023 = await db.readByFilter<TestData>(
            { timestamp: new Date('2023-01-01').getTime() },
            'test',
        )
        expect(results2023).toHaveLength(0)

        const results2024 = await db.readByFilter<TestData>(
            { timestamp: new Date('2024-01-01').getTime() },
            'test',
        )
        expect(results2024).toHaveLength(2)
    })

    it('should delete items from correct partitions', async () => {
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
