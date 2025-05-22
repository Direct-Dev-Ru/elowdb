import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { JSONLFile } from './JSONLFile.js'
import { FilePositions, LinePositionsManager } from './JSONLFile.js'
import { RWMutex } from '@direct-dev-ru/rwmutex-ts'

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

describe('JSONLFile', () => {
    // const testDir = path.join(process.cwd(), 'test-data')
    const testDir = path.join('test-data')
    const testFileMain = path.join(testDir, 'testResult')
    let jsonlFile: JSONLFile<TestData>

    beforeEach(async () => {
        // Create test directory if it doesn't exist
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true })
        }
    })

    afterEach(async () => {})
    describe('JSONLFile warm up', () => {
        it('01.should store collectionName in the adapter', async () => {
            const logInThisTest = true
            const testFile = `${testFileMain}_B01.jsonl`
            try {
                await fs.promises.unlink(`${testFile}_B01.jsonl`)
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

    describe.skip('JSONLFile step with transaction', () => {
        it('01.should write and read a single object', async () => {
            const testFile = `${testFileMain}_01.jsonl`
            try {
                await fs.promises.unlink(`${testFile}_01.jsonl`)
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
                await fs.promises.unlink(testFile)
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
                await fs.promises.unlink(testFile)
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
                await fs.promises.unlink(testFile)
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
                await fs.promises.unlink(testFile)
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
                await fs.promises.unlink(testFile)
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
                await fs.promises.unlink(testFile)
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
                await fs.promises.unlink(testFile)
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
                await fs.promises.unlink(testFile)
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
            const testFile = `${testFileMain}_10.jsonl`
            try {
                await fs.promises.unlink(testFile)
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
            console.log('result2', result2)
            expect(Array.isArray(result2)).toBe(true)
            if (Array.isArray(result2)) {
                expect(result2.length).toBe(1)
                expect(result2[0].id).toBe(checkId)
            }
            const result3 = await jsonlFile.readByData({ user: 'User0' })
            console.log('result3', result3)
            expect(Array.isArray(result3)).toBe(true)
            if (Array.isArray(result3)) {
                expect(result3.length).toBe(3)
            }
        })

        it('11.should handle file compression', async () => {
            const testFile = `${testFileMain}_11.jsonl`
            try {
                await fs.promises.unlink(testFile)
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
        it.skip('01T.should write and read multiple objects', async () => {
            const testFile = `${testFileMain}_01T.jsonl`
            try {
                await fs.promises.unlink(testFile)
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

        it.skip('02T.should rollback then error', async () => {
            const logInThisTest = false
            const testFile = `${testFileMain}_02T.jsonl`
            try {
                await fs.promises.unlink(testFile)
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

        it.skip('03T.should use external mutex when specified', async () => {
            const testFile = `${testFileMain}_03T.jsonl`
            try {
                await fs.promises.unlink(testFile)
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

        it.skip('04T.should handle concurrent transactions', async () => {
            const testFile = `${testFileMain}_04T.jsonl`
            const logInThisTest = false
            try {
                await fs.promises.unlink(testFile)
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
                    name: `Test${i}.`.repeat(getRandom(1, 20)),
                    value: getRandom(20, 40),
                    user: `User${i % 2}`,
                })
            }

            const externalMutex = new RWMutex()
            // const externalMutex = (
            //     await LinePositionsManager.getFilePositions(testFile)
            // ).getMutex()
            const data3: TestData = {
                id: '300',
                name: 'Test 3',
                value: 40,
                user: 'User3',
            }
            await jsonlFile.write([data3])
            try {
                await Promise.all(
                    testData.map((data, index) =>
                        jsonlFile.withTransaction(
                            async (tx) => {
                                await tx.write(data, true, `test-${index}`)
                            },
                            { rollback: false, mutex: externalMutex },
                        ),
                    ),
                )
            } catch (error) {
                expect(error).toBeInstanceOf(Error)
            }

            const result = await jsonlFile.read()
            expect(result).toHaveLength(concurentCount)
            expect(result).toEqual(
                expect.arrayContaining([
                    data3,
                    ...testData.filter((td) => td.id != '6'),
                ]),
            )
            logTest(
                logInThisTest,
                'filePositions',
                await LinePositionsManager.getFilePositions(testFile),
            )
        })

        it.skip('05T.should support reading in a transaction', async () => {
            const testFile = `${testFileMain}_05T.jsonl`
            const logInThisTest = false
            try {
                await fs.promises.unlink(testFile)
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
                await jsonlFile.write([data3])
                result = await tx.read(undefined, true)
                expect(result).toHaveLength(3)
                expect(result).toEqual([data1, data2, data3])

                await tx.delete([{ id: '2' }], true)
                result = await tx.read(undefined, true)
                expect(result).toHaveLength(2)
                expect(result).toEqual([data1, data3])
                tx.init(true, true)
            })
        })

        it('06T.should support deletion in a transaction', async () => {
            const testFile = `${testFileMain}_06T.jsonl`
            const logInThisTest = false
            try {
                await fs.promises.unlink(testFile)
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

        it.skip('07T.should restore file state on error', async () => {
            const testFile = `${testFileMain}_07T.jsonl`
            try {
                await fs.promises.unlink(testFile)
            } catch (error) {
                // Игнорируем ошибку, если файл не существует
            }

            jsonlFile = new JSONLFile<TestData>(testFile, '', {
                allocSize: 512,
            })
            await jsonlFile.init(true)

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

            try {
                await jsonlFile.withTransaction(
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
            const result2 = await jsonlFile.read()
            expect(result2).toHaveLength(2)
            expect(result2).toEqual([initialData, data1])
        })

        it.skip('08T.should handle backup file cleanup', async () => {
            const testFile = `${testFileMain}_08T.jsonl`
            try {
                await fs.promises.unlink(testFile)
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
                await fs.promises.unlink(testFile)
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
})
