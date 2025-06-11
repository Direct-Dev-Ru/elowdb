import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { LineDb } from './LineDbv2.js'
import { LineDbAdapter } from '../common/interfaces/lineDb.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { logTest } from '../common/utils/log.js'
import { JSONLFile } from '../adapters/node/JSONLFile.js'

// Тестовый тип данных с обязательным полем timestamp
interface TestData extends LineDbAdapter {
    id: number | string // Должно соответствовать LineDbAdapter
    name: string
    age?: number
    value?: number
    userId?: number
    timestamp: number // timestamp в миллисекундах
}

function shouldKeepTestFiles(): boolean {
    const keepFiles = process.env.KEEP_TEST_FILES
    return keepFiles === 'true' || keepFiles === '1'
}

describe('LineDb Partitioning Tests', () => {
    const dbFolder = path.join(process.cwd(), 'test-part-linedb')
    let db: LineDb

    beforeEach(async () => {
        // Очищаем тестовую директорию перед каждым тестом
        try {
            await fs.rm(dbFolder, { recursive: true, force: true })
        } catch (error) {
            // Игнорируем ошибку, если директория не существует
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
        // Очищаем тестовую директорию после каждого теста
        try {
            if (!shouldKeepTestFiles()) {
                await fs.rm(dbFolder, { recursive: true, force: true })
            }
        } catch (error) {
            // Игнорируем ошибку
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

        // Проверяем, что создались файлы для разных партиций
        const files = await fs.readdir(dbFolder)
        expect(files).toContain('test_2023.jsonl')
        expect(files).toContain('test_2024.jsonl')

        // Проверяем данные через отдельные JSONLFile адаптеры
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

        // Проверяем данные за 2023 год
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

        // Проверяем данные за 2024 год
        expect(data2024).toHaveLength(1)
        expect(data2024).toEqual([
            expect.objectContaining({
                id: 3,
                name: 'Item 30',
                timestamp: new Date('2024-01-01').getTime(),
            }),
        ])

        // Проверяем вставку данных без ID и сквозную нумерацию
        const testData2: Partial<TestData>[] = [
            {
                name: 'Item 40',
                timestamp: new Date('2023-03-01').getTime(),
            },
            {
                name: 'Item 50',
                timestamp: new Date('2024-03-01').getTime(),
            },
            {
                name: 'Item 60',
                timestamp: new Date('2023-09-01').getTime(),
            }
        ]

        await db.insert(testData2, 'test')

        // Проверяем данные через отдельные JSONLFile адаптеры после вставки
        const data2023AfterInsert = await adapter2023.read() as TestData[]
        const data2024AfterInsert = await adapter2024.read() as TestData[]

        // Проверяем, что все записи имеют уникальные ID
        const allIds = [...data2023AfterInsert, ...data2024AfterInsert].map(item => item.id)
        const uniqueIds = new Set(allIds)
        expect(allIds.length).toBe(uniqueIds.size)

        // Проверяем, что ID идут последовательно
        const sortedIds = [...uniqueIds].sort((a, b) => Number(a) - Number(b))
        expect(sortedIds).toEqual([1, 2, 3, 4, 5, 6])

        // Проверяем, что данные распределились по правильным партициям
        expect(data2023AfterInsert).toHaveLength(4) // 2 исходных + 2 новых записи 2023 года
        expect(data2024AfterInsert).toHaveLength(2) // 1 исходная + 1 новая запись 2024 года

        // Проверяем, что новые записи имеют правильные ID и находятся в правильных партициях
        const newItem2023 = data2023AfterInsert.find(item => item.name === 'Item 40')
        const newItem2024 = data2024AfterInsert.find(item => item.name === 'Item 50')
        const newItem2023_2 = data2023AfterInsert.find(item => item.name === 'Item 60')

        expect(newItem2023).toBeDefined()
        expect(newItem2024).toBeDefined()
        expect(newItem2023_2).toBeDefined()

        expect(newItem2023?.id).toBeDefined()
        expect(newItem2024?.id).toBeDefined()
        expect(newItem2023_2?.id).toBeDefined()

        // Проверяем, что timestamp соответствует партиции
        expect(new Date(newItem2023!.timestamp).getFullYear()).toBe(2023)
        expect(new Date(newItem2024!.timestamp).getFullYear()).toBe(2024)
        expect(new Date(newItem2023_2!.timestamp).getFullYear()).toBe(2023)

    }, 1_000_000)

    it('should read data from correct partitions', async () => {
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

        // Читаем данные за 2023 год
        const results2023 = await db.readByFilter<TestData>(
            { timestamp: new Date('2023-01-01').getTime() },
            'test',
        )
        expect(results2023).toHaveLength(2)
        expect(
            results2023.every(
                (item) => new Date(item.timestamp).getFullYear() === 2023,
            ),
        ).toBe(true)

        // Читаем данные за 2024 год
        const results2024 = await db.readByFilter<TestData>(
            { timestamp: new Date('2024-01-01').getTime() },
            'test',
        )
        expect(results2024).toHaveLength(1)
        expect(results2024[0].timestamp).toBe(new Date('2024-01-01').getTime())
    })

    it('should handle items without timestamp in default partition', async () => {
        const testData: TestData[] = [
            {
                id: 1,
                name: 'Item 1',
                timestamp: new Date('2023-01-01').getTime(),
            },
            { id: 2, name: 'Item 2', timestamp: 0 }, // Без timestamp
        ]

        await db.write(testData, 'test')

        // Проверяем, что создался файл для дефолтной партиции
        const files = await fs.readdir(dbFolder)
        expect(files).toContain('test__default.jsonl')

        // Читаем данные из дефолтной партиции
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

        // Обновляем timestamp первого элемента на 2024 год
        const updatedItem = {
            ...testData[0],
            timestamp: new Date('2024-06-01').getTime(),
        }
        await db.update(updatedItem, 'test')

        // Проверяем, что элемент переместился в партицию 2024 года
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

        // Удаляем элемент из партиции 2023 года
        await db.delete({ timestamp: new Date('2023-01-01').getTime() }, 'test')

        // Проверяем, что элемент удален из партиции 2023 года
        const results2023 = await db.readByFilter<TestData>(
            { timestamp: new Date('2023-06-15').getTime() },
            'test',
        )
        expect(results2023).toHaveLength(1)
        expect(results2023[0].name).toBe('Item 2')

        // Проверяем, что элемент в партиции 2024 года остался
        const results2024 = await db.readByFilter<TestData>(
            { timestamp: new Date('2024-01-01').getTime() },
            'test',
        )
        expect(results2024).toHaveLength(1)
        expect(results2024[0].name).toBe('Item 3')
    })
})
