/* eslint-disable @typescript-eslint/restrict-template-expressions */
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
import { defNodeDecrypt, defNodeEncrypt } from '../adapters/node/TextFile.js'
import { YAMLFile } from '../adapters/node/YAMLFile.js'
import { MemoryRecordCache } from '../common/cache/RecordCache.js'
import { CacheEntry, RecordCache } from '../common/interfaces/cache.js'
import {
    FilterFunction,
    JSONLFileOptions,
    LineDbAdapterOptions,
    PaginatedResult,
} from '../common/interfaces/jsonl-file.js'
import {
    BackupMetaData,
    JoinOptions,
    LineDbAdapter,
    LineDbInitOptions,
    LineDbOptions,
} from '../common/interfaces/lineDb.js'
import { compareIdsLikeNumbers } from '../common/utils/compare.js'
import {
    isValidFilterString,
    parseFilterString,
} from '../common/utils/filterParser.js'
import { logTest } from '../common/utils/log.js'
import { nextPowerOf2 } from '../common/utils/numbers.js'
import {
    compressToBase64,
    decompressFromBase64,
} from '../common/utils/strings.js'

export { CacheEntry } from '../common/interfaces/cache.js'
export {
    JoinOptions,
    LineDbAdapter,
    LineDbInitOptions,
    LineDbOptions,
} from '../common/interfaces/lineDb.js'
export interface LineDbTransactionOptions {
    rollback?: boolean
    mutex?: RWMutex
    backupFile?: string
    doNotDeleteBackupFile?: boolean
    timeout?: number
}

const defaultNextIdFn = async (
    _data: Partial<unknown>,
    collectionName: string,
): Promise<number> => {
    return await LastIdManager.getInstance().incrementLastId(collectionName)
}

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
        const idsMap = this.lastIds
        return await this.mutex.withReadLock(async () => {
            const baseFileName = filename.split('_')[0]
            return idsMap.get(baseFileName) || 0
        })
    }

    async setLastId(filename: string, id: number): Promise<void> {
        const idsMap = this.lastIds
        await this.mutex.withWriteLock(async () => {
            // idsMap.set(filename, id)
            // change in base map key
            if (filename.includes('_')) {
                const baseFileName = filename.split('_')[0]
                const currenBaseFileNameId = idsMap.get(baseFileName) || 0
                if (currenBaseFileNameId < id) {
                    idsMap.set(baseFileName, id)
                }
            } else {
                idsMap.set(filename, id)
            }
        })
    }

    async incrementLastId(filename: string): Promise<number> {
        const idsMap = this.lastIds
        return await this.mutex.withWriteLock(async () => {
            const baseFileName = filename.split('_')[0]
            // const allKeys = Array.from(idsMap.keys()).filter(
            //     (key) => key === filename || key.startsWith(`${baseName}_`),
            // )

            // Находим максимальный ID среди всех партиций
            // let maxId = 0
            // for (const key of allKeys) {
            //     const currentId = this.lastIds.get(key) || 0
            //     maxId = Math.max(maxId, currentId)
            // }

            // Увеличиваем максимальный ID на 1
            const currentBaseFileNameId = idsMap.get(baseFileName) || 0
            const newId = currentBaseFileNameId + 1
            idsMap.set(baseFileName, newId)
            return newId
        })
    }
}

/**
 * Основной класс для работы с LineDB - NoSQL базы данных на основе JSONL файлов.
 * Предоставляет высокоуровневый API для работы с коллекциями данных, включая
 * CRUD операции, транзакции, партиционирование, кэширование и резервное копирование.
 *
 * @example
 * ```typescript
 * // Создание с базовыми опциями
 * const db = new LineDb({
 *   cacheSize: 1000,
 *   cacheTTL: 300000 // 5 минут
 * });
 *
 * // Создание с готовыми адаптерами
 * const userAdapter = new JSONLFile<User>('./users.jsonl');
 * const orderAdapter = new JSONLFile<Order>('./orders.jsonl');
 * const db = new LineDb({}, [userAdapter, orderAdapter]);
 *
 * // Создание с опциями инициализации
 * const db = new LineDb({
 *   collections: [
 *     { collectionName: 'users', indexedFields: ['email', 'name'] },
 *     { collectionName: 'orders', allocSize: 512 }
 *   ],
 *   dbFolder: './data',
 *   partitions: [
 *     {
 *       collectionName: 'orders',
 *       partIdFn: (order) => order.userId.toString()
 *     }
 *   ]
 * });
 * ```
 */
