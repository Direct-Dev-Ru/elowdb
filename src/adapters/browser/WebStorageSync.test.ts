import { deepEqual, equal  } from 'node:assert/strict'
import test from 'node:test'

import { WebStorageSync } from './WebStorageSync.js'
import { bsonOptionsForStorage } from '../../common/bson/bson-option.js'

const storage: { [key: string]: string } = {}

// Example: Using btoa and atob for base64 encoding/decoding
const base64Options = {
    parse: (str: string): any => JSON.parse(atob(str)),
    stringify: (data: any): string => btoa(JSON.stringify(data)),
};

// Mock localStorage
const mockStorage = () => ({
    getItem: (key: string): string | null => storage[key] || null,
    setItem: (key: string, data: string) => (storage[key] = data),
    length: 1,
    removeItem() {
        return
    },
    clear() {
        return
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    key(_: number): string {
        return ''
    },
})
global.localStorage = mockStorage()
global.sessionStorage = mockStorage()

await test('localStorage', async () => {
    const obj = { id: 1, name: 'test' }
    const storage = new WebStorageSync<{ id: number, name: string }>('key base64', localStorage, { ...base64Options })
        // Write
    equal(storage.write(obj), undefined)
        // Read
    deepEqual(storage.read(), obj)
    console.log('localStorage unencrypted', storage.read())
    console.log('localStorage unencrypted in storage representation',global.localStorage.getItem('key base64'))
})

await test('localStorage bson', async () => {
    const obj = { id: 1, name: 'test' }
    const storage = new WebStorageSync<{ id: number, name: string }>('key bson', localStorage, { ...bsonOptionsForStorage })
        // Write
    equal(storage.write(obj), undefined)
        // Read
    deepEqual(storage.read(), obj)
    console.log('localStorage bson unencrypted', storage.read())
    console.log('localStorage bson unencrypted in storage representation',global.localStorage.getItem('key bson'))
})

await test('localStorage encrypted', async () => {
    const obj = { id: 1, name: 'test' }
    const encStorage = new WebStorageSync<{ id: number, name: string }>('encrypted', localStorage, { _cypherKey: 'secret', })
    // Write encrypted
    equal(encStorage.write(obj), undefined)
    // Read encrypted   
    deepEqual(encStorage.read(), obj)
    // console.log(global.sessionStorage.getItem('key'))
    // console.log(global.sessionStorage.getItem('encrypted'))
    // console.log(await encStorage.read())
})

await test('sessionStorage without encryption', async () => {
    const obj = { id: 1, name: 'test' }
    const storage = new WebStorageSync('key', sessionStorage)
    // Write
    equal(storage.write(obj), undefined)
    // Read
    deepEqual(storage.read(), obj)    
})

await test('sessionStorage encrypted', async () => {
    const obj = { id: 1, name: 'test' }
    const encStorage = new WebStorageSync<{ id: number, name: string }>('encrypted', sessionStorage, { _cypherKey: 'secret', ...bsonOptionsForStorage })
    // Write encrypted
    equal(encStorage.write(obj), undefined)
    // Read encrypted   
    deepEqual(encStorage.read(), obj)
    console.log(global.sessionStorage.getItem('key'))
    console.log(global.sessionStorage.getItem('encrypted'))
    // console.log(await encStorage.read())
})


