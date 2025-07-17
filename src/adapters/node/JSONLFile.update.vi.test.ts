import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import fs, { read } from 'node:fs'
import path from 'node:path'
import { JSONLFile } from './JSONLFile.js'
import { LinePositionsManager } from '../../common/positions/position.js'
import { RWMutex } from '@direct-dev-ru/rwmutex-ts'
import { json } from 'node:stream/consumers'
import { log } from 'node:console'
import { TestData } from '../../common/interfaces/test-data.js'
import {
    JSONLFileOptions,
    LineDbAdapterOptions,
} from '../../common/interfaces/jsonl-file.js'

const sortFn = (a: TestData, b: TestData) =>
    (a.id as string).localeCompare(b.id as string)

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

describe('JSONLFile', () => {
    // const testDir = path.join(process.cwd(), 'test-data')
    const testDir = path.join('test-data-jsonl')
    const testFileMain = path.join(testDir, 'testResult')
    let jsonlFile: JSONLFile<TestData>
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

    describe('JSONLFile update operations', () => {
        it('00U.should update single record and change indexed field', async () => {
            const testFile = `${testFileMain}_00U.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
                indexedFields: ['id', 'user'],
            })
            await jsonlFile.init()

            const initialData: TestData[] = [
                {
                    id: '1',
                    name: 'Test1',
                    value: 42,
                    user: 'User1',
                },
                {
                    id: '2',
                    name: 'Test2',
                    value: 43,
                    user: 'User2',
                },
            ]

            await jsonlFile.insert(initialData)
            logTest(
                true,
                'initialData positions: ',
                await jsonlFile.getPositionsNoLock(),
            )
            
            const updatedData1: TestData = {
                id: '1',
                name: 'Updated Test1',
                value: 100,
                user: 'User3',
            }
            const updatedData2: TestData = {
                id: '2',
                name: 'Updated Test2',
                value: 100,
                user: 'User4',
            }

            await jsonlFile.update(updatedData1, { id: '1' })
            
            await jsonlFile.update(updatedData2, { id: '2' })
            logTest(
                true,
                'updatedData positions: ',
                await jsonlFile.getPositionsNoLock(),
            )

            const result = await jsonlFile.read()
            expect(result).toHaveLength(2)
            logTest(false, 'result: ', result)
            expect(result[0]).toEqual({ ...updatedData1 })
            expect(result[1]).toEqual({ ...updatedData2 })

            const transactionId = await jsonlFile.beginTransaction({
                rollback: true,
                timeout: 100_000,
            })
            // logTest(logInThisTest, 'transactionId', transactionId)
            const transactionOptions: LineDbAdapterOptions = {
                inTransaction: true,
                transactionId,
            }

            await jsonlFile.withTransaction(async (tx, options) => {
                const record1 = await tx.readByFilter({ id: '1' }, options)
                await tx.update(
                    { value: record1[0].value + 100 },
                    { id: '1' },
                    options,
                )
                const result2 = await jsonlFile.read(() => true, options)
                expect(result2).toHaveLength(2)
                expect(result2[0]).toEqual({
                    ...updatedData1,
                    value: updatedData1.value + 100,
                })
                await tx.endTransaction()
            }, transactionOptions)
        })

        it('01U.should update single record', async () => {
            const testFile = `${testFileMain}_01U.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const initialData: TestData = {
                id: '1',
                name: 'Test1',
                value: 42,
                user: 'User1',
            }

            await jsonlFile.write(initialData)

            const updatedData: TestData = {
                id: '1',
                name: 'Updated Test1',
                value: 100,
                user: 'User1',
            }

            await jsonlFile.update(updatedData, { id: '1' })
            const result = await jsonlFile.read()
            expect(result).toHaveLength(1)
            logTest(false, 'result: ', result)
            expect(result).toEqual([{ ...updatedData }])

            const transactionId = await jsonlFile.beginTransaction({
                rollback: true,
                timeout: 100_000,
            })
            // logTest(logInThisTest, 'transactionId', transactionId)
            const transactionOptions: LineDbAdapterOptions = {
                inTransaction: true,
                transactionId,
            }

            await jsonlFile.withTransaction(async (tx, options) => {
                const record1 = await tx.readByFilter({ id: '1' }, options)
                await tx.update(
                    { value: record1[0].value + 100 },
                    { id: '1' },
                    options,
                )
                const result2 = await jsonlFile.read(() => true, options)
                expect(result2).toHaveLength(1)
                expect(result2[0]).toEqual({
                    ...updatedData,
                    value: updatedData.value + 100,
                })
                await tx.endTransaction()
            }, transactionOptions)
        })

        it('02U.should update multiple records', async () => {
            const testFile = `${testFileMain}_02U.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const initialData: TestData[] = [
                { id: '1', name: 'Test1', value: 42, user: 'User1' },
                { id: '2', name: 'Test2', value: 43, user: 'User2' },
                { id: '3', name: 'Test3', value: 44, user: 'User3' },
            ]

            await jsonlFile.write(initialData)

            const updatedData: TestData[] = [
                { id: '1', name: 'Updated Test1', value: 100, user: 'User1' },
                { id: '3', name: 'Updated Test3', value: 300, user: 'User3' },
            ]

            await jsonlFile.update(updatedData)
            const result = await jsonlFile.read()
            expect(result).toHaveLength(3)
            logTest(true, 'result: ', result)
            expect(result).toEqual([
                updatedData[0],
                initialData[1],
                updatedData[1],
            ])
        })

        it('03U.should handle update of non-existent record', async () => {
            const testFile = `${testFileMain}_03U.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const nonExistentData: Partial<TestData> = {
                name: 'Non Existent',
                value: 999,
                user: 'User999',
            }

            await jsonlFile.update(nonExistentData, { id: '999' })
            const result = await jsonlFile.read()
            expect(result).toHaveLength(0)
        })

        it('04U.should update records with custom id function', async () => {
            const testFile = `${testFileMain}_04U.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
                idFn: (data) => [`byUser:${data.user}`],
            })
            await jsonlFile.init()

            const initialData: TestData[] = [
                { id: '1', name: 'Test1', value: 42, user: 'User1' },
                { id: '2', name: 'Test2', value: 43, user: 'User2' },
            ]

            await jsonlFile.write(initialData)

            const updatedData: Partial<TestData> = {
                name: 'Updated Test1',
                value: 100,
                user: 'User1',
            }

            await jsonlFile.update(updatedData, { id: initialData[0].id })
            const result = await jsonlFile.read()
            expect(result).toHaveLength(2)
            expect(result[0]).toEqual({ ...updatedData, id: initialData[0].id })
            expect(result[1]).toEqual(initialData[1])
        })

        it('05U.should handle update with encryption', async () => {
            const testFile = `${testFileMain}_05U.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, 'test-key', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const initialData: TestData = {
                id: '1',
                name: 'Test1',
                value: 42,
                user: 'User1',
            }

            await jsonlFile.write(initialData)

            const updatedData: TestData = {
                id: '1',
                name: 'Updated Test1',
                value: 100,
                user: 'User1',
            }

            await jsonlFile.update(updatedData)
            const result = await jsonlFile.read()
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual(updatedData)

            // Проверяем, что данные в файле зашифрованы
            const fileContent = await fs.promises.readFile(testFile, 'utf8')
            const lines = fileContent
                .split('\n')
                .filter((line) => line.trim().length > 0)

            for (const line of lines) {
                expect(() => JSON.parse(line)).toThrow()
            }
        })

        it('06U.should handle duplicate records in update array', async () => {
            const testFile = `${testFileMain}_06U.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const initialData: TestData = {
                id: '1',
                name: 'Test1',
                value: 42,
                user: 'User1',
            }

            await jsonlFile.write(initialData)

            // Создаем массив с дубликатами
            const updateData: TestData[] = [
                { id: '1', name: 'Update1', value: 100, user: 'User1' },
                { id: '1', name: 'Update2', value: 200, user: 'User1' },
                { id: '1', name: 'Update3', value: 300, user: 'User1' },
            ]

            await jsonlFile.update(updateData, { id: initialData.id })
            const result = await jsonlFile.read()
            expect(result).toHaveLength(1)
            // Проверяем, что применены значения из последнего дубликата
            expect(result[0]).toEqual(updateData[2])
        })

        it('07U.should merge records with same id preserving last values', async () => {
            const testFile = `${testFileMain}_07U.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const initialData: TestData[] = [
                {
                    id: '1',
                    name: 'Test1',
                    value: 42,
                    user: 'User1',
                },
                {
                    id: '2',
                    name: 'Test2',
                    value: 43,
                    user: 'User2',
                },
            ]

            await jsonlFile.write(initialData)

            // Создаем массив с частичными обновлениями
            const updateData: Partial<TestData>[] = [
                { id: '1', name: 'Update1' },
                { id: '1', value: 200 },
                { id: '2', value: 430 },
                { id: '1', name: 'Update2', user: 'User2' },
            ]

            await jsonlFile.update(updateData)
            const result = await jsonlFile.read()
            expect(result).toHaveLength(2)
            // Проверяем, что все поля объединены корректно
            expect(result[0]).toEqual({
                id: '1',
                name: 'Update2',
                value: 200,
                user: 'User2',
            })
            expect(result[1]).toEqual({
                id: '2',
                name: 'Test2',
                value: 430,
                user: 'User2',
            })
        })

        it('08U.should handle empty update array', async () => {
            const testFile = `${testFileMain}_08U.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const initialData: TestData = {
                id: '1',
                name: 'Test1',
                value: 42,
                user: 'User1',
            }

            await jsonlFile.write(initialData)

            const result = await jsonlFile.update([], { id: initialData.id })
            expect(result).toHaveLength(0)

            const readResult = await jsonlFile.read()
            expect(readResult).toHaveLength(1)
            expect(readResult[0]).toEqual(initialData)
        })

        it('09U.should handle update with partial data', async () => {
            const testFile = `${testFileMain}_09U.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const initialData: TestData = {
                id: '1',
                name: 'Test1',
                value: 42,
                user: 'User1',
            }

            await jsonlFile.write(initialData)

            // Обновляем только одно поле
            const updateData: Partial<TestData> = {
                id: '1',
                value: 100,
            }

            await jsonlFile.update(updateData)
            const result = await jsonlFile.read()
            expect(result).toHaveLength(1)
            // Проверяем, что остальные поля остались без изменений
            expect(result[0]).toEqual({
                ...initialData,
                value: 100,
            })
        })

        it('10U.should update record and maintain name index', async () => {
            const testFile = `${testFileMain}_10U.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            // Создаем экземпляр с индексом по полю name
            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 128,
                idFn: (data) => [`byName:${data.name}`, `byUser:${data.user}`],
            })
            await jsonlFile.init()

            // Записываем начальные данные
            const initialData: TestData[] = [
                {
                    id: '1',
                    name: 'Test1',
                    value: 42,
                    user: 'User1',
                },
                {
                    id: '2',
                    name: 'Test1',
                    value: 44,
                    user: 'User1',
                },
                {
                    id: '3',
                    name: 'Test2',
                    value: 43,
                    user: 'User3',
                },
            ]

            await jsonlFile.write(initialData)
            const positions = await jsonlFile.getPositionsNoLock()
            logTest(false, 'positions before change: ', positions)

            // Проверяем, что можем найти запись по старому имени
            const resultBeforeUpdate = await jsonlFile.readByFilter({
                name: 'Test1',
            })
            expect(resultBeforeUpdate).toHaveLength(2)
            expect(resultBeforeUpdate).toEqual(
                initialData.filter((data) => data.name === 'Test1'),
            )

            // Обновляем имя записи
            const updateData: Partial<TestData> = {
                name: 'Updated Test1',
                value: 100,
                user: 'NewUser',
            }
            const filterData: Partial<TestData> = {
                name: 'Test1',
            }

            await jsonlFile.update(updateData, filterData)

            // logTest(false, 'positions after change: ', await jsonlFile.getPositionsNoLock())

            // Проверяем, что не можем найти запись по старому имени
            const resultAfterUpdateOldName = await jsonlFile.readByFilter({
                name: 'Test1',
                // user: 'NewUser',
            })
            expect(resultAfterUpdateOldName).toHaveLength(0)

            // Проверяем, что можем найти запись по новому имени
            const resultAfterUpdateNewName = await jsonlFile.readByFilter({
                name: 'Updated Test1',
                user: 'NewUser',
            })
            // logTest(false, 'resultAfterUpdateNewName: ', resultAfterUpdateNewName)
            expect(resultAfterUpdateNewName).toHaveLength(2)
            expect(resultAfterUpdateNewName[0]).toEqual({
                ...initialData[0],
                name: 'Updated Test1',
                value: 100,
                user: 'NewUser',
            })
            expect(resultAfterUpdateNewName[1]).toEqual({
                ...initialData[1],
                name: 'Updated Test1',
                value: 100,
                user: 'NewUser',
            })
        })

        it('11U.should handle update with attempt update id (not approoved) with filter data by id', async () => {
            const testFile = `${testFileMain}_11U.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const initialData: TestData = {
                id: '1',
                name: 'Test1',
                value: 42,
                user: 'User1',
            }

            await jsonlFile.write(initialData)

            const result = await jsonlFile.update(
                [{ id: '2', name: 'Updated Test1' }],
                { id: initialData.id },
            )
            expect(result).toHaveLength(1)

            const readResult = await jsonlFile.read()
            expect(readResult).toHaveLength(1)
            expect(readResult[0]).toEqual({
                ...initialData,
                name: 'Updated Test1',
            })
        })

        it('12U.should handle update with circular references', async () => {
            const testFile = `${testFileMain}_12U.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const initialData: TestData = {
                id: '1',
                name: 'Test1',
                value: 42,
                user: 'User1',
            }

            await jsonlFile.write(initialData)

            // Создаем объект с циклической ссылкой
            const circularObj: any = { id: '1', name: 'Circular' }
            circularObj.self = circularObj

            // Пытаемся обновить с циклической ссылкой
            await expect(
                jsonlFile.update(circularObj, { id: '1' }),
            ).rejects.toThrow()
        })

        it('13U.should handle update with very large values', async () => {
            const testFile = `${testFileMain}_13U.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 1024 * 1024, // 1MB
            })
            await jsonlFile.init()

            const initialData: TestData = {
                id: '1',
                name: 'Test1',
                value: 42,
                user: 'User1',
            }

            await jsonlFile.write(initialData)

            // Создаем очень большое значение для поля name
            const largeName = 'x'.repeat(1000000) // 1MB строка
            const updateData: Partial<TestData> = {
                name: largeName,
            }

            await jsonlFile.update(updateData, { id: '1' })
            const result = await jsonlFile.read()
            expect(result[0].name).toBe(largeName)
        })

        it('14U.should handle update with special characters in values', async () => {
            const testFile = `${testFileMain}_14U.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const initialData: TestData = {
                id: '1',
                name: 'Test1',
                value: 42,
                user: 'User1',
            }

            await jsonlFile.write(initialData)

            // Специальные символы в значениях
            const specialChars = {
                name: 'Test\n\r\t"\'\\',
                user: 'User\n\r\t"\'\\',
                value: 100,
            }

            await jsonlFile.update(specialChars, { id: '1' })
            const result = await jsonlFile.read()
            expect(result[0]).toEqual({
                ...initialData,
                ...specialChars,
            })
        })

        it('15U.should handle update with concurrent operations', async () => {
            const testFile = `${testFileMain}_15U.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const initialData: TestData[] = Array.from(
                { length: 10 },
                (_, i) => ({
                    id: i.toString(),
                    name: `Test${i}`,
                    value: i,
                    user: `User${i % 2}`,
                }),
            )

            await jsonlFile.write(initialData)

            // Создаем массив промисов для конкурентных обновлений
            const updatePromises = initialData.map((data, index) => {
                const updateData: Partial<TestData> = {
                    name: `Updated${index}`,
                    value: index * 10,
                }
                return jsonlFile.update(updateData, { id: data.id })
            })

            // Выполняем все обновления конкурентно
            await Promise.all(updatePromises)

            const result = await jsonlFile.read()
            expect(result).toHaveLength(10)
            result.forEach((record, index) => {
                expect(record.name).toBe(`Updated${index}`)
                expect(record.value).toBe(index * 10)
            })
        })
    })

})
