import { CookieStorage } from '../adapters/browser/CookieStorage.js'
import { IndexedDbStorage } from '../adapters/browser/IndexedDbStorage.js'
import { LocalStorage } from '../adapters/browser/LocalStorage.js'
import { SessionStorage } from '../adapters/browser/SessionStorage.js'
// import { Low, LowSync } from '../index.js'
import { Low } from '../index.js'

export async function LocalStoragePreset<Data>(
    key: string,
    defaultData: Data,
): Promise<Low<Data>> {
    const adapter = new LocalStorage<Data>(key)
    const db = new Low<Data>(adapter, defaultData)
    await db.read()
    return db
}

export async function SessionStoragePreset<Data>(
    key: string,
    defaultData: Data,
): Promise<Low<Data>> {
    const adapter = new SessionStorage<Data>(key)
    const db = new Low<Data>(adapter, defaultData)
    await db.read()
    return db
}

export async function CookieStoragePreset<Data>(
    key: string,
    defaultData: Data,
): Promise<Low<Data>> {
    const adapter = new CookieStorage<Data>(key)
    const db = new Low<Data>(adapter, defaultData)
    await db.read()
    return db
}

export async function IndexedDbStoragePreset<Data>(
    key: string,
    defaultData: Data,
): Promise<Low<Data>> {
    const adapter = new IndexedDbStorage<Data>(key)
    const db = new Low<Data>(adapter, defaultData)
    await db.read()
    return db
}
