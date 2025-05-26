import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { JSONLFile } from './JSONLFile.js'
import { LinePositionsManager } from '../../common/positions/position.js'
import { RWMutex } from '@direct-dev-ru/rwmutex-ts'
import { json } from 'node:stream/consumers'
import { log } from 'node:console'

interface TestData {
    id: string
    name: string
    value: number
    user: string
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
        if (!shouldKeepTestFiles()) {
            // Очищаем тестовую директорию после каждого теста
            const files = await fs.promises.readdir(testDir)
            await Promise.all(
                files.map((file) => safeUnlink(path.join(testDir, file))),
            )
        }
    })

    describe('JSONLFile warm up', () => {
        it('01.should store collectionName in the adapter', async () => {
            logInThisTest = true
            const testFile = `${testFileMain}_B01.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
                // collectionName: 'test-warmup',
            })
            await jsonlFile.init()

            const testData: TestData = {
                id: '1',
                name: 'Test',
                value: 42,
                user: 'User1',
            }
            await jsonlFile.write(testData)
            const result = await jsonlFile.read()
            expect(result).toEqual([testData])
            logTest(
                logInThisTest,
                jsonlFile.getFilename(),
                jsonlFile.getCollectionName(),
            )
        })
    })

    describe.skip('JSONLFile step without transaction', () => {
        it('01.should write and read a single object', async () => {
            const testFile = `${testFileMain}_01.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const testData: TestData = {
                id: '1',
                name: 'Test',
                value: 42,
                user: 'User1',
            }
            await jsonlFile.write(testData)
            const result = await jsonlFile.read()
            expect(result).toEqual([testData])
        })

        it('02.should write and read multiple objects', async () => {
            const testFile = `${testFileMain}_02.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const testData: TestData[] = []
            for (let i = 1; i <= 10; i++) {
                testData.push({
                    id: i.toString(),
                    name: `Test${i}.`.repeat(getRandom(1, i)),
                    value: getRandom(20, 40),
                    user: `User${i % 2}`,
                })
            }
            await jsonlFile.write(testData[0])
            await jsonlFile.write(testData)
            const result = await jsonlFile.read()

            expect(result).toEqual(testData)

            const jsonlFile2 = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile2.init()
            await jsonlFile2.write([
                { ...testData[2], name: 'Test2.00' },
                { ...testData[4], name: 'Test4.00' },
            ])
            const result2 = await jsonlFile2.read()
            const testData2 = [...testData]
            testData2[2].name = 'Test2.00'
            testData2[4].name = 'Test4.00'
            expect(result2).toEqual(testData2)
        })

        it('03.should read by data', async () => {
            const testFile = `${testFileMain}_03.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const testData: TestData[] = []
            for (let i = 1; i <= 10; i++) {
                testData.push({
                    id: i.toString(),
                    name: `Test${i}.`.repeat(getRandom(1, 20)),
                    value: getRandom(20, 40),
                    user: `User${i % 2}`,
                })
            }

            await jsonlFile.write(testData)
            const result = await jsonlFile.readByData({ id: '5' })

            expect(Array.isArray(result)).toBe(true)
            if (Array.isArray(result)) {
                expect(result[0]).toEqual(testData[4]) // Индекс 4 соответствует id '5'
            }
            const result2 = await jsonlFile.readByData({ user: 'User1' })

            expect(Array.isArray(result2)).toBe(true)
            if (Array.isArray(result2)) {
                expect(result2).toEqual(
                    testData.filter((data) => data.user === 'User1'),
                )
            }

            const jsonlFileUserIdx = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
                idFn: (data) => [`byUser:${data.user}`],
            })
            await jsonlFileUserIdx.init()
            const result3 = await jsonlFileUserIdx.readByData(
                { user: 'User1' },
                { strictCompare: false },
            )
            expect(Array.isArray(result3)).toBe(true)
            if (Array.isArray(result3)) {
                expect(result3).toEqual(
                    testData.filter((data) => data.user === 'User1'),
                )
            }
        })

        it('04.should update existing record with encryption', async () => {
            const testFile = `${testFileMain}_04.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '1111111', {
                allocSize: 4096,
                // encrypt: async (text, cypherKey) => {
                //     return await encryptString(text, cypherKey)
                // },
                // decrypt: async (encryptedText, cypherKey) => {
                //     return await decryptString(encryptedText, cypherKey)
                // },
            })
            await jsonlFile.init()
            const testData: TestData[] = []
            for (let i = 1; i <= 20; i++) {
                testData.push({
                    id: i.toString(),
                    name: `Test${i}-`.repeat(getRandom(1, 20)),
                    value: getRandom(20, 40),
                    user: `User${i % 2}`,
                })
            }

            await jsonlFile.write(testData)

            const updId = '2'
            const updatedData: TestData = {
                id: updId,
                name: 'Updated',
                value: 100,
                user: 'User1',
            }
            await jsonlFile.write(updatedData)

            const result = await jsonlFile.readByData({ id: updId })
            expect(Array.isArray(result)).toBe(true)
            if (Array.isArray(result)) {
                expect(result[0]).toEqual(updatedData)
            }
        })

        it('05.should handle encryption', async () => {
            const testFile = `${testFileMain}_05.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            const encryptedFile = new JSONLFile<TestData>(
                testFile,
                'test-key',
                {
                    allocSize: 1024 * 8,
                    // encrypt: async (text, cypherKey) => {
                    //     return await encryptString(text, cypherKey)
                    // },
                    // decrypt: async (encryptedText, cypherKey) => {
                    //     return await decryptString(encryptedText, cypherKey)
                    // },
                },
            )
            await encryptedFile.init()

            const testData: TestData = {
                id: '1',
                name: 'Test',
                value: 42,
                user: 'User1',
            }

            await encryptedFile.write(testData)
            const result = await encryptedFile.read()

            expect(result).toEqual([testData])
        })

        it('06.should handle custom id function', async () => {
            const testFile = `${testFileMain}_06.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            const customIdFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 1024 * 8,
                idFn: (data) => [`byName:${data.name}`, `byId:${data.id}`],
            })
            await customIdFile.init()

            const testData: TestData[] = [
                { id: '1', name: 'Test1', value: 42, user: 'User1' },
                { id: '2', name: 'Test2', value: 43, user: 'User2' },
            ]

            await customIdFile.write(testData)
            const result = await customIdFile.readByData({ name: 'Test1' })

            expect(Array.isArray(result)).toBe(true)
            if (Array.isArray(result)) {
                expect(result[0]).toEqual(testData[0])
            }
        })

        it('07.should handle multiple updates', async () => {
            const testFile = `${testFileMain}_07.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            const testData: TestData[] = [
                { id: '1', name: 'Test1', value: 42, user: 'User1' },
                { id: '2', name: 'Test2', value: 43, user: 'User2' },
            ]
            const jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 1024 * 1,
                idFn: (data) => [`byName:${data.name}`, `byId:${data.id}`],
            })
            await jsonlFile.init()
            await jsonlFile.write(testData)

            // Update multiple times
            await jsonlFile.write({
                id: '1',
                name: 'Updated1',
                value: 100,
                user: 'User1',
            })
            await jsonlFile.write({
                id: '2',
                name: 'Updated2',
                value: 200,
                user: 'User2',
            })

            const result = await jsonlFile.read()
            console.log('result', result)

            expect(result).toEqual([
                { id: '1', name: 'Updated1', value: 100, user: 'User1' },
                { id: '2', name: 'Updated2', value: 200, user: 'User2' },
            ])
        })

        it('08.should handle concurrent writes', async () => {
            const testFile = `${testFileMain}_08.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            const testData: TestData[] = []
            for (let i = 1; i <= 1000; i++) {
                testData.push({
                    id: i.toString(),
                    name: `Test${i}.`.repeat(getRandom(1, 20)),
                    value: getRandom(20, 40),
                    user: `User${i % 2}`,
                })
            }
            const jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 1024 * 4,
                idFn: (data) => [`byUser:${data.user}`, `byId:${data.id}`],
            })
            await jsonlFile.init()
            await jsonlFile.write(testData)

            // Write all data concurrently
            await Promise.all(testData.map((data) => jsonlFile.write(data)))

            const result = await jsonlFile.read()
            expect(result).toEqual(testData)
        })

        it('09.should handle reading with filter function', async () => {
            const testFile = `${testFileMain}_09.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            const testData: TestData[] = []
            for (let i = 1; i <= 10; i++) {
                testData.push({
                    id: i.toString(),
                    name: `Test${i}.`.repeat(getRandom(1, 20)),
                    value: 51 * (i % 2),
                    user: `User${i % 2}`,
                })
            }
            const jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 1024 * 4,
                idFn: (data) => [`byUser:${data.user}`, `byId:${data.id}`],
            })
            await jsonlFile.init()
            await jsonlFile.write(testData)
            const result = await jsonlFile.read((data) => data.value > 50)

            expect(Array.isArray(result)).toBe(true)
            if (Array.isArray(result)) {
                expect(result.length).toBe(5) // Only values > 50
                expect(result.every((data) => data.value > 50)).toBe(true)
            }
        })

        it('10.should handle record deletion', async () => {
            const testFile = `${testFileMain}_10_deletion.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            const jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 128 * 1,
                idFn: (data) => [`byUser:${data.user}`, `byId:${data.id}`],
            })
            await jsonlFile.init()

            const testData: TestData[] = []
            for (let i = 1; i <= 10; i++) {
                testData.push({
                    id: i.toString(),
                    name: `Test${i}`,
                    value: i * 10,
                    user: `User${i % 2}`,
                })
            }

            // Записываем данные
            await jsonlFile.write(testData)

            // Удаляем несколько записей
            await jsonlFile.delete([{ id: '2', user: 'User1' }, { id: '4' }])
            // await jsonlFile.delete({ user: 'User1' })

            // // Проверяем, что удаленные записи не читаются
            // const result = await jsonlFile.read()
            // expect(result).toEqual(
            //     testData.filter((_, index) => index !== 1 && index !== 3),
            // )

            // // Проверяем поиск по id удаленной записи
            // const deletedResult = await jsonlFile.readByData({ id: '2' })
            // expect(Array.isArray(deletedResult)).toBe(true)
            // if (Array.isArray(deletedResult)) {
            //     expect(deletedResult.length).toBe(0)
            // }

            const checkId = '10'
            const result2 = await jsonlFile.readByData({ id: checkId })
            logTest(logInThisTest, 'result2', result2)
            expect(Array.isArray(result2)).toBe(true)
            if (Array.isArray(result2)) {
                expect(result2.length).toBe(1)
                expect(result2[0].id).toBe(checkId)
            }
            const result3 = await jsonlFile.readByData({ user: 'User0' })
            logTest(logInThisTest, 'result3', result3)
            expect(Array.isArray(result3)).toBe(true)
            if (Array.isArray(result3)) {
                expect(result3.length).toBe(3)
            }
        })

        it('11.should handle file compression', async () => {
            const testFile = `${testFileMain}_11.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            const jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 1024 * 4,
                idFn: (data) => [`byUser:${data.user}`, `byId:${data.id}`],
            })
            await jsonlFile.init(false)

            const testData: TestData[] = []
            for (let i = 1; i <= 10; i++) {
                testData.push({
                    id: i.toString(),
                    name: `Test${i}`,
                    value: i * 10,
                    user: `User${i % 2}`,
                })
            }

            // Записываем данные
            await jsonlFile.write(testData)

            // Удаляем несколько записей
            await jsonlFile.delete([
                testData[1], // id: '2'
                testData[3], // id: '4'
            ])
            const result2 = await jsonlFile.read()
            // logTest(logInThisTest, 'result2', result2)
            expect(result2).toEqual(
                testData.filter((_, index) => index !== 1 && index !== 3),
            )

            // Создаем новый экземпляр для проверки сжатия при инициализации
            const jsonlFile2 = new JSONLFile<TestData>(testFile, '', {
                allocSize: 1024 * 4,
                idFn: (data) => [`byUser:${data.user}`, `byId:${data.id}`],
            })
            await jsonlFile2.init(false)

            // Проверяем, что все записи доступны и в правильном порядке
            const result = await jsonlFile2.read()
            expect(result).toEqual(
                testData.filter((_, index) => index !== 1 && index !== 3),
            )

            // // Проверяем, что файл действительно сжат (нет пустых строк)
            // const fileContent = await fs.promises.readFile(testFile, 'utf8')
            // const lines = fileContent
            //     .split('\n')
            //     .filter((line) => line.trim().length > 0)
            // expect(lines.length).toBe(8) // 10 - 2 удаленные записи
        })
    })

    describe.skip('JSONLFile step withTransaction', () => {
        it('01T.should write and read multiple objects', async () => {
            const testFile = `${testFileMain}_01T.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const data1: TestData = {
                id: '1',
                name: 'Test 1',
                value: 25,
                user: 'User1',
            }
            const data2: TestData = {
                id: '2',
                name: 'Test 2',
                value: 30,
                user: 'User2',
            }

            await jsonlFile.withTransaction(
                async (tx) => {
                    await tx.write(data1)
                    await tx.write(data2)
                },
                { rollback: false },
            )

            const result = await jsonlFile.read()
            expect(result).toHaveLength(2)
            expect(result).toEqual([data1, data2])
        })

        it('02T.should rollback then error', async () => {
            logInThisTest = false
            const testFile = `${testFileMain}_02T.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const data1: TestData = {
                id: '1',
                name: 'Test 1',
                value: 25,
                user: 'User1',
            }
            const data2: TestData = {
                id: '2',
                name: 'Test 1',
                value: 25,
                user: 'User1',
            }
            const data3: TestData = {
                id: '3',
                name: 'Test 3',
                value: 40,
                user: 'User3',
            }
            await jsonlFile.write([data1])
            logTest(
                logInThisTest,
                '2',
                await LinePositionsManager.getFilePositions(testFile),
            )
            try {
                await jsonlFile.withTransaction(
                    async (tx) => {
                        await tx.write(data2)
                        logTest(
                            logInThisTest,
                            '2.1',
                            await LinePositionsManager.getFilePositions(
                                testFile,
                            ),
                        )
                        throw new Error('Test error')
                        await tx.write(data3)
                    },
                    { rollback: true },
                )
            } catch (error) {
                logTest(
                    logInThisTest,
                    'error',
                    error,
                    await LinePositionsManager.getFilePositions(testFile),
                )
                expect(error).toBeInstanceOf(Error)
            }

            const result = await jsonlFile.read()
            expect(result).toHaveLength(1)
            logTest(
                logInThisTest,
                '3',
                await LinePositionsManager.getFilePositions(testFile),
            )
        })

        it('03T.should use external mutex when specified', async () => {
            const testFile = `${testFileMain}_03T.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const externalMutex = new RWMutex()
            const data1: TestData = {
                id: '1',
                name: 'Test 1',
                value: 25,
                user: 'User1',
            }
            const data2: TestData = {
                id: '2',
                name: 'Test 2',
                value: 30,
                user: 'User2',
            }

            await jsonlFile.withTransaction(
                async (tx) => {
                    await tx.write(data1)
                    await tx.write(data2)
                },
                { rollback: true, mutex: externalMutex },
            )

            const result = await jsonlFile.read()
            expect(result).toHaveLength(2)
            expect(result).toEqual([data1, data2])
        })

        it('04T.should handle concurrent transactions', async () => {
            const testFile = `${testFileMain}_04T.jsonl`
            logInThisTest = false
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const concurentCount = 20
            const testData: TestData[] = []
            for (let i = 1; i <= concurentCount; i++) {
                testData.push({
                    id: i.toString(),
                    name: `Test-${i}`,
                    value: getRandom(20, 40),
                    user: `User${i % 2}`,
                })
            }

            // const externalMutex = new RWMutex()
            let externalMutex = (
                await LinePositionsManager.getFilePositions(testFile)
            ).getMutex()
            externalMutex = new RWMutex()

            const data3: TestData = {
                id: 'initId',
                name: 'Test Init',
                value: 40,
                user: 'User Init',
            }
            await jsonlFile.write([data3])
            try {
                await Promise.allSettled(
                    testData.map((data, index) =>
                        jsonlFile.withTransaction(
                            async (tx) => {
                                await tx.write(
                                    data,
                                    true,
                                    index === 5 ? 'throwError' : 'noError',
                                )
                            },
                            { rollback: true, mutex: externalMutex },
                        ),
                    ),
                )
            } catch (error) {
                expect(error).toBeInstanceOf(Error)
            }

            const result = await jsonlFile.read()
            logTest(logInThisTest || true, 'result:', result)
            expect(result).toHaveLength(concurentCount)
            expect(result).toEqual(
                expect.arrayContaining([
                    data3,
                    ...testData.filter((td) => td.id != '6'),
                ]),
            )
            logTest(
                logInThisTest || true,
                'filePositions',
                await LinePositionsManager.getFilePositions(testFile),
            )
        })

        it('05T.should support reading in a transaction', async () => {
            const testFile = `${testFileMain}_05T.jsonl`
            logInThisTest = false
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()
            const data1: TestData = {
                id: '1',
                name: 'Test 1',
                value: 25,
                user: 'User1',
            }
            const data2: TestData = {
                id: '2',
                name: 'Test 2',
                value: 30,
                user: 'User2',
            }
            const data3: TestData = {
                id: '3',
                name: 'Test 3',
                value: 60,
                user: 'User3',
            }

            await jsonlFile.write([data1, data2])

            await jsonlFile.withTransaction(async (tx) => {
                let result = await tx.read(undefined, true)
                expect(result).toHaveLength(2)
                expect(result).toEqual([data1, data2])

                // await jsonlFile.write([data3])
                // result = await tx.read(undefined, true)
                // expect(result).toHaveLength(3)
                // expect(result).toEqual([data1, data2, data3])

                // await tx.delete([{ id: '2' }], true)
                // result = await tx.read(undefined, true)
                // expect(result).toHaveLength(2)
                // expect(result).toEqual([data1, data3])
                // tx.init(true, true)
            })
        })

        it('06T.should support deletion in a transaction', async () => {
            const testFile = `${testFileMain}_06T.jsonl`
            logInThisTest = false
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const data1: TestData = {
                id: '1',
                name: 'Test 1',
                value: 25,
                user: 'User1',
            }
            const data2: TestData = {
                id: '2',
                name: 'Test 2',
                value: 30,
                user: 'User2',
            }
            const data3: TestData = {
                id: '3',
                name: 'Test 3',
                value: 30,
                user: 'User3',
            }
            const data4: TestData = {
                id: '4',
                name: 'Test 4',
                value: 40,
                user: 'User4',
            }

            await jsonlFile.write([data1, data2])

            await jsonlFile.withTransaction(async (tx) => {
                await jsonlFile.write([data3, data4])
                await tx.delete({ id: '2' })
                const result = await tx.read()
                expect(result).toHaveLength(3)
                expect(result).toEqual([data1, data3, data4])
            })
        })

        it('07T.should restore file state on error', async () => {
            const testFile = `${testFileMain}_07T.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            // Инициализируем файл без принудительной перезаписи
            await jsonlFile.init(false)

            // Записываем начальные данные
            const initialData: TestData = {
                id: '1',
                name: 'Initial',
                value: 25,
                user: 'User1',
            }
            await jsonlFile.write(initialData)

            // Пытаемся выполнить транзакцию с ошибкой
            const data1: TestData = {
                id: '2',
                name: 'Test 1',
                value: 25,
                user: 'User1',
            }
            const data2: TestData = {
                id: '3',
                name: 'Test 2',
                value: 30,
                user: 'User2',
            }

            try {
                await jsonlFile.withTransaction(
                    async (tx) => {
                        await tx.write(data1)
                        throw new Error('Test error')
                        await tx.write(data2)
                    },
                    { rollback: true },
                )
            } catch (error) {
                expect(error).toBeInstanceOf(Error)
            }

            // Проверяем, что файл восстановлен в исходное состояние
            const result = await jsonlFile.read()
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual(initialData)

            // Создаем новый экземпляр для второй части теста
            const jsonlFile2 = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile2.init(false)

            try {
                await jsonlFile2.withTransaction(
                    async (tx) => {
                        await tx.write(data1)
                        throw new Error('Test error')
                        await tx.write(data2)
                    },
                    { rollback: false },
                )
            } catch (error) {
                expect(error).toBeInstanceOf(Error)
            }

            // Проверяем, что файл не восстановлен в исходное состояние и имеет частично выполненную транзакцию
            const result2 = await jsonlFile2.read()
            expect(result2).toHaveLength(2)
            expect(result2).toEqual([initialData, data1])
        })

        it('08T.should handle backup file cleanup', async () => {
            const testFile = `${testFileMain}_08T.jsonl`
            try {
                await safeUnlink(testFile)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            // Проверяем, что бэкап файл создается и удаляется
            const backupFile = `${testFile}-test-backup.jsonl`
            const data: TestData = {
                id: '1',
                name: 'Test',
                value: 25,
                user: 'User1',
            }

            await jsonlFile.withTransaction(
                async (tx) => {
                    await tx.write(data)
                },
                { backupFile, doNotDeleteBackupFile: false, rollback: true },
            )

            // Проверяем, что бэкап файл удален
            const backupExists = await fs.promises
                .access(backupFile)
                .then(() => true)
                .catch(() => false)
            expect(backupExists).toBe(false)
        })

        it('09T.should handle backup file creation for new database', async () => {
            const testFile = `${testFileMain}_09T.jsonl`
            try {
                await safeUnlink(testFile)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '1234567890', {
                allocSize: 512,
            })
            await jsonlFile.init()

            // Пытаемся выполнить транзакцию с ошибкой для новой БД
            try {
                await jsonlFile.withTransaction(
                    async (tx) => {
                        throw new Error('Test error')
                    },
                    {
                        rollback: true,
                    },
                )
            } catch (error) {
                expect(error).toBeInstanceOf(Error)
            }

            // Проверяем, что файл пустой (новая БД)
            const result = await jsonlFile.read()
            expect(result).toHaveLength(0)
        })
    })

    describe('JSONLFile edge cases', () => {
        it('01E.should handle empty file initialization', async () => {
            const testFile = `${testFileMain}_01E.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init(false)

            const result = await jsonlFile.read()
            expect(result).toHaveLength(0)
        })

        it('02E.should handle file with invalid JSON lines', async () => {
            const testFile = `${testFileMain}_02E.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            // Создаем файл с невалидными JSON строками
            await fs.promises.appendFile(
                testFile,
                'invalid json1\n{"id:"1","name":"Test 1"}\n{invalid}\n',
            )
            await fs.promises.appendFile(
                testFile,
                'invalid json2\n{"id":"2","name":"Test 2"}\n{invalid}\n',
            )
            await fs.promises.appendFile(
                testFile,
                'invalid json3\n{"id":"3","name":"Test 3"}\n{invalid}\n',
            )

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 2048, skipInvalidLines: true,
            })
            await jsonlFile.init(false)

            const result = await jsonlFile.read()
            expect(result).toHaveLength(2)
            expect(result[0]).toEqual({ id: '2', name: 'Test 2' })
            expect(result[1]).toEqual({ id: '3', name: 'Test 3' })
            // expect(result[2]).toEqual({ id: '1', name: 'Test 3' })
        })

        it('03E.should handle maximum line length', async () => {
            const testFile = `${testFileMain}_03E.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 100,
            })
            await jsonlFile.init()

            const longName = 'x'.repeat(90)
            const testData: TestData = {
                id: '1',
                name: longName,
                value: 42,
                user: 'User1',
            }

            await expect(jsonlFile.write(testData)).rejects.toThrow(
                'Line length',
            )
        })

        it('04E.should handle file with only deleted records', async () => {
            const testFile = `${testFileMain}_04E.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const testData: TestData = {
                id: '1',
                name: 'Test',
                value: 42,
                user: 'User1',
            }

            await jsonlFile.write(testData)
            await jsonlFile.delete({ id: '1' })

            const result = await jsonlFile.read()
            expect(result).toHaveLength(0)
        })

        it('05E.should handle file with mixed deleted and valid records', async () => {
            const testFile = `${testFileMain}_05E.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const testData: TestData[] = [
                { id: '1', name: 'Test1', value: 42, user: 'User1' },
                { id: '2', name: 'Test2', value: 43, user: 'User2' },
                { id: '3', name: 'Test3', value: 44, user: 'User3' },
            ]

            await jsonlFile.write(testData)
            await jsonlFile.delete({ id: '2' })

            const result = await jsonlFile.read()
            expect(result).toHaveLength(2)
            expect(result).toEqual([testData[0], testData[2]])
        })

        it('06E.should handle file with duplicate IDs', async () => {
            const testFile = `${testFileMain}_06E.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const testData1: TestData = {
                id: '1',
                name: 'Test1',
                value: 42,
                user: 'User1',
            }
            const testData2: TestData = {
                id: '1',
                name: 'Test2',
                value: 43,
                user: 'User2',
            }

            await jsonlFile.write(testData1)
            await jsonlFile.write(testData2)

            const result = await jsonlFile.read()
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual(testData2)

            // Создаем файл с дублированным ID
            await fs.promises.appendFile(
                testFile,
                '{"id":"1","name":"Test1","value":43,"user":"User2"}\n',
            )
            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            try {                
                await jsonlFile.init()
            } catch (error) {
                expect(error).toBeInstanceOf(Error)
                expect(error.message).toContain('Not unique id in file:')
            }
        })

        it('07E.should handle file with empty lines', async () => {
            const testFile = `${testFileMain}_07E.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            // Создаем файл с пустыми строками
            await fs.promises.writeFile(
                testFile,
                '\n\n{"id":"1","name":"Test"}\n\n',
            )

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init(false)

            const result = await jsonlFile.read()
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual({ id: '1', name: 'Test' })
        })

        it('08E.should handle file with special characters in data', async () => {
            const testFile = `${testFileMain}_08E.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const testData: TestData = {
                id: '1',
                name: 'Test\n\r\t"\'\\',
                value: 42,
                user: 'User\n\r\t"\'\\',
            }

            await jsonlFile.write(testData)
            const result = await jsonlFile.read()
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual(testData)
        })

        it('09E.should handle migration from unencrypted to encrypted data', async () => {
            const testFile = `${testFileMain}_09E.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            // Создаем файл с незашифрованными данными
            await fs.promises.writeFile(
                testFile,
                '{"id":"1","name":"Test1","value":42,"user":"User1"}\n' +
                    '{"id":"2","name":"Test2","value":43,"user":"User2"}\n',
            )

            // Создаем экземпляр с ключом шифрования
            jsonlFile = new JSONLFile<TestData>(testFile, 'test-key', {
                allocSize: 2048,
            })
            await jsonlFile.init(false)

            // При инициализации данные должны быть автоматически зашифрованы
            const result = await jsonlFile.read()
            expect(result).toHaveLength(2)
            // expect(result[0]).toEqual({ id: '1', name: 'Test1', value: 42, user: 'User1' })
            // expect(result[1]).toEqual({ id: '2', name: 'Test2', value: 43, user: 'User2' })

            // Проверяем, что данные в файле теперь зашифрованы
            const fileContent = await fs.promises.readFile(testFile, 'utf8')
            const lines = fileContent
                .split('\n')
                .filter((line) => line.trim().length > 0)

            // Проверяем, что строки зашифрованы (не являются валидным JSON)
            for (const line of lines) {
                expect(() => JSON.parse(line)).toThrow()
            }

            // Создаем новый экземпляр для проверки чтения зашифрованных данных
            const jsonlFile2 = new JSONLFile<TestData>(testFile, 'test-key', {
                allocSize: 2048,
            })
            await jsonlFile2.init(false)

            const result2 = await jsonlFile2.read()
            expect(result2).toHaveLength(2)
            expect(result2[0]).toEqual({
                id: '1',
                name: 'Test1',
                value: 42,
                user: 'User1',
            })
            expect(result2[1]).toEqual({
                id: '2',
                name: 'Test2',
                value: 43,
                user: 'User2',
            })
        })

        it('10E.should return error when reading encrypted data without key', async () => {
            const testFile = `${testFileMain}_10E.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            // Создаем файл с зашифрованными данными
            const encryptedFile = new JSONLFile<TestData>(
                testFile,
                'test-key',
                {
                    allocSize: 1024,
                },
            )
            await encryptedFile.init()

            const testData: TestData = {
                id: '1',
                name: 'Test1',
                value: 42,
                user: 'User1',
            }

            // Записываем зашифрованные данные
            await encryptedFile.write(testData)

            // Пытаемся прочитать без ключа шифрования
            const unencryptedFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 1024,
            })
            try {
                await unencryptedFile.init(false)
            } catch (error) {
                expect(error).toBeInstanceOf(Error)
                expect(error.message).toContain('Error parsing line:')
            }

            // Проверяем, что файл содержит зашифрованные данные
            const fileContent = await fs.promises.readFile(testFile, 'utf8')
            const lines = fileContent
                .split('\n')
                .filter((line) => line.trim().length > 0)

            // Проверяем, что строки зашифрованы (не являются валидным JSON)
            for (const line of lines) {
                expect(() => JSON.parse(line)).toThrow()
            }

            // Проверяем, что с правильным ключом данные читаются корректно
            const encryptedFile2 = new JSONLFile<TestData>(
                testFile,
                'test-key',
                {
                    allocSize: 1024,
                },
            )
            await encryptedFile2.init()
            const result2 = await encryptedFile2.read()
            expect(result2).toHaveLength(1)
            expect(result2[0]).toEqual(testData)
        })

        it('11E.should handle migration from encrypted to unencrypted data', async () => {
            const testFile = `${testFileMain}_11E.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }
            // Создаем файл с зашифрованными данными
            const testData: TestData[] = [
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
            // Создаем экземпляр с ключом шифрования
            const jsonlFileEncrypted = new JSONLFile<TestData>(testFile, 'test-key', {
                allocSize: 2048,
            })
            await jsonlFileEncrypted.init(false)
            await jsonlFileEncrypted.write(testData)

            // Проверяем, что данные в файле теперь зашифрованы
            const fileContentEncrypted = await fs.promises.readFile(
                testFile,
                'utf8',
            )
            const linesEncrypted = fileContentEncrypted
                .split('\n')
                .filter((line) => line.trim().length > 0)

            // Проверяем, что строки зашифрованы (не являются валидным JSON)
            for (const line of linesEncrypted) {
                expect(() => JSON.parse(line)).toThrow()
            }
            
            const jsonlFileUnencrypted = new JSONLFile<TestData>(testFile, '', {
                allocSize: 2048, decryptKey: 'test-key'
            })
            await jsonlFileUnencrypted.init(false)
            
            // При инициализации данные должны быть автоматически зашифрованы
            const result = await jsonlFileUnencrypted.read()
            expect(result).toHaveLength(2)
            expect(result[0]).toEqual({ id: '1', name: 'Test1', value: 42, user: 'User1' })
            expect(result[1]).toEqual({ id: '2', name: 'Test2', value: 43, user: 'User2' })

            // Проверяем, что данные в файле теперь не зашифрованы
            const fileContentUnencrypted = await fs.promises.readFile(testFile, 'utf8')
            const linesUnencrypted = fileContentUnencrypted
                .split('\n')
                .filter((line) => line.trim().length > 0)

            // Проверяем, что строки не зашифрованы (являются валидным JSON)
            for (const line of linesUnencrypted) {
                expect(() => JSON.parse(line)).not.toThrow()
            }            
        })
    })
})
