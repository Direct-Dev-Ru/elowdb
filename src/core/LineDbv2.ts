/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/require-await */
import { RWMutex } from '@direct-dev-ru/rwmutex-ts'
import { chain, CollectionChain } from 'lodash'

import { JSONLFile, TransactionOptions } from '../adapters/node/JSONLFile.js'
const globalLineDbMutex = new RWMutex()

export function logTest(...args: unknown[]): void {
    if (process.env.NODE_ENV === 'test') {
        console.log(...args)
    }
}

class LastIdManager {
    private static instance: LastIdManager
    private lastIds: Map<string, number> = new Map()
    private mutex: RWMutex = new RWMutex()

    private constructor() {}

    static getInstance(): LastIdManager {
        if (!LastIdManager.instance) {
            LastIdManager.instance = new LastIdManager()
        }
        return LastIdManager.instance
    }

    async getLastId(filename: string): Promise<number> {
        return await this.mutex.withReadLock(async () => {
            return this.lastIds.get(filename) || 0
        })
    }

    async setLastId(filename: string, id: number): Promise<void> {
        await this.mutex.withWriteLock(async () => {
            this.lastIds.set(filename, id)
        })
    }

    async incrementLastId(filename: string): Promise<number> {
        return await this.mutex.withWriteLock(async () => {
            const currentId = this.lastIds.get(filename) || 0
            const newId = currentId + 1
            this.lastIds.set(filename, newId)
            return newId
        })
    }
}

interface CacheEntry<T> {
    data: T
    lastAccess: number // время последнего доступа
    collectionName: string // имя коллекции
}

export interface LineDbOptions {
    cacheSize?: number
    mutex?: RWMutex
    nextIdFn?: (
        data: Partial<unknown>,
        collectionName: string,
    ) => Promise<string | number>
    objName?: string
    cacheTTL?: number // время жизни записи в кэше (мс)
}

export interface LineDbAdapter {
    id: string | number
}

export type JoinType = 'inner' | 'left' | 'right' | 'full'

export interface JoinOptions<T extends LineDbAdapter, U extends LineDbAdapter> {
    type: JoinType
    leftFields: string[]
    rightFields: string[]
    strictCompare?: boolean
    inTransaction?: boolean
    leftFilter?: Partial<T>
    rightFilter?: Partial<U>
    onlyOneFromRight?: boolean
}

