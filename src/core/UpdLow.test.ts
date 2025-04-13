/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

// import { temporaryFile } from 'tempy'
import { JSONFile } from '../adapters/node/JSONFile.js'
import { UpdLow } from './Low.js'

interface TestData {
    value?: number
    items?: string[]
}

let testFilePath: string = join(tmpdir(), `test-${Date.now()}.json`)
let adapter = new JSONFile<TestData>(testFilePath)

const BeforeEach = async (): Promise<string> => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    testFilePath = join(tmpdir(), `test-${Date.now()}.json`)
    adapter = new JSONFile<TestData>(testFilePath)
    return testFilePath
}

const AfterEach = async <T = unknown>(
    db: UpdLow<T>,
    testFilePath: string,
    // eslint-disable-next-line @typescript-eslint/require-await
): Promise<void> => {
    try {
        await unlink(testFilePath)
    } catch (e) {
        console.log(e)
    } finally {
        db?.stopSmartRefresh()
        console.log('------------------------------------')
    }
    return
}

await test('should initialize with default data', async () => {
    const testFilePath = await BeforeEach()
    const defaultData: TestData = { value: 42 }
    const db = new UpdLow(adapter, defaultData, 2000)
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.deepEqual(db.data, defaultData)
    assert.equal(db.lastMod, 0)
    await db.write()
    await AfterEach<TestData>(db, testFilePath)
})

await test('should only refresh when data is unchanged', async () => {
    const testFilePath = await BeforeEach()
    writeFileSync(testFilePath, JSON.stringify({ value: 1 }))
    const db = new UpdLow(adapter, {}, 2000)
    await db.read() // Initial read

    const firstReadTime = db.lastFetch
    db.data = { value: 2 } // Make local change and make it dirty

    // Simulate external change id db file
    writeFileSync(testFilePath, JSON.stringify({ value: 3 }))
    await new Promise((resolve) => setTimeout(resolve, 500))
    console.log('db.isDirty', db.isDirty)

    assert.ok(db.isDirty === true)

    assert.equal(db.data.value, 2) // Should keep local change

    // sync db with file
    await db.read()
    assert.ok(db.isDirty !== true)
    // console.log('db.isDirty', db.isDirty)
    assert.equal(db.data.value, 3) // Now should keep updatable variable
    assert.ok(db.lastFetch >= firstReadTime)

    await AfterEach<TestData>(db, testFilePath)
})

// eslint-disable-next-line @typescript-eslint/no-floating-promises, @typescript-eslint/require-await
// describe('UpdLow', async () => {
//     let testFilePath: string
//     let adapter: JSONFile<TestData>

//     beforeEach(() => {
//         testFilePath = join(tmpdir(), `test-${Date.now()}.json`)
//         adapter = new JSONFile<TestData>(testFilePath)
//     })

//     afterEach(() => {
//         try {
//             unlinkSync(testFilePath)
//         } catch (e) {
//             console.log(e)
//         }
//     })

//     // eslint-disable-next-line @typescript-eslint/require-await
//     void it('should initialize with default data', async () => {
//         const defaultData: TestData = { value: 42 }
//         const db = new UpdLow(adapter, defaultData)

//         assert.deepEqual(db.data, defaultData)
//         assert.equal(db.lastMod, 0)
//     })

//     void it('should auto-read when no default data provided', async () => {
//         writeFileSync(testFilePath, JSON.stringify({ value: 100 }))

//         const db = new UpdLow(adapter)
//         // Wait for setImmediate to complete
//         await new Promise((resolve) => setImmediate(resolve))

//         assert.equal(db.data.value, 100)
//         assert.ok(db.lastFetch > 0)
//     })

//     void it('should track modifications via setter', () => {
//         const db = new UpdLow(adapter, {})
//         const beforeTime = Date.now()

//         db.data = { value: 10 }
//         const afterTime = Date.now()

//         assert.equal(db.data.value, 10)
//         assert.ok(db.lastMod >= beforeTime)
//         assert.ok(db.lastMod <= afterTime)
//     })

//     void it('should only refresh when data is unchanged', async () => {
//         writeFileSync(testFilePath, JSON.stringify({ value: 1 }))
//         const db = new UpdLow(adapter, {})
//         await db.read() // Initial read

//         const firstReadTime = db.lastFetch
//         db.data = { value: 2 } // Make local change

//         // Simulate external change id db file
//         writeFileSync(testFilePath, JSON.stringify({ value: 3 }))
//         await new Promise((resolve) => setTimeout(resolve, 500))
//         console.log(db.isDirty)

//         assert.ok(!db.isDirty)

//         assert.equal(db.data.value, 2) // Should keep local change

//         // sync db with file
//         await db.read()
//         assert.ok(!db.isDirty)
//         assert.equal(db.data.value, 3) // Now should keep updatable variable
//         assert.ok(db.lastFetch > firstReadTime)
//     })

//     void it('should handle smart refresh intervals', async () => {
//         const db = new UpdLow(adapter, {}, 100)

//         let refreshCount = 0
//         const originalRead = db.read.bind(db)
//         db.read = async () => {
//             refreshCount++
//             await originalRead()
//         }

//         await new Promise((resolve) => setTimeout(resolve, 250))
//         db.stopSmartRefresh()

//         assert.ok(refreshCount >= 2) // Should have refreshed at least twice
//     })

//     void it('should prevent concurrent reads', async () => {
//         const db = new UpdLow(adapter, {})

//         let readOperations = 0
//         const originalRead = db.read.bind(db)
//         db.read = async () => {
//             readOperations++
//             await originalRead()
//         }

//         // Properly await all concurrent reads
//         await Promise.all([db.read(), db.read(), db.read()])

//         assert.equal(readOperations, 1)
//     })

//     void it('should update and write data', async () => {
//         const db = new UpdLow(adapter, {})

//         // eslint-disable-next-line @typescript-eslint/require-await
//         const result = await db.update(async (data) => {
//             data.value = 42
//             return true
//         })

//         assert.equal(result, true)
//         assert.equal(db.data.value, 42)

//         await db.write()
//         const fileContent = JSON.parse(readFileSync(testFilePath, 'utf-8'))
//         assert.equal(fileContent?.value || 0, 42)
//     })

//     void it('should handle failed updates', async () => {
//         const db = new UpdLow(adapter, {})

//         // eslint-disable-next-line @typescript-eslint/require-await
//         const result = await db.update(async () => false)
//         assert.equal(result, false)
//     })

//     // Additional test for error cases
//     void it('should handle read errors gracefully', async () => {
//         const db = new UpdLow(adapter, {})

//         // Mock a failing read
//         const originalRead = db.read.bind(db)
//         // eslint-disable-next-line @typescript-eslint/require-await
//         db.read = async () => {
//             throw new Error('Read failed')
//         }

//         try {
//             await assert.rejects(
//                 async () => {
//                     await db.read()
//                 },
//                 { name: 'Error', message: 'Read failed' },
//             )
//         } finally {
//             db.read = originalRead // Restore original
//         }
//     })
// })
