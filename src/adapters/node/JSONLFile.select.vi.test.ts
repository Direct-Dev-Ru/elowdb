import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import fs, { read } from 'node:fs'
import path from 'node:path'
import { JSONLFile } from './JSONLFile.js'
import { TestData } from '../../common/interfaces/test-data.js'
interface User {
    id: string
    name: string
    email: string
    age?: number | null
    createdAt: Date
    isActive: boolean
}
import { LineDbAdapterOptions } from '../../common/interfaces/jsonl-file.js'
import { update } from 'lodash'

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

describe('JSONLFile Select operations', () => {
    // const testDir = path.join(process.cwd(), 'test-data')
    const testDir = path.join('test-select-jsonl')
    const testFileMain = path.join(testDir, 'testResult')
    let jsonlFile: JSONLFile<User>
    let logInThisTest = true

    beforeEach(async () => {
        // Create test directory if it doesn't exist
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true })
        }
    })

    afterAll(async () => {
        if (true || !shouldKeepTestFiles()) {
            // Очищаем тестовую директорию после каждого теста
            const files = await fs.promises.readdir(testDir)
            await Promise.all(
                files.map((file) => safeUnlink(path.join(testDir, file))),
            )
        }
    })

    describe('JSONLFile select operations', () => {
        it('00U.should select records by filter', async () => {
            const testFile = `${testFileMain}_00U.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<User>(testFile, '', {
                allocSize: 512,
                indexedFields: ['id', 'email'],
            })
            await jsonlFile.init()

            const initialData: User[] = [
                {
                    id: '1',
                    name: 'Test User 1',
                    email: 'test1@example.com',
                    age: 20,
                    createdAt: new Date(),
                    isActive: true,
                },
                {
                    id: '2',
                    name: 'Test User 2',
                    email: 'test2@example.com',
                    age: 17,
                    createdAt: new Date(),
                    isActive: false,
                },
            ]

            await jsonlFile.insert(initialData)
            logTest(
                logInThisTest,
                'initialData positions: ',
                await jsonlFile.getPositionsNoLock(),
            )

            const result = await jsonlFile.select(`not isActive`)
            expect(result).toHaveLength(1)
            logTest(logInThisTest, 'result: ', result)

            const result2 = await jsonlFile.select(`isActive && age > 20`)
            expect(result2).toHaveLength(0)
            logTest(logInThisTest, 'result2: ', result2)

            await jsonlFile.update({ isActive: false }, `isActive`)
            await jsonlFile.delete(`not isActive`)
            const resultAfterDelete = await jsonlFile.select({})
            expect(resultAfterDelete).toHaveLength(0)
            logTest(logInThisTest, 'resultAfterDelete: ', resultAfterDelete)
        })
    })

    describe('Типы фильтров', () => {
        it('01F.should select with simple object filter', async () => {
            const testFile = `${testFileMain}_01F.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<User>(testFile, '', {
                allocSize: 512,
                indexedFields: ['id', 'email'],
            })
            await jsonlFile.init()

            const initialData: User[] = [
                {
                    id: '1',
                    name: 'John Doe',
                    email: 'john@example.com',
                    age: 25,
                    createdAt: new Date(),
                    isActive: true,
                },
                {
                    id: '2',
                    name: 'Jane Smith',
                    email: 'jane@example.com',
                    age: 30,
                    createdAt: new Date(),
                    isActive: true,
                },
                {
                    id: '3',
                    name: 'Bob Johnson',
                    email: 'bob@example.com',
                    age: 35,
                    createdAt: new Date(),
                    isActive: false,
                },
            ]

            await jsonlFile.insert(initialData)

            // Точное совпадение
            const result1 = await jsonlFile.select({ name: 'John Doe' })
            expect(result1).toHaveLength(1)
            expect(result1[0].name).toBe('John Doe')

            // Поиск по нескольким полям
            const result2 = await jsonlFile.select({
                name: 'Jane Smith',
                isActive: true,
            })
            expect(result2).toHaveLength(1)
            expect(result2[0].name).toBe('Jane Smith')
            expect(result2[0].isActive).toBe(true)

            // Поиск по несуществующему значению
            const result3 = await jsonlFile.select({ name: 'NonExistent' })
            expect(result3).toHaveLength(0)
        })

        it('02F.should select with MongoDB-like filter', async () => {
            const testFile = `${testFileMain}_02F.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<User>(testFile, '', {
                allocSize: 512,
                indexedFields: ['id', 'email'],
            })
            await jsonlFile.init()

            const initialData: User[] = [
                {
                    id: '1',
                    name: 'John Doe',
                    email: 'john@example.com',
                    age: 25,
                    createdAt: new Date(),
                    isActive: true,
                },
                {
                    id: '2',
                    name: 'Jane Smith',
                    email: 'jane@example.com',
                    age: 30,
                    createdAt: new Date(),
                    isActive: true,
                },
                {
                    id: '3',
                    name: 'Bob Johnson',
                    email: 'bob@example.com',
                    age: 35,
                    createdAt: new Date(),
                    isActive: false,
                },
                {
                    id: '4',
                    name: 'Alice Brown',
                    email: 'alice@example.com',
                    age: 40,
                    createdAt: new Date(),
                    isActive: true,
                },
            ]

            await jsonlFile.insert(initialData)

            // Операторы сравнения
            const result1 = await jsonlFile.select(
                {
                    age: { $gt: 30 },
                },
                { filterType: 'mongodb' },
            )
            expect(result1).toHaveLength(2)
            expect(result1.every((user) => user.age! > 30)).toBe(true)

            const result2 = await jsonlFile.select(
                {
                    age: { $gte: 30, $lt: 40 },
                },
                { filterType: 'mongodb' },
            )
            expect(result2).toHaveLength(2)
            expect(
                result2.every((user) => user.age! >= 30 && user.age! < 40),
            ).toBe(true)

            // Оператор $in
            const result3 = await jsonlFile.select(
                {
                    email: { $in: ['john@example.com', 'jane@example.com'] },
                },
                { filterType: 'mongodb' },
            )
            expect(result3).toHaveLength(2)
            expect(result3.map((user) => user.email)).toContain(
                'john@example.com',
            )
            expect(result3.map((user) => user.email)).toContain(
                'jane@example.com',
            )

            // Логические операторы
            const result4 = await jsonlFile.select(
                {
                    $or: [{ age: { $lt: 30 } }, { age: { $gt: 35 } }],
                    isActive: true,
                },
                { filterType: 'mongodb' },
            )
            expect(result4).toHaveLength(2)
            expect(
                result4.every(
                    (user) =>
                        (user.age! < 30 || user.age! > 35) && user.isActive,
                ),
            ).toBe(true)
        })

        it('03F.should select with string filter (filtrex)', async () => {
            const testFile = `${testFileMain}_03F.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<User>(testFile, '', {
                allocSize: 512,
                indexedFields: ['id', 'email'],
            })
            await jsonlFile.init()

            const initialData: User[] = [
                {
                    id: '1',
                    name: 'John Doe',
                    email: 'john@example.com',
                    age: 25,
                    createdAt: new Date(),
                    isActive: true,
                },
                {
                    id: '2',
                    name: 'Jane Smith',
                    email: 'jane@example.com',
                    age: 30,
                    createdAt: new Date(),
                    isActive: true,
                },
                {
                    id: '3',
                    name: 'Bob Johnson',
                    email: 'bob@example.com',
                    age: 35,
                    createdAt: new Date(),
                    isActive: false,
                },
            ]

            await jsonlFile.insert(initialData)

            // Простые условия
            const result1 = await jsonlFile.select('age > 25')
            expect(result1).toHaveLength(2)
            expect(result1.every((user) => user.age! > 25)).toBe(true)

            // Сложные условия
            const result2 = await jsonlFile.select(
                'age >= 25 && strStartsWith(name, "J") && isActive',
            )
            expect(result2).toHaveLength(2)
            expect(
                result2.every(
                    (user) =>
                        user.age! >= 25 &&
                        user.name.startsWith('J') &&
                        user.isActive,
                ),
            ).toBe(true)

            // Использование функций
            const result3 = await jsonlFile.select(
                'strLen(name) > 3 && strContains(email, "@")',
            )
            expect(result3).toHaveLength(3)
            expect(
                result3.every(
                    (user) => user.name.length > 3 && user.email.includes('@'),
                ),
            ).toBe(true)

            // Логические операторы
            const result4 = await jsonlFile.select('age <= 30 || age > 35')
            expect(result4).toHaveLength(2)
            expect(
                result4.every((user) => user.age! <= 30 || user.age! > 35),
            ).toBe(true)
        })

        it('04F.should select with function filter', async () => {
            const testFile = `${testFileMain}_04F.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<User>(testFile, '', {
                allocSize: 512,
                indexedFields: ['id', 'email'],
            })
            await jsonlFile.init()

            const initialData: User[] = [
                {
                    id: '1',
                    name: 'John Doe',
                    email: 'john@example.com',
                    age: 25,
                    createdAt: new Date(),
                    isActive: true,
                },
                {
                    id: '2',
                    name: 'Jane Smith',
                    email: 'jane@example.com',
                    age: 30,
                    createdAt: new Date(),
                    isActive: true,
                },
                {
                    id: '3',
                    name: 'Bob Johnson',
                    email: 'bob@example.com',
                    age: 35,
                    createdAt: new Date(),
                    isActive: false,
                },
            ]

            await jsonlFile.insert(initialData)

            // Простая функция
            const result1 = await jsonlFile.select((user) => user.age! > 25)
            expect(result1).toHaveLength(2)
            expect(result1.every((user) => user.age! > 25)).toBe(true)

            // Сложная логика
            const result2 = await jsonlFile.select((user) => {
                const isAdult = user.age! >= 18
                const hasValidEmail = user.email.includes('@')
                const isActive = user.isActive
                return isAdult && hasValidEmail && isActive
            })
            expect(result2).toHaveLength(2)
            expect(
                result2.every(
                    (user) =>
                        user.age! >= 18 &&
                        user.email.includes('@') &&
                        user.isActive,
                ),
            ).toBe(true)

            // Функция с дополнительной логикой
            const result3 = await jsonlFile.select((user) => {
                const namestrStartsWithJ = user.name.startsWith('J')
                const ageInRange = user.age! >= 25 && user.age! <= 35
                return namestrStartsWithJ && ageInRange
            })
            expect(result3).toHaveLength(2)
            expect(
                result3.every(
                    (user) =>
                        user.name.startsWith('J') &&
                        user.age! >= 25 &&
                        user.age! <= 35,
                ),
            ).toBe(true)
        })

        it('05F.should select with filter options', async () => {
            const testFile = `${testFileMain}_05F.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<User>(testFile, '', {
                allocSize: 512,
                indexedFields: ['id', 'email'],
            })
            await jsonlFile.init()

            const initialData: User[] = [
                {
                    id: '1',
                    name: 'John Doe',
                    email: 'john@example.com',
                    age: 25,
                    createdAt: new Date(),
                    isActive: true,
                },
                {
                    id: '2',
                    name: 'John Smith',
                    email: 'john.smith@example.com',
                    age: 30,
                    createdAt: new Date(),
                    isActive: true,
                },
                {
                    id: '3',
                    name: 'Jane Doe',
                    email: 'jane@example.com',
                    age: 35,
                    createdAt: new Date(),
                    isActive: false,
                },
            ]

            await jsonlFile.insert(initialData)

            // Строгое сравнение
            const result1 = await jsonlFile.select(
                { name: 'John' },
                { strictCompare: true },
            )
            expect(result1).toHaveLength(0) // Нет точного совпадения

            // Нестрогое сравнение (поиск подстроки)
            const result2 = await jsonlFile.select(
                { name: 'John' },
                { strictCompare: false },
            )
            expect(result2).toHaveLength(2) // Найдены записи, содержащие "John"

            // Указание типа фильтра
            const result3 = await jsonlFile.select(
                { age: { $gt: 25 } },
                { filterType: 'mongodb' },
            )
            expect(result3).toHaveLength(2)
            expect(result3.every((user) => user.age! > 25)).toBe(true)

            // Комбинация опций
            const result4 = await jsonlFile.select(
                { name: 'John' },
                {
                    strictCompare: false,
                    filterType: 'base',
                },
            )
            expect(result4).toHaveLength(2)
            expect(result4.every((user) => user.name.includes('John'))).toBe(
                true,
            )
        })

        it('06F.should select with complex MongoDB operators', async () => {
            const testFile = `${testFileMain}_06F.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<User>(testFile, '', {
                allocSize: 512,
                indexedFields: ['id', 'email'],
            })
            await jsonlFile.init()

            const initialData: User[] = [
                {
                    id: '1',
                    name: 'John Doe',
                    email: 'john@example.com',
                    age: 25,
                    createdAt: new Date(),
                    isActive: true,
                },
                {
                    id: '2',
                    name: 'Jane Smith',
                    email: 'jane@example.com',
                    age: 30,
                    createdAt: new Date(),
                    isActive: true,
                },
                {
                    id: '3',
                    name: 'Bob Johnson',
                    email: 'bob@example.com',
                    age: 35,
                    createdAt: new Date(),
                    isActive: false,
                },
                {
                    id: '4',
                    name: 'Alice Brown',
                    email: 'alice@example.com',
                    age: 40,
                    createdAt: new Date(),
                    isActive: true,
                },
            ]

            await jsonlFile.insert(initialData)
           
            // Оператор $and
            const result3 = await jsonlFile.select(
                {
                    $and: [{ age: { $gte: 30 } }, { isActive: true }],
                },
                { filterType: 'mongodb' },
            )
            expect(result3).toHaveLength(2)
            expect(
                result3.every((user) => user.age! >= 30 && user.isActive),
            ).toBe(true)

            // Оператор $nor
            const result4 = await jsonlFile.select(
                {
                    $nor: [{ age: { $lt: 30 } }, { isActive: false }],
                },
                { filterType: 'mongodb' },
            )
            expect(result4).toHaveLength(2)
            expect(
                result4.every(
                    (user) => !(user.age! < 30) && !(user.isActive === false),
                ),
            ).toBe(true)
        })

        it('07F.should select with advanced filtrex expressions', async () => {
            const testFile = `${testFileMain}_07F.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<User>(testFile, '', {
                allocSize: 512,
                indexedFields: ['id', 'email'],
            })
            await jsonlFile.init()

            const initialData: User[] = [
                {
                    id: '1',
                    name: 'John Doe',
                    email: 'john@example.com',
                    age: 25,
                    createdAt: new Date(),
                    isActive: true,
                },
                {
                    id: '2',
                    name: 'Jane Smith',
                    email: 'jane@example.com',
                    age: 30,
                    createdAt: new Date(),
                    isActive: true,
                },
                {
                    id: '3',
                    name: 'Bob Johnson',
                    email: 'bob@example.com',
                    age: 35,
                    createdAt: new Date(),
                    isActive: false,
                },
            ]

            await jsonlFile.insert(initialData)

            // Использование функций filtrex
            const result1 = await jsonlFile.select('strLen(name) > 8')
            expect(result1).toHaveLength(2)
            expect(result1.every((user) => user.name.length > 8)).toBe(true)

            // Сложные логические выражения
            const result2 = await jsonlFile.select(
                '(age > 25 and age < 35) or (not isActive)',
            )
            expect(result2).toHaveLength(2)
            expect(
                result2.every(
                    (user) =>
                        (user.age! > 25 && user.age! < 35) || !user.isActive,
                ),
            ).toBe(true)

            // Использование строковых функций
            const result3 = await jsonlFile.select(
                'strContains(strToLower(name),"john")',
            )
            expect(result3).toHaveLength(2)
            expect(result3[0].name.toLowerCase()).toContain('john')

            // Комбинированные условия
            const result4 = await jsonlFile.select(
                'age >= 30 and isActive and strContains(email,"@")',
            )
            expect(result4).toHaveLength(1)
            expect(result4[0].age).toBeGreaterThanOrEqual(30)
            expect(result4[0].isActive).toBe(true)
            expect(result4[0].email).toContain('@')
        })

        it('08F.should handle edge cases in filters', async () => {
            const testFile = `${testFileMain}_08F.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<User>(testFile, '', {
                allocSize: 512,
                indexedFields: ['id', 'email'],
            })
            await jsonlFile.init()

            const initialData: User[] = [
                {
                    id: '1',
                    name: 'John Doe',
                    email: 'john@example.com',
                    age: 25,
                    createdAt: new Date(),
                    isActive: true,
                },
                {
                    id: '2',
                    name: '',
                    email: 'empty@example.com',
                    age: null,
                    createdAt: new Date(),
                    isActive: false,
                },
                {
                    id: '3',
                    name: 'Bob Johnson',
                    email: 'bob@example.com',
                    age: 0,
                    createdAt: new Date(),
                    isActive: true,
                },
                {
                    id: '4',
                    name: 'Cindy Johnson',
                    email: 'cindy@example.com',
                    age: undefined,
                    createdAt: new Date(),
                    isActive: false,
                },
            ]

            await jsonlFile.insert(initialData)

            // Фильтр с null значениями
            const result1 = await jsonlFile.select('isNull(age)')
            logTest(
                logInThisTest,
                'isNull result:',
                result1.map((r) => ({ id: r.id, age: r.age })),
            )
            expect(result1).toHaveLength(1)
            expect(result1[0].age).toBeNull()

            // Фильтр с undefined значениями
            const resultUD = await jsonlFile.select('isUndefined(age)')
            logTest(
                logInThisTest,
                'isUndefined result:',
                resultUD.map((r) => ({ id: r.id, age: r.age })),
            )
            expect(resultUD).toHaveLength(1)
            expect(resultUD[0].age).toBeUndefined()

            // Фильтр с not Undefined значениями
            const result1_2 = await jsonlFile.select('isNotUndefined(age)')

            expect(result1_2).toHaveLength(3)
            expect(result1_2[0].age).toBeDefined()
            expect(result1_2[1].age).toBeDefined()

            // Фильтр с пустыми строками
            const result2 = await jsonlFile.select((user) => user.name === '')
            expect(result2).toHaveLength(1)
            expect(result2[0].name).toBe('')

            // Фильтр с нулевыми значениями
            const result3 = await jsonlFile.select((user) => user.age === 0)
            expect(result3).toHaveLength(1)
            expect(result3[0].age).toBe(0)

            // Строковый фильтр с пустыми значениями
            const result4 = await jsonlFile.select('name == ""')
            expect(result4).toHaveLength(1)
            expect(result4[0].name).toBe('')

            // MongoDB фильтр с undefined ( выводит и null и undefined)
            const result5 = await jsonlFile.select(
                {                    
                    $and: [{ age: undefined }],
                },
                { filterType: 'mongodb' },
            )
            logTest(true, 'result5:', result5)
            expect(result5).toHaveLength(2)
            expect(result5.map((r) => r.name).sort()).toEqual([
                '',
                'Cindy Johnson',
            ])
        }, 1_000_000)
    })
})
