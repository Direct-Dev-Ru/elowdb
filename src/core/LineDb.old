/* eslint-disable @typescript-eslint/require-await */
import { RWMutex } from '@direct-dev-ru/rwmutex-ts'

import { JSONLFile } from '../adapters/node/JSONLFile.js'

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
}

export interface LineDbOptions<T> {
    cacheSize?: number
    nextIdFn?: (data: Partial<T>) => Promise<string | number>
    objName?: string
    cacheTTL?: number // время жизни записи в кэше (мс)
}

export class LineDb<T extends { id: string | number }> {
    #adapter: JSONLFile<T>
    #mutex: RWMutex
    #cache: Map<string | number, CacheEntry<T>>
    #cacheSize: number
    #nextIdFn: (data: Partial<T>) => Promise<string | number>
    #lastIdManager: LastIdManager
    #filename: string
    #cacheTTL: number

    constructor(adapter: JSONLFile<T>, options: LineDbOptions<T> = {}) {
        this.#adapter = adapter
        this.#mutex = new RWMutex()
        this.#cache = new Map()
        this.#cacheSize = options.cacheSize || 1000
        this.#nextIdFn = options.nextIdFn || this.#defaultNextIdFn
        this.#cacheTTL = options.cacheTTL || 5 * 60 * 1000 // 5 минут по умолчанию
        this.#lastIdManager = LastIdManager.getInstance()
        this.#filename = adapter.getFilename()
    }

    async init(force: boolean = false): Promise<void> {
        await this.#adapter.init(force)
        // Инициализируем lastId
        const all = await this.read()
        if (all.length > 0) {
            const maxId = Math.max(
                ...all.map((item) =>
                    typeof item.id === 'number' ? item.id : 0,
                ),
            )
            await this.#lastIdManager.setLastId(this.#filename, maxId)
        } else {
            await this.#lastIdManager.setLastId(this.#filename, 0)
        }
    }

    #defaultNextIdFn = async (): Promise<number> => {
        return await this.#lastIdManager.incrementLastId(this.#filename)
    }

    async nextId(data?: Partial<T>): Promise<string | number> {
        return await this.#nextIdFn(data || {})
    }

    async lastSequenceId(): Promise<number> {
        return await this.#lastIdManager.getLastId(this.#filename)
    }

    async read(): Promise<T[]> {
        return await this.#mutex.withReadLock(async () => {
            return await this.#adapter.read()
        })
    }

    async readByFilter(
        data: Partial<T>,
        options?: { strictCompare?: boolean },
    ): Promise<T[]> {
        return await this.#mutex.withReadLock(async () => {
            const now = Date.now()

            // Сначала проверяем кэш
            if (data.id && this.#cache.has(data.id)) {
                const entry = this.#cache.get(data.id)!
                if (
                    this.#matchesData(entry.data, data, options?.strictCompare)
                ) {
                    // Обновляем время последнего доступа
                    entry.lastAccess = now
                    // console.log('cache hit', entry.data)
                    return [entry.data]
                }
            }

            const results = await this.#adapter.readByFilter(data, options)

            // Обновляем кэш
            for (const item of results) {
                this.#updateCache(item)
            }

            return results
        })
    }

    async write(data: T | T[]): Promise<void> {
        await this.#mutex.withWriteLock(async () => {
            const dataArray = Array.isArray(data) ? data : [data]

            if (this.#nextIdFn === this.#defaultNextIdFn) {
                // Генерируем id для новых записей
                for (const item of dataArray) {
                    if (!item.id || Number(item.id) <= -1) {
                        item.id = await this.nextId(item)
                    }
                }
            } else {
                // Генерируем id для новых записей
                for (const item of dataArray) {
                    if (!item.id) {
                        item.id = await this.nextId(item)
                    }
                }
            }

            // console.log('dataArray', dataArray)

            await this.#adapter.write(dataArray)
            // Обновляем кэш
            for (const item of dataArray) {
                this.#updateCache(item)
            }
        })
    }

    async delete(data: Partial<T> | Partial<T>[]): Promise<void> {
        await this.#mutex.withWriteLock(async () => {
            await this.#adapter.delete(data)

            // Очищаем кэш для удаленных записей
            const dataArray = Array.isArray(data) ? data : [data]
            for (const item of dataArray) {
                if (item.id) {
                    this.#cache.delete(item.id)
                }
            }
        })
    }

    #updateCache(item: T): void {
        const now = Date.now()

        // Если запись с таким ID уже есть в кэше, обновляем её
        if (this.#cache.has(item.id)) {
            this.#cache.set(item.id, { data: item, lastAccess: now })
            return
        }

        // Если кэш полон, ищем запись для вытеснения
        if (this.#cache.size >= this.#cacheSize) {
            let oldestAccess = Infinity
            let oldestKey: string | number | undefined

            // Находим запись с самым старым временем доступа
            for (const [key, entry] of this.#cache.entries()) {
                if (entry.lastAccess < oldestAccess) {
                    oldestAccess = entry.lastAccess
                    oldestKey = key
                }
            }

            // Удаляем самую старую запись
            if (oldestKey !== undefined) {
                this.#cache.delete(oldestKey)
            }
        }

        // Добавляем новую запись в кэш
        this.#cache.set(item.id, { data: item, lastAccess: now })
    }

    #matchesData(item: T, data: Partial<T>, strictCompare?: boolean): boolean {
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
}
