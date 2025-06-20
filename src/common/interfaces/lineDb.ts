import { RWMutex } from '@direct-dev-ru/rwmutex-ts'

import { JSONLFileOptions, LineDbAdapter } from './jsonl-file.js'

export { LineDbAdapter } from './jsonl-file.js'

export interface CacheEntry<T> {
    data: T
    lastAccess: number // время последнего доступа
    collectionName: string // имя коллекции
}

export interface PartitionCollection<P> {
    collectionName: string
    partIdFn: (item: Partial<P>) => string
}

export interface nextIdCollection<P> {
    collectionName: string
    nexIdFn: (item: Partial<P>) => string
}

export interface LineDbInitOptions {
    cacheSize?: number
    cacheTTL?: number // время жизни записи в кэше (мс)
    mutex?: RWMutex
    collections: JSONLFileOptions<unknown>[]
    dbFolder?: string
    partitions?: PartitionCollection<unknown>[]
    nextIdFn?: (
        data: Partial<unknown>,
        collectionName: string,
    ) => Promise<string | number> //next id function
}

export interface LineDbOptions {
    cacheSize?: number
    cacheTTL?: number // время жизни записи в кэше (мс)
    mutex?: RWMutex
    nextIdFn?: (
        data: Partial<unknown>,
        collectionName: string,
    ) => Promise<string | number> //next id function
    objName?: string
}

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

export type JoinType = 'inner' | 'left' | 'right' | 'full'
