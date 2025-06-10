/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/require-await */
import crypto from 'node:crypto'
import fsClassic, { PathLike } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { RWMutex } from '@direct-dev-ru/rwmutex-ts'
import { chain, CollectionChain } from 'lodash'

import { JSONLFile, TransactionOptions } from '../adapters/node/JSONLFile.js'
import { LineDbAdapterOptions } from '../common/interfaces/jsonl-file.js'
import {
    CacheEntry,
    JoinOptions,
    LineDbAdapter,
    lineDbInitOptions,
    LineDbOptions,
} from '../common/interfaces/lineDb.js'
import { logTest } from '../common/utils/log.js'

const globalLineDbMutex = new RWMutex()
const logForTest =
    process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'dev'

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
    #constructorOptions: LineDbOptions

    constructor(adapters?: unknown, options: LineDbOptions = {}) {
        this.#constructorOptions = options
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
        this.#cacheTTL = options.cacheTTL || 0
        this.#lastIdManager = LastIdManager.getInstance()
    }

    async init(
        force: boolean = false,
        initOptions?: lineDbInitOptions,
    ): Promise<void> {
        if (initOptions) {
            let i = 0
            for (const adapterOptions of initOptions.collections) {
                i++
                const resultCollectionName =
                    adapterOptions?.collectionName || `collection_${i}`
                const newAdapter = new JSONLFile(
                    path.join(
                        initOptions?.dbFolder || '',
                        `${resultCollectionName}.jsonl`,
                    ),
                    adapterOptions?.encryptKeyForLineDb || '',
                    adapterOptions,
                )
                const collectionName = newAdapter.getCollectionName()
                this.#adapters.set(collectionName, newAdapter)
                this.#collections.set(collectionName, newAdapter.getFilename())
            }
        }
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
            return await adapter.read(undefined, {
                inTransaction: this.#inTransaction || options?.inTransaction,
            })
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

    async readByFilter<T extends LineDbAdapter>(
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
                        logTest(
                            logForTest,
                            `Cache entry expired for ${cacheKey}`,
                        )
                    } else {
                        // Запись актуальна, обновляем время доступа и возвращаем
                        entry.lastAccess = now
                        logTest(logForTest, `Cache hit for ${cacheKey}`)
                        return [entry.data]
                    }
                }
            }

            const results = await adapter.readByFilter(data, {
                ...options,
                inTransaction:
                    this.#inTransaction || options?.inTransaction || false,
            })

            // Обновляем кэшшшшшшшшшшшшшшшшшшшшшшшшшшшшшшшшшшш
            for (const item of results) {
                this.#updateCache(item, collectionName as string)
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

            await adapter.write(dataArray, {
                inTransaction: this.#inTransaction || options.inTransaction,
            })
            // Обновляем кэш
            for (const item of dataArray) {
                this.#updateCache(item, collectionName as string)
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
                // Generate id for new records
                if (!item.id || Number(item.id) <= -1) {
                    item.id = await this.nextId(item, collectionName)
                } else {
                    // Check if record does not exist
                    const filter = { id: item.id } as Partial<T>
                    const exists = await adapter.readByFilter(filter, {
                        strictCompare: true,
                        inTransaction:
                            this.#inTransaction || options.inTransaction,
                    })
                    if (exists.length > 0) {
                        throw new Error(
                            `Record with id ${item.id} already exists in collection ${collectionName}`,
                        )
                    }
                }
            }

            await adapter.write(dataArray, {
                inTransaction: this.#inTransaction || options.inTransaction,
            })
            // Обновляем кэш
            for (const item of dataArray) {
                this.#updateCache(item, collectionName as string)
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
                const existingItem = await adapter.readByFilter(item, {
                    strictCompare: true,
                    inTransaction: this.#inTransaction || options.inTransaction,
                })
                if (existingItem.length > 0) {
                    for (const existing of existingItem) {
                        updatedData.push({
                            ...existing,
                            ...item,
                        } as T)
                    }
                }
            }
            await adapter.write(updatedData, {
                inTransaction: this.#inTransaction || options.inTransaction,
            })
            // Обновляем кэш
            for (const upatedItem of updatedData) {
                this.#updateCache(upatedItem, collectionName as string)
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
            await adapter.delete(dataArrayToDelete, {
                inTransaction: this.#inTransaction || options.inTransaction,
            })

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

    async clearCache(collectionName?: string): Promise<void> {
        if (collectionName) {
            for (const [key, entry] of this.#cache.entries()) {
                if (entry.collectionName === collectionName) {
                    this.#cache.delete(key)
                }
            }
        } else {
            this.#cache.clear()
        }
    }

    async #getCacheStats(): Promise<{
        hits: number
        misses: number
        size: number
        hitRate: number
    }> {
        const hits = 0
        const misses = 0
        const size = this.#cache.size
        const hitRate = size > 0 ? hits / size : 0

        return { hits, misses, size, hitRate }
    }

    #updateCache<T extends LineDbAdapter>(
        item: T,
        collectionName: string,
        // options: { inTransaction: boolean } = { inTransaction: false },
    ): void {
        const now = Date.now()
        const cacheKey = `${collectionName}:${item.id}`

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
                logTest(
                    logForTest,
                    `Cache entry expired during update for ${cacheKey}`,
                )
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
                        logTest(
                            logForTest,
                            'update cache item - timestamp checked',
                            item,
                        )
                    }
                } else {
                    // Если поля timestamp нет, обновляем как обычно
                    this.#cache.set(cacheKey, {
                        data: item,
                        lastAccess: now,
                        collectionName,
                    })
                    logTest(
                        logForTest,
                        'update cache item - no timestamp',
                        item,
                    )
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
                        logForTest,
                        `Cache entry in collection ${collectionName} expired during eviction for ${key}`,
                    )
                    continue
                }

                if (entry.lastAccess < oldestAccess) {
                    oldestAccess = entry.lastAccess
                    oldestKey = key
                }
            }

            // logTest(logForTest,'cache eviction - oldestKey', oldestKey)

            // Remove the oldest entry
            if (oldestKey !== undefined) {
                this.#cache.delete(oldestKey)
            }
            // add new entry to cache
            logTest(logForTest, 'cache eviction - add new entry to cache', item)
            this.#cache.set(cacheKey, {
                data: item,
                lastAccess: now,
                collectionName,
            })
            return
        }

        // logTest(logForTest,'cache is not full - add new entry to cache', item)
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
        const results = await this.readByFilter(data, collectionName, options)
        return chain(results)
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
                    ? await this.readByFilter<T>(
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
                    ? await this.readByFilter<U>(
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

        // logTest(logForTest,'leftData', leftData)
        // logTest(logForTest,'rightData', rightData)

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
            // logTest(logForTest,'key', key, leftItem?.id)
            // logTest(logForTest,'rightItem', rightMap)

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

    async withAdapterTransaction<T extends LineDbAdapter>(
        callback: (adapter: JSONLFile<T>, db: LineDb) => Promise<unknown>,
        collectionName?: string,
        transactionOptions: TransactionOptions = { rollback: true },
        adapterOptions: LineDbAdapterOptions = { inTransaction: true },
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
        try {
            const transactionId =
                await adapter.beginTransaction(transactionOptions)
            return await adapter.withTransaction(closure, {
                ...adapterOptions,
                transactionId,
            })
        } finally {
            await adapter.endTransaction()
        }
    }

    // async withDbTransaction(
    //     callback: (db: LineDb) => Promise<unknown>,
    //     collectionNames: string[],
    //     options: TransactionOptions = {},
    // ): Promise<void> {
    //     const mutexLocal = options?.mutex || globalLineDbMutex
    //     this.#inTransaction = true

    //     if (!('rollback' in options)) {
    //         options.rollback = true
    //     }
    //     if (!('backupFile' in options)) {
    //         options.backupFile = undefined
    //     }
    //     if (!('doNotDeleteBackupFile' in options)) {
    //         options.doNotDeleteBackupFile = false
    //     }

    //     // Создаем временный файл для бэкапа в системной папке для временных файлов
    //     const tmpDir = os.tmpdir()
    //     // Генерируем случайный идентификатор для уникальности имени файла
    //     const entropy = crypto.randomBytes(8).toString('hex')
    //     const backupFile =
    //         options?.backupFile ||
    //         path.join(tmpDir, `elinedb-${entropy}-${Date.now()}.backup`)
    //     let backupCreated = false

    //     const positionsBackup = new Map<string | number, number[]>()
    //     try {
    //         try {
    //             return await mutexLocal.withWriteLock(async () => {
    //                 if (options?.rollback) {
    //                     // Сохраняем текущее состояние файла
    //                     try {
    //                         await fs.copyFile(
    //                             this.#filename.toString(),
    //                             backupFile,
    //                         )
    //                         // Создаем глубокую копию карты позиций
    //                         for (const [
    //                             key,
    //                             positions,
    //                         ] of await filePositions.getAllPositionsNoLock()) {
    //                             positionsBackup.set(key, [...positions])
    //                         }
    //                         backupCreated = true
    //                     } catch (err) {
    //                         // Если файл не существует, это нормально для новой БД
    //                         if (
    //                             (err as NodeJS.ErrnoException).code !== 'ENOENT'
    //                         ) {
    //                             throw err
    //                         }
    //                     }
    //                 }
    //                 // вызов функции полезной функции
    //                 await fn(this)
    //             })
    //         } catch (err) {
    //             if (options?.rollback) {
    //                 // Восстанавливаем состояние filePositions
    //                 try {
    //                     await filePositions.setAllPositionsNoLock(
    //                         positionsBackup,
    //                     )
    //                 } catch (restoreErr) {
    //                     throw new Error(
    //                         `Failed to restore filePositions: ${restoreErr}. Original error: ${err}`,
    //                     )
    //                 }
    //             }
    //             throw new Error(
    //                 `error in transaction mode. rollback: ${
    //                     options?.rollback ? 'done' : 'not done'
    //                 }. ${this.#collectionName}: ${err}`,
    //             )
    //         }
    //     } catch (err) {
    //         // Восстанавливаем состояние из бэкапа при ошибке
    //         if (backupCreated && options?.rollback) {
    //             try {
    //                 await fs.copyFile(backupFile, this.#filename.toString())
    //                 // await fs.copyFile(backupFile, '/tmp/elinedb-error.err')
    //             } catch (restoreErr) {
    //                 throw new Error(
    //                     `Failed to restore from backup: ${restoreErr}. Original error: ${err}`,
    //                 )
    //             }
    //         }

    //         throw new Error(
    //             `error in transaction mode. rollback: ${
    //                 options?.rollback ? 'done' : 'not done'
    //             }. ${this.#collectionName}: ${err}`,
    //         )
    //     } finally {
    //         this.#inTransactionMode = false

    //         // Удаляем временный файл
    //         if (
    //             backupCreated &&
    //             options?.rollback &&
    //             !options?.doNotDeleteBackupFile
    //         ) {
    //             try {
    //                 await fs.unlink(backupFile)
    //             } catch (unlinkErr) {
    //                 // Логируем ошибку удаления, но не прерываем выполнение
    //                 console.error(`Failed to remove backup file: ${unlinkErr}`)
    //             }
    //         }
    //     }
    // }

    async createBackup(
        outputFile?: string,
        collectionNames?: string[],
    ): Promise<void> {
        if (!outputFile) {
            const backupFolder = path.join(process.cwd(), 'elinedb-backups')
            if (!fsClassic.existsSync(backupFolder)) {
                await fs.mkdir(backupFolder, { recursive: true })
            }
            const entropy = crypto.randomBytes(8).toString('hex')
            outputFile = path.join(
                os.tmpdir(),
                `elinedb-${entropy}-${Date.now()}.backup`,
            )
        }
        const mutexLocal = this.#mutex
        return await mutexLocal.withReadLock(async () => {
            const backupContent: string[] = []

            // Собираем данные из всех коллекций
            for (const [collectionName, adapter] of this.#adapters) {
                if (
                    collectionNames &&
                    !collectionNames.includes(collectionName)
                ) {
                    continue
                }
                const data = await (adapter as JSONLFile<LineDbAdapter>).read()

                // Добавляем разделитель и имя коллекции
                backupContent.push(
                    `===${collectionName}:${(
                        adapter as JSONLFile<LineDbAdapter>
                    ).getFilename()}===`,
                )

                // Добавляем данные коллекции
                for (const item of data) {
                    backupContent.push(JSON.stringify(item))
                }

                // Добавляем разделитель
                backupContent.push('=====================')
            }

            // Записываем в файл
            await fs.writeFile(
                outputFile as PathLike,
                backupContent.join('\n'),
                'utf-8',
            )
        })
    }

    async restoreFromBackup(
        backupFile: string,
    ): Promise<{ error: string } | void> {
        const mutexLocal = this.#mutex
        try {
            await mutexLocal.withWriteLock(async () => {
                // Читаем содержимое бэкапа
                const content = await fs.readFile(backupFile, 'utf-8')
                const lines = content.split('\n')

                let currentCollection: string | null = null
                let currentFilename: string | null = null
                let currentData: string[] = []

                // Обрабатываем каждую строку
                for (const line of lines) {
                    // Проверяем, является ли строка разделителем коллекции
                    if (line.startsWith('===') && line.endsWith('===')) {
                        // Если у нас есть данные предыдущей коллекции, сохраняем их
                        if (
                            currentCollection &&
                            currentFilename &&
                            currentData.length > 0
                        ) {
                            const adapter = this.#adapters.get(
                                currentCollection,
                            ) as JSONLFile<LineDbAdapter>
                            if (!adapter) {
                                throw new Error(
                                    `Collection ${currentCollection} not found during restore`,
                                )
                            }

                            // Дополняем каждую строку пробелами до размера allocSize
                            const paddedData = currentData
                                .filter((line) => line.trim())
                                .map((line) => {
                                    const padding = ' '.repeat(
                                        Math.max(
                                            0,
                                            adapter.allocSize - line.length - 1,
                                        ),
                                    )
                                    return line + padding
                                })
                                .join('\n')

                            // Записываем данные в файл
                            await fs.writeFile(
                                currentFilename,
                                `${paddedData}\n`,
                                'utf-8',
                            )

                            // Переинициализируем адаптер
                            // await adapter.init(true)

                            // Очищаем кэш для этой коллекции
                            await this.clearCache(currentCollection)

                            currentData = []
                        }

                        // Извлекаем имя коллекции и файла
                        const current = line.slice(3, -3)
                        currentCollection = current.split(':')[0]
                        currentFilename = current.split(':')[1]
                        continue
                    }

                    // Пропускаем разделители между коллекциями
                    if (line === '=====================') {
                        continue
                    }

                    // Если у нас есть текущая коллекция, добавляем строку
                    if (currentCollection) {
                        currentData.push(line)
                    }
                }

                // Сохраняем данные последней коллекции
                if (
                    currentCollection &&
                    currentFilename &&
                    currentData.length > 0
                ) {
                    const adapter = this.#adapters.get(
                        currentCollection,
                    ) as JSONLFile<LineDbAdapter>
                    if (!adapter) {
                        throw new Error(
                            `Collection ${currentCollection} not found during restore`,
                        )
                    }

                    // Дополняем каждую строку пробелами до размера allocSize
                    const paddedData = currentData
                        .filter((line) => line.trim())
                        .map((line) => {
                            const padding = ' '.repeat(
                                Math.max(
                                    0,
                                    adapter.allocSize - line.length - 1,
                                ),
                            )
                            return line + padding
                        })
                        .join('\n')

                    // Записываем данные в файл
                    await fs.writeFile(
                        currentFilename,
                        `${paddedData}\n`,
                        'utf-8',
                    )

                    // Переинициализируем адаптер
                    // await adapter.init(true)

                    // Очищаем кэш для этой коллекции
                    await this.clearCache(currentCollection)
                }
            })
            return await this.init(true)
        } catch (error) {
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            return {
                error: `Error restoring from backup: ${
                    (error as Error).message
                }`,
            }
        }
    }
}

export default LineDb
