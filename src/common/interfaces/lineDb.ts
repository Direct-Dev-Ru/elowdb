import { RWMutex } from '@direct-dev-ru/rwmutex-ts'

import { RecordCache } from './cache.js'
import { JSONLFileOptions, LineDbAdapter } from './jsonl-file.js'

export { LineDbAdapter } from './jsonl-file.js'

export interface PartitionCollection<P> {
    collectionName: string
    partIdFn: ((item: Partial<P>) => string) | string
    mutex?: RWMutex
}

export interface nextIdCollection<P> {
    collectionName: string
    nexIdFn: (item: Partial<P>) => string
}

export interface LineDbInitOptions {
    cacheSize?: number
    cacheTTL?: number // время жизни записи в кэше (мс)
    cache?: RecordCache<unknown>
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
    cache?: RecordCache<unknown>
    mutex?: RWMutex
    nextIdFn?: (
        data: Partial<unknown>,
        collectionName: string,
    ) => Promise<string | number> //next id function
    objName?: string
}
export interface BackupMetaData {
    collectionNames: string[]
    gzip: boolean
    encryptKey: string
    noLock: boolean
    timestamp: number
    backupDate: string
}

export interface JoinOptions<T extends LineDbAdapter, U extends LineDbAdapter> {
    type: JoinType
    leftFields: string[]
    rightFields: string[]
    strictCompare?: boolean
    inTransaction?: boolean
    transactionId?: string
    leftFilter?: Partial<T>
    rightFilter?: Partial<U>
    onlyOneFromRight?: boolean
}

export type JoinType = 'inner' | 'left' | 'right' | 'full'
