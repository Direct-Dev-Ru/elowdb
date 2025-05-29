import { TestData } from '../../common/interfaces/test-data.js'
import { deepEqual, equal } from 'node:assert/strict'
import test from 'node:test'

import { temporaryFile } from 'tempy'

import { TextFile, TextFileSync } from './TextFile.js'

const secretKey = 'somesecretcode'

await test('TextFile', async () => {
    const str = 'foo'
    const file = new TextFile(temporaryFile(), secretKey)

    // Null if file doesn't exist
    equal(await file.read(), null)

    // Write
    equal(await file.write(str), undefined)

    // Read
    deepEqual(await file.read(), str)
})

await test('TextFileSync', () => {
    const str = 'foo'
    const file = new TextFileSync(temporaryFile(), secretKey)

    // Null if file doesn't exist
    equal(file.read(), null)

    // Write
    equal(file.write(str), undefined)

    // Read
    deepEqual(file.read(), str)
})

await test('RaceCondition', async () => {
    const tempFile = temporaryFile()
    const file = new TextFile(tempFile, secretKey)
    const promises: Promise<void>[] = []

    let i = 0
    for (; i <= 100; i++) {
        promises.push(file.write(String(i)))
    }

    await Promise.all(promises)

    equal(await file.read(), String(i - 1))
    // console.log(tempFile)
})
