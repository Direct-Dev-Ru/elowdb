/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { createHash } from 'crypto'

import { RecordCache } from '../interfaces/cache.js'
import { CacheEntry } from '../interfaces/cache.js'
import { logTest } from '../utils/log.js'

export interface RecordCacheOptions {
    maxSize?: number
    ttl?: number
    enableLogging?: boolean
    keyFn?: (item: unknown) => string | number // функция для генерации ключа записи
}

/**
 * Реализация кэша записей для LineDB
 * Использует карту карт: Map<collectionName, Map<recordKey, CacheEntry>>
 * Поддерживает партиционирование коллекций
 */
export class MemoryRecordCache<T> implements RecordCache<T> {
    // Map of maps: collection -> (record key -> cache entry)
    private collections: Map<string, Map<string | number, CacheEntry<T>>> =
        new Map()
    private readonly maxSize: number
    private readonly ttl?: number
    private readonly enableLogging: boolean
    private readonly keyFn: (item: unknown) => string | number
    private stats = {
        hits: 0,
        misses: 0,
    }

    getFlatCacheMap(): Map<string | number, CacheEntry<T>> {
        if (this.collections.size === 0) {
            return new Map()
        }
        const cacheMap: Map<string | number, CacheEntry<T>> = new Map()
        for (const [
            collectionName,
            collectionMap,
        ] of this.collections.entries()) {
            for (const [recordKey, entry] of collectionMap.entries()) {
                cacheMap.set(`${collectionName}:${recordKey}`, entry)
            }
        }
        return cacheMap
    }

    constructor(options: RecordCacheOptions = {}) {
        this.maxSize = options.maxSize || 1000
        this.ttl = options.ttl
        this.enableLogging = options.enableLogging || false
        this.keyFn =
            options.keyFn ||
            ((item: unknown) => {
                const record = item as Record<string, unknown>
                if (!record) {
                    return 'unknown'
                }
                const id = record.id as string | number | undefined
                if (!id) {
                    const stringToHash = JSON.stringify(record)
                    return this.hashIt(stringToHash)
                }
                return id
            })
        // ((item: unknown) => {
        //     const record = item as Record<string, unknown>
        //     const id = record.id as string | number | undefined
        //     if (!id) {
        //         const stringToHash = JSON.stringify(record)
        //         return this.hashIt(stringToHash)
        //     }
        //     return this.hashIt(id)
        // })
    }

    hashIt(id: string | number): string | number {
        return createHash('sha256').update(id.toString()).digest('hex')
    }

    /**
     * Получить базовое имя коллекции (без партиции)
     */
    private getBaseCollectionName(collectionName: string): string {
        return collectionName.split('_')[0]
    }

    /**
     * Получить ключ записи из данных
     */
    private getRecordKey(item: Partial<T>): string | number {
        return this.keyFn(item)
    }

    getByRecord(data: Partial<T>, collectionName?: string): T | null {
        const key = this.getRecordKey(data)
        return this.get(`${collectionName}:${key}`)
    }

    /**
     * Получить запись из кэша по ключу
     * @param key - ключ записи в формате "collectionName:id"
     */
    get(key: string): T | null {
        const [collectionName, recordKey] = this.parseKey(key)
        const baseCollectionName = this.getBaseCollectionName(collectionName)

        const collectionMap = this.collections.get(baseCollectionName)
        if (!collectionMap) {
            this.stats.misses++
            return null
        }

        const entry = collectionMap.get(recordKey)
        if (!entry) {
            this.stats.misses++
            return null
        }

        const now = Date.now()

        // Проверяем TTL
        if (this.ttl && now - entry.lastAccess > this.ttl) {
            collectionMap.delete(recordKey)
            // Удаляем пустую коллекцию
            if (collectionMap.size === 0) {
                this.collections.delete(baseCollectionName)
            }
            this.stats.misses++
            this.log(`Cache entry expired for ${key}`)
            return null
        }

        // Обновляем время последнего доступа
        entry.lastAccess = now
        this.stats.hits++
        this.log(`Cache hit for ${key}`)
        return entry.data
    }

    setByRecord(data: T, collectionName?: string): boolean {
        const key = this.getRecordKey(data)
        return this.set(`${collectionName}:${key}`, data)
    }

