import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LineDb } from './LineDb.js'
import { JSONLFile, TransactionOptions } from '../adapters/node/JSONLFile.js'
import fs from 'node:fs/promises'
import path from 'node:path'

interface TestData {
    id: number
    name: string
    age: number
}
interface TestUser {
    id: number
    username: string
    password: string
    isActive: boolean
    role: string
    timestamp: number
}

describe('LineDb', () => {
    const testFileData = path.join(process.cwd(), 'test-data/testData.jsonl')

    const testFile = testFileData
    let db: LineDb<TestData>
    let adapter: JSONLFile<TestData>
    let adapterUser: JSONLFile<TestUser>

    beforeEach(async () => {
        try {
            await fs.unlink(testFile)
        } catch (error) {
            // Игнорируем ошибку, если файл не существует
        }
        adapter = new JSONLFile<TestData>(testFile)
        db = new LineDb<TestData>(adapter)
        await db.init(true)
    })

    afterEach(async () => {
        // try {
        //     await fs.unlink(testFile)
        // } catch (error) {
        //     // Игнорируем ошибку, если файл не существует
        // }
    })

    describe.skip('Инициализация', () => {
        it('должен успешно инициализироваться', async () => {
            expect(db).toBeDefined()
            await expect(db.init()).resolves.not.toThrow()
        })

        it('должен создавать файл при инициализации', async () => {
            await db.init()
            const exists = await fs
                .access(testFile)
                .then(() => true)
                .catch(() => false)
            expect(exists).toBe(true)
        })
    })

    describe('Операции с данными', () => {
        it('должен добавлять новую запись', async () => {
            const data: TestData = { id: 1, name: 'Test', age: 25 }
            await db.write(data)
            const result = await db.read()
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual(data)
        })

        it('должен обновлять существующую запись', async () => {
            const data: TestData = { id: 1, name: 'Test', age: 25 }
            await db.write(data)

            const updatedData = { ...data, age: 26 }
            await db.write(updatedData)

            const result = await db.read()
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual(updatedData)
        })

        it('должен удалять запись', async () => {
            const data: TestData[] = [
                { id: -1, name: 'Test-1', age: 25 },
                { id: -1, name: 'Test-2', age: 25 },
                { id: -1, name: 'Test-3', age: 25 },
            ]
            await db.write(data)
            await db.delete({ id: 2 })
            const result = await db.read()
            expect(result).toHaveLength(2)
            expect(result[0]).toEqual(data[0])
            expect(result[1]).toEqual(data[2])
        })

        it('должен читать запись по id', async () => {
            const data: TestData = { id: -1, name: 'Test', age: 25 }
            await db.init(true)
            await db.write(data)
            const result = await db.readByData({ id: 1 })
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual(data)
        })

        it('должен читать записи с частичным совпадением', async () => {
            const data1: TestData = { id: 1, name: 'Test User', age: 25 }
            const data2: TestData = { id: 2, name: 'Another User', age: 30 }
            await db.write([data1, data2])

            const result = await db.readByData(
                { name: 'Test' },
                { strictCompare: false },
            )
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual(data1)
        })
    })

    describe.skip('Кэширование', () => {
        it('должен кэшировать записи', async () => {
            const data: TestData = { id: 1, name: 'Test', age: 25 }
            await db.write(data)

            // Первое чтение должно загрузить в кэш
            await db.readByData({ id: 1 })

            // Второе чтение должно использовать кэш
            const result = await db.readByData({ id: 1 })
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual(data)
        })

        it('должен инвалидировать кэш при обновлении', async () => {
            const data: TestData = { id: 1, name: 'Test', age: 25 }
            await db.write(data)

            // Загружаем в кэш
            await db.readByData({ id: 1 })

            // Обновляем данные
            const updatedData = { ...data, name: 'Updated', age: 26 }
            await db.write(updatedData)

            // Проверяем, что кэш обновился
            const result = await db.readByData({ id: 1 })
            expect(result[0]).toEqual(updatedData)
        })
    })

    describe.skip('Генерация ID', () => {
        it('должен генерировать последовательные ID', async () => {
            const data1: Partial<TestData> = { name: 'Test 1', age: 25 }
            const data2: Partial<TestData> = { name: 'Test 2', age: 30 }
            const data3: Partial<TestData> = { name: 'Test 2', age: 30 }
            const data4: Partial<TestData> = { name: 'Test 2', age: 30 }
            const data5: Partial<TestData> = { name: 'Test 2', age: 30 }

            await db.write(data1 as TestData)
            await db.write(data2 as TestData)
            await db.write(data3 as TestData)
            // Обновляем данные
            const updatedData = {
                name: 'Updated',
                age: 26,
                id: await db.lastSequenceId(),
            }
            await db.write(updatedData)
            await db.write(data4 as TestData)
            await db.write(data5 as TestData)

            const result = await db.read()
            expect(result).toHaveLength(5)
            expect(result[0].id).toBe(1)
            expect(result[1].id).toBe(2)
            expect(result[2].id).toBe(3)
            expect(result[3].id).toBe(4)
            expect(result[4].id).toBe(5)
        })

        it('должен использовать существующий ID при обновлении', async () => {
            const data: TestData = { id: 1, name: 'Test', age: 25 }
            await db.write(data)

            const updatedData = { ...data, age: 26 }
            await db.write(updatedData)

            const result = await db.read()
            expect(result).toHaveLength(1)
            expect(result[0].id).toBe(1)
        })
    })

    describe.skip('Обработка ошибок', () => {
        it('должен выбрасывать ошибку при чтении неинициализированной БД', async () => {
            const ladapter = new JSONLFile<TestData>(testFile)
            const newDb = new LineDb<TestData>(ladapter)
            await expect(newDb.read()).rejects.toThrow()
        })

        it('должен выбрасывать ошибку при записи неинициализированной БД', async () => {
            const ladapter = new JSONLFile<TestData>(testFile)
            const newDb = new LineDb<TestData>(ladapter)
            const data: TestData = { id: 1, name: 'Test', age: 25 }
            await expect(newDb.write(data)).rejects.toThrow()
        })
    })

    describe.skip('Произвольная функция генерации ID', () => {
        interface CustomIdData {
            id: number
            name: string
            age: number
            category: string
        }

        const customIdTestFile = path.join(
            process.cwd(),
            'test-data/custom-id-test.jsonl',
        )
        let customIdDb: LineDb<CustomIdData>

        beforeEach(async () => {
            try {
                await fs.unlink(customIdTestFile)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }
            const customIdAdapter = new JSONLFile<CustomIdData>(
                customIdTestFile,
            )
            customIdDb = new LineDb<CustomIdData>(customIdAdapter, {
                nextIdFn: async (data) => {
                    // Генерируем ID на основе категории и возраста
                    const category =
                        (data as CustomIdData).category || 'default'
                    const age = (data as CustomIdData).age || 0

                    // Генерируем криптографически стойкое случайное число
                    const randomBytes = new Uint8Array(4)
                    crypto.getRandomValues(randomBytes)
                    const randomHex = Array.from(randomBytes)
                        .map((b) => b.toString(16).padStart(2, '0'))
                        .join('')

                    // Добавляем микросекунды к временной метке
                    const timestamp = `${Date.now()}-${
                        performance
                            .now()
                            .toString()
                            .split('.')[1]
                            ?.slice(0, 3) || '000'
                    }`

                    // Добавляем хеш от входных данных
                    const inputHash = await crypto.subtle
                        .digest(
                            'SHA-256',
                            new TextEncoder().encode(JSON.stringify(data)),
                        )
                        .then((hash) =>
                            Array.from(new Uint8Array(hash))
                                .map((b) => b.toString(16).padStart(2, '0'))
                                .join('')
                                .slice(0, 8),
                        )

                    return `${category}-${age}-${timestamp}-${randomHex}-${inputHash}`
                },
            })
            await customIdDb.init(true)
        })

        afterEach(async () => {
            // try {
            //     await fs.unlink(customIdTestFile)
            // } catch (error) {
            // Игнорируем ошибку, если файл не существует
            // }
        })

        it('должен использовать произвольную функцию для генерации ID', async () => {
            const data: Partial<CustomIdData> = {
                name: 'Test User',
                age: 25,
                category: 'premium',
            }

            await customIdDb.write(data as CustomIdData)
            const result = await customIdDb.read()

            expect(result).toHaveLength(1)
            expect(result[0].id).toMatch(
                /^premium-25-\d+-\d{3}-[a-f0-9]{8}-[a-f0-9]{8}$/,
            )
        })

        it('должен генерировать уникальные ID для разных записей', async () => {
            const data1: Partial<CustomIdData> = {
                name: 'User 1',
                age: 25,
                category: 'premium',
            }
            const data2: Partial<CustomIdData> = {
                name: 'User 2',
                age: 25,
                category: 'premium',
            }

            await customIdDb.write([
                data1 as CustomIdData,
                data2 as CustomIdData,
            ])

            const result = await customIdDb.read()
            expect(result).toHaveLength(2)
            expect(result[0].id).not.toBe(result[1].id)
        })

        it('должен сохранять сгенерированный ID при обновлении записи', async () => {
            const data: Partial<CustomIdData> = {
                name: 'Test User',
                age: 25,
                category: 'premium',
            }

            await customIdDb.write(data as CustomIdData)
            const originalResult = await customIdDb.read()
            const originalId = originalResult[0].id

            // Обновляем запись
            const updatedData = {
                ...originalResult[0],
                age: 26,
            }
            await customIdDb.write(updatedData)

            const updatedResult = await customIdDb.read()
            expect(updatedResult[0].id).toBe(originalId)
        })
    })

    describe.skip('Конкурентная запись', () => {
        it('должен корректно обрабатывать конкурентные записи', async () => {
            const testData: Partial<TestData>[] = []
            const count = 200
            for (let i = 0; i < count; i++) {
                const data: Partial<TestData> = {
                    name: `Test ${i}`,
                    age: 20 + i,
                }
                testData.push(data)
            }
            await Promise.all(
                testData.map((data) => db.write(data as TestData)),
            )

            const result = await db.read()
            expect(result).toHaveLength(count)

            // Проверяем, что все ID уникальны
            const ids = result.map((item) => item.id)
            const uniqueIds = new Set(ids)
            expect(uniqueIds.size).toBe(count)
        })
    })

    describe.skip('Автоинкремент ID для разных файлов', () => {
        const testFile2 = path.join(process.cwd(), 'test-data/test2.jsonl')
        let db2: LineDb<TestData>

        beforeEach(async () => {
            try {
                await fs.unlink(testFile2)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }
            const adapter2 = new JSONLFile<TestData>(testFile2)
            db2 = new LineDb<TestData>(adapter2)
            await db2.init(true)
        })

        afterEach(async () => {
            try {
                await fs.unlink(testFile2)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }
        })

        it('должен поддерживать независимый автоинкремент ID для разных файлов', async () => {
            // Записываем данные в первый файл
            const data1: Partial<TestData> = { name: 'Test 1', age: 25 }
            await db.write(data1 as TestData)

            // Записываем данные во второй файл
            const data2: Partial<TestData> = { name: 'Test 2', age: 30 }
            await db2.write(data2 as TestData)

            // Проверяем результаты
            const result1 = await db.read()
            const result2 = await db2.read()

            expect(result1[0].id).toBe(1)
            expect(result2[0].id).toBe(1)
        })
    })

    /*
    describe('withTransaction', () => {
        it.skip('должен вызывать withTransaction адаптера внутри writeLock', async () => {
            const callback = vi.fn().mockResolvedValue(undefined)

            await db.withTransaction(callback)

            expect(adapter.withTransaction).toHaveBeenCalledWith(callback)
        })

        it.skip('должен пробрасывать ошибки из callback', async () => {
            const error = new Error('test error')
            const callback = vi.fn().mockRejectedValue(error)

            await expect(db.withTransaction(callback)).rejects.toThrow(error)
        })

        it('должен выполнять операции в транзакции', async () => {
            const testData: TestData[] = [
                { id: -1, name: 'test', age: 40 },
                { id: -1, name: 'test2', age: 40 },
            ]

            const callback = async (
                adapter: JSONLFile<TestData>,
                db: LineDb<TestData>,
            ) => {
                const testDataIds = await db.setIds(testData)
                await adapter.write(testDataIds)
                console.log(await db.nextId())
                // throw new Error('Test error')
                // await adapter.write(testData)
            }

            try {
                await db.withTransaction(callback, db, { rollback: true })
            } catch (error) {
                expect(error).toBeInstanceOf(Error)
            }
            const dbContent = await db.read()
            expect(dbContent).toHaveLength(2)
            expect(dbContent[0]).toEqual(testData[0])
        })
    })
    */
})
