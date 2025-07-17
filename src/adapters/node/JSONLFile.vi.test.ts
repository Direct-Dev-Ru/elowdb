import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import fs, { read } from 'node:fs'
import path from 'node:path'
import { JSONLFile } from './JSONLFile.js'
import { TestData } from '../../common/interfaces/test-data.js'
import {
    JSONLFileOptions,
    LineDbAdapterOptions,
} from '../../common/interfaces/jsonl-file.js'
import { log } from 'node:console'

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

    describe('JSONLFile Warmup', () => {
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
                id: 1,
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
        it('02.should resize allocSize then write', async () => {
            logInThisTest = true
            const testFile = `${testFileMain}_B02.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 128 * 1,
                collectionName: 'test-warmup',
            })
            await jsonlFile.init()

            const testData: TestData[] = [
                {
                    id: '1',
                    name: 'Test',
                    value: 42,
                    user: 'User1',
                },
                {
                    id: '2',
                    name: 'Test2',
                    value: 43,
                    user: 'User2',
                },
                {
                    id: '3',
                    name: 'Test3',
                    value: 44,
                    user: 'User3',
                },
            ]
            const testData2: TestData[] = [
                {
                    id: '11',
                    name: `Test${'11111111111111111'.repeat(5)}`,
                    value: 142,
                    user: 'User11',
                },
                {
                    id: '12',
                    name: 'Test 12',
                    value: 143,
                    user: 'User12',
                },
            ]
            await jsonlFile.write(testData)

            const result = await jsonlFile.read()
            expect(result).toEqual(testData)
            //logTest(logInThisTest, 'positions ::::', await jsonlFile.getPositionsNoLock())

            await jsonlFile.write(testData2)
            logTest(
                logInThisTest,
                'positions after second write ::::',
                await jsonlFile.getPositionsNoLock(),
            )

            const result3 = await jsonlFile.readByFilter({ id: '3' })
            expect(result3).toEqual(
                [...testData, ...testData2].filter((data) => data.id === '3'),
            )
            const result4 = await jsonlFile.readByFilter({ id: '12' })
            expect(result4).toEqual(
                [...testData, ...testData2].filter((data) => data.id === '12'),
            )
        })
        it('03.should double allocSize then init', async () => {
            logInThisTest = true
            const testFile = `${testFileMain}_B03.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 32,
                // collectionName: 'test-warmup',
            })
            await jsonlFile.init()

            const testData: TestData[] = [
                {
                    id: '1',
                    name: 'Test',
                    value: 42,
                    user: 'User1',
                },
                {
                    id: '2',
                    name: 'Test2',
                    value: 43,
                    user: 'User2',
                },
                {
                    id: '3',
                    name: 'Test3',
                    value: 44,
                    user: 'User3',
                },
            ]

            await jsonlFile.write(testData)
            const result = await jsonlFile.read()
            expect(result).toEqual(testData)
        })
    })

    describe('JSONLFile step without transaction', () => {
        it('01.should write and readByFilter', async () => {
            const testFile = `${testFileMain}_01.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
                indexedFields: ['id', 'name'],
                convertStringIdToNumber: true,
            })
            await jsonlFile.init()

            const testData: TestData = {
                id: '1',
                name: 'Test-1',
                value: 42,
                user: 'User1',
            }
            await jsonlFile.write(testData)
            const result = await jsonlFile.read()
            expect(result).toEqual([{ ...testData, id: result[0].id }])
            const result2 = await jsonlFile.readByFilter(
                { name: 'Test-1' },
                { strictCompare: true, inTransaction: false },
            )
            expect(result2).toEqual([{ ...testData, id: result2[0].id }])
            await jsonlFile.write({
                ...testData,
                id: '2',
                name: 'Test-2',
            })
            const result3 = await jsonlFile.readByFilter(
                { name: 'Test' },
                {
                    strictCompare: false,
                    inTransaction: false,
                    filterType: 'object',
                },
            )
            expect(result3).toEqual([
                { ...testData, id: result3[0].id },
                { ...testData, id: 2, name: 'Test-2' },
            ])

            const resultSift = await jsonlFile.readByFilter(
                { name: { $like: 'Test%' } },
                { inTransaction: false, filterType: 'sift' },
            )
            expect(resultSift).toEqual([
                { ...testData, id: resultSift[0].id },
                { ...testData, id: resultSift[1].id, name: resultSift[1].name },
            ])

            logTest(
                logInThisTest,
                'positions after second write ::::',
                await jsonlFile.getPositionsNoLock(),
            )
            const resultFilterFunction = await jsonlFile.readByFilter(
                (data) => data.name.startsWith('Test-1'),
                { inTransaction: false },
            )
            expect(resultFilterFunction).toEqual([
                { ...testData, id: 1 },
                // { ...testData, id: '2', name: 'Test-2' },
            ])
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
            for (let i = 1; i <= 5; i++) {
                testData.push({
                    id: i.toString().padStart(3, '0'),
                    name: `Test${i}.`,
                    value: getRandom(5, 40),
                    user: `User${i % 2}`,
                })
            }
            testData[0].value = -1
            await jsonlFile.write(testData[0])
            await jsonlFile.write(testData[1])
            await jsonlFile.write(testData[0])

            await jsonlFile.write(testData)
            const result = await jsonlFile.read()
            expect(result).toEqual(testData)

            const jsonlFile2 = new JSONLFile<TestData>(testFile, '')
            await jsonlFile2.init()
            await jsonlFile2.write([
                { ...testData[2], name: 'Test2.Updated' },
                { ...testData[4], name: 'Test4.Updated' },
            ])

            const result2 = await jsonlFile2.read()
            const testData2 = [...testData]
            testData2[2].name = 'Test2.Updated'
            testData2[4].name = 'Test4.Updated'
            expect(result2).toEqual(testData2)
        })

        it('03.should read by filter', async () => {
            const testFile = `${testFileMain}_03.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 1024 * 8,
            })
            await jsonlFile.init()
            const idToFind = '5'
            const arrayLength = 100
            const testData: TestData[] = []
            for (let i = 1; i <= arrayLength; i++) {
                testData.push({
                    id: i.toString(),
                    name: `Test${i}.`.repeat(getRandom(1, 5)),
                    value: getRandom(20, 40),
                    user: `User${i % 2}`,
                })
            }

            await jsonlFile.write(testData)

            const result = await jsonlFile.readByFilter({ id: idToFind })

            expect(Array.isArray(result)).toBe(true)
            if (Array.isArray(result)) {
                expect(result.find((data) => data.id === idToFind)).toEqual(
                    testData.find((data) => data.id === idToFind),
                )
            }

            const result2 = await jsonlFile.readByFilter(
                { user: { $eq: 'User1' } },
                { inTransaction: false, filterType: 'sift' },
            )

            expect(Array.isArray(result2)).toBe(true)
            if (Array.isArray(result2)) {
                expect(result2).toEqual(
                    testData.filter((data) => data.user === 'User1'),
                )
            }

            const result2_1 = await jsonlFile.readByFilter(
                { name: { $regex: 'Test1[0-9]\\.' } },
                { inTransaction: false, filterType: 'sift' },
            )
            expect(Array.isArray(result2_1)).toBe(true)
            if (Array.isArray(result2_1)) {
                expect(result2_1.length).toBe(10)
            }

            const result2_2 = await jsonlFile.readByFilter(
                { user: { $like: 'User1' } },
                { inTransaction: false, filterType: 'sift' },
            )
            expect(Array.isArray(result2_2)).toBe(true)
            if (Array.isArray(result2_2)) {
                expect(result2_2.length).toBe(50)
            }

            const jsonlFileUserIdx = new JSONLFile<TestData>(testFile, '', {
                allocSize: 1024 * 2,
                idFn: (data) => [`byUser:${data.user}`],
            })
            await jsonlFileUserIdx.init()

            const result3 = await jsonlFileUserIdx.readByFilter(
                `user == "User1" and value > 30`,
                {
                    inTransaction: false,
                    filterType: 'string',
                },
            )
            expect(Array.isArray(result3)).toBe(true)

            if (Array.isArray(result3)) {
                expect(result3.map((data) => data.id)).toEqual(
                    testData
                        .filter(
                            (data) => data.user === 'User1' && data.value > 30,
                        )
                        .map((data) => data.id),
                )
            }

            const jsonlFileUserIdx2 = new JSONLFile<TestData>(testFile, '', {
                allocSize: 1024 * 2,
                idFn: (data) => [`byId:${data.id}`],
            })
            await jsonlFileUserIdx2.init()

            const result4 = await jsonlFileUserIdx2.readByFilter(
                `id === "${idToFind}"`,
                {
                    inTransaction: false,
                    filterType: 'string',
                },
            )
            expect(Array.isArray(result4)).toBe(true)
            expect(result4.length).toBe(1)
            expect(result4[0].id).toBe(idToFind)

            const result4_1 = await jsonlFileUserIdx2.readByFilter(
                { id: idToFind },
                {
                    inTransaction: false,
                    filterType: 'object',
                },
            )
            expect(Array.isArray(result4_1)).toBe(true)
            expect(result4_1.length).toBe(1)
            expect(result4_1[0].id).toBe(idToFind)
        })

        it('03.1 should read by filter with indexed fields', async () => {
            const testFile = `${testFileMain}_03_1.jsonl`
            try {
                // await new Promise((resolve) => setTimeout(resolve, 500))
                // await safeUnlink(testFile, true)
                fs.unlinkSync(testFile)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 1024 * 1,
                indexedFields: ['id', 'user', 'value'],
            })
            await jsonlFile.init()
            const idToFind = '3'
            const arrayLength = 6
            const testData: TestData[] = []
            for (let i = 1; i <= arrayLength; i++) {
                const val = getRandom(1, 40)
                testData.push({
                    id: i.toString(),
                    name: `Test${i}`,
                    value: val,
                    user: `User${i % 2}`,
                })
            }

            await jsonlFile.write(testData)
            logTest(false, 'map: ', await jsonlFile.getPositionsNoLock())

            const result = await jsonlFile.readByFilter({
                id: { $eq: idToFind },
            })

            expect(Array.isArray(result)).toBe(true)
            if (Array.isArray(result)) {
                expect(result.find((data) => data.id === idToFind)).toEqual(
                    testData.find((data) => data.id === idToFind),
                )
            }

            const result2 = await jsonlFile.readByFilter('user === "User1"')
            // logTest(false, 'result2', result2)
            // logTest(false, 'testData', testData)
            // logTest(false, 'testData filtered', testData.filter((data) => data.user === 'User1'))
            expect(result2).toEqual(
                testData.filter((data) => data.user === 'User1'),
            )

            const result3 = await jsonlFile.readByFilter(
                'user === "User1" and name === "Test1"',
            )
            logTest(false, 'result3', result3)
            expect(result3).toEqual(
                testData.filter(
                    (data) => data.user === 'User1' && data.name === 'Test1',
                ),
            )

            logTest(false, '###########')
            const result4 = await jsonlFile.readByFilter({ id: idToFind })
            logTest(false, 'result4', result4)
            expect(result4).toEqual(
                testData.filter((data) => data.id === idToFind),
            )
        })

        it('04.should update existing record with encryption', async () => {
            const testFile = `${testFileMain}_04.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            jsonlFile = new JSONLFile<TestData>(testFile, 'test-key', {
                allocSize: 2048,
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
                    name: `Test${i}-`.repeat(getRandom(1, 100)),
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

            const result = await jsonlFile.readByFilter({ id: updId })
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
            const result = await customIdFile.readByFilter({ name: 'Test1' })

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
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 1024 * 1,
                idFn: (data) => [`byName:${data.name}`],
            })
            await jsonlFile.init()

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
            const count = 1000
            for (let i = 1; i <= count; i++) {
                testData.push({
                    id: i.toString(),
                    name: `Test${i}.`.repeat(getRandom(1, 20)),
                    value: getRandom(20, 40),
                    user: `User${i % 2}`,
                })
            }
            const jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 1024 * 4,
                idFn: (data) => [`byUser:${data.user}`],
            })
            await jsonlFile.init()
            // await jsonlFile.write(testData)
            // Write all data concurrently
            await Promise.all(testData.map((data) => jsonlFile.write(data)))
            const position = await jsonlFile.getPositionsNoLock()

            const result = (await jsonlFile.read()).sort(sortFn)

            expect(result).toEqual(testData.sort(sortFn))
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
            logTest(true, 'map: ', await jsonlFile.getPositionsNoLock())
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
                idFn: (data) => [`byUser:${data.user}`],
                allocSize: 1024 * 4,
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

            logTest(
                logInThisTest,
                'map after delete: ',
                await jsonlFile.getPositionsNoLock(),
            )
            const checkId = '3'
            const result2 = await jsonlFile.readByFilter({ id: checkId })
            logTest(logInThisTest, 'result2', result2)
            expect(Array.isArray(result2)).toBe(true)
            if (Array.isArray(result2)) {
                expect(result2.length).toBe(1)
                expect(result2[0].id).toBe(checkId)
            }

            const result3 = await jsonlFile.readByFilter({ user: 'User0' })
            logTest(logInThisTest, 'result3', result3)
            expect(Array.isArray(result3)).toBe(true)
            if (Array.isArray(result3)) {
                expect(result3.length).toBe(3)
            }
            // compress with new instance
            const jsonlFile2 = new JSONLFile<TestData>(testFile)
            await jsonlFile2.init()
            const result4 = await jsonlFile2.readByFilter({ user: 'User0' })

            expect(Array.isArray(result4)).toBe(true)
            logTest(
                logInThisTest,
                'map after compression',
                await jsonlFile2.getPositionsNoLock(),
            )
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
            logTest(logInThisTest, 'result2', result2)
            expect(result2.length).toEqual(
                testData.filter(
                    (item, index) => item.id !== '2' && item.id !== '4',
                ).length,
            )

            // Create new instance to check compression on initialization
            const jsonlFile2 = new JSONLFile<TestData>(testFile, '', {
                allocSize: 1024 * 4,
                idFn: (data) => [`byUser:${data.user}`],
            })
            await jsonlFile2.init(false)

            // Check that all records are available and in the correct order
            const result = await jsonlFile2.read()

            expect(result.length).toEqual(
                testData.filter((item) => item.id !== '2' && item.id !== '4')
                    .length,
            )
            expect(result.sort(sortFn)).toEqual(
                testData
                    .filter((item) => item.id !== '2' && item.id !== '4')
                    .sort(sortFn),
            )
        })

        it('12.should handle record deletion by filter with no indexed field', async () => {
            const testFile = `${testFileMain}_12_deletion.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            const jsonlFile = new JSONLFile<TestData>(testFile, '', {
                idFn: (data) => [`byUser:${data.user}`],
                allocSize: 256 * 1,
            })
            await jsonlFile.init()

            const testData: TestData[] = []
            const count = 5
            for (let i = 1; i <= count; i++) {
                testData.push({
                    id: i.toString(),
                    name: `Test${i}`,
                    value: i * 10,
                    user: `User${i % 2}`,
                })
            }

            // Write data
            await jsonlFile.write(testData)
            logTest(false, 'map: ', await jsonlFile.getPositionsNoLock())
            logTest(false, 'allocSize: ', jsonlFile.getAllocSize())

            // Delete records by filter by field that is not in the index
            const deleted = await jsonlFile.delete([{ value: 30 }])
            expect((deleted as Partial<TestData>[]).length).toBe(1)

            logTest(
                true,
                'map after delete: ',
                await jsonlFile.getPositionsNoLock(),
            )

            const checkId = '2'
            const result2 = await jsonlFile.readByFilter({ id: checkId })
            logTest(logInThisTest, 'result2', result2)
            expect(Array.isArray(result2)).toBe(true)
            if (Array.isArray(result2)) {
                expect(result2.length).toBe(1)
                expect(result2[0].id).toBe(checkId)
            }

            const result3 = await jsonlFile.readByFilter({ user: 'User0' })
            logTest(logInThisTest, 'result3', result3)
            expect(Array.isArray(result3)).toBe(true)
            if (Array.isArray(result3)) {
                expect(result3.length).toBe(2)
            }

            const jsonlFile2 = new JSONLFile<TestData>(testFile)
            await jsonlFile2.init()
            const result4 = await jsonlFile2.readByFilter({ user: 'User0' })
            logTest(logInThisTest, 'result4', result4)
            expect(Array.isArray(result4)).toBe(true)
        })

        it('13.should process select method with different filter types', async () => {
            const testFile = `${testFileMain}_13.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // console.log('Error deleting file:', error)
            }

            const jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 256 * 1,
                indexedFields: ['id', 'user', 'name'],
            })
            await jsonlFile.init()

            const testData: TestData[] = []
            const count = 100
            for (let i = 1; i <= count; i++) {
                testData.push({
                    id: i.toString(),
                    name: `Test${i}`,
                    value: i * 10,
                    user: `User${i % 2}`,
                })
            }

            await jsonlFile.write(testData)

            const result = await jsonlFile.select()
            expect(result.sort(sortFn)).toEqual(testData.sort(sortFn))

            const result2 = await jsonlFile.select(
                // { id: { $eq: '50' } },
                `id === "50"`,
                {
                    filterType: 'filtrex',
                    inTransaction: false,
                },
            )
            expect(result2.sort(sortFn)).toEqual(
                testData.filter((data) => data.id === '50'),
            )

            const result2_1 = await jsonlFile.select(
                // { id: { $eq: '50' } },
                `user === "User1"`,
                {
                    filterType: 'filtrex',
                    inTransaction: false,
                },
            )
            expect(result2_1.sort(sortFn)).toEqual(
                testData.filter((data) => data.user === 'User1').sort(sortFn),
            )

            const result3 = await jsonlFile.select(
                { user: { $eq: 'User0' } },
                {
                    filterType: 'mongodb',
                    inTransaction: false,
                },
            )
            expect(result3.sort(sortFn)).toEqual(
                testData.filter((data) => data.user === 'User0').sort(sortFn),
            )

            const nameValueToFilter = 'Test1'
            const result3_1 = await jsonlFile.select(
                { name: nameValueToFilter },
                {
                    filterType: 'base',
                    inTransaction: false,
                },
            )
            expect(result3_1.sort(sortFn)).toEqual(
                testData
                    .filter((data) => data.name === nameValueToFilter)
                    .sort(sortFn),
            )
        })
    })

    describe('JSONLFile step withTransaction', () => {
        it('01T.should write and read multiple objects in transaction', async () => {
            const testFile = `${testFileMain}_01T.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            const jsonlFile = new JSONLFile<TestData>(testFile, '', {
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

            // logTest(logInThisTest, 'transactionId', transactionId)
            const transactionOptions: LineDbAdapterOptions = {
                inTransaction: true,
            }
            await jsonlFile.withTransaction(
                async (tx, options) => {
                    await tx.write([data1, data2], options)
                    const record1 = await tx.readByFilter({ id: '1' }, options)
                    await tx.update(
                        { name: `Updated ${record1[0].name}` },
                        { id: '1' },
                        options,
                    )
                    const record2 = await tx.readByFilter({ id: '2' }, options)
                    await tx.update(
                        { name: `Updated ${record2[0].name}` },
                        'id==="2"',
                        options,
                    )
                },
                {
                    rollback: true,
                    timeout: 100_000,
                },
                transactionOptions,
            )

            const result = await jsonlFile.read()
            expect(result).toHaveLength(2)
            expect(result).toEqual([
                { ...data1, name: 'Updated Test 1' },
                { ...data2, name: 'Updated Test 2' },
            ])
        })

        it('02T.should rollback transaction on error', async () => {
            const testFile = `${testFileMain}_02T.jsonl`
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
                name: 'Initial',
                value: 25,
                user: 'User1',
            }
            await jsonlFile.write(initialData)

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

            // logTest(logInThisTest, 'transactionId', transactionId)
            const transactionOptions: LineDbAdapterOptions = {
                inTransaction: true,
            }
            try {
                await jsonlFile.withTransaction(
                    async (tx, options) => {
                        await tx.write(data1, options)
                        throw new Error('Test error')
                        await tx.write(data2, options)
                    },
                    {
                        rollback: true,
                        timeout: 100_000,
                    },
                    transactionOptions,
                )
            } catch (error) {
                expect(error).toBeInstanceOf(Error)
            }

            const result = await jsonlFile.read()
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual(initialData)
        })

        it('03T.should support reading in a transaction', async () => {
            const testFile = `${testFileMain}_03T.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()
            const testData: TestData[] = []
            for (let i = 1; i <= 1000; i++) {
                testData.push({
                    id: i.toString(),
                    name: `Test${i}`,
                    value: i * 10,
                    user: `User${i % 2}`,
                })
            }

            await jsonlFile.write(testData)

            // logTest(logInThisTest, 'transactionId', transactionId)
            const transactionOptions: LineDbAdapterOptions = {
                inTransaction: true,
            }
            await jsonlFile.withTransaction(
                async (tx, options) => {
                    const result = await tx.read(undefined, options)
                    expect(result).toHaveLength(1000)

                    const data3: TestData = {
                        id: '3000',
                        name: 'Test 3',
                        value: 60,
                        user: 'User3',
                    }
                    await tx.write(data3, options)

                    const result2 = await tx.read(() => true, options)
                    expect(result2).toHaveLength(1001)
                },
                {
                    rollback: true,
                    timeout: 100_000,
                },
                transactionOptions,
            )
        })

        it('04T.should support deletion with error in a transaction', async () => {
            const testFile = `${testFileMain}_04T.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
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

            await jsonlFile.insert([data1, data2])

            try {
                const callBack = async (tx: JSONLFile<TestData>) => {
                    await tx.write(data3)
                    await tx.delete({ id: '2' })
                    const result = await tx.read()
                    expect(result).toHaveLength(2)
                    expect(result).toEqual([data1, data3])
                    throw new Error('Test error')
                }
                await jsonlFile.withTransaction(callBack, {
                    rollback: true,
                    timeout: 20_000,
                })
            } catch (error) {
                expect(error).toBeInstanceOf(Error)
            }

            const result = await jsonlFile.read()
            expect(result).toHaveLength(2)
            expect(result).toEqual([data1, data2])
        }, 1_000_000)

        it('05T.should handle concurrent transactions of inserts', async () => {
            const testFile = `${testFileMain}_05T.jsonl`
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
                id: 'init',
                name: 'Initial',
                value: 0,
                user: 'System',
            }
            await jsonlFile.write(initialData)

            const concurrentCount = 100
            const testData: TestData[] = Array.from(
                { length: concurrentCount },
                (_, i) => ({
                    id: `id_${i}`,
                    name: `Test ${i}`,
                    value: i * 10,
                    user: `User${i}`,
                }),
            )

            await Promise.allSettled(
                testData.map(async (data) => {
                    try {
                        return jsonlFile.withTransaction(
                            async (tx, opt) => {
                                await tx.insert(data, opt)
                            },
                            {
                                rollback: true,
                                timeout: 100_000,
                            },
                            // {
                            //     inTransaction: true,
                            // },
                        )
                    } catch (error) {
                        console.error('Error in transaction:', error)
                        throw error
                    } finally {
                        await jsonlFile.endTransactionV2()
                    }
                }),
            )
            // await jsonlFile.init(true)
            const result = await jsonlFile.select('')

            // logTest(true, 'resultAll', resultAll)

            expect(result).toHaveLength(concurrentCount + 1)
            // expect(result).toEqual([initialData, ...testData])
        })

        it('06T.should handle concurrent transactions of updates', async () => {
            const testFile = `${testFileMain}_06T.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const concurrentCount = 100
            const testData: TestData[] = Array.from(
                { length: concurrentCount },
                (_, i) => ({
                    id: `${i}`,
                    name: `Test ${i}`,
                    value: i * 10,
                    user: `User${i}`,
                }),
            )
            await jsonlFile.insert(testData)

            await jsonlFile.update({ name: 'Updated 1' }, { id: '1' })

            const updateData: Partial<TestData>[] = Array.from(
                { length: concurrentCount },
                (_, i) => ({
                    id: `${i}`,
                    name: `Updated ${i}`,
                }),
            )
            await Promise.allSettled(
                updateData.map(async (data) => {
                    return jsonlFile.withTransaction(async (a, opt) => {
                        await a.update(
                            { name: data.name },
                            { id: data.id },
                            opt,
                        )
                    })
                }),
            )
            const result = await jsonlFile.select('')
            expect(result).toHaveLength(concurrentCount)
            // expect(result).toEqual(updateData)
        })
    }, 1_000_000)

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
                allocSize: 2048,
                skipInvalidLines: true,
            })
            await jsonlFile.init(false)

            const result = await jsonlFile.read()
            expect(result).toHaveLength(2)
            expect(result[0]).toEqual({ id: '2', name: 'Test 2' })
            expect(result[1]).toEqual({ id: '3', name: 'Test 3' })
            // expect(result[2]).toEqual({ id: '1', name: 'Test 3' })
        })

        it('03E.should realoc allocSize if line length is greater than allocSize', async () => {
            const testFile = `${testFileMain}_03E.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 128,
            })
            await jsonlFile.init()

            const longName = 'x'.repeat(200)
            const testData: TestData = {
                id: '1',
                name: longName,
                value: 42,
                user: 'User1',
            }

            await jsonlFile.write(testData)
            const result = await jsonlFile.read()
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual(testData)

            const jsonlFile2 = new JSONLFile<TestData>(testFile, '', {
                allocSize: 128,
            })
            await jsonlFile2.init()

            const result2 = await jsonlFile2.read()
            expect(result2).toHaveLength(1)
            expect(result2[0]).toEqual(testData)
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
            const firstLine =
                '{"id":"1","name":"Test1","value":42,"user":"User1"}'
            const secondLine =
                '{"id":"2","name":"Test2","value":43,"user":"User2"}'
            const initAllocSize = 128
            // Создаем файл с пустыми строками
            await fs.promises.writeFile(
                testFile,
                firstLine +
                    // ' '.repeat(initAllocSize - firstLine.length - 1) +
                    '\n' +
                    secondLine +
                    ' '.repeat(initAllocSize - secondLine.length - 1) +
                    '\n\n',
            )

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: initAllocSize,
            })
            await jsonlFile.init(false)
            // logTest(false, 'allocSize: ', jsonlFile.getAllocSize())
            const result = await jsonlFile.read()
            expect(result).toHaveLength(2)
            expect(result[0]).toEqual(JSON.parse(firstLine))
            expect(result[1]).toEqual(JSON.parse(secondLine))
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
            const jsonlFileEncrypted = new JSONLFile<TestData>(
                testFile,
                'test-key',
                {
                    allocSize: 2048,
                },
            )
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
                allocSize: 2048,
                decryptKey: 'test-key',
            })
            await jsonlFileUnencrypted.init(false)

            // При инициализации данные должны быть автоматически зашифрованы
            const result = await jsonlFileUnencrypted.read()
            expect(result).toHaveLength(2)
            expect(result[0]).toEqual({
                id: '1',
                name: 'Test1',
                value: 42,
                user: 'User1',
            })
            expect(result[1]).toEqual({
                id: '2',
                name: 'Test2',
                value: 43,
                user: 'User2',
            })

            // Проверяем, что данные в файле теперь не зашифрованы
            const fileContentUnencrypted = await fs.promises.readFile(
                testFile,
                'utf8',
            )
            const linesUnencrypted = fileContentUnencrypted
                .split('\n')
                .filter((line) => line.trim().length > 0)

            // Проверяем, что строки не зашифрованы (являются валидным JSON)
            for (const line of linesUnencrypted) {
                expect(() => JSON.parse(line)).not.toThrow()
            }
        })
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

            await jsonlFile.write(initialData)
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

            // logTest(logInThisTest, 'transactionId', transactionId)
            const transactionOptions: LineDbAdapterOptions = {
                inTransaction: true,
            }

            await jsonlFile.withTransaction(
                async (tx, options) => {
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
                },
                {
                    rollback: true,
                    timeout: 100_000,
                },
                transactionOptions,
            )
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

            // logTest(logInThisTest, 'transactionId', transactionId)
            const transactionOptions: LineDbAdapterOptions = {
                inTransaction: true,
            }

            await jsonlFile.withTransaction(
                async (tx, options) => {
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
                },
                {
                    rollback: true,
                    timeout: 100_000,
                },
                transactionOptions,
            )
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

    describe('JSONLFile insert', () => {
        it('01I.should insert one record', async () => {
            const testFile = `${testFileMain}_01I.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const dataToInsert: TestData = {
                id: '1',
                name: 'Test1',
                value: 42,
                user: 'User1',
            }

            // insert - should merge to one record with value = 100
            await jsonlFile.insert([
                dataToInsert,
                { ...dataToInsert, value: 100 },
            ])
            const result = await jsonlFile.read()
            expect(result).toHaveLength(1)
            expect(result[0]).toMatchObject({ ...dataToInsert, value: 100 })

            // insert - should throw error if data contains id that already exists
            await expect(jsonlFile.insert(dataToInsert)).rejects.toThrow()

            // insert - should insert one record
            const dataToInsert2: TestData = {
                id: '2',
                name: 'Test2',
                value: 43,
                user: 'User2',
            }
            await jsonlFile.insert(dataToInsert2)
            const result2 = await jsonlFile.read()
            expect(result2).toHaveLength(2)
            expect(result2[1]).toMatchObject(dataToInsert2)
            try {
                await jsonlFile.insert(dataToInsert2)
            } catch (error) {
                expect(error).toBeInstanceOf(Error)
                expect(error.message).toContain('id=2')
            }
        })

        it('02I.should insert array of records', async () => {
            const testFile = `${testFileMain}_02I.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init()

            const records = [
                { id: '1', user: 'User1', value: 42 },
                { id: '2', user: 'User2', value: 999 },
                { id: '2', user: 'User2', value: 99 },
                { id: '1', user: 'User3', value: 999 },
            ]
            await jsonlFile.insert(records)
            const all = await jsonlFile.read()
            expect(all).toHaveLength(2)
            expect(all).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ id: '1', value: 999 }),
                    expect.objectContaining({ id: '2', value: 99 }),
                ]),
            )
            const records2 = [
                { id: '10', user: 'User1', value: 42 },
                { id: '20', user: 'User2', value: 999 },
                { user: 'User2', value: 99 },
                { user: 'User3', value: 999 },
            ]
            try {
                await jsonlFile.insert(records2)
            } catch (error) {
                expect(error).toBeInstanceOf(Error)
                expect(error.message).toContain(
                    'All records must contain id field.',
                )
            }
            const all2 = await jsonlFile.read()
            expect(all2).toHaveLength(2)
            expect(all2).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ id: '1', value: 999 }),
                    expect.objectContaining({ id: '2', value: 99 }),
                ]),
            )
        })
    })

    describe('JSONLFile select', () => {
        it('01S.should select one record by id with different filter types', async () => {
            const testFile = `${testFileMain}_01S.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
                indexedFields: ['id'],
            })
            await jsonlFile.init()

            const dataToInsert: TestData = {
                id: 1,
                name: 'Test1',
                value: 42,
                user: 'User1',
            }
            await jsonlFile.insert([dataToInsert])
            const dataToInsert2: TestData = {
                id: 2,
                name: 'Test2',
                value: 43,
                user: 'User2',
            }
            await jsonlFile.insert(dataToInsert2)
            const result = await jsonlFile.select('id === 1')

            expect(result).toHaveLength(1)
            expect(result[0]).toMatchObject({ ...dataToInsert, value: 42 })

            const result2 = await jsonlFile.select({ id: { $eq: 2 } })

            expect(result2).toHaveLength(1)
            expect(result2[0]).toMatchObject({ ...dataToInsert2, value: 43 })

            const result3 = await jsonlFile.select({ id: 2 })
            expect(result3).toHaveLength(1)
            expect(result3[0]).toMatchObject({ ...dataToInsert2, value: 43 })
        })
        it('02S.should select one record by not id field with different filter types', async () => {
            const testFile = `${testFileMain}_02S.jsonl`
            try {
                await safeUnlink(testFile, true)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
                indexedFields: ['id'],
            })
            await jsonlFile.init()

            const dataToInsert1: TestData = {
                id: 1,
                name: 'Test1',
                value: 42,
                user: 'User1',
            }
            await jsonlFile.insert([dataToInsert1])
            const dataToInsert2: TestData = {
                id: 2,
                name: 'Test2',
                value: 43,
                user: 'User2',
            }
            await jsonlFile.insert(dataToInsert2)
            const result = await jsonlFile.select(`name == 'Test1'`)

            expect(result).toHaveLength(1)
            expect(result[0]).toMatchObject({ ...dataToInsert1, value: 42 })

            const result2 = await jsonlFile.select({ value: { $eq: 43 } })

            expect(result2).toHaveLength(1)
            expect(result2[0]).toMatchObject({ ...dataToInsert2 })

            const result3 = await jsonlFile.select({ user: 'User2' })
            expect(result3).toHaveLength(1)
            expect(result3[0]).toMatchObject({ ...dataToInsert2 })
        })
    })
})

describe('JSONLFile selectWithPagination', () => {
    const testFile = path.join('test-data-jsonl', 'pagination_test.jsonl')
    let jsonlFile: JSONLFile<TestData>

    beforeEach(async () => {
        try {
            await safeUnlink(testFile, true)
        } catch {}

        if (!fs.existsSync(path.dirname(testFile))) {
            fs.mkdirSync(path.dirname(testFile), { recursive: true })
        }

        jsonlFile = new JSONLFile<TestData>(testFile, '', {
            allocSize: 256,
            cacheTTL: 1000 * 180, // 3 minutes
            cacheLimit: 100, // 100 records
        })
        await jsonlFile.init()

        const testData: TestData[] = Array.from({ length: 25 }, (_, i) => ({
            id: (i + 1).toString(),
            //     id: Number(i + 1),
            name: `Name${i + 1}`,
            value: i * 10,
            user: `User${i % 3}`,
        }))
        await jsonlFile.write(testData)
    })

    it('should return first page', async () => {
        const res = await jsonlFile.selectWithPagination({}, 1, 10)
        expect(res.data).toHaveLength(10)
        expect(res.page).toBe(1)
        expect(res.total).toBe(25)
        expect(res.pages).toBe(3)
    })

    it('should return last page', async () => {
        // init select for caching
        const initRes = await jsonlFile.selectWithPagination({}, 1, 10)
        expect(initRes.data).toHaveLength(10)
        // now should return from cache
        await jsonlFile.update({ name: 'Updated Name21' }, { id: 21 })
        const res = await jsonlFile.selectWithPagination({}, 3, 10)
        logTest(true, 'lst page:', res)
        expect(res.data).toHaveLength(5)
        expect(res.page).toBe(3)
        expect(res.total).toBe(25)
        expect(res.pages).toBe(3)
        // data received from cache should be updated
        expect(res.data[0].name).toBe('Updated Name21')
        const updatedRecord = await jsonlFile.select('id===21')
        expect(updatedRecord[0].name).toBe('Updated Name21')
    })

    it('should return empty page if page number is too large', async () => {
        const res = await jsonlFile.selectWithPagination({}, 5, 10)
        expect(res.data).toHaveLength(0)
        expect(res.page).toBe(5)
        expect(res.total).toBe(25)
        expect(res.pages).toBe(3)
    })

    it('should correctly filter by user', async () => {
        const res = await jsonlFile.selectWithPagination(
            { user: 'User1' },
            1,
            10,
        )
        const all = await jsonlFile.select({ user: 'User1' })
        expect(res.data.every((r) => r.user === 'User1')).toBe(true)
        expect(res.total).toBe(all.length)
    })

    it('should update select cache after record deletion', async () => {
        // Init cache
        const initRes = await jsonlFile.selectWithPagination({}, 1, 10)
        expect(initRes.data).toHaveLength(10)

        // Delete record
        await jsonlFile.delete({ id: 5 })

        // Check that cache is updated
        const res = await jsonlFile.selectWithPagination({}, 1, 10)
        expect(res.data).toHaveLength(10)
        expect(res.total).toBe(24) // Общее количество уменьшилось
        expect(res.data.find((item) => item.id === 5)).toBeUndefined()

        let resFromFilterFunc = await jsonlFile.selectWithPagination(
            (item) => {
                return Number(item.id) < 10
            },
            1,
            5,
        )
        expect(resFromFilterFunc.data).toHaveLength(5)
        expect(resFromFilterFunc.total).toBe(8)
        expect(resFromFilterFunc.pages).toBe(2)
        await jsonlFile.delete({ id: 2 })
        await jsonlFile.delete({ id: 6 })
        await jsonlFile.delete({ id: 7 })
        resFromFilterFunc = await jsonlFile.selectWithPagination(
            (item) => {
                return Number(item.id) < 10
            },
            1,
            5,
        )
        expect(resFromFilterFunc.data).toHaveLength(5)
        expect(resFromFilterFunc.total).toBe(5)
        expect(resFromFilterFunc.pages).toBe(1)
    })

    it('should respect cache limit', async () => {
        // create new instance with small cache limit
        const limitedJsonlFile = new JSONLFile<TestData>(testFile, '', {
            allocSize: 256,
            cacheTTL: 1000 * 180,
            cacheLimit: 15, // limit cache to 15 records
        })
        await limitedJsonlFile.init()

        // fill cache with different requests
        for (let i = 1; i <= 10; i++) {
            await limitedJsonlFile.selectWithPagination(
                { user: `User${i % 3}` },
                1,
                5,
            )
        }

        // check cache size contains no more than 15 records
        const cache = limitedJsonlFile.getSelectCache()
        expect(cache).not.toBeNull()
        expect(cache?.getCacheSize()).toBeLessThanOrEqual(15)
    })

    it('should clear cache after TTL expiration', async () => {
        // create new instance with small TTL
        const shortTTLJsonlFile = new JSONLFile<TestData>(testFile, '', {
            allocSize: 256,
            cacheTTL: 100, // 100ms TTL
            cacheLimit: 100,
            cacheCleanupInterval: 200, // 1 second
        })
        await shortTTLJsonlFile.init()

        // fill cache
        const initRes = await shortTTLJsonlFile.selectWithPagination({}, 1, 10)
        expect(initRes.data).toHaveLength(10)

        // wait for TTL expiration
        await new Promise((resolve) => setTimeout(resolve, 400))

        // check that cache is cleared
        const cache = shortTTLJsonlFile.getSelectCache()
        expect(cache?.getCacheSize()).toBe(0)
    })
})

describe('JSONLFile skipCheckExistingForWrite', () => {
    const testFile = path.join('test-data-jsonl', 'skip_check_test.jsonl')
    let jsonlFile: JSONLFile<TestData>

    beforeEach(async () => {
        try {
            await safeUnlink(testFile, true)
        } catch {}

        if (!fs.existsSync(path.dirname(testFile))) {
            fs.mkdirSync(path.dirname(testFile), { recursive: true })
        }

        jsonlFile = new JSONLFile<TestData>(testFile, '', {
            allocSize: 256,
        })
        await jsonlFile.init()
    })

    it('should skip checking existing records when skipCheckExistingForWrite is true', async () => {
        // Создаем начальные данные
        const initialData: TestData = {
            id: '1',
            name: 'Initial',
            value: 42,
            user: 'User1',
        }

        // Записываем начальные данные
        await jsonlFile.write(initialData)

        // Проверяем, что данные записались
        const initialResult = await jsonlFile.read()
        expect(initialResult).toHaveLength(1)
        expect(initialResult[0]).toEqual(initialData)

        // Пытаемся записать ту же запись с флагом skipCheckExistingForWrite = true
        const duplicateData: TestData = {
            id: '1',
            name: 'Duplicate',
            value: 100,
            user: 'User2',
        }

        // Должно создать дубликат записи, так как проверка существующих записей пропущена
        await jsonlFile.write(duplicateData, {
            inTransaction: false,
            skipCheckExistingForWrite: true,
        })

        // Проверяем, что теперь у нас две записи с одинаковым id
        const finalResult = await jsonlFile.read()
        expect(finalResult).toHaveLength(2)

        // Проверяем, что обе записи существуют
        const recordsWithId1 = finalResult.filter((record) => record.id === '1')
        expect(recordsWithId1).toHaveLength(2)

        // Проверяем, что одна запись имеет исходные данные, а другая - новые
        const hasInitial = recordsWithId1.some(
            (record) =>
                record.name === 'Initial' &&
                record.value === 42 &&
                record.user === 'User1',
        )
        const hasDuplicate = recordsWithId1.some(
            (record) =>
                record.name === 'Duplicate' &&
                record.value === 100 &&
                record.user === 'User2',
        )

        expect(hasInitial).toBe(true)
        expect(hasDuplicate).toBe(true)
    })

    it('should check existing records by default when skipCheckExistingForWrite is false', async () => {
        // Создаем начальные данные
        const initialData: TestData = {
            id: '1',
            name: 'Initial',
            value: 42,
            user: 'User1',
        }

        // Записываем начальные данные
        await jsonlFile.write(initialData)

        // Пытаемся записать ту же запись с флагом skipCheckExistingForWrite = false (по умолчанию)
        const duplicateData: TestData = {
            id: '1',
            name: 'Updated',
            value: 100,
            user: 'User2',
        }

        // Должно обновить существующую запись, так как проверка включена
        await jsonlFile.write(duplicateData, {
            inTransaction: false,
            skipCheckExistingForWrite: false,
        })

        // Проверяем, что у нас только одна запись с обновленными данными
        const finalResult = await jsonlFile.read()
        expect(finalResult).toHaveLength(1)
        expect(finalResult[0]).toEqual(duplicateData)
    })

    it('should handle multiple records with skipCheckExistingForWrite', async () => {
        // Создаем начальные данные
        const initialData: TestData[] = [
            { id: '1', name: 'First', value: 10, user: 'User1' },
            { id: '2', name: 'Second', value: 20, user: 'User2' },
        ]

        // Записываем начальные данные
        await jsonlFile.write(initialData)

        // Проверяем, что данные записались
        const initialResult = await jsonlFile.read()
        expect(initialResult).toHaveLength(2)

        // Пытаемся записать смешанные данные: существующие и новые
        const mixedData: TestData[] = [
            { id: '1', name: 'Updated First', value: 100, user: 'User1' }, // существующий
            { id: '3', name: 'Third', value: 30, user: 'User3' }, // новый
        ]

        // С флагом skipCheckExistingForWrite = true
        await jsonlFile.write(mixedData, {
            inTransaction: false,
            skipCheckExistingForWrite: true,
        })

        // Проверяем результат
        const finalResult = await jsonlFile.read()
        expect(finalResult).toHaveLength(4) // 2 исходных + 2 новых (включая дубликат)

        // Проверяем, что у нас есть дубликат записи с id=1
        const recordsWithId1 = finalResult.filter((record) => record.id === '1')
        expect(recordsWithId1).toHaveLength(2)

        // Проверяем, что новая запись с id=3 добавлена
        const recordsWithId3 = finalResult.filter((record) => record.id === '3')
        expect(recordsWithId3).toHaveLength(1)
        expect(recordsWithId3[0]).toEqual(mixedData[1])
    })

    it('should work correctly with indexed fields when skipCheckExistingForWrite is true', async () => {
        // Создаем адаптер с индексированными полями
        const indexedJsonlFile = new JSONLFile<TestData>(testFile, '', {
            allocSize: 256,
            indexedFields: ['id', 'name'],
        })
        await indexedJsonlFile.init()

        // Создаем начальные данные
        const initialData: TestData = {
            id: '1',
            name: 'Initial',
            value: 42,
            user: 'User1',
        }

        // Записываем начальные данные
        await indexedJsonlFile.write(initialData)

        // Пытаемся записать дубликат с skipCheckExistingForWrite = true
        const duplicateData: TestData = {
            id: '1',
            name: 'Duplicate',
            value: 100,
            user: 'User2',
        }

        await indexedJsonlFile.write(duplicateData, {
            inTransaction: false,
            skipCheckExistingForWrite: true,
        })

        // Проверяем, что дубликат создался
        const finalResult = await indexedJsonlFile.read()
        expect(finalResult).toHaveLength(2)

        // Проверяем поиск по индексу - должно найти обе записи
        const searchById = await indexedJsonlFile.readByFilter({ id: '1' })
        expect(searchById).toHaveLength(2)

        // Проверяем поиск по имени - должно найти соответствующие записи
        const searchByName1 = await indexedJsonlFile.readByFilter({
            name: 'Initial',
        })
        expect(searchByName1).toHaveLength(1)

        const searchByName2 = await indexedJsonlFile.readByFilter({
            name: 'Duplicate',
        })
        expect(searchByName2).toHaveLength(1)
        // logTest(true, 'indexedJsonlFile:', await indexedJsonlFile.getPositionsNoLock())
    })

    it('should handle empty array with skipCheckExistingForWrite', async () => {
        // Создаем начальные данные
        const initialData: TestData = {
            id: '1',
            name: 'Initial',
            value: 42,
            user: 'User1',
        }

        // Записываем начальные данные
        await jsonlFile.write(initialData)

        // Пытаемся записать пустой массив с skipCheckExistingForWrite = true
        await jsonlFile.write([], {
            inTransaction: false,
            skipCheckExistingForWrite: true,
        })

        // Проверяем, что данные не изменились
        const result = await jsonlFile.read()
        expect(result).toHaveLength(1)
        expect(result[0]).toEqual(initialData)
    })

    it('should handle single record vs array with skipCheckExistingForWrite', async () => {
        // Создаем начальные данные как массив
        const initialData: TestData[] = [
            { id: '1', name: 'First', value: 10, user: 'User1' },
        ]

        // Записываем начальные данные
        await jsonlFile.write(initialData)

        // Пытаемся записать ту же запись как одиночный объект с skipCheckExistingForWrite = true
        const singleData: TestData = {
            id: '1',
            name: 'Updated',
            value: 100,
            user: 'User2',
        }

        await jsonlFile.write(singleData, {
            inTransaction: false,
            skipCheckExistingForWrite: true,
        })

        // Проверяем, что дубликат создался
        const finalResult = await jsonlFile.read()
        expect(finalResult).toHaveLength(2)

        // Проверяем, что обе записи с id=1 существуют
        const recordsWithId1 = finalResult.filter((record) => record.id === '1')
        expect(recordsWithId1).toHaveLength(2)
    })

    it('should work with encryption when skipCheckExistingForWrite is true', async () => {
        // Создаем зашифрованный адаптер
        const encryptedJsonlFile = new JSONLFile<TestData>(
            testFile,
            'test-key',
            {
                allocSize: 256,
            },
        )
        await encryptedJsonlFile.init()

        // Создаем начальные данные
        const initialData: TestData = {
            id: '1',
            name: 'Initial',
            value: 42,
            user: 'User1',
        }

        // Записываем начальные данные
        await encryptedJsonlFile.write(initialData)

        // Пытаемся записать дубликат с skipCheckExistingForWrite = true
        const duplicateData: TestData = {
            id: '1',
            name: 'Duplicate',
            value: 100,
            user: 'User2',
        }

        await encryptedJsonlFile.write(duplicateData, {
            inTransaction: false,
            skipCheckExistingForWrite: true,
        })

        // Проверяем, что дубликат создался
        const finalResult = await encryptedJsonlFile.read()
        expect(finalResult).toHaveLength(2)

        // Проверяем, что обе записи с id=1 существуют
        const recordsWithId1 = finalResult.filter((record) => record.id === '1')
        expect(recordsWithId1).toHaveLength(2)
    })
})