export class LineDb {
    #defaultNextIdFn = defaultNextIdFn
    #adapters: Map<string, unknown> = new Map()
    #collections: Map<string, string> = new Map()
    #partitionFunctions: Map<string, (item: Partial<unknown>) => string> =
        new Map()
    #mutex: RWMutex = new RWMutex()
    // #cache: Map<string, CacheEntry<unknown>> | undefined
    #cacheSize: number = 1000
    #cacheExternal: RecordCache<unknown> | undefined
    #nextIdFn: (
        data: Partial<unknown>,
        collectionName: string,
    ) => Promise<string | number> = defaultNextIdFn

    #lastIdManager: LastIdManager = LastIdManager.getInstance()
    #inTransaction: boolean = false
    #cacheTTL?: number
    #constructorOptions: LineDbOptions | undefined
    #initOptions: LineDbInitOptions | undefined

    #decrypt = async (
        _text: string,
        _cypherKey: string,
    ): Promise<string | { error: string }> => {
        const texttoDecrypt = Buffer.from(_text, 'base64').toString('utf8')
        if (!_cypherKey) {
            return texttoDecrypt
        }
        const decrypted = await defNodeDecrypt(texttoDecrypt, _cypherKey)
        if (typeof decrypted !== 'string') {
            return { error: decrypted.error }
        }
        return decrypted
    }
    // resulting encryption function
    #encrypt = async (
        _text: string,
        _cypherKey: string,
    ): Promise<string | { error: string }> => {
        if (!_cypherKey) {
            return Buffer.from(_text, 'utf8').toString('base64')
        }
        const encrypted = await defNodeEncrypt(_text, _cypherKey)
        if (typeof encrypted !== 'string') {
            return { error: encrypted.error }
        }
        return Buffer.from(encrypted, 'utf8').toString('base64')
    }

    /**
     * Создает новый экземпляр LineDb.
     *
     * @param {LineDbOptions | LineDbInitOptions} [options={}] - Опции конфигурации базы данных
     * @param {unknown} [adapters] - Готовые адаптеры JSONLFile для использования
     *
     * @description
     * Конструктор поддерживает два режима работы:
     *
     * **Режим 1: LineDbOptions** - для создания экземпляра с базовыми настройками
     * - Используется когда в options нет поля 'collections'
     * - Адаптеры должны быть переданы отдельно через параметр adapters
     * - Инициализация коллекций происходит позже через метод init()
     *
     * **Режим 2: LineDbInitOptions** - для создания экземпляра с полной конфигурацией
     * - Используется когда в options есть поле 'collections'
     * - Автоматически создает адаптеры на основе конфигурации
     * - Инициализация происходит автоматически при вызове init()
     *
     * @example
     * ```typescript
     * // Режим 1: Базовые опции
     * const db = new LineDb({
     *   cacheSize: 2000,
     *   cacheTTL: 600000,
     *   nextIdFn: async (data, collectionName) => {
     *     return `${collectionName}_${Date.now()}_${Math.random()}`
     *   }
     * });
     *
     * // Режим 2: Полная конфигурация - предпочтительный способ
     * const ordersOptions: JSONLFileOptions<Order> = {
     *   collectionName: 'orders',
     *   encryptKeyForLineDb: '',
     *   indexedFields: ['id', 'name', 'userId'],
     * }
     * const db = new LineDb({
     *   collections: [
     *     ordersOptions as unknown as JSONLFileOptions<unknown>,
     *   ],
     *   dbFolder: './my-database',
     *   partitions: [
     *     {
     *       collectionName: 'orders',
     *       partIdFn: (order) => order.userId.toString()
     *     }
     *   ]
     * });
     *
     * // С готовыми адаптерами
     * const userAdapter = new JSONLFile<User>('./users.jsonl');
     * const db = new LineDb({}, userAdapter);
     *
     * // С массивом адаптеров
     * const adapters = [
     *   new JSONLFile<User>('./users.jsonl'),
     *   new JSONLFile<Order>('./orders.jsonl')
     * ];
     * const db = new LineDb({}, adapters);
     * ```
     *
     * @throws {Error} 'Invalid adapters' - если переданные адаптеры не являются экземплярами JSONLFile
     *
     * @note
     * - При использовании LineDbInitOptions конструктор не выполняет полную инициализацию
     * - Для завершения инициализации необходимо вызвать метод init()
     * - Адаптеры автоматически уничтожаются при вызове метода close()
     *
     * @see {@link init} - Метод для завершения инициализации
     * @see {@link close} - Метод для очистки ресурсов
     * @see {@link LineDbOptions} - Интерфейс базовых опций
     * @see {@link LineDbInitOptions} - Интерфейс опций инициализации
     */
    constructor(
        options: LineDbOptions | LineDbInitOptions = {},
        adapters?: unknown,
    ) {
        const optionsKeys = Object.keys(options)
        let isOptionsInitInstance = false

        // Определяем тип опций по наличию поля 'collections'
        if (optionsKeys.includes('collections')) {
            this.#initOptions = options as LineDbInitOptions
            isOptionsInitInstance = true
        } else {
            this.#constructorOptions = options as LineDbOptions
            isOptionsInitInstance = false
        }

        // Если это LineDbInitOptions, завершаем конструктор
        if (isOptionsInitInstance) {
            return
        }

        this.#constructorOptions = options as LineDbOptions
        // Инициализация внутренних компонентов
        this.#mutex = this.#constructorOptions.mutex || globalLineDbMutex
        this.#cacheSize = this.#constructorOptions.cacheSize || 1000
        this.#cacheTTL = this.#constructorOptions.cacheTTL || 0
        this.#cacheExternal =
            this.#constructorOptions.cache ||
            (this.#cacheTTL && this.#cacheSize)
                ? new MemoryRecordCache({
                      maxSize: this.#cacheSize,
                      ttl: this.#cacheTTL,
                      enableLogging: false,
                  })
                : undefined

        this.#nextIdFn =
            this.#constructorOptions?.nextIdFn || this.#defaultNextIdFn
        this.#cacheTTL = this.#constructorOptions.cacheTTL || 0
        this.#lastIdManager = LastIdManager.getInstance()

        // Обработка готовых адаптеров
        if (adapters) {
            if (Array.isArray(adapters)) {
                // Массив адаптеров
                for (const adapter of adapters) {
                    if (adapter instanceof JSONLFile) {
                        const collectionName = adapter.getCollectionName()
                        this.#adapters.set(collectionName, adapter)
                        this.#collections.set(
                            collectionName,
                            adapter.getFilename(),
                        )
                    }
                }
            } else if (adapters instanceof JSONLFile) {
                // Один адаптер
                const collectionName = adapters.getCollectionName()
                this.#adapters.set(collectionName, adapters)
                this.#collections.set(collectionName, adapters.getFilename())
            } else {
                throw new Error('Invalid adapters')
            }
        }
    }

    close(): void {
        for (const [, adapter] of this.#adapters) {
            const adapterFile = adapter as JSONLFile<LineDbAdapter>
            adapterFile.destroy()
        }
        this.#adapters.clear()
        this.#collections.clear()
        this.#partitionFunctions.clear()

        this.#cacheExternal?.clear()
        this.#cacheSize = 0
    }

    async #getPartitionFiles(collectionName: string): Promise<string[]> {
        const adapter = this.#adapters.get(collectionName)
        const dbFolder = path.dirname(
            (adapter as JSONLFile<LineDbAdapter>).getFilename().toString(),
        )
        const files = await fs.readdir(dbFolder)
        return files.filter(
            (file) =>
                file.startsWith(collectionName) && file.endsWith('.jsonl'),
        )
    }

    #isCollectionPartitioned(collectionName: string): boolean {
        const basePartitionName = collectionName.split('_')[0]
        return (
            this.#partitionFunctions.has(basePartitionName) ||
            this.#partitionFunctions.has(collectionName)
        )
    }

    #isDefaultNextIdFn(): boolean {
        return this.#nextIdFn === defaultNextIdFn
    }

    /**
     * Преобразует строковое представление функции партиционирования в реальную функцию
     * @param partIdFn - строка с именем поля или функция
     * @returns функция партиционирования
     */
    #parsePartitionFunction(
        partIdFn: string | ((item: Partial<unknown>) => string),
    ): (item: Partial<unknown>) => string {
        if (typeof partIdFn === 'function') {
            return partIdFn
        }

        // Если это строка, создаем функцию, которая возвращает значение поля
        return (item: Partial<unknown>) => {
            const value = item[partIdFn as keyof typeof item]
            return value ? String(value) : 'default'
        }
    }

    /**
     * Читает опции инициализации из YAML файла, указанного в переменной окружения LINEDB_INITFILE_PATH
     * @returns Promise<LineDbInitOptions | null> - опции инициализации или null, если файл не найден
     */
    async #readInitOptionsFromYamlFile(): Promise<LineDbInitOptions | null> {
        const initFilePath = process.env.LINEDB_INITFILE_PATH
        if (!initFilePath) {
            return null
        }

        try {
            // Проверяем существование файла
            if (!fsClassic.existsSync(initFilePath)) {
                logTest(logForTest, `Init file not found: ${initFilePath}`)
                throw new Error(`Init file not found: ${initFilePath}`)
            }

            // Создаем YAMLFile адаптер для чтения конфигурации
            const yamlAdapter = new YAMLFile<LineDbInitOptions>(initFilePath)

            // Читаем данные из файла (YAMLFile возвращает один объект, а не массив)
            const configData = await yamlAdapter.read()
            if (!configData) {
                logTest(logForTest, `Init file is empty: ${initFilePath}`)
                throw new Error(
                    `Init file is empty or corrupted: ${initFilePath}`,
                )
            }

            logTest(
                logForTest,
                `Loaded init options from: ${initFilePath}`,
                configData,
            )
            return configData
        } catch (error) {
            logTest(
                logForTest,
                `Error reading init file ${initFilePath}:`,
                error,
            )
            throw new Error(`Error reading init file ${initFilePath}: ${error}`)
        }
    }

    async init(
        force: boolean = false,
        initOptions?: LineDbInitOptions,
    ): Promise<void> {
        let skipSomeActions = false

        // Пытаемся прочитать опции из YAML файла, если не переданы явно
        if (!initOptions && !this.#initOptions) {
            const yamlInitOptions = await this.#readInitOptionsFromYamlFile()
            if (yamlInitOptions) {
                initOptions = yamlInitOptions
                this.#initOptions = yamlInitOptions
            }
        }

        if (!initOptions && this.#initOptions) {
            initOptions = this.#initOptions
        } else if (initOptions) {
            this.#initOptions = initOptions
        } else if (this.#constructorOptions) {
            skipSomeActions = true
        } else if (!this.#constructorOptions) {
            throw new Error('No init options')
        }
        if (!skipSomeActions) {
            // Инициализация внутренних компонентов
            this.#mutex = initOptions?.mutex || globalLineDbMutex

            this.#cacheSize = initOptions?.cacheSize || 1000
            this.#cacheTTL = initOptions?.cacheTTL || 0
            this.#cacheExternal =
                initOptions?.cache || (this.#cacheTTL && this.#cacheSize)
                    ? new MemoryRecordCache({
                          maxSize: this.#cacheSize,
                          ttl: this.#cacheTTL,
                          enableLogging: false,
                      })
                    : undefined
            this.#nextIdFn = initOptions?.nextIdFn || defaultNextIdFn
            this.#lastIdManager = LastIdManager.getInstance()
        }
        let dbFolder = ''
        if (initOptions) {
            dbFolder =
                initOptions?.dbFolder ?? path.join(process.cwd(), 'linedb')
            if (!fsClassic.existsSync(dbFolder)) {
                await fs.mkdir(dbFolder, { recursive: true })
            }
            this.#initOptions = {
                ...(initOptions || {}),
                dbFolder,
                collections: initOptions?.collections || [],
                partitions: initOptions?.partitions || [],
            }
            this.#nextIdFn =
                this.#initOptions?.nextIdFn || this.#defaultNextIdFn

            // Save partition functions to collection
            // for (const partition of this.#initOptions?.partitions || []) {
            for (
                let partIdx = 0;
                partIdx < (this.#initOptions?.partitions || []).length;
                partIdx++
            ) {
                const partition = (this.#initOptions?.partitions || [])[partIdx]

                this.#partitionFunctions.set(
                    partition.collectionName,
                    this.#parsePartitionFunction(partition.partIdFn),
                )
                if (!partition.mutex) {
                    partition.mutex = new RWMutex()
                }
            }
            // this.#initOptions = initOptions
            let i = 0

            for (const adapterOptions of this.#initOptions.collections) {
                i++
                const resultCollectionName =
                    adapterOptions?.collectionName || `collection_${i}`

                // Создаем адаптер для коллекции
                const adapterfilePath = path.join(
                    dbFolder || '',
                    `${resultCollectionName}.jsonl`,
                )

                let exists = false
                for (const [key, existingAdapter] of this.#adapters) {
                    if (
                        (
                            existingAdapter as JSONLFile<LineDbAdapter>
                        ).getFilename() === adapterfilePath
                    ) {
                        exists = true
                        logTest(true, key, ' passed through ...')
                        break
                    }
                }

                if (!exists) {
                    const newAdapter = new JSONLFile(
                        adapterfilePath,
                        adapterOptions?.encryptKeyForLineDb || '',
                        adapterOptions as unknown as JSONLFileOptions<LineDbAdapter>,
                    )
                    await newAdapter.init(true)
                    const collectionName = newAdapter.getCollectionName()
                    this.#adapters.set(collectionName, newAdapter)
                    this.#collections.set(
                        collectionName,
                        newAdapter.getFilename(),
                    )
                }
            }
        }
        if (this.#adapters.size === 0) {
            throw new Error('No collections found in init options')
        }
        // Инициализация адаптеров и lastId
        for (const [collectionName, adapter] of this.#adapters) {
            if (this.#partitionFunctions.get(collectionName)) {
                // there are can be partitions - need read all of them if exists

                const partitionFiles =
                    await this.#getPartitionFiles(collectionName)

                let maxId = 0
                for (const partitionFile of partitionFiles) {
                    const partitionKey = partitionFile.replace('.jsonl', '')
                    const partitionPath = path.join(dbFolder, partitionFile)

                    // Создаем адаптер для партиции если его еще нет
                    if (!this.#adapters.has(partitionKey)) {
                        const partitionAdapter = new JSONLFile(
                            partitionPath,
                            (
                                adapter as JSONLFile<LineDbAdapter>
                            ).getEncryptKey() || '',
                            {
                                ...(
                                    adapter as JSONLFile<LineDbAdapter>
                                ).getOptions(),
                                collectionName: partitionKey,
                            },
                        )
                        this.#adapters.set(partitionKey, partitionAdapter)
                        this.#collections.set(partitionKey, partitionPath)
                    }

                    // Инициализируем адаптер партиции
                    const partitionAdapter = this.#adapters.get(
                        partitionKey,
                    ) as JSONLFile<LineDbAdapter>
                    await partitionAdapter.init(force)

                    // Читаем данные партиции и находим максимальный ID
                    const partitionData = await partitionAdapter.read()
                    const partitionMaxId = Math.max(
                        ...partitionData.map((item) =>
                            typeof item.id === 'number' ? item.id : 0,
                        ),
                        0,
                    )
                    maxId = Math.max(maxId, partitionMaxId)
                }

                // Устанавливаем максимальный ID для коллекции
                await this.#lastIdManager.setLastId(collectionName, maxId)
            } else {
                await (adapter as JSONLFile<LineDbAdapter>).init(force)
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
    }

    get actualCacheSize(): number {
        return this.#cacheExternal ? this.#cacheExternal?.size() || 0 : 0
    }
    get limitCacheSize(): number {
        return this.#cacheSize
    }
    get cacheMap(): Map<string | number, CacheEntry<unknown>> {
        return this.#cacheExternal
            ? this.#cacheExternal.getFlatCacheMap()
            : new Map()
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

        // Если нет партиционирования, используем стандартный подход
        return await this.#nextIdFn(data || {}, collectionName)
    }

    async lastSequenceId(collectionName?: string): Promise<number> {
        if (!collectionName) {
            collectionName = this.firstCollection
        }
        return await this.#lastIdManager.getLastId(collectionName)
    }

    // Read all records from collection or from partition
    // if partition name is presented in parameter
    // or if partition name is presented in collection name
    // or if partition name is presented in collection name and partition name is presented in parameter
    async read<T extends LineDbAdapter>(
        collectionName?: string,
        options: { inTransaction: boolean } = { inTransaction: false },
    ): Promise<T[]> {
        if (!collectionName) {
            collectionName = this.firstCollection
        }

        // Проверяем, есть ли функция партиционирования для этой коллекции
        const splitOfCollectionName = collectionName.split('_')
        const partitionFn = this.#partitionFunctions.get(
            splitOfCollectionName[0],
        )

        if (!partitionFn) {
            // Если нет функции партиционирования, используем стандартное чтение
            const adapter = this.#adapters.get(collectionName) as JSONLFile<T>
            if (!adapter) {
                throw new Error(`Collection ${collectionName} not found`)
            }
            const payload = async () => {
                return await adapter.read(undefined, {
                    inTransaction:
                        this.#inTransaction || options?.inTransaction,
                })
            }
            if (this.#inTransaction || options?.inTransaction) {
                return await payload()
            }
            return await this.#mutex.withReadLock(payload)
        }

        // Если есть функция партиционирования, читаем из всех партиций
        const partitionNameFromParameter =
            splitOfCollectionName.length > 1
                ? splitOfCollectionName[splitOfCollectionName.length - 1]
                : undefined

        const results: T[] = []

        for (const [key, partitionAdapter] of this.#adapters) {
            let condition = false

            condition = partitionNameFromParameter
                ? key === collectionName
                : key.startsWith(`${collectionName}_`)

            if (condition) {
                const adapter = partitionAdapter as JSONLFile<T>
                const partitionResults = await adapter.read(undefined, {
                    inTransaction:
                        this.#inTransaction || options?.inTransaction,
                })
                results.push(...partitionResults)
            }
        }

        return results
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
        data: Partial<T> | string,
        collectionName?: string,
        options?: {
            strictCompare?: boolean
            inTransaction?: boolean
            optimisticRead?: boolean
        },
    ): Promise<T[]> {
        if (!collectionName) {
            collectionName = this.firstCollection
        }
        const splitOfCollectionName = collectionName.split('_')
        const partitionFn = this.#partitionFunctions.get(
            splitOfCollectionName[0],
        )
        if (!partitionFn) {
            // if no partition function, use standard reading
            const adapter = this.#adapters.get(collectionName) as JSONLFile<T>
            if (!adapter) {
                throw new Error(`Collection ${collectionName} not found`)
            }

            const payload = async () => {
                // Check cache by id of presented record
                if (typeof data === 'object' && data.id) {
                    const cacheKey = `${collectionName}:${data.id}`
                    if (this.#cacheExternal?.has(cacheKey)) {
                        const entryExternal = this.#cacheExternal.get(cacheKey)
                        if (entryExternal) {
                            logTest(logForTest, `Cache hit for ${cacheKey}`)
                            return [entryExternal]
                        }
                    }
                }
                // No cache hit - Read by filter from disk
                const results = await adapter.readByFilter(data, {
                    ...options,
                    inTransaction:
                        this.#inTransaction || options?.inTransaction || false,
                })

                // Update cache
                for (const item of results) {
                    this.#updateCache(item, collectionName as string)
                }

                return results
            }

            if (this.#inTransaction || options?.inTransaction) {
                return (await payload()) as T[]
            }
            return (await this.#mutex.withReadLock(payload)) as T[]
        }

        // if partition function exists, read from all partitions or only from one
        // if optimistic read or partition name is presented
        // or if partition name is presented in parameter
        // TODO: maybe better to do atomic read from all partitions and then update cache
        const partitionNameFromParameter =
            splitOfCollectionName.length > 1
                ? splitOfCollectionName[splitOfCollectionName.length - 1]
                : undefined
        const optimisticRead =
            options?.optimisticRead || partitionNameFromParameter
        const results: T[] = []
        let condition = false
        for (const [key, partitionAdapter] of this.#adapters) {
            if (
                !partitionNameFromParameter &&
                optimisticRead &&
                key.startsWith(collectionName)
            ) {
                const dataToCalcPartition =
                    typeof data === 'string' && isValidFilterString(data)
                        ? parseFilterString(data)
                        : data
                const partitionName = partitionFn(dataToCalcPartition)
                if (partitionName) {
                    condition = key === `${collectionName}_${partitionName}`
                }
            } else if (partitionNameFromParameter) {
                condition = key === collectionName
            } else {
                condition = key.startsWith(collectionName)
            }
            if (condition) {
                const adapter = partitionAdapter as JSONLFile<T>

                const partitionResults = await adapter.readByFilter(data, {
                    strictCompare: options?.strictCompare || false,
                    inTransaction:
                        this.#inTransaction || options?.inTransaction || false,
                })
                results.push(...partitionResults)
            }
        }
        // Update cache
        if (this.#cacheExternal) {
            const cachePayload = async () => {
                for (const item of results) {
                    this.#updateCache(item, collectionName as string)
                }
            }
            if (this.#inTransaction || options?.inTransaction) {
                await cachePayload()
            }
            await this.#mutex.withWriteLock(cachePayload)
        }
        return results
    }

    async write<T extends LineDbAdapter>(
        data: T | T[] | Partial<T> | Partial<T>[],
        collectionName?: string,
        options: {
            inTransaction: boolean
            wrappedCall?: boolean
        } = { inTransaction: false, wrappedCall: false },
    ): Promise<void> {
        if (!collectionName) {
            collectionName = this.firstCollection
        }

        const dataArray = Array.isArray(data) ? data : [data]
        const adapters = new Map<string, T[]>()

        let adapter: JSONLFile<T> | undefined
        if (this.#isCollectionPartitioned(collectionName)) {
            for await (const item of dataArray) {
                adapter = await this.getPartitionAdapter<T>(
                    item as T,
                    collectionName,
                )
                const adapterKey = adapter.getCollectionName()

                if (!adapters.has(adapterKey)) {
                    adapters.set(adapterKey, [])
                }
                adapters.get(adapterKey)!.push(item as T)
            }
        } else {
            adapter = await this.getPartitionAdapter<T>(
                dataArray[0] as unknown as T,
                collectionName,
            )
            const adapterKey = adapter.getCollectionName()
            adapters.set(adapterKey, dataArray as T[])
        }

        // Write data to corresponding partitions
        for (const [adapterKey, items] of adapters) {
            const adapter = this.#adapters.get(adapterKey) as JSONLFile<T>
            if (!adapter) {
                throw new Error(`Adapter ${adapterKey} not found`)
            }

            await adapter.write(items, {
                ...options,
                inTransaction: this.#inTransaction || options.inTransaction,
            })

            // Set LastId if it has number type and using default function
            // Refresh cache
            if (this.#cacheExternal) {
                const cachePayload = async () => {
                    for (const item of items) {
                        this.#updateCache(item, adapterKey)
                        if (
                            this.#isDefaultNextIdFn() &&
                            typeof item.id === 'number'
                        ) {
                            const currentId =
                                await this.#lastIdManager.getLastId(adapterKey)
                            if (item.id > currentId || 0) {
                                await this.#lastIdManager.setLastId(
                                    adapterKey,
                                    item.id,
                                )
                            }
                        }
                    }
                }
                if (
                    this.#inTransaction ||
                    options.inTransaction ||
                    options.wrappedCall
                ) {
                    await cachePayload()
                } else {
                    await this.#mutex.withWriteLock(cachePayload)
                }
            }
        }
    }

    async insert<T extends LineDbAdapter>(
        data: T | T[] | Partial<T> | Partial<T>[],
        collectionName?: string,
        options: {
            inTransaction: boolean
            debugTag?: string
            skipCheckExistingForWrite?: boolean
        } = {
            inTransaction: false,
            skipCheckExistingForWrite: false,
        },
    ): Promise<void> {
        if (!collectionName) {
            collectionName = this.firstCollection
        }

        const payload = async () => {
            const dataArray = Array.isArray(data) ? data : [data]
            const resultDataArray: Partial<T>[] = []
            for (const item of dataArray) {
                if (options.debugTag === 'error') {
                    throw new Error('test error')
                }
                // Generate id for new records if omit
                if (!item.id || Number(item.id) <= -1) {
                    let done = false
                    let newId: string | number = -1
                    let count = 0
                    while (!done) {
                        newId = await this.nextId(item, collectionName)
                        if (
                            !resultDataArray.some((item) => item.id === newId)
                        ) {
                            done = true
                        }
                        count++
                        if (count > 10_000) {
                            throw new Error(
                                'Can not generate new id for 10 000 iterations',
                            )
                        }
                    }
                    resultDataArray.push({ id: newId, ...item })
                } else {
                    // Check if record does not exist
                    if (!(options?.skipCheckExistingForWrite || false)) {
                        const filter = { id: item.id } as Partial<T>

                        for (const [key, partitionAdapter] of this.#adapters) {
                            if (key.includes(collectionName as string)) {
                                const exists = await (
                                    partitionAdapter as JSONLFile<LineDbAdapter>
                                ).readByFilter(filter, {
                                    ...options,
                                    inTransaction: true,
                                })
                                if (exists.length > 0) {
                                    throw new Error(
                                        `Record with id ${item.id} already exists in collection ${collectionName}`,
                                    )
                                }
                            }
                        }
                    }
                    resultDataArray.push({ ...item })
                }
            }

            await this.write(resultDataArray, collectionName, {
                ...options,
                inTransaction: true,
                wrappedCall: true,
            })

            // update cache after insert
            if (this.#cacheExternal) {
                for (const item of resultDataArray) {
                    await this.#cacheExternal.updateCacheAfterInsert(
                        item as T,
                        collectionName as string,
                    )
                }
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
        filter?:
            | Partial<T>
            | Record<string, unknown>
            | string
            | FilterFunction<T>,
        options: LineDbAdapterOptions = { inTransaction: false },
    ): Promise<T[]> {
        if (!collectionName) {
            collectionName = this.firstCollection
        }
        if (
            typeof data === 'object' &&
            'id' in data &&
            typeof filter === 'object' &&
            'id' in filter &&
            !compareIdsLikeNumbers(
                data.id,
                (filter as unknown as LineDbAdapter).id,
            )
        ) {
            throw new Error(
                'You can not update record id with filter by another id. Use delete and insert instead',
            )
        }
        const partitionFn = this.#partitionFunctions.get(collectionName)
        if (!partitionFn) {
            const adapter = this.#adapters.get(collectionName) as JSONLFile<T>
            if (!adapter) {
                throw new Error(`Collection ${collectionName} not found`)
            }

            const payload = async () => {
                const dataArray = Array.isArray(data) ? data : [data]
                // check data is exists and forming result data to update
                const updatedData: T[] = []
                if (filter) {
                    const existingItems = await adapter.readByFilter(filter, {
                        ...options,
                        strictCompare: true,
                        inTransaction:
                            this.#inTransaction || options.inTransaction,
                    })
                    if (existingItems.length > 0) {
                        for (const existingItem of existingItems) {
                            const dataCandidate =
                                dataArray.find((item) =>
                                    compareIdsLikeNumbers(
                                        item.id,
                                        existingItem.id,
                                    ),
                                ) ?? dataArray[0]
                            updatedData.push({
                                ...existingItem,
                                ...dataCandidate,
                            } as T)
                        }
                    }
                } else {
                    for (const item of dataArray) {
                        const filterObject =
                            'id' in item ? { id: item.id } : item
                        const existingItem = await adapter.readByFilter(
                            filterObject,
                            {
                                ...options,
                                strictCompare: true,
                                inTransaction:
                                    this.#inTransaction ||
                                    options.inTransaction,
                            },
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
                }
                if (updatedData.length === 0) {
                    return [] as T[]
                }
                const updatedItems = await adapter.update(updatedData, '', {
                    ...options,
                    inTransaction: this.#inTransaction || options.inTransaction,
                })

                // try to refresh cache
                try {
                    for (const updatedItem of updatedItems) {
                        this.#updateCache(updatedItem, collectionName as string)
                    }
                } catch {
                    // if error, clear cache
                    this.#cacheExternal?.clear()
                }
                return updatedItems
            }
            // execute inside transaction or independently
            if (this.#inTransaction || options.inTransaction) {
                return await payload()
            }
            return await this.#mutex.withWriteLock(payload)
        }

        // if partition function exists, read from all partitions and collect data to map
        const updatedData: Map<string, T[]> = new Map()
        // const updatedData: Map<
        //     { oldPartition: string; newPartition: string },
        //     T[]
        // > = new Map()
        const dataArray = Array.isArray(data) ? data : [data]
        for (const [key, partitionAdapter] of this.#adapters) {
            if (key.includes(collectionName)) {
                const adapter = partitionAdapter as JSONLFile<T>
                for (const item of dataArray) {
                    const results = await adapter.readByFilter(
                        filter ? filter : item,
                        {
                            ...options,
                            inTransaction:
                                this.#inTransaction || options.inTransaction,
                        },
                    )
                    if (results.length > 0) {
                        for (const result of results) {
                            const updatedItem = { ...result, ...item } as T
                            let newPartition = partitionFn(updatedItem)
                            const baseCollectionName = key.split('_')[0]
                            if (!newPartition.includes(baseCollectionName)) {
                                newPartition = `${collectionName}_${newPartition}`
                            }
                            const mapKey = JSON.stringify({
                                oldPartition: key,
                                newPartition,
                            })
                            const existingUpdatedItems = updatedData.get(mapKey)
                            if (existingUpdatedItems) {
                                existingUpdatedItems.push(updatedItem)
                            } else {
                                updatedData.set(mapKey, [updatedItem])
                            }
                        }
                    }
                }
            }
        }

        // update items that have been collected to map updatedData
        let updatedItems: T[] = []
        for (const [key, items] of updatedData.entries()) {
            if (items.length === 0) {
                continue
            }
            const objectKey = JSON.parse(key)
            if (objectKey.oldPartition === objectKey.newPartition) {
                const adapter = this.#adapters.get(
                    objectKey.oldPartition,
                ) as JSONLFile<T>
                // adapter update method returns updated items
                const currentUpdatedItems = await adapter.update(items, '', {
                    ...options,
                    inTransaction: this.#inTransaction || options.inTransaction,
                })
                updatedItems = [...updatedItems, ...currentUpdatedItems]
            } else {
                const baseCollectionName = objectKey.oldPartition.split('_')[0]
                const partitionMutex = this.#initOptions?.partitions?.find(
                    (partition) =>
                        partition.collectionName === baseCollectionName,
                )?.mutex
                if (partitionMutex) {
                    await partitionMutex.withWriteLock(async () => {
                        await this.withMultyAdaptersTransaction(
                            async (
                                adapters: Map<
                                    string,
                                    {
                                        adapter: JSONLFile<LineDbAdapter>
                                        adapterOptions: LineDbAdapterOptions
                                    }
                                >,
                            ) => {
                                logTest(
                                    true,
                                    'withMultyAdaptersTransaction inner callback ...',
                                )
                                const oldAdapterObject = adapters.get(
                                    objectKey.oldPartition as string,
                                )
                                const oldAdapter =
                                    oldAdapterObject?.adapter as unknown as JSONLFile<T>

                                await oldAdapter.delete(items)
                                const newAdapterObject = adapters.get(
                                    objectKey.newPartition as string,
                                )
                                const newAdapter =
                                    newAdapterObject?.adapter as unknown as JSONLFile<T>

                                const currentUpdatedItems =
                                    await newAdapter.insert(items)

                                updatedItems = [
                                    ...updatedItems,
                                    ...(currentUpdatedItems ?? []),
                                ]
                                // throw new Error('test error')
                            },
                            [
                                objectKey.oldPartition as string,
                                objectKey.newPartition as string,
                            ],
                            {
                                rollback: true,
                            },
                        )
                    })
                } else {
                    throw new Error(
                        `Partition mutex for collection ${baseCollectionName} not found`,
                    )
                }
            }
        }
        return updatedItems
    }

    async delete<T extends LineDbAdapter>(
        data: Partial<T> | Partial<T>[] | string,
        collectionName?: string,
        options: { inTransaction: boolean; strictCompare?: boolean } = {
            inTransaction: false,
            strictCompare: true,
        },
    ): Promise<Partial<LineDbAdapter>[]> {
        if (!collectionName) {
            collectionName = this.firstCollection
        }
        if (!this.#adapters.has(collectionName.split('_')[0])) {
            throw new Error(`Collection ${collectionName} not found`)
        }
        const dataLength = Array.isArray(data) ? data.length : 1
        if (
            (typeof data !== 'string' &&
                (data == null ||
                    Object.keys(data).length === 0 ||
                    dataLength === 0)) ||
            (typeof data === 'string' && data === '')
        ) {
            return []
        }

        if (typeof data !== 'string' && dataLength > 1) {
            // Analyze input array for duplicates by id, then by all fields for records without id
            const arr = Array.isArray(data) ? data : [data]

            // First, find duplicates by id
            const seenIds = new Set()
            const uniqueById: Partial<T>[] = []
            const noIdItems: Partial<T>[] = []

            for (const item of arr) {
                if (
                    item &&
                    'id' in item &&
                    item.id !== undefined &&
                    item.id !== null
                ) {
                    if (!seenIds.has(item.id)) {
                        seenIds.add(item.id)
                        uniqueById.push(item)
                    }
                } else {
                    noIdItems.push(item)
                }
            }

            // Now find duplicates among records without id by all fields
            const uniqueNoIdItems: Partial<T>[] = []
            const seenNoId = new Set<string>()
            for (const item of noIdItems) {
                // String-key based on all fields of the object
                const key = JSON.stringify(item, Object.keys(item).sort())
                if (!seenNoId.has(key)) {
                    seenNoId.add(key)
                    uniqueNoIdItems.push(item)
                }
            }

            // Combine unique records
            const uniqueItems = [...uniqueById, ...uniqueNoIdItems]

            // Pass only unique records further
            data = uniqueItems
        }

        // delete method payload code
        const payload = async () => {
            const filter =
                typeof data === 'string'
                    ? data
                    : Array.isArray(data)
                    ? data
                    : [data]
            const adapters = await this.getCollectionAdapters(collectionName)
            const deletedRecords: Partial<LineDbAdapter>[] = []
            for (const [key, adapter] of adapters.entries()) {
                if (key.includes(collectionName as string)) {
                    const deleted = await adapter.delete(filter, {
                        ...options,
                        inTransaction:
                            this.#inTransaction || options.inTransaction,
                    })
                    deletedRecords.push(
                        ...(deleted as Partial<LineDbAdapter>[]),
                    )
                }
            }

            // Clear cache for deleted records
            for (const item of deletedRecords) {
                if (item.id) {
                    const cacheKey = `${collectionName}:${item.id}`
                    if (this.#cacheExternal) {
                        this.#cacheExternal.delete(cacheKey)
                    }
                }
            }
            return deletedRecords
        }

        if (this.#inTransaction || options.inTransaction) {
            return await payload()
        }
        return await this.#mutex.withWriteLock(payload)
    }

    async clearCache(
        collectionName?: string,
        options: { inTransaction: boolean } = { inTransaction: false },
    ): Promise<void> {
        if (!this.#cacheExternal) {
            return
        }
        const payload = async () => {
            if (collectionName && this.#cacheExternal) {
                this.#cacheExternal.clear(collectionName)
            } else if (this.#cacheExternal) {
                this.#cacheExternal.clear()
            }
            return
        }
        if (this.#inTransaction || options.inTransaction) {
            return await payload()
        }
        const mutexLocal = this.#mutex || globalLineDbMutex
        return await mutexLocal.withWriteLock(payload)
        // return await payload()
    }

    #updateCache<T extends LineDbAdapter>(
        item: T,
        collectionName: string,
        // options: { inTransaction: boolean } = { inTransaction: false },
    ): void {
        if (this.#cacheTTL && this.#cacheTTL <= 0) {
            return
        }

        if (this.#cacheExternal) {
            this.#cacheExternal.setByRecord(item, collectionName)
            return
        }
    }

    selectResultArray<T>(result: CollectionChain<T> | T[]): T[] {
        return typeof result === 'object' && 'value' in result
            ? result.value()
            : result
    }

    selectResultChain<T>(result: CollectionChain<T> | T[]): CollectionChain<T> {
        return typeof result === 'object' && 'value' in result
            ? result
            : chain(result)
    }

    async select<T extends LineDbAdapter>(
        data: Partial<T> | string,
        collectionName?: string,
        options: {
            strictCompare?: boolean
            inTransaction?: boolean
            optimisticRead?: boolean
            returnChain?: boolean
        } = {
            strictCompare: false,
            inTransaction: false,
            optimisticRead: false,
            returnChain: false,
        },
    ): Promise<CollectionChain<T> | T[]> {
        const fieldPattern = 'id'
        let results: T[] = []
        let trySelectByOneFieldFilter = false
        let filterField = ''
        let filterValue: string | number | boolean = ''
        let newFilter: Partial<T> | Record<string, unknown> = {}
        if (typeof data === 'string') {
            // Проверяем строку фильтра на соответствие шаблону field===value или field === value
            // Значение может быть числовым или строковым

            const fieldMatch = data.match(
                new RegExp(`(${fieldPattern})\\s*===?\\s*(['"]?[^'"]+['"]?)`),
            )
            if (fieldMatch) {
                filterField = fieldMatch[1]
                // Проверяем наличие кавычек в значении
                const hasQuotes =
                    fieldMatch[2].startsWith('"') ||
                    fieldMatch[2].startsWith("'")
                filterValue = hasQuotes
                    ? fieldMatch[2].slice(1, -1)
                    : Number(fieldMatch[2])
                newFilter = { [filterField]: filterValue }
                trySelectByOneFieldFilter = true
                if (trySelectByOneFieldFilter) {
                    const cacheKey = `${collectionName}:${Number(
                        fieldMatch[2],
                    )}`
                    const cached = (
                        this.#cacheExternal
                            ? this.#cacheExternal.get(cacheKey)
                            : null
                    ) as T | null
                    results = cached
                        ? [cached]
                        : await this.readByFilter<T>(
                              newFilter as Partial<T>,
                              collectionName,
                              {
                                  ...options,
                                  strictCompare: options.strictCompare,
                                  inTransaction:
                                      this.#inTransaction ||
                                      options.inTransaction,
                              },
                          )
                    if (results.length > 0) {
                        return options.returnChain ? chain(results) : results
                    }
                }
            }
        }

        results = await this.readByFilter<T>(data, collectionName, options)
        return options.returnChain ? chain(results) : results
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
                              ...options,
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
                              ...options,
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

        // Добавляем оставшиеся записи из правой коллекции для right and full outer join
        if (options.type === 'right' || options.type === 'full') {
            for (const rightObject of rightMap.values()) {
                // Добавляем оставшиеся записи (которые еще не были добавлены) из правой коллекции для right and full outer join
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

    async withMultyAdaptersTransaction(
        callback: (
            adapters: Map<
                string,
                {
                    adapter: JSONLFile<LineDbAdapter>
                    adapterOptions: LineDbAdapterOptions
                }
            >,
            db: LineDb,
        ) => Promise<unknown>,
        adapters: string[],
        lineDbTransactionOptions: LineDbTransactionOptions = { rollback: true },
    ): Promise<void> {
        const mutexLocal = this.#mutex || globalLineDbMutex
        const adapterMap = new Map<
            string,
            {
                adapter: JSONLFile<LineDbAdapter>
                adapterOptions: LineDbAdapterOptions
            }
        >()

        await mutexLocal.withWriteLock(async () => {
            const transactionBackupFile =
                lineDbTransactionOptions.backupFile ||
                path.join(
                    os.tmpdir(),
                    crypto.randomBytes(8).toString('hex') +
                        '-linedb-backup.backup',
                )
            this.#inTransaction = true
            try {
                // Собираем все адаптеры
                for (const collectionName of adapters) {
                    const existingAdapters =
                        await this.getCollectionAdapters(collectionName)
                    for (const [adapterKey, adapter] of existingAdapters) {
                        if (!adapterMap.has(adapterKey)) {
                            adapterMap.set(adapterKey, {
                                adapter,
                                adapterOptions: {
                                    inTransaction: true,
                                },
                            })
                        }
                    }
                }

                if (lineDbTransactionOptions.rollback) {
                    await this.createBackup(transactionBackupFile, {
                        collectionNames: Array.from(adapterMap.keys()),
                        noLock: true,
                        exectlyInclude: true,
                    })
                }

                // Создаем массив адаптеров для вложенных транзакций
                const adapterArray = Array.from(adapterMap.values())

                // Создаем вложенные транзакции вручную
                let currentPromise:
                    | Promise<unknown>
                    | (() => Promise<unknown>) = async () => {
                    return await callback(adapterMap, this)
                }

                // Проходим по адаптерам в обратном порядке и оборачиваем в транзакции
                for (let i = adapterArray.length - 1; i >= 0; i--) {
                    const adapterInfo = adapterArray[i]
                    const previousPromise = currentPromise

                    currentPromise = adapterInfo.adapter.withTransaction(
                        async (adapter) => {
                            // Обновляем adapterMap с транзакционным адаптером
                            const updatedAdapterMap = new Map(adapterMap)
                            updatedAdapterMap.set(adapter.getCollectionName(), {
                                adapter,
                                adapterOptions: {
                                    inTransaction: true,
                                },
                            })

                            // Вызываем предыдущий слой (callback или следующий адаптер)
                            return typeof previousPromise === 'function'
                                ? await previousPromise()
                                : await previousPromise
                        },
                        {
                            rollback:
                                lineDbTransactionOptions.rollback !== false,
                            timeout: lineDbTransactionOptions.timeout || 10_000,
                        },
                        {
                            inTransaction: true,
                        },
                    )
                }

                // Ждем выполнения всей цепочки
                await currentPromise
            } catch (error) {
                if (lineDbTransactionOptions.rollback) {
                    await this.restoreFromBackup(transactionBackupFile, {
                        noLock: true,
                    })
                }
                throw error
            } finally {
                this.#inTransaction = false
            }
        })
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

        return await adapter.withTransaction(
            closure,
            transactionOptions,
            adapterOptions,
        )
    }

    async createBackup(
        outputFile?: string,
        options: {
            collectionNames?: string[]
            gzip?: boolean
            encryptKey?: string
            noLock?: boolean
            exectlyInclude?: boolean // if true, only include collectionNames in collectionNames parameter, if false, include all partitions in db
        } = {
            noLock: false,
        },
    ): Promise<string> {
        if (!outputFile) {
            const backupFolder = path.join(process.cwd(), 'linedb-backups')
            if (!fsClassic.existsSync(backupFolder)) {
                await fs.mkdir(backupFolder, { recursive: true })
            }
            const entropy = crypto.randomBytes(8).toString('hex')
            outputFile = path.join(
                os.tmpdir(),
                `linedb-${entropy}-${Date.now()}.backup`,
            )
        }

        if (!(await fs.stat(path.dirname(outputFile))).isDirectory()) {
            await fs.mkdir(path.dirname(outputFile), { recursive: true })
        }

        const mutexLocal = this.#mutex || globalLineDbMutex

        const payload = async () => {
            const backupContent: string[] = []

            // Собираем данные из всех коллекций
            for (const [collectionName, adapter] of this.#adapters) {
                const baseCollectionName = collectionName.split('_')[0]
                // passthrough if collection is not in parameter collectionNames - compare by base collection name
                if (options?.exectlyInclude) {
                    if (!options.collectionNames?.includes(collectionName)) {
                        continue
                    }
                } else if (
                    options.collectionNames &&
                    !options.collectionNames.includes(baseCollectionName)
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
                    const itemToPush = JSON.stringify(item)

                    backupContent.push(itemToPush)
                }

                // Добавляем разделитель
                backupContent.push('=====================')
            }

            // Write backup data to file
            const backupTimestamp = Date.now()

            const metaData: BackupMetaData = {
                collectionNames: options.collectionNames || [],
                gzip: options.gzip || false,
                encryptKey: options.encryptKey || '',
                noLock: options.noLock || false,
                timestamp: backupTimestamp,
                backupDate: new Date(backupTimestamp).toISOString(),
            }

            let contentToWrite = `===metadata:${JSON.stringify(
                metaData,
            )}===\n${backupContent.join('\n')}`

            if (options.gzip) {
                contentToWrite = await compressToBase64(contentToWrite)
            }
            if (options.encryptKey) {
                const encryptedItem = await this.#encrypt(
                    contentToWrite,
                    options.encryptKey,
                )
                if (typeof encryptedItem === 'string') {
                    contentToWrite = encryptedItem
                } else {
                    throw new Error(encryptedItem.error)
                }
            }
            await fs.writeFile(outputFile as PathLike, contentToWrite, 'utf-8')
        }
        if (options.noLock) {
            await payload()
        } else {
            await mutexLocal.withReadLock(payload)
        }
        return outputFile
    }

    async restoreFromBackup(
        backupFile: string,
        options: {
            collectionNames?: string[]
            encryptKey?: string
            gzip?: boolean
            keepBackup?: boolean
            noLock?: boolean
        } = {
            gzip: false,
            encryptKey: '',
            collectionNames: [],
            keepBackup: false,
            noLock: false,
        },
    ): Promise<{ error: string } | void> {
        const mutexLocal = globalLineDbMutex
        // Считываем метаданные из первой строки файла бэкапа
        let metaData: BackupMetaData = {
            collectionNames: [],
            gzip: false,
            encryptKey: '',
            noLock: false,
            timestamp: 0,
            backupDate: '',
        }

        let content: string = await fs.readFile(backupFile, 'utf-8')

        if (options.encryptKey) {
            const decryptedContent = await this.#decrypt(
                content,
                options.encryptKey,
            )
            if (typeof decryptedContent === 'string') {
                content = decryptedContent
            } else {
                throw new Error(decryptedContent.error)
            }
        }
        if (options.gzip) {
            content = await decompressFromBase64(content)
        }
        const metaDataLineEnd = content.indexOf('\n')
        if (metaDataLineEnd !== -1) {
            const firstLine = content.substring(0, metaDataLineEnd)
            const metaMatch = firstLine.match(/^===metadata:(.+)===/)
            if (metaMatch) {
                try {
                    metaData = JSON.parse(metaMatch[1])
                } catch (e) {
                    throw new Error(`Error parsing metadata from backup: ${e}`)
                }
            }
        }
        // define payload for restoring data from backup file
        const payload = async () => {
            // read content of backup file
            const lines = content.split('\n')

            let currentCollection: string | null = null
            // let currentCollectionBaseName: string = ''
            let currentFilename: string | null = null
            let currentData: string[] = []
            // Удаляем все файлы, начинающиеся с имен коллекций из метаданных
            const dbDir = this.#initOptions?.dbFolder
            if (dbDir) {
                const processedCollections = new Set<string>()
                for (const collectionName of metaData.collectionNames) {
                    const baseCollectionName = collectionName.split('_')[0]
                    if (processedCollections.has(baseCollectionName)) {
                        continue
                    }
                    processedCollections.add(baseCollectionName)
                    const files = await fs.readdir(dbDir)
                    for (const file of files) {
                        if (
                            file.startsWith(baseCollectionName) &&
                            file.endsWith('.jsonl')
                        ) {
                            try {
                                await fs.unlink(path.join(dbDir, file))
                            } catch (e) {
                                // TODO: log error
                            }
                        }
                    }
                }
            }
            // restore data from backup file
            // process each line
            for (const line of lines) {
                // skip metadata line
                if (line.match(/^===metadata:(.+)===/)) {
                    continue
                }
                // skip collection separators
                if (/^=+$/.test(line.trim())) {
                    continue
                }

                // check if line is a collection separator
                if (line.startsWith('===') && line.endsWith('===')) {
                    // if we have data from previous collection, save it
                    if (
                        currentCollection &&
                        currentFilename &&
                        currentData.length > 0
                    ) {
                        // let adapter: JSONLFile<LineDbAdapter> | null = null

                        // adapter = this.#adapters.get(
                        //     currentCollection,
                        // ) as JSONLFile<LineDbAdapter>
                        // if (!adapter) {
                        //     throw new Error(
                        //         `Collection ${currentCollection} not found during restore`,
                        //     )
                        // }

                        // Дополняем каждую строку пробелами до оптимального размера allocSize
                        const maxLineLength = Math.max(
                            ...currentData.map((line) => line.length),
                        )

                        const allocSize = nextPowerOf2(
                            Math.max(maxLineLength + 1),
                        )
                        const paddedData = currentData
                            .filter((line) => line.trim())
                            .map((line) => {
                                const padding = ' '.repeat(
                                    Math.max(0, allocSize - line.length - 1),
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

                        // Clear cache for this collection
                        await this.clearCache(currentCollection, {
                            inTransaction: true,
                        })
                        currentData = []
                    }

                    // Извлекаем имя коллекции и файла
                    const current = line.slice(3, -3)
                    currentCollection = current.split(':')[0]
                    currentFilename = current.split(':')[1]
                    // currentCollectionBaseName = currentCollection.split('_')[0]
                    continue
                }

                // Если у нас есть текущая коллекция, добавляем строку
                if (
                    currentCollection &&
                    ((options?.collectionNames || []).length === 0 ||
                        (options?.collectionNames || []).some((v) =>
                            (currentCollection || '').startsWith(v),
                        ))
                ) {
                    currentData.push(line)
                }
            }

            // Сохраняем данные последней коллекции
            if (
                !(
                    currentCollection &&
                    currentFilename &&
                    currentData.length > 0
                )
            ) {
                return
            }
            // Дополняем каждую строку пробелами до оптимального размера allocSize
            const maxLineLength = Math.max(
                ...currentData.map((line) => line.length),
            )
            const allocSize = nextPowerOf2(Math.max(maxLineLength + 1))

            // Дополняем каждую строку пробелами до размера allocSize
            const paddedData = currentData
                .filter((line) => line.trim())
                .map((line) => {
                    const padding = ' '.repeat(
                        Math.max(0, allocSize - line.length - 1),
                    )
                    return line + padding
                })
                .join('\n')

            // Записываем данные в файл
            await fs.writeFile(currentFilename, `${paddedData}\n`, 'utf-8')

            // Переинициализируем адаптер
            // await adapter.init(true)

            // Очищаем кэш для этой коллекции
            await this.clearCache(currentCollection, {
                inTransaction: true,
            })
        }
        // execute payload
        try {
            if (options.noLock) {
                await payload()
            } else {
                await mutexLocal.withWriteLock(payload)
            }
            await this.init(true, this.#initOptions)
            if (!options.keepBackup) {
                await fs.unlink(backupFile)
            }
        } catch (error) {
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            return {
                error: `Error restoring from backup: ${
                    (error as Error).message
                }`,
            }
        }
    }

    async getCollectionAdapters<T extends LineDbAdapter>(
        collectionName?: string,
    ): Promise<Map<string, JSONLFile<T>>> {
        if (!collectionName) {
            collectionName = this.firstCollection
        }

        const adapters = new Map<string, JSONLFile<T>>()
        for (const [partitionKey, adapter] of this.#adapters) {
            if (partitionKey.startsWith(collectionName)) {
                adapters.set(partitionKey, adapter as JSONLFile<T>)
            }
        }
        return adapters
    }

    async getPartitionAdapter<T extends LineDbAdapter>(
        data: T,
        collectionName?: string,
    ): Promise<JSONLFile<T>> {
        if (!collectionName) {
            collectionName = this.firstCollection
        }

        const partitionFn = this.#partitionFunctions.get(collectionName)
        if (!partitionFn) {
            // Если нет функции партиционирования, используем дефолтный адаптер
            const adapter = this.#adapters.get(collectionName) as JSONLFile<T>
            if (!adapter) {
                throw new Error(`Collection ${collectionName} not found`)
            }
            return adapter
        }

        const partitionValue = partitionFn(data) || 'default'
        const partitionKey = `${collectionName}_${partitionValue}`

        let partitionAdapter = this.#adapters.get(partitionKey) as JSONLFile<T>
        if (!partitionAdapter) {
            // Создаем новый адаптер для партиции
            const baseAdapter = this.#adapters.get(
                collectionName,
            ) as JSONLFile<T>
            if (!baseAdapter) {
                throw new Error(`Collection ${collectionName} not found`)
            }

            const dbFolder = path.dirname(baseAdapter.getFilename().toString())
            const partitionFilename = path.join(
                dbFolder,
                `${collectionName}_${partitionValue}.jsonl`,
            )

            partitionAdapter = new JSONLFile(
                partitionFilename,
                baseAdapter.getEncryptKey() || '',
                {
                    ...baseAdapter.getOptions(),
                    collectionName: partitionKey,
                },
            )

            await partitionAdapter.init(true)
            this.#adapters.set(partitionKey, partitionAdapter)
            this.#collections.set(partitionKey, partitionFilename)
        }

        return partitionAdapter
    }

    async selectWithPagination<T extends LineDbAdapter>(
        filter: Partial<T> | string,
        page: number = 1,
        limit: number = 20,
        collectionName?: string,
        options: {
            strictCompare?: boolean
            inTransaction?: boolean
            optimisticRead?: boolean
        } = {},
    ): Promise<PaginatedResult<T>> {
        if (!collectionName) {
            collectionName = this.firstCollection
        }

        // Создаем уникальный ключ кэша
        const cacheKey = await this.#getPaginationCacheKey(
            filter,
            collectionName,
        )

        // Проверяем кэш
        let all: T[] = []
        if (this.#cacheExternal?.has(cacheKey)) {
            const cached = this.#cacheExternal.get(cacheKey)
            if (cached) {
                logTest(logForTest, `Cache hit for pagination: ${cacheKey}`)
                all = cached as T[]
            }
        }

        // Если нет в кэше, получаем все данные
        if (all.length === 0) {
            const allSelectResult = await this.select<T>(
                filter,
                collectionName,
                {
                    ...options,
                    returnChain: false,
                },
            )
            const allUnsorted = this.selectResultArray(allSelectResult)
            // sorted results
            all = allUnsorted.sort((a, b) => {
                if (
                    a.id &&
                    b.id &&
                    typeof a.id === 'number' &&
                    typeof b.id === 'number'
                ) {
                    return a.id - b.id
                }
                if (
                    a.id &&
                    b.id &&
                    typeof a.id === 'string' &&
                    typeof b.id === 'string'
                ) {
                    return a.id.localeCompare(b.id)
                }
                if (
                    a.id &&
                    b.id &&
                    typeof a.id === 'number' &&
                    typeof b.id === 'string' &&
                    !isNaN(parseInt(b.id))
                ) {
                    return a.id - parseInt(b.id)
                }
                if (
                    a.id &&
                    b.id &&
                    typeof a.id === 'string' &&
                    typeof b.id === 'number' &&
                    !isNaN(parseInt(a.id))
                ) {
                    return parseInt(a.id) - b.id
                }
                return a.id.toString().localeCompare(b.id.toString())
            })

            // Сохраняем все данные в кэш
            if (this.#cacheExternal) {
                this.#cacheExternal.set(cacheKey, all)
                logTest(logForTest, `Cache set for pagination: ${cacheKey}`)
            }
        }

        const total = all.length
        const pages = Math.ceil(total / limit)
        const start = (page - 1) * limit
        const end = start + limit
        const data = all.slice(start, end)

        const result: PaginatedResult<T> = {
            data,
            total,
            limit,
            pages,
            page,
        }

        return result
    }

    /**
     * Create unique cache key for pagination
     */
    async #getPaginationCacheKey<T extends LineDbAdapter>(
        filter: Partial<T> | string,
        collectionName: string,
    ): Promise<string> {
        const filterStr =
            typeof filter === 'string' ? filter : JSON.stringify(filter)
        return `pagination:${collectionName}:${await compressToBase64(
            filterStr,
        )}`
    }
}

export default LineDb
