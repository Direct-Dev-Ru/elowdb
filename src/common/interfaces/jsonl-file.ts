/* eslint-disable @typescript-eslint/no-explicit-any */

import { RWMutex } from '@direct-dev-ru/rwmutex-ts'

import { Cache } from './cache'

export type FilterFunction<T> = (data: T) => boolean

export interface PaginatedResult<T> {
    data: T[]
    total: number
    limit: number
    pages: number
    page: number
}

export interface JSONLFileOptions<T> {
    collectionName?: string
    decrypt?: (
        encryptedText: string,
        cypherKey: string,
    ) => Promise<string | { error: string }>
    encrypt?: (
        text: string,
        cypherKey: string,
    ) => Promise<string | { error: string }>
    allocSize?: number
    convertStringIdToNumber?: boolean // if true, then id will be string representation of number, it converts to number
    idFn?: (data: T) => (string | number)[]
    decryptKey?: string // This key will be used to decrypt the file and stay it unencrypted (_cypherKey is null)
    encryptKeyForLineDb?: string // This key will be used then adapter is used inside LineDb init method
    skipInvalidLines?: boolean
    log?: (...args: any[]) => void
    logTest?: (...args: any[]) => void
    indexedFields?: (keyof T)[]
    parse?: (str: string) => T
    stringify?: (data: T) => string
    cache?: Cache<T>
    cacheTTL?: number // 0 - отключить кэш, > 0 - время жизни кэша в миллисекундах
    cacheLimit?: number // 0 - отключить кэш, > 0 - лимит записей в кэше
    cacheCleanupInterval?: number
}

export interface LineDbAdapter {
    id: string | number
    timestamp?: number // timestamp in milliseconds
}

export interface LineDbAdapterOptions {
    inTransaction?: boolean
    transactionId?: string
    debugTag?: string
    strictCompare?: boolean
    filterType?: 'sift' | 'mongodb' | 'string' | 'filtrex' | 'object' | 'base'
    method?:
        | 'insert'
        | 'update'
        | 'delete'
        | 'select'
        | 'write'
        | 'readByFilter'
        | 'all'
    repeatCount?: number
    internalCall?: boolean // if true, then call is internal, not from user
    skipCheckExistingForWrite?: boolean // if true, then skip check existing for write - always append to file
}

export interface AdapterLine<T extends LineDbAdapter> {
    init(force: boolean, options?: LineDbAdapterOptions): Promise<void>
    // read(fn?: (data: T) => boolean): Promise<T[]>
    // write(data: T | T[]): Promise<void>

    insert(data: T | T[], options?: LineDbAdapterOptions): Promise<T[]>
    update(
        data: Partial<T> | Partial<T>[],
        filterData?: Partial<T>,
        options?: LineDbAdapterOptions,
    ): Promise<T[]>
    delete(
        data: Partial<T> | Partial<T>[],
        options?: LineDbAdapterOptions,
    ): Promise<number | Partial<T>[]>
    select(
        fn: (data: T) => boolean,
        options?: LineDbAdapterOptions,
    ): Promise<T[]>
}

export interface ITransaction {
    transactionMode: 'read' | 'write'
    transactionId: string
    timeoutMs: number
    timeoutId: NodeJS.Timeout
    rollback: boolean
    backupFile: string
    doNotDeleteBackupFile: boolean
    mutex: RWMutex

    /**
     * Очищает таймаут транзакции
     */
    clearTimeout(): void

    /**
     * Проверяет, является ли транзакция активной
     */
    isActive(): boolean

    /**
     * Проверяет, является ли транзакция режимом чтения
     */
    isReadMode(): boolean

    /**
     * Проверяет, является ли транзакция режимом записи
     */
    isWriteMode(): boolean

    /**
     * Проверяет, требуется ли откат транзакции при ошибке
     */
    shouldRollback(): boolean

    /**
     * Проверяет, нужно ли сохранять резервную копию
     */
    shouldKeepBackup(): boolean

    /**
     * Получает путь к файлу резервной копии
     */
    getBackupFile(): string

    /**
     * Устанавливает путь к файлу резервной копии
     */
    setBackupFile(path: string): void
}