    /**
     * Установить запись в кэш
     * @param key - ключ записи в формате "collectionName:id"
     * @param data - данные записи
     */
    set(key: string, data: T): boolean {
        const [keyCollectionName, recordKey] = this.parseKey(key)
        const baseCollectionName = this.getBaseCollectionName(keyCollectionName)
        const now = Date.now()

        // Получаем или создаем карту для коллекции
        let collectionMap = this.collections.get(baseCollectionName)
        if (!collectionMap) {
            collectionMap = new Map()
            this.collections.set(baseCollectionName, collectionMap)
        }

        // Если запись уже существует, проверяем её актуальность
        if (collectionMap.has(recordKey)) {
            const existingEntry = collectionMap.get(recordKey)!

            // Проверяем TTL
            if (this.ttl && now - existingEntry.lastAccess > this.ttl) {
                collectionMap.delete(recordKey)
                this.log(`Cache entry expired during update for ${key}`)
            } else {
                // Проверяем timestamp если есть
                if (
                    'timestamp' in (data as unknown as { timestamp: number }) &&
                    'timestamp' in
                        (existingEntry.data as unknown as { timestamp: number })
                ) {
                    const newTimestamp = (
                        data as unknown as { timestamp: number }
                    ).timestamp
                    const cachedTimestamp = (
                        existingEntry.data as unknown as { timestamp: number }
                    ).timestamp

                    if (newTimestamp >= cachedTimestamp) {
                        collectionMap.set(recordKey, {
                            data,
                            lastAccess: now,
                            collectionName: baseCollectionName,
                        })
                        this.log('Cache item updated - timestamp checked', data)
                    }
                } else {
                    collectionMap.set(recordKey, {
                        data,
                        lastAccess: now,
                        collectionName: baseCollectionName,
                    })
                    this.log('Cache item updated - no timestamp', data)
                }
                return true
            }
        }

        // Если кэш полон, удаляем самую старую запись
        if (this.getTotalSize() >= this.maxSize) {
            this.evictOldest()
        }

        // Добавляем новую запись
        collectionMap.set(recordKey, {
            data,
            lastAccess: now,
            collectionName: baseCollectionName,
        })

        this.log('Cache item added', data)
        return true
    }

    deleteByRecord(data: Partial<T>, collectionName?: string): void {
        const key = this.getRecordKey(data)
        this.delete(`${collectionName}:${key}`)
    }

    /**
     * Удалить запись из кэша
     * @param key - ключ записи в формате "collectionName:id"
     */
    delete(key: string): void {
        const [collectionName, recordKey] = this.parseKey(key)
        const baseCollectionName = this.getBaseCollectionName(collectionName)

        const collectionMap = this.collections.get(baseCollectionName)
        if (collectionMap) {
            collectionMap.delete(recordKey)
            // Удаляем пустую коллекцию
            if (collectionMap.size === 0) {
                this.collections.delete(baseCollectionName)
            }
        }
    }

    /**
     * Очистить кэш для конкретной коллекции или весь кэш
     * @param collectionName - имя коллекции (опционально)
     */
    clear(collectionName?: string): void {
        if (collectionName) {
            const baseCollectionName =
                this.getBaseCollectionName(collectionName)
            this.collections.delete(baseCollectionName)
        } else {
            this.collections.clear()
        }
    }

    /**
     * Получить общий размер кэша
     */
    size(): number {
        return this.getTotalSize()
    }

    /**
     * Получить размер конкретной коллекции
     */
    getCollectionSize(collectionName: string): number {
        const baseCollectionName = this.getBaseCollectionName(collectionName)
        const collectionMap = this.collections.get(baseCollectionName)
        return collectionMap ? collectionMap.size : 0
    }

