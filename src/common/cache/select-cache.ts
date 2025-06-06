import { EventEmitter } from 'events'

import { Cache } from '../interfaces/cache'
import { compareIds } from '../utils/compare'

export interface SelectCacheOptions {
    ttlMs?: number
    cacheLimit?: number
    cleanupInterval?: number
}

export class SelectCache<T extends { id: string | number }>
    implements Cache<T>
{
    private readonly TTL: number = 0
    private readonly CLEANUP_INTERVAL: number = 0
    private cleanupInterval: NodeJS.Timeout | null = null

    private cache = new Map<
        string,
        {
            data: T[]
            timestamp: number
            total: number
        }
    >()
    private readonly cacheLimit: number = 0

    constructor(options?: SelectCacheOptions) {
        if (options?.ttlMs) {
            this.TTL = options.ttlMs
        }
        if (options?.cacheLimit) {
            this.cacheLimit = options.cacheLimit
        }
        if (options?.cleanupInterval) {
            this.CLEANUP_INTERVAL = options.cleanupInterval
            // Запускаем очистку если задан интервал
            this.startCleanupInterval()
        }
    }

    private startCleanupInterval() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval)
        }
        // Запускаем очистку только если задан интервал
        if (this.CLEANUP_INTERVAL > 0) {
            this.cleanupInterval = setInterval(() => {
                this.clearByTTL()
            }, this.CLEANUP_INTERVAL)
        }
    }

    getCacheSize(key?: string) {
        if (key) {
            return this.cache.get(key)?.data.length || 0
        }
        let size = 0
        for (const [, value] of this.cache.entries()) {
            size += value.data.length
        }
        return size
    }

    get(key: string): { data: T[]; total: number } | null {
        const cacheEntry = this.cache.get(key)
        if (cacheEntry && Date.now() - cacheEntry.timestamp < this.TTL) {
            return { data: cacheEntry.data, total: cacheEntry.total }
        }
        this.cache.delete(key)
        return null
    }

    set(key: string, data: T[], total: number): boolean {
        let canSetCache = true
        if (
            this.getCacheSize() - this.getCacheSize(key) + data.length >
            this.cacheLimit
        ) {
            this.clearByTTL()
            canSetCache =
                this.getCacheSize() - this.getCacheSize(key) + data.length <=
                this.cacheLimit
        }
        if (canSetCache) {
        this.cache.set(key, { data, total, timestamp: Date.now() })
        }
        return canSetCache
    }

    clear() {
        this.cache.clear()
        this.dispose()
    }

    dispose() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval)
            this.cleanupInterval = null
        }
    }

    clearByTTL() {
        for (const [key, cacheEntry] of this.cache.entries()) {
            if (Date.now() - cacheEntry.timestamp > this.TTL) {
                this.cache.delete(key)
            }
        }
    }

    // Метод для подписки на события от JSONLFile
    subscribeToEvents(emitter: EventEmitter) {
        // Подписываемся на событие обновления
        emitter.on('record:update', (record: T) => {
            // Проходим по всем записям в кэше
            for (const [key, cacheEntry] of this.cache.entries()) {
                const updatedData = cacheEntry.data.map((item) => {
                    // Если нашли запись с таким же id - обновляем её
                    if (!compareIds(item, record)) {
                        return record
                    }
                    return item
                })

                // Обновляем кэш с новыми данными
                this.set(key, updatedData, cacheEntry.total)
            }
        })

        // Подписываемся на событие удаления
        emitter.on('record:delete', (record: T) => {
            // Проходим по всем записям в кэше
            for (const [key, cacheEntry] of this.cache.entries()) {
                // Фильтруем удаленную запись
                const filteredData = cacheEntry.data.filter((item) => {
                    return compareIds(item, record)
                })

                // Обновляем кэш с отфильтрованными данными
                this.set(key, filteredData, filteredData.length)
            }
        })
    }

    // Метод для отписки от событий
    unsubscribeFromEvents(emitter: EventEmitter) {
        emitter.removeAllListeners('record:update')
        emitter.removeAllListeners('record:delete')
        this.dispose()
    }
}