export class LineDb {
    #adapters: Map<string, unknown> = new Map()
    // #adapters: Map<string, JSONLFile<unknown>> = new Map()
    #collections: Map<string, string> = new Map()
    #mutex: RWMutex
    #cache: Map<string, CacheEntry<unknown>>
    #cacheSize: number
    #nextIdFn: (
        data: Partial<unknown>,
        collectionName: string,
    ) => Promise<string | number>
    #lastIdManager: LastIdManager
    #inTransaction: boolean = false
    #cacheTTL?: number

    constructor(adapters: unknown, options: LineDbOptions = {}) {
        if (Array.isArray(adapters)) {
            for (const adapter of adapters) {
                if (adapter instanceof JSONLFile) {
                    const collectionName = adapter.getCollectionName()
                    this.#adapters.set(collectionName, adapter)
                    this.#collections.set(collectionName, adapter.getFilename())
                }
            }
        } else if (adapters instanceof JSONLFile) {
            const collectionName = adapters.getCollectionName()
            this.#adapters.set(collectionName, adapters)
            this.#collections.set(collectionName, adapters.getFilename())
        } else {
            throw new Error('Invalid adapters')
        }

        this.#mutex = options.mutex || globalLineDbMutex
        this.#cache = new Map()
        this.#cacheSize = options.cacheSize || 1000
        this.#nextIdFn = options.nextIdFn || this.#defaultNextIdFn
        this.#cacheTTL = options.cacheTTL
        this.#lastIdManager = LastIdManager.getInstance()
    }

    async init(force: boolean = false): Promise<void> {
        for (const [collectionName, adapter] of this.#adapters) {
            await (adapter as JSONLFile<LineDbAdapter>).init(force)
            // Инициализируем lastId
            const all = await this.read(collectionName)
            if (all.length > 0) {
                const maxId = Math.max(
                    ...all.map((item) =>
                        typeof item.id === 'number' ? item.id : 0,
                    ),
                )
                await this.#lastIdManager.setLastId(collectionName, maxId)
            } else {
                await this.#lastIdManager.setLastId(collectionName, 0)
            }
        }
    }

    get actualCacheSize(): number {
        return this.#cache.size
    }
    get limitCacheSize(): number {
        return this.#cacheSize
    }
    get cacheMap(): Map<string, CacheEntry<unknown>> {
        return this.#cache
    }

    #defaultNextIdFn = async (
        _data: Partial<unknown>,
        collectionName: string,
    ): Promise<number> => {
        return await this.#lastIdManager.incrementLastId(collectionName)
    }

    public get firstCollection(): string {
        const firstCollection = this.#collections.keys().next().value as string
        if (!firstCollection) {
            throw new Error('No collections available')
        }
        return firstCollection
    }

    async nextId<T extends LineDbAdapter>(
        data?: Partial<T>,
        collectionName?: string,
    ): Promise<string | number> {
        if (!collectionName) {
            collectionName = this.firstCollection
        }
        return await this.#nextIdFn(data || {}, collectionName)
    }

    async lastSequenceId(collectionName?: string): Promise<number> {
        if (!collectionName) {
            collectionName = this.firstCollection
        }
        return await this.#lastIdManager.getLastId(collectionName)
    }

    async read<T extends LineDbAdapter>(
        collectionName?: string,
        options: { inTransaction: boolean } = { inTransaction: false },
    ): Promise<T[]> {
        if (!collectionName) {
            collectionName = this.firstCollection
        }
        const adapter = this.#adapters.get(collectionName) as JSONLFile<T>
        if (!adapter) {
            throw new Error(`Collection ${collectionName} not found`)
        }
        const payload = async () => {
            return await adapter.read(
                undefined,
                this.#inTransaction || options?.inTransaction,
            )
        }
        if (this.#inTransaction || options?.inTransaction) {
            return await payload()
        }
        return await this.#mutex.withReadLock(payload)
    }

    async #filterByData<T extends LineDbAdapter>(
        data: Partial<T>,
        collection: T[],
        options?: { strictCompare?: boolean },
    ): Promise<T[]> {
        return collection.filter((record) => {
            return Object.entries(data).every(([key, value]) => {
                const recordValue = record[key as keyof T]

                // Если значение в data - строка, проверяем вхождение
                if (
                    typeof value === 'string' &&
                    typeof recordValue === 'string' &&
                    options?.strictCompare == false
                ) {
                    return recordValue
                        .toLowerCase()
                        .includes(value.toLowerCase())
                }

                // Для остальных типов проверяем строгое равенство
                return recordValue === value
            })
        })
    }

    async readByData<T extends LineDbAdapter>(
        data: Partial<T>,
        collectionName?: string,
        options?: { strictCompare?: boolean; inTransaction?: boolean },
    ): Promise<T[]> {
        if (!collectionName) {
            collectionName = this.firstCollection
        }
        const adapter = this.#adapters.get(collectionName) as JSONLFile<T>
        if (!adapter) {
            throw new Error(`Collection ${collectionName} not found`)
        }

        const payload = async () => {
            const now = Date.now()

            // Сначала проверяем кэш по id представленной записи
            if (data.id) {
                const cacheKey = `${collectionName}:${data.id}`
                if (this.#cache.has(cacheKey)) {
                    const entry = this.#cache.get(cacheKey) as CacheEntry<T>

                    // Проверяем, не устарела ли запись в кэше
                    if (
                        this.#cacheTTL &&
                        now - entry.lastAccess > this.#cacheTTL
                    ) {
                        // Запись устарела, удаляем её из кэша
                        this.#cache.delete(cacheKey)
                        logTest(`Cache entry expired for ${cacheKey}`)
                    } else {
                        // Запись актуальна, обновляем время доступа и возвращаем
                        entry.lastAccess = now
                        logTest(`Cache hit for ${cacheKey}`)
                        return [entry.data]
                    }
                }
            }

            const results = await adapter.readByData(
                data,
                options,
                this.#inTransaction || options?.inTransaction,
            )

            // Обновляем кэшшшшшшшшшшшшшшшшшшшшшшшшшшшшшшшшшшш
            for (const item of results) {
                this.#updateCache(item, collectionName)
            }

            return results
        }

        if (this.#inTransaction || options?.inTransaction) {
            return await payload()
        }
        return await this.#mutex.withReadLock(payload)
    }

    async write<T extends LineDbAdapter>(
        data: T | T[],
        collectionName?: string,
        options: { inTransaction: boolean } = { inTransaction: false },
    ): Promise<void> {
        if (!collectionName) {
            collectionName = this.firstCollection
        }
        const adapter = this.#adapters.get(collectionName) as JSONLFile<T>
        if (!adapter) {
            throw new Error(`Collection ${collectionName} not found`)
        }

        const payload = async () => {
            const dataArray = Array.isArray(data) ? data : [data]
            for (const item of dataArray) {
                // Генерируем id для новых записей
                if (!item.id || Number(item.id) <= -1) {
                    item.id = await this.nextId(item, collectionName)
                }
            }

            await adapter.write(
                dataArray,
                this.#inTransaction || options.inTransaction,
            )
            // Обновляем кэш
            for (const item of dataArray) {
                this.#updateCache(item, collectionName)
            }
        }
        if (this.#inTransaction || options.inTransaction) {
            return await payload()
        }
        return await this.#mutex.withWriteLock(payload)
    }

    async insert<T extends LineDbAdapter>(
        data: T | T[],
        collectionName?: string,
        options: { inTransaction: boolean } = { inTransaction: false },
    ): Promise<void> {
        if (!collectionName) {
            collectionName = this.firstCollection
        }
        const adapter = this.#adapters.get(collectionName) as JSONLFile<T>
        if (!adapter) {
            throw new Error(`Collection ${collectionName} not found`)
        }

        const payload = async () => {
            const dataArray = Array.isArray(data) ? data : [data]
            for (const item of dataArray) {
                // Генерируем id для новых записей
                if (!item.id || Number(item.id) <= -1) {
                    item.id = await this.nextId(item, collectionName)
                } else {
                    // check record do not exists
                    const filter = { id: item.id } as Partial<T>
                    const exists = await adapter.readByData(
                        filter,
                        {
                            strictCompare: true,
                            inTransaction: options.inTransaction,
                        },
                        this.#inTransaction || options.inTransaction,
                    )
                    if (exists.length > 0) {
                        throw new Error(
                            `Запись с id ${item.id} уже существует в коллекции ${collectionName}`,
                        )
                    }
                }
            }

            await adapter.write(
                dataArray,
                this.#inTransaction || options.inTransaction,
            )
            // Обновляем кэш
            for (const item of dataArray) {
                this.#updateCache(item, collectionName)
            }
        }
        if (this.#inTransaction || options.inTransaction) {
            return await payload()
        }
        return await this.#mutex.withWriteLock(payload)
    }

    async update<T extends LineDbAdapter>(
        data: Partial<T> | Partial<T>[],
        collectionName?: string,
        options: { inTransaction: boolean } = { inTransaction: false },
    ): Promise<void> {
        if (!collectionName) {
            collectionName = this.firstCollection
        }
        const adapter = this.#adapters.get(collectionName) as JSONLFile<T>
        if (!adapter) {
            throw new Error(`Collection ${collectionName} not found`)
        }

        const payload = async () => {
            const dataArray = Array.isArray(data) ? data : [data]
            for (const item of dataArray) {
                // Генерируем id для новых записей
                if (!item.id || Number(item.id) <= -1) {
                    item.id = await this.nextId(item, collectionName)
                }
            }
            const updatedData: T[] = []
            for (const item of dataArray) {
                const existingItem = await adapter.readByData(
                    item,
                    {
                        strictCompare: true,
                        inTransaction: options.inTransaction,
                    },
                    this.#inTransaction || options.inTransaction,
                )
                if (existingItem.length > 0) {
                    for (const existing of existingItem) {
                        updatedData.push({
                            ...existing,
                            ...item,
                        } as T)
                    }
                }
            }
            await adapter.write(
                updatedData,
                this.#inTransaction || options.inTransaction,
            )
            // Обновляем кэш
            for (const upatedItem of updatedData) {
                this.#updateCache(upatedItem, collectionName)
            }
        }
        // выполнение внутри транзакции или самостоятельно
        if (this.#inTransaction || options.inTransaction) {
            return await payload()
        }
        return await this.#mutex.withWriteLock(payload)
    }

    async delete<T extends LineDbAdapter>(
        data: Partial<T> | Partial<T>[],
        collectionName?: string,
        options: { inTransaction: boolean } = { inTransaction: false },
    ): Promise<void> {
        if (!collectionName) {
            collectionName = this.firstCollection
        }
        const adapter = this.#adapters.get(collectionName) as JSONLFile<T>
        if (!adapter) {
            throw new Error(`Collection ${collectionName} not found`)
        }

        const payload = async () => {
            const dataArrayToDelete = Array.isArray(data) ? data : [data]
            await adapter.delete(
                dataArrayToDelete,
                this.#inTransaction || options.inTransaction,
            )

            // Очищаем кэш для удаленных записей
            for (const item of dataArrayToDelete) {
                if (item.id) {
                    const cacheKey = `${collectionName}:${item.id}`
                    this.#cache.delete(cacheKey)
                }
            }
        }
        if (this.#inTransaction || options.inTransaction) {
            return await payload()
        }
        return await this.#mutex.withWriteLock(payload)
    }

    #updateCache<T extends LineDbAdapter>(
        item: T,
        collectionName: string,
        options: { inTransaction: boolean } = { inTransaction: false },
    ): void {
        const now = Date.now()
        const cacheKey = `${collectionName}:${item.id}`

        logTest('options in #updatecache', options)

        // Если запись с таким ID уже есть в кэше, проверяем её актуальность
        if (this.#cache.has(cacheKey)) {
            const cachedEntry = this.#cache.get(cacheKey)!

            // Проверяем TTL
            if (
                this.#cacheTTL &&
                now - cachedEntry.lastAccess > this.#cacheTTL
            ) {
                // Запись устарела, удаляем её
                this.#cache.delete(cacheKey)
                logTest(`Cache entry expired during update for ${cacheKey}`)
            } else {
                const cachedEntryData = cachedEntry.data as T
                // Проверяем наличие поля timestamp и его значение
                if ('timestamp' in cachedEntryData) {
                    const newTimestamp = (
                        item as unknown as { timestamp: number }
                    ).timestamp
                    const cachedTimestamp = (
                        cachedEntryData as { timestamp: number }
                    ).timestamp

                    // Обновляем кэш только если новый timestamp больше или равен старому
                    if (newTimestamp >= cachedTimestamp) {
                        this.#cache.set(cacheKey, {
                            data: item,
                            lastAccess: now,
                            collectionName,
                        })
                        logTest('update cache item - timestamp checked', item)
                    }
                } else {
                    // Если поля timestamp нет, обновляем как обычно
                    this.#cache.set(cacheKey, {
                        data: item,
                        lastAccess: now,
                        collectionName,
                    })
                    logTest('update cache item - no timestamp', item)
                }
                return
            }
        }

        // Если кэш полон, ищем записи для вытеснения
        if (this.#cache.size >= this.#cacheSize) {
            let oldestAccess = Infinity
            let oldestKey: string | undefined

            // Find the entry with the oldest access time
            for (const [key, entry] of this.#cache.entries()) {
                if (entry.collectionName !== collectionName) {
                    continue
                }
                // Проверяем TTL при поиске самой старой записи
                if (this.#cacheTTL && now - entry.lastAccess > this.#cacheTTL) {
                    // Запись устарела, удаляем её
                    this.#cache.delete(key)
                    logTest(
                        `Cache entry in collection ${collectionName} expired during eviction for ${key}`,
                    )
                    continue
                }

                if (entry.lastAccess < oldestAccess) {
                    oldestAccess = entry.lastAccess
                    oldestKey = key
                }
            }

            // logTest('cache eviction - oldestKey', oldestKey)

            // Remove the oldest entry
            if (oldestKey !== undefined) {
                this.#cache.delete(oldestKey)
            }
            // add new entry to cache
            logTest('cache eviction - add new entry to cache', item)
            this.#cache.set(cacheKey, {
                data: item,
                lastAccess: now,
                collectionName,
            })
            return
        }

        // logTest('cache is not full - add new entry to cache', item)
        this.#cache.set(cacheKey, {
            data: item,
            lastAccess: now,
            collectionName,
        })
    }

    #matchesData<T extends LineDbAdapter>(
        item: T,
        data: Partial<T>,
        strictCompare?: boolean,
    ): boolean {
        return Object.entries(data).every(([key, value]) => {
            const itemValue = item[key as keyof T]

            if (
                typeof value === 'string' &&
                typeof itemValue === 'string' &&
                !strictCompare
            ) {
                return itemValue.toLowerCase().includes(value.toLowerCase())
            }

            return itemValue === value
        })
    }

    async select<T extends LineDbAdapter>(
        data: Partial<T>,
        collectionName?: string,
        options: { strictCompare?: boolean; inTransaction?: boolean } = {
            strictCompare: false,
            inTransaction: false,
        },
    ): Promise<CollectionChain<T>> {
        const results = await this.readByData(data, collectionName, options)
        return chain(results)
    }

    async withTransaction<T extends LineDbAdapter>(
        callback: (adapter: JSONLFile<T>, db: LineDb) => Promise<unknown>,
        collectionName?: string,
        options: TransactionOptions = { rollback: true },
    ): Promise<unknown> {
        if (!collectionName) {
            collectionName = this.firstCollection
        }
        const adapter = this.#adapters.get(collectionName) as JSONLFile<T>
        if (!adapter) {
            throw new Error(`Collection ${collectionName} not found`)
        }

        const closure = async (adapter: JSONLFile<T>) => {
            return await callback(adapter, this)
        }
        return await adapter.withTransaction(closure, options)
    }

    /**
     * Performs a join operation between two collections or arrays of data.
     * Supports inner, left, right, and full outer joins with filtering capabilities.
     *
     * @template T - Type of the left collection items
     * @template U - Type of the right collection items
     * @param leftCollection - Name of the left collection or array of left items
     * @param rightCollection - Name of the right collection or array of right items
     * @param options - Join configuration options
     * @param options.type - Type of join: 'inner', 'left', 'right', or 'full'
     * @param options.leftFields - Fields from left collection to join on
     * @param options.rightFields - Fields from right collection to join on
     * @param options.strictCompare - Whether to use strict comparison for field values
     * @param options.inTransaction - Whether to perform the operation in a transaction
     * @param options.leftFilter - Optional filter for left collection
     * @param options.rightFilter - Optional filter for right collection
     * @returns A lodash chain containing the joined results
     *
     * @example
     * // Inner join between collections
     * const result = await db.join('orders', 'users', {
     *   type: 'inner',
     *   leftFields: ['userId'],
     *   rightFields: ['id']
     * });
     *
     * @example
     * // Left join with filtering
     * const result = await db.join('orders', 'users', {
     *   type: 'left',
     *   leftFields: ['userId'],
     *   rightFields: ['id'],
     *   leftFilter: { status: 'active' }
     * });
     */
    async join<T extends LineDbAdapter, U extends LineDbAdapter>(
        leftCollection: string | T[],
        rightCollection: string | U[],
        options: JoinOptions<T, U>,
    ): Promise<CollectionChain<{ left: T; right: U | null }>> {
        let leftData: T[] = []
        let rightData: U[] = []
        if (options.leftFilter) {
            leftData =
                typeof leftCollection === 'string'
                    ? await this.readByData<T>(
                          options.leftFilter,
                          typeof leftCollection === 'string'
                              ? leftCollection
                              : undefined,
                          {
                              strictCompare: options.strictCompare,
                              inTransaction: options.inTransaction,
                          },
                      )
                    : await this.#filterByData<T>(
                          options.leftFilter,
                          leftCollection,
                          {
                              strictCompare: options.strictCompare,
                          },
                      )
        }
        if (options.rightFilter) {
            rightData =
                typeof rightCollection === 'string'
                    ? await this.readByData<U>(
                          options.rightFilter,
                          typeof rightCollection === 'string'
                              ? rightCollection
                              : undefined,
                          {
                              strictCompare: options.strictCompare,
                              inTransaction: options.inTransaction,
                          },
                      )
                    : await this.#filterByData<U>(
                          options.rightFilter,
                          rightCollection,
                          {
                              strictCompare: options.strictCompare,
                          },
                      )
        }

        if (leftData.length === 0) {
            leftData = Array.isArray(leftCollection)
                ? leftCollection
                : await this.read<T>(leftCollection, {
                      inTransaction: options.inTransaction as boolean,
                  })
        }

        if (rightData.length === 0) {
            rightData = Array.isArray(rightCollection)
                ? rightCollection
                : await this.read<U>(rightCollection, {
                      inTransaction: options.inTransaction as boolean,
                  })
        }

        const result: { left: T; right: U | null }[] = []

        // logTest('leftData', leftData)
        // logTest('rightData', rightData)

        // Создаем Map для правой коллекции для быстрого поиска
        const rightMap = new Map<string, { item: U; joined: number }>()
        for (const rightItem of rightData) {
            const key = options.rightFields
                .map((field) => rightItem[field as keyof U])
                .join('|')
            rightMap.set(key, { item: rightItem, joined: 0 })
        }

        // Обрабатываем левую коллекцию
        for (const leftItem of leftData) {
            const key = options.leftFields
                .map((field) => leftItem[field as keyof T])
                .join('|')

            const rightObject = rightMap.get(key)
            const rightItem = rightMap.get(key)?.item
            // logTest('key', key, leftItem?.id)
            // logTest('rightItem', rightMap)

            if (options.type === 'inner' && !rightItem) {
                continue
            }

            if (options.type === 'right' && !rightItem) {
                continue
            }
            if (
                options.onlyOneFromRight &&
                rightObject &&
                rightObject.joined > 0
            ) {
                continue
            }

            result.push({
                left: leftItem,
                right: rightItem || null,
            })
            if (rightObject) {
                rightObject.joined++
            }
        }

        // Добавляем оставшиеся записи из правой коллекции для right и full outer join
        if (options.type === 'right' || options.type === 'full') {
            for (const rightObject of rightMap.values()) {
                // Добавляем оставшиеся записи (которые еще не были добавлены) из правой коллекции для right и full outer join
                if (rightObject.joined === 0) {
                    result.push({
                        left: null as unknown as T,
                        right: rightObject?.item || null,
                    })
                }
            }
        }

        return chain(result)
    }
}

export default LineDb
