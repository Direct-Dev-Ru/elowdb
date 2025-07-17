import { EventEmitter } from 'events'

export interface Cache<T> {
    get(key: string): { data: T[]; total: number } | null
    set(key: string, data: T[], total: number): boolean
    getCacheSize(key?: string): number
    clear(): void
    clearByTTL(): void
    subscribeToEvents(emitter: EventEmitter): void
    unsubscribeFromEvents(emitter: EventEmitter): void
}

export interface CacheEntry<T> {
    data: T | T[]
    lastAccess: number // время последнего доступа
    collectionName: string // имя коллекции
}

/**
 * Интерфейс для кэша записей LineDB
 * Предоставляет методы для работы с отдельными записями в кэше
 */
export interface RecordCache<T> {
    /**
     * Получить запись из кэша по ключу
     * @param key - ключ записи в формате "collectionName:id"
     * @returns запись из кэша или null, если не найдена или устарела
     */
    get(key: string): T | T[] | null

    /**
     * Получить запись из кэша по данным записи
     * @param data - данные записи
     * @returns запись из кэша или null, если не найдена или устарела
     */
    getByRecord(data: Partial<T>, collectionName?: string): T | T[] | null

    /**
     * Установить запись в кэш
     * @param key - ключ записи в формате "collectionName:id"
     * @param data - данные записи
     * @returns true, если запись успешно добавлена
     */
    set(key: string, data: T): boolean

    /**
     * Установить запись в кэш по данным записи
     * @param data - данные записи
     * @returns true, если запись успешно добавлена
     */
    setByRecord(data: T, collectionName?: string): boolean

    /**
     * Удалить запись из кэша
     * @param key - ключ записи в формате "collectionName:id"
     */
    delete(key: string): void

    /**
     * Удалить запись из кэша по данным записи
     * @param data - данные записи
     */
    deleteByRecord(data: Partial<T>, collectionName?: string): void

    /**
     * Очистить кэш для конкретной коллекции или весь кэш
     * @param collectionName - имя коллекции (опционально)
     */
    clear(collectionName?: string): void

    /**
     * Получить размер кэша
     * @returns количество записей в кэше
     */
    size(): number

    /**
     * Получить размер конкретной коллекции
     * @param collectionName - имя коллекции
     * @returns количество записей в коллекции
     */
    getCollectionSize(collectionName: string): number

    /**
     * Получить статистику кэша
     * @returns объект со статистикой
     */
    getStats(): {
        hits: number
        misses: number
        size: number
        hitRate: number
    }

    /**
     * Проверить, содержит ли кэш запись с указанным ключом
     * @param key - ключ записи в формате "collectionName:id"
     * @returns true, если запись существует и не устарела
     */
    has(key: string): boolean

    /**
     * Проверить, содержит ли кэш запись с указанными данными
     * @param data - данные записи
     * @param collectionName - имя коллекции (опционально)
     * @returns true, если запись существует и не устарела
     */
    hasByRecord(data: Partial<T>, collectionName?: string): boolean

    /**
     * Обновить время последнего доступа к записи
     * @param key - ключ записи в формате "collectionName:id"
     */
    touch(key: string): void

    /**
     * Получить все записи коллекции
     * @param collectionName - имя коллекции
     * @returns массив записей коллекции
     */
    getCollectionEntries(collectionName: string): (T | T[])[]

    /**
     * Получить информацию о всех коллекциях
     * @returns массив объектов с информацией о коллекциях
     */
    getCollectionsInfo(): Array<{ name: string; size: number }>

    /**
     * Получить плоский кэш в виде Map
     * @returns Map<string | number, CacheEntry<T>>
     */
    getFlatCacheMap(): Map<string | number, CacheEntry<T>>

    /**
     * Обновить кэш после записи новых данных
     * @param data - данные записи
     * @param collectionName - имя коллекции
     */
    updateCacheAfterInsert(data: T, collectionName: string): Promise<void>
}