    /**
     * Получить статистику кэша
     */
    getStats(): {
        hits: number
        misses: number
        size: number
        hitRate: number
    } {
        const total = this.stats.hits + this.stats.misses
        const hitRate = total > 0 ? this.stats.hits / total : 0

        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            size: this.getTotalSize(),
            hitRate,
        }
    }

    /**
     * Проверить, содержит ли кэш запись с указанными данными
     * @param data - данные записи
     * @param collectionName - имя коллекции (опционально)
     */
    hasByRecord(data: Partial<T>, collectionName?: string): boolean {
        const key = this.getRecordKey(data)
        return this.has(`${collectionName}:${key}`)
    }

    /**
     * Проверить, содержит ли кэш запись с указанным ключом
     * @param key - ключ записи в формате "collectionName:id"
     */
    has(key: string): boolean {
        const [collectionName, recordKey] = this.parseKey(key)
        const baseCollectionName = this.getBaseCollectionName(collectionName)

        const collectionMap = this.collections.get(baseCollectionName)
        if (!collectionMap) {
            return false
        }

        const entry = collectionMap.get(recordKey)
        if (!entry) {
            return false
        }

        // check TTL
        if (this.ttl && Date.now() - entry.lastAccess > this.ttl) {
            collectionMap.delete(recordKey)
            // remove empty collection
            if (collectionMap.size === 0) {
                this.collections.delete(baseCollectionName)
            }
            return false
        }

        return true
    }

    /**
     * Обновить время последнего доступа к записи
     * @param key - ключ записи в формате "collectionName:id"
     */
    touch(key: string): void {
        const [collectionName, recordKey] = this.parseKey(key)
        const baseCollectionName = this.getBaseCollectionName(collectionName)

        const collectionMap = this.collections.get(baseCollectionName)
        if (collectionMap) {
            const entry = collectionMap.get(recordKey)
            if (entry) {
                entry.lastAccess = Date.now()
            }
        }
    }

    /**
     * Получить все записи коллекции
     */
    getCollectionEntries(collectionName: string): T[] {
        const baseCollectionName = this.getBaseCollectionName(collectionName)
        const collectionMap = this.collections.get(baseCollectionName)
        if (!collectionMap) {
            return []
        }

        const now = Date.now()
        const entries: T[] = []

        for (const [recordKey, entry] of collectionMap.entries()) {
            // Проверяем TTL
            if (this.ttl && now - entry.lastAccess > this.ttl) {
                collectionMap.delete(recordKey)
                continue
            }
            entries.push(entry.data)
        }

        // Удаляем пустую коллекцию
        if (collectionMap.size === 0) {
            this.collections.delete(baseCollectionName)
        }

        return entries
    }

    /**
     * Получить информацию о коллекциях
     */
    getCollectionsInfo(): Array<{ name: string; size: number }> {
        const info: Array<{ name: string; size: number }> = []

        for (const [
            collectionName,
            collectionMap,
        ] of this.collections.entries()) {
            info.push({
                name: collectionName,
                size: collectionMap.size,
            })
        }

        return info
    }

    /**
     * Парсинг ключа в формат "collectionName:id"
     */
    private parseKey(key: string): [string, string | number] {
        const lastColonIndex = key.lastIndexOf(':')
        if (lastColonIndex === -1) {
            throw new Error(
                `Invalid cache key format: ${key}. Expected format: "collectionName:id"`,
            )
        }

        const collectionName = key.substring(0, lastColonIndex)
        const recordKey = key.substring(lastColonIndex + 1)

        // Пытаемся преобразовать в число, если это возможно
        const numericKey = Number(recordKey)
        const finalKey = isNaN(numericKey) ? recordKey : numericKey

        return [collectionName, finalKey]
    }

    /**
     * Получить общий размер всех коллекций
     */
    private getTotalSize(): number {
        let total = 0
        for (const collectionMap of this.collections.values()) {
            total += collectionMap.size
        }
        return total
    }

    /**
     * Удаляет самую старую запись из указанной коллекции
     */
    private evictOldest(): void {
        let oldestAccess = Infinity
        let oldestCollectionName: string | undefined
        let oldestRecordKey: string | number | undefined

        const now = Date.now()

        // Ищем самую старую запись во всех коллекциях
        let evicted = false
        for (const [
            collectionName,
            collectionMap,
        ] of this.collections.entries()) {
            for (const [recordKey, entry] of collectionMap.entries()) {
                // Проверяем TTL при поиске самой старой записи
                if (this.ttl && now - entry.lastAccess > this.ttl) {
                    collectionMap.delete(recordKey)
                    this.log(
                        `Cache entry in collection ${collectionName} expired during eviction for ${recordKey}`,
                    )
                    evicted = true
                    continue
                }

                if (entry.lastAccess < oldestAccess) {
                    oldestAccess = entry.lastAccess
                    oldestCollectionName = collectionName
                    oldestRecordKey = recordKey
                }
            }
        }

        // Удаляем самую старую запись
        if (oldestCollectionName && oldestRecordKey !== undefined && !evicted) {
            const collectionMap = this.collections.get(oldestCollectionName)
            if (collectionMap) {
                collectionMap.delete(oldestRecordKey)
                this.log(
                    `Cache eviction - removed oldest entry: ${oldestCollectionName}:${oldestRecordKey}`,
                )

                // Удаляем пустую коллекцию
                if (collectionMap.size === 0) {
                    this.collections.delete(oldestCollectionName)
                }
            }
        }
    }

    private log(...args: unknown[]): void {
        if (this.enableLogging) {
            logTest(true, ...args)
        }
    }
}
