import { TestData } from '../../common/interfaces/test-data.js'
import { deepEqual, equal } from 'node:assert/strict'
import test from 'node:test'

import { temporaryFile } from 'tempy'

import { JSONFile, JSONFileSync } from './JSONFile.js'

type Data = {
    a: number
}

const secretKey = 'Testkey25!'

await test('JSONFile', async () => {
    const tempFile = temporaryFile()

    const obj: Data = { a: 1 }
    const file = new JSONFile<Data>(tempFile, secretKey)

    // Null if file doesn't exist
    equal(await file.read(), null)

    // Write
    equal(await file.write(obj), undefined)
    // console.log('tempFile:', tempFile)

    // Read
    deepEqual(await file.read(), obj)
})

await test('JSONFileSync', () => {
    const tempFile = temporaryFile()
    const obj = { a: 1 }
    const file = new JSONFileSync<Data>(tempFile, secretKey)
    // console.log('tempFile:', tempFile)
    // Null if file doesn't exist
    equal(file.read(), null)

    // Write
    equal(file.write(obj), undefined)

    // Read
    deepEqual(file.read(), obj)
})
