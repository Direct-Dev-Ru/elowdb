/* eslint-disable no-constant-condition */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import crypto from 'node:crypto'
import fs from 'node:fs'
import { promises as fsPromises } from 'node:fs'
import { createReadStream } from 'node:fs'
import { PathLike } from 'node:fs'
import { FileHandle } from 'node:fs/promises'
import os from 'node:os'
import readline from 'node:readline'

import { RWMutex } from '@direct-dev-ru/rwmutex-ts'
import { UUID } from 'bson'
import { EventEmitter } from 'events'
import { cloneDeep } from 'lodash'
import path from 'path'

import { SelectCache } from '../../common/cache/select-cache'
import { Cache } from '../../common/interfaces/cache'
import {
    FilterFunction,
    ITransaction,
    LineDbAdapterOptions,
    PaginatedResult,
} from '../../common/interfaces/jsonl-file'
import {
    AdapterLine,
    JSONLFileOptions,
    LineDbAdapter,
} from '../../common/interfaces/jsonl-file.js'
import {
    FilePosition,
    FilePositions,
    LinePositionsManager,
} from '../../common/positions/position.js'
import { createSafeFilter } from '../../common/utils/filtrex'
import {
    createSafeSiftFilter,
    isMongoDbLikeFilter,
} from '../../common/utils/sift'
import { JSONLTransaction } from '../../core/Transaction'
import { defNodeDecrypt, defNodeEncrypt } from './TextFile.js'

export interface TransactionOptions {
    rollback?: boolean
    mutex?: RWMutex
    backupFile?: string
    doNotDeleteBackupFile?: boolean
    timeout?: number
}

export class JSONLFile<T extends LineDbAdapter> implements AdapterLine<T> {
    #parse: (str: string) => T
    #stringify: (data: T) => string
    #allocSize: number = 1024
    #cypherKey: string = ''
    #filename: PathLike
    $hasDeletedRecords = false
    #decrypt: (
        text: string,
        cypherKey: string,
    ) => Promise<string | { error: string }>
    #encrypt: (
        text: string,
        cypherKey: string,
    ) => Promise<string | { error: string }>

    #mutex = new RWMutex()
    #endTransactionMutex = new RWMutex()
    #selectCache: Cache<T> | null = null
    #events = new EventEmitter()

    #initialized = false
    #inTransactionMode = false
    #transaction: ITransaction | null = null
    #idFn: (data: T) => (string | number)[] = (data) => [`byId:${data.id}`]
    #collectionName: string
    #hashFilename: string
    #constructorOptions: JSONLFileOptions<T> = {}
    #defaultMethodsOptions: LineDbAdapterOptions = {
        inTransaction: false,
    }
    #beginTransactionMutex = new RWMutex()

    #isFlatType(value: unknown): boolean {
        return (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean' ||
            value === null
        )
    }

    #filterIndexedFields(fields: (keyof T)[]): (keyof T)[] {
        if (!fields || fields.length === 0) return []

        return fields
        // return fields.filter((field) => {
        //     const value = ({} as T)[field]
        //     return this.#isFlatType(value)
        // })
    }

    getSelectCache(): Cache<T> | null {
        return this.#selectCache
    }

    constructor(
        filename: PathLike,
        _cypherKey: string = '',
        options: JSONLFileOptions<T> = { allocSize: 256 },
    ) {
        this.#constructorOptions = {
            ...options,
            indexedFields: options.indexedFields
                ? this.#filterIndexedFields(options.indexedFields)
                : undefined,
        }
        this.#hashFilename = crypto
            .createHash('sha256')
            .update(filename.toString())
            .digest('hex')
        this.#collectionName = options.collectionName || this.#hashFilename
        this.#filename = filename
        this.#cypherKey = _cypherKey
        this.#allocSize = options.allocSize || 256
        this.#parse = options.parse || JSON.parse
        this.#stringify = options.stringify || JSON.stringify
        this.#decrypt = options.decrypt || defNodeDecrypt
        this.#encrypt = options.encrypt || defNodeEncrypt

        // Создаем кэш только если cacheTTL > 0 или передан пользовательский кэш
        if (
            (options?.cacheTTL || 0) !== 0 ||
            (options?.cacheLimit || 0) !== 0
        ) {
            this.#selectCache =
                options.cache ||
                new SelectCache<T>({
                    ttlMs: options.cacheTTL,
                    cacheLimit: options.cacheLimit,
                    cleanupInterval: options.cacheCleanupInterval,
                })
            // Подписываем кэш на события
            this.#selectCache.subscribeToEvents(this.#events)
        }
    }

    get allocSize(): number {
        return this.#allocSize
    }

    getFilename(): string {
        return this.#filename.toString()
    }

    getCollectionName(): string {
        return this.#collectionName
    }

    async init(
        force: boolean = false,
        options: LineDbAdapterOptions = {
            inTransaction: false,
        },
    ): Promise<void> {
        if (this.#initialized && !force) {
            return
        }
        // this.#logTest('init', this.#filename)
        this.#initialized = false
        await this.#ensureFileExists()
        const result = await this.#initReadJsonlFile(
            undefined,
            5000,
            options.inTransaction,
        )
        //  this.#logTest('result in init', name, result)
        if (typeof result === 'object' && 'error' in result) {
            if (result.error === 'need rewrite file' && result?.result) {
                this.#initialized = true
                const filePositions =
                    this.#inTransactionMode || options.inTransaction
                        ? await LinePositionsManager.getFilePositionsNoLock(
                              this.#filename.toString(),
                          )
                        : await LinePositionsManager.getFilePositions(
                              this.#filename.toString(),
                          )
                if (options.inTransaction) {
                    await filePositions.clearNoLock()
                } else {
                    await filePositions.clear()
                }
                await fs.promises.writeFile(this.#filename, '')
                await this.write(result.result, {
                    inTransaction: options.inTransaction,
                })
                // await this.readJsonlFile(undefined, 5000, inTransaction)
                //  this.#logTest('filePositions in init', filePositions)
            } else if (result.error === 'need compress file') {
                await this.#compressFile(options.inTransaction) // проводим сжатие файла
                // обновляем индекс
                await this.#initReadJsonlFile(
                    undefined,
                    5000,
                    options.inTransaction,
                )
            } else {
                throw new Error(result.error)
            }
        }
        this.#initialized = true
    }

    #ensureInitialized() {
        if (!this.#initialized) {
            throw new Error(
                'JSONLFile: init() must be called before using the instance',
            )
        }
    }

    async #updateExistingRecord(
        fileHandle: FileHandle,
        pos: number,
        line: string,
    ): Promise<string> {
        // запись обновленной записи в файл
        try {
            //  this.#logTest('updated on pos:', pos, '\nline:', line.trim())

            await fileHandle.write(Buffer.from(line), 0, line.length, pos)
            return `jsonl:success write on pos:${pos}`
        } catch (err) {
            return `jsonl:error: ${err}`
        }
    }

    async #fileExists(path: string): Promise<boolean> {
        try {
            await fsPromises.access(path)
            return true // Файл существует и доступен
        } catch (err) {
            return false // Файл не существует или нет доступа
        }
    }

    async #compressFile(inTransaction: boolean = false): Promise<void> {
        const filePositions = inTransaction
            ? await LinePositionsManager.getFilePositionsNoLock(
                  this.#filename.toString(),
              )
            : await LinePositionsManager.getFilePositions(
                  this.#filename.toString(),
              )
        const hasDeletedRecords = this.$hasDeletedRecords

        if (!hasDeletedRecords) {
            //  this.#logTest('no deleted records')
            return
        }
        const payload = async () => {
            // Читаем все валидные записи
            const validRecords: T[] = []
            const fileStream = createReadStream(this.#filename)
            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity,
            })
            let maxLineLength = 0
            for await (const line of rl) {
                const trimmedLine = line.trim()
                if (trimmedLine.length === 0) {
                    continue
                }
                if (trimmedLine.length > maxLineLength) {
                    maxLineLength = trimmedLine.length
                }

                try {
                    let lineData = trimmedLine
                    if (this.#cypherKey) {
                        const decrypted = await this.#decrypt(
                            lineData,
                            this.#cypherKey,
                        )
                        if (typeof decrypted === 'string') {
                            lineData = decrypted
                        } else {
                            continue
                        }
                    }

                    const record = this.#parse(lineData)
                    validRecords.push(record)
                } catch (error) {
                    // Пропускаем невалидные записи
                }
            }
            // Перезаписываем файл только валидными записями
            const fileHandle = await fs.promises.open(this.#filename, 'w')
            try {
                for (const record of validRecords) {
                    const line = await this.#prepareLine(record)
                    await fileHandle.write(Buffer.from(line))
                }
            } finally {
                await fileHandle.close()
            }
            if (
                maxLineLength > 0 &&
                this.#allocSize - maxLineLength > this.#allocSize / 2 &&
                this.#allocSize / 2 - maxLineLength >
                    (this.#allocSize / 2) * 0.2
            ) {
                let newAllocSize = 64
                while (newAllocSize < maxLineLength * 1.2) {
                    newAllocSize *= 2
                }
                await this.reallocSize(newAllocSize)
            }
        }
        return this.#inTransactionMode || inTransaction
            ? await payload()
            : await filePositions.getMutex().withWriteLock(payload, 10000)
    }

    async #ensureFileExists(): Promise<void> {
        return fs.promises
            .access(this.#filename)
            .catch(() => fs.promises.writeFile(this.#filename, ''))
    }

    async #prepareLine(record: T): Promise<string> {
        let line = this.#stringify(record)
        if (this.#cypherKey) {
            const encrypted = await this.#encrypt(line, this.#cypherKey)
            if (typeof encrypted === 'string') {
                line = encrypted
            } else {
                throw new Error('Encryption failed')
            }
        }
        return `${line + ' '.repeat(this.#allocSize - line.length - 1)}\n`
    }

    #logTest(...args: unknown[]): void {
        if (process.env.NODE_ENV === 'test') {
            console.log(...args)
        }
    }

    #calculateOptimalAllocSize(lineLength: number): number {
        // Минимальный размер блока (степень двойки)
        const MIN_ALLOC_SIZE = 64
        // Максимальный размер блока (степень двойки)
        const MAX_ALLOC_SIZE = 1024 * 1024 * 4
        // Дополнительное пространство для будущего роста
        const PADDING_FACTOR = 1.2

        // Если текущий размер достаточен, возвращаем 1 (не увеличиваем)
        if (lineLength <= this.#allocSize * 0.8) {
            return 1
        }
        // Вычисляем необходимый размер с учетом паддинга
        const requiredSize =
            this.#allocSize *
            Math.ceil(lineLength / this.#allocSize) *
            PADDING_FACTOR

        // Находим ближайшую большую степень двойки
        let newSize = MIN_ALLOC_SIZE
        while (newSize < requiredSize && newSize < MAX_ALLOC_SIZE) {
            newSize *= 2
        }
        return newSize
    }

    async #readRecords(
        positions:
            | Map<string | number, (number | FilePosition)[]>
            | Set<number | FilePosition>,
        filterFn?: (data: T) => boolean,
    ): Promise<T[]> {
        const result: T[] = []
        // const readedPositions: number[] = []
        const fileHandle = await fs.promises.open(this.#filename, 'r')
        const setOfPositions: Set<number | FilePosition> =
            positions instanceof Map
                ? Array.from(positions.values()).reduce((acc, val) => {
                      val.forEach((pos) => acc.add(pos))
                      return acc
                  }, new Set<number | FilePosition>())
                : positions
        try {
            // for (const [_, posArray] of positions) {
            for (const pos of setOfPositions) {
                const readPosition =
                    pos instanceof FilePosition ? pos.position : pos
                if (readPosition < 0) continue // Пропускаем удаленные записи
                // if (readedPositions.includes(readPosition)) continue // Пропускаем уже прочитанные записи

                const buffer = Buffer.alloc(this.#allocSize)
                await fileHandle.read(buffer, 0, this.#allocSize, readPosition)
                const line = buffer.toString().trim()
                // readedPositions.push(readPosition)

                if (line.length === 0) continue

                try {
                    let lineData = line
                    if (this.#cypherKey) {
                        const decrypted = await this.#decrypt(
                            lineData,
                            this.#cypherKey,
                        )
                        if (typeof decrypted === 'string') {
                            lineData = decrypted
                        } else {
                            continue
                        }
                    }
                    const record = this.#parse(lineData)
                    if (filterFn && !filterFn(record)) {
                        continue
                    }
                    result.push(record)
                } catch (error) {
                    // Пропускаем невалидные записи
                }
            }
            // }
        } finally {
            await fileHandle.close()
        }
        return result
    }

    async #processLine(
        line: string,
        position: number,
        filePositions: FilePositions,
        fn?: (data: T) => boolean,
    ): Promise<{ obj: T | undefined; needRewrite: boolean; error?: string }> {
        let lineData = line.trim()
        let obj: T | undefined = undefined
        let needRewrite = false

        // if initialization and empty string, return error to compress file
        if (lineData.length === 0 && !this.#initialized) {
            this.$hasDeletedRecords = true
            return {
                obj: undefined,
                needRewrite: false,
                error: 'need compress file',
            }
        }

        try {
            // Обработка зашифрованных данных
            if (this.#cypherKey) {
                const decryptionResult =
                    await this.#handleEncryptedLine(lineData)
                if ('error' in decryptionResult) {
                    return {
                        obj: undefined,
                        needRewrite: false,
                        error: decryptionResult.error,
                    }
                }
                lineData = decryptionResult.lineData
                needRewrite = decryptionResult.needRewrite
            }

            // Парсинг JSON
            const parseResult = await this.#parseLine(lineData)
            if ('error' in parseResult) {
                return {
                    obj: undefined,
                    needRewrite: false,
                    error: parseResult.error,
                }
            }
            obj = parseResult.obj

            // Проверка фильтра
            if (fn && obj && !fn(obj)) {
                return { obj: undefined, needRewrite: false }
            }

            // Индексация
            if (obj) {
                const indexResult = await this.#indexLine(
                    obj,
                    position,
                    filePositions,
                )
                if ('error' in indexResult) {
                    return {
                        obj: undefined,
                        needRewrite: false,
                        error: indexResult.error,
                    }
                }
            }

            return { obj, needRewrite }
        } catch (err) {
            if (!this.#initialized && !this.#cypherKey) {
                this.$hasDeletedRecords = true
                return {
                    obj: undefined,
                    needRewrite: false,
                    error: 'need compress file',
                }
            }
            return {
                obj: undefined,
                needRewrite: false,
                error: `Error parsing line: ${line}: ${err}`,
            }
        }
    }

    async #handleEncryptedLine(
        lineData: string,
    ): Promise<{ lineData: string; needRewrite: boolean } | { error: string }> {
        try {
            const decrypted = await this.#decrypt(lineData, this.#cypherKey)
            if (typeof decrypted === 'string') {
                return { lineData: decrypted, needRewrite: false }
            }
            // Если расшифровка не удалась, пробуем прочитать как обычный JSON
            try {
                const obj = this.#parse(lineData)
                return { lineData, needRewrite: true }
            } catch (err) {
                if (this.#constructorOptions.skipInvalidLines) {
                    return { lineData, needRewrite: true }
                }
                return { error: `Error parsing line: ${lineData}: ${err}` }
            }
        } catch (err) {
            if (this.#constructorOptions.skipInvalidLines) {
                return { lineData, needRewrite: true }
            }
            return { error: `Error parsing line: ${lineData}: ${err}` }
        }
    }

    async #parseLine(
        lineData: string,
    ): Promise<{ obj: T; needRewrite: boolean } | { error: string }> {
        try {
            const obj = this.#parse(lineData)
            if (obj.id === 'invalid_id') {
                if (this.#constructorOptions.skipInvalidLines) {
                    return { obj: {} as T, needRewrite: true }
                }
                return { error: `Error parsing line: ${lineData}` }
            }
            return { obj, needRewrite: false }
        } catch (err) {
            if (!this.#cypherKey && this.#constructorOptions?.decryptKey) {
                try {
                    const decrypted = await this.#decrypt(
                        lineData,
                        this.#constructorOptions.decryptKey,
                    )
                    if (typeof decrypted === 'string') {
                        const obj = this.#parse(decrypted)
                        return { obj, needRewrite: false }
                    }
                } catch (decryptErr) {
                    if (this.#constructorOptions.skipInvalidLines) {
                        return { obj: {} as T, needRewrite: true }
                    }
                    return {
                        error: `Error parsing line: ${lineData}: ${decryptErr}`,
                    }
                }
            }
            return { error: `Error parsing line: ${lineData}: ${err}` }
        }
    }

    async #indexLine(
        obj: T,
        position: number,
        filePositions: FilePositions,
    ): Promise<{ success: true } | { error: string }> {
        const id = this.#idFn(obj)
        if (id.length > 0) {
            const existingPosition = await filePositions.getPositionByData(
                obj,
                10_000,
                (data: T) => [`byId:${data.id}`],
            )
            if (existingPosition.size > 0) {
                return { error: `Not unique id in file: ${id}` }
            }
            await filePositions.setPositionByData(
                obj,
                new FilePosition(position, false, crypto.randomUUID()),
                10_000,
                this.#idFn,
            )
        }
        return { success: true }
    }

    async #initReadJsonlFile(
        fn?: (data: T) => boolean,
        timeoutMs: number = 1000,
        inTransaction: boolean = false,
    ): Promise<T[] | { error: string; result?: T[] }> {
        const result: T[] = []
        let maxLineLength = 0
        let position = 0
        let needRewrite = false
        const fileStream = createReadStream(this.#filename)

        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity,
        })

        const filePositions =
            this.#inTransactionMode || inTransaction
                ? await LinePositionsManager.getFilePositionsNoLock(
                      this.#filename.toString(),
                  )
                : await LinePositionsManager.getFilePositions(
                      this.#filename.toString(),
                  )

        // Initial read file under write lock
        const payload = async () => {
            // if there is no filter function, clear index positions
            if (!fn) {
                await filePositions.clearNoLock()
            }
            for await (const line of rl) {
                let lineData = line.trim()
                // calculate max line length in file to realloc allocSize if needed
                if (line.length > maxLineLength && lineData.length > 0) {
                    maxLineLength = line.length
                }
                // if line length is not equal to allocSize, realloc allocSize
                if (
                    lineData.length > 0 &&
                    line.length + 1 !== this.#allocSize
                ) {
                    this.#allocSize = line.length + 1
                    // this.#logTest(true, 'allocSize::::>', this.#allocSize)
                }
                // if line length is greater than allocSize * 0.8, realloc allocSize
                if (lineData.length > this.#allocSize * 0.8) {
                    await this.reallocSize(
                        this.#calculateOptimalAllocSize(line.length),
                    )
                    if (line.length > this.#allocSize) {
                        throw new Error(
                            `Line length ${
                                line.length
                            } is greater than allocSize ${this.#allocSize}`,
                        )
                    }
                }

                let obj: T = { id: 'invalid_id' } as T
                // if initialization and empty string, return error to compress file
                if (lineData.length === 0 && !this.#initialized) {
                    this.$hasDeletedRecords = true
                    return { error: 'need compress file' }
                }
                try {
                    // if encryption key is specified, try to decrypt
                    if (this.#cypherKey) {
                        try {
                            // Try to decrypt
                            const decrypted = await this.#decrypt(
                                lineData,
                                this.#cypherKey,
                            )
                            if (typeof decrypted === 'string') {
                                lineData = decrypted
                            } else {
                                // If decryption failed, try to read as regular JSON
                                try {
                                    obj = this.#parse(lineData)
                                    // If JSON is valid, it means it's unencrypted data
                                    needRewrite = true
                                } catch (err) {
                                    // If JSON is invalid - return error if skipInvalidLines is not configured
                                    if (
                                        this.#constructorOptions
                                            .skipInvalidLines
                                    ) {
                                        needRewrite = true
                                        continue
                                    }
                                    // Если и JSON невалидный - возвращаем ошибку
                                    return {
                                        error: `Error parsing line: ${line}: ${err}`,
                                    }
                                }
                            }
                        } catch (err) {
                            if (this.#constructorOptions.skipInvalidLines) {
                                needRewrite = true
                                continue
                            }
                            return {
                                error: `Error parsing line: ${line}: ${err}`,
                            }
                        }
                    }
                    // первоначальная попытка распарсить строку
                    try {
                        // парсим строку
                        if (obj.id === 'invalid_id') {
                            obj = this.#parse(lineData)
                        }
                    } catch (err) {
                        // If we couldn't parse because the string is encrypted and we didn't specify an encryption key
                        if (
                            !this.#cypherKey &&
                            this.#constructorOptions?.decryptKey
                        ) {
                            try {
                                // Try to decrypt
                                const decrypted = await this.#decrypt(
                                    lineData,
                                    this.#constructorOptions.decryptKey,
                                )
                                if (typeof decrypted === 'string') {
                                    lineData = decrypted
                                }
                                obj = this.#parse(lineData)
                                needRewrite = true
                            } catch (err) {
                                if (this.#constructorOptions.skipInvalidLines) {
                                    continue
                                }
                                return {
                                    error: `Error parsing line: ${line}: ${err}`,
                                }
                            }
                        }
                    }
                    // if after parsing attempt, id is still invalid_id, return error
                    if (obj.id === 'invalid_id') {
                        if (this.#constructorOptions.skipInvalidLines) {
                            needRewrite = true
                            continue
                        }
                        return {
                            error: `Error parsing line: ${line}`,
                        }
                    }
                    // if there is a filter function and it doesn't pass, skip
                    if (fn && !fn(obj)) {
                        position += this.allocSize
                        continue
                    }
                    // calculate id key for index
                    const id = this.#idFn(obj)
                    if (id.length > 0) {
                        // Проверяем наличие записи с таким id в индексе
                        const existingPosition =
                            await filePositions.getPositionByDataNoLock(
                                obj,
                                (data) => [`byId:${data.id}`],
                            )
                        if (existingPosition.size > 0) {
                            return {
                                error: `Not unique id in file: ${id}`,
                            }
                        }
                        // if there is something to index, add position to index
                        await filePositions.setPositionByDataNoLock(
                            obj,
                            new FilePosition(
                                position,
                                false,
                                crypto.randomUUID(),
                            ),
                            this.#idFn,
                        )
                    }
                    result.push(obj)
                } catch (err) {
                    if (!this.#initialized && !this.#cypherKey) {
                        this.$hasDeletedRecords = true
                        return { error: 'need compress file' }
                    }
                    // continue
                    return { error: `Error parsing line: ${line}: ${err}` }
                }
                position += this.allocSize // +1 for newline
            }
            if (needRewrite) {
                return { error: 'need rewrite file', result }
            }
            if (
                maxLineLength > 0 &&
                this.#allocSize - maxLineLength > this.#allocSize / 2 &&
                this.#allocSize / 2 - maxLineLength >
                    (this.#allocSize / 2) * 0.2
            ) {
                let newAllocSize = 64
                while (newAllocSize < maxLineLength * 1.2) {
                    newAllocSize *= 2
                }
                await this.reallocSize(newAllocSize)
            }
        }

        const readResult =
            this.#inTransactionMode || inTransaction
                ? await payload()
                : await filePositions
                      .getMutex()
                      .withWriteLock(payload, timeoutMs)

        return readResult &&
            typeof readResult === 'object' &&
            'error' in readResult
            ? readResult
            : result
    }

    async #readAllFromFile(
        filterFn?: FilterFunction<T>,
        options: LineDbAdapterOptions = {
            inTransaction: false,
            strictCompare: false,
        },
    ): Promise<T[] | { error: string; result?: T[] }> {
        const result: T[] = []
        const fileStream = createReadStream(this.#filename)

        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity,
        })
        const filePositions =
            this.#inTransactionMode || options.inTransaction
                ? await LinePositionsManager.getFilePositionsNoLock(
                      this.#filename.toString(),
                  )
                : await LinePositionsManager.getFilePositions(
                      this.#filename.toString(),
                  )
        // Функция для чтения всех строк из файла
        const payload = async () => {
            for await (const line of rl) {
                let lineData = line.trim()
                if (lineData.length === 0) {
                    continue
                }
                let obj: T = { id: 'invalid_id' } as T
                try {
                    // if encryption key is specified, try to decrypt
                    if (this.#cypherKey) {
                        try {
                            // Try to decrypt
                            const decrypted = await this.#decrypt(
                                lineData,
                                this.#cypherKey,
                            )
                            if (typeof decrypted === 'string') {
                                lineData = decrypted
                            } else {
                                // If decryption failed, try to read as regular JSON
                                try {
                                    obj = this.#parse(lineData)
                                    // If JSON is valid, it means it's unencrypted data
                                } catch (err) {
                                    // Если и JSON невалидный - возвращаем ошибку если не настроен skipInvalidLines
                                    if (
                                        this.#constructorOptions
                                            .skipInvalidLines
                                    ) {
                                        continue
                                    }
                                    return {
                                        error: `Error parsing line: ${line}: ${err}`,
                                    }
                                }
                            }
                        } catch (err) {
                            if (this.#constructorOptions.skipInvalidLines) {
                                continue
                            }
                            return {
                                error: `Error parsing line: ${line}: ${err}`,
                            }
                        }
                    }
                    // первоначальная попытка распарсить строку, если id invalid_id
                    // если к этому моменту не распарсили, то пробуем распарсить как обычный JSON
                    try {
                        if (obj.id === 'invalid_id') {
                            obj = this.#parse(lineData)
                        }
                    } catch (err) {
                        // If we couldn't parse because the string is encrypted and we didn't specify an encryption key
                        if (
                            !this.#cypherKey &&
                            this.#constructorOptions?.decryptKey
                        ) {
                            try {
                                // Try to decrypt
                                const decrypted = await this.#decrypt(
                                    lineData,
                                    this.#constructorOptions.decryptKey,
                                )
                                if (typeof decrypted === 'string') {
                                    lineData = decrypted
                                }
                                obj = this.#parse(lineData)
                                // If JSON is valid, it means it's unencrypted data
                                // needRewrite = true
                            } catch (err) {
                                if (this.#constructorOptions.skipInvalidLines) {
                                    continue
                                }
                                return {
                                    error: `Error parsing line: ${line}: ${err}`,
                                }
                            }
                        }
                    }
                    // if after parsing attempt, id is still invalid_id, return error if not configured to skipInvalidLines
                    if (obj.id === 'invalid_id') {
                        if (this.#constructorOptions.skipInvalidLines) {
                            continue
                        }
                        return {
                            error: `Error parsing line: ${line}`,
                        }
                    }
                    // if there is a filter function and it doesn't pass, skip
                    if (filterFn && !filterFn(obj)) {
                        continue
                    }

                    result.push(obj)
                } catch (err) {
                    if (!this.#initialized && !this.#cypherKey) {
                        this.$hasDeletedRecords = true
                        return { error: 'need compress file' }
                    }
                    // continue
                    return { error: `Error parsing line: ${line}: ${err}` }
                }
            }
        }

        const readResult =
            this.#inTransactionMode || options.inTransaction
                ? await payload()
                : await filePositions.getMutex().withReadLock(payload)

        return readResult &&
            typeof readResult === 'object' &&
            'error' in readResult
            ? readResult
            : result
    }

    async #delete(
        data: Partial<T> | Partial<T>[],
        options: LineDbAdapterOptions = {
            inTransaction: false,
            strictCompare: true,
        },
    ): Promise<number> {
        this.#ensureInitialized()
        if (
            this.#transaction &&
            options.inTransaction &&
            this.#transaction.transactionId !== options?.transactionId
        ) {
            throw new Error(
                `Error in Transaction - transaction id does not match: ${options.debugTag}`,
            )
        }
        const filePositions =
            this.#inTransactionMode || options.inTransaction
                ? await LinePositionsManager.getFilePositionsNoLock(
                      this.#filename.toString(),
                  )
                : await LinePositionsManager.getFilePositions(
                      this.#filename.toString(),
                  )

        const dataArray = Array.isArray(data) ? data : [data]

        const payload = async (): Promise<number> => {
            let deletedCount = 0
            for (const item of dataArray) {
                const positions = await filePositions.getPositionByDataNoLock(
                    item as T,
                    (item as T)?.id
                        ? (data: T) => [`byId:${data.id}`]
                        : this.#idFn,
                )
                // если нашли по индексу что то то удаляем по этим данным
                if (positions.size > 0) {
                    const fileHandle = await fs.promises.open(
                        this.#filename,
                        'r+',
                    )
                    try {
                        for (const [id, posArray] of positions) {
                            for (const pos of posArray) {
                                // Заполняем строку пробелами
                                const emptyLine = `${' '.repeat(
                                    this.#allocSize - 1,
                                )}\n`

                                const writePosition =
                                    pos instanceof FilePosition
                                        ? pos.position
                                        : pos
                                await fileHandle.write(
                                    Buffer.from(emptyLine),
                                    0,
                                    emptyLine.length,
                                    writePosition,
                                )
                                await filePositions.replacePositionNoLock(
                                    pos,
                                    new FilePosition(-100, true),
                                )
                                deletedCount++
                                this.$hasDeletedRecords = true
                                if (this.#hasCache()) {
                                    // Эмитим событие удаления
                                    this.#events.emit('record:delete', item)
                                }
                            }
                        }
                    } finally {
                        await fileHandle.close()
                    }
                } else {
                    // если не нашли по индексу, то читаем все записи и удаляем по этим данным
                    const allPositions =
                        await filePositions.getAllPositionsNoLock('byId:')

                    const filterFn = (record: Partial<T>) => {
                        return Object.entries(item).every(([key, value]) => {
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
                    }
                    const records = await this.#readRecords(
                        allPositions,
                        filterFn,
                    )
                    const emptyLine = `${' '.repeat(this.#allocSize - 1)}\n`
                    const fileHandle = await fs.promises.open(
                        this.#filename,
                        'r+',
                    )
                    try {
                        for (const record of records) {
                            const positions =
                                await filePositions.getPositionByDataNoLock(
                                    record,
                                    (data) => [`byId:${data.id}`],
                                )
                            if (positions.size > 0) {
                                for (const [id, posArray] of positions) {
                                    for (const pos of posArray) {
                                        const writePosition =
                                            pos instanceof FilePosition
                                                ? pos.position
                                                : pos

                                        await fileHandle.write(
                                            Buffer.from(emptyLine),
                                            0,
                                            emptyLine.length,
                                            writePosition,
                                        )
                                        await filePositions.replacePositionNoLock(
                                            pos,
                                            new FilePosition(
                                                -100,
                                                true,
                                                'deleted',
                                            ),
                                        )
                                    }
                                    deletedCount++
                                    this.$hasDeletedRecords = true
                                    if (this.#hasCache()) {
                                        // Эмитим событие удаления
                                        this.#events.emit(
                                            'record:delete',
                                            record,
                                        )
                                    }
                                }
                            }
                        }
                    } finally {
                        if (fileHandle) {
                            await fileHandle.close()
                        }
                    }
                }
            }
            return deletedCount
        }
        if (this.#inTransactionMode || options.inTransaction) {
            // запуск без блокировок
            return await payload()
        }
        return await filePositions.getMutex().withWriteLock(payload)
    }

    async read(
        fn?: FilterFunction<T>,
        options: LineDbAdapterOptions = {
            inTransaction: false,
        },
    ): Promise<T[]> {
        this.#ensureInitialized()
        const filePositions =
            this.#inTransactionMode || options.inTransaction
                ? await LinePositionsManager.getFilePositionsNoLock(
                      this.#filename.toString(),
                  )
                : await LinePositionsManager.getFilePositions(
                      this.#filename.toString(),
                  )

        const payload = async () => {
            const allPositions = await filePositions.getAllPositionsNoLock()
            //  this.#logTest('read allPositions', allPositions)
            // const filteredPositionsById = new Map(
            //     Array.from(allPositions.entries()).filter(([key, _]) =>
            //         key.toString().includes('byId:'),
            //     ),
            // )

            const filteredPositionsById = new Set<number | FilePosition>(
                Array.from(allPositions.entries())
                    .map(([_, value]) => value)
                    .flat(),
            )

            //  this.#logTest('read filteredPositions', filteredPositionsById)
            return this.#readRecords(filteredPositionsById)
        }
        let result: T[] = []
        result =
            this.#inTransactionMode || options.inTransaction
                ? await payload()
                : await filePositions.getMutex().withReadLock(payload)

        if (fn) {
            return result.filter(fn)
        }
        return result
    }

    async reallocSize(newAllocSize: number = 4096): Promise<void> {
        const tempFile = `${this.#filename}.tmp`

        const readStream = fs.createReadStream(this.#filename, {
            encoding: 'utf-8',
        })
        const writeStream = fs.createWriteStream(tempFile, {
            encoding: 'utf-8',
        })

        const rl = readline.createInterface({
            input: readStream,
            crlfDelay: Infinity, // handles both \n and \r\n
        })
        for await (const line of rl) {
            const paddedLine =
                line.trimEnd() +
                ' '.repeat(newAllocSize - line.trimEnd().length - 1) +
                '\n'
            writeStream.write(paddedLine)
        }
        try {
            await new Promise<void>((resolve, reject) => {
                writeStream.end(() => {
                    resolve()
                })
                writeStream.on('error', reject)
            })

            // Optionally: replace original file with temp file
            await fs.promises.copyFile(tempFile, this.#filename)

            const filePositions =
                await LinePositionsManager.getFilePositionsNoLock(
                    this.#filename.toString(),
                )
            await filePositions.recalculatePositionNoLock(
                newAllocSize / this.#allocSize,
            )
            //  this.#logTest('newAllocSize', newAllocSize)
            //  this.#logTest(
            //     'positions after reallocSize',
            //     await filePositions.getAllPositionsNoLock(),
            // )
            this.#allocSize = newAllocSize
        } catch (err) {
            this.#logTest('error in reallocSize', err)
            throw err
        } finally {
            await fs.promises.unlink(tempFile)
        }
    }

    getAllocSize(): number {
        return this.#allocSize
    }

    async getPositionsNoLock() {
        const filePositions = await LinePositionsManager.getFilePositionsNoLock(
            this.#filename.toString(),
        )
        return filePositions.getAllPositionsNoLock()
    }

    async write(data: T | T[], options?: LineDbAdapterOptions): Promise<void> {
        this.#ensureInitialized()

        if (!options) {
            options = this.#defaultMethodsOptions
        }
        this.#transactionGuard(options)

        // error throwing for test
        if (options.debugTag === 'throwError') {
            throw new Error(`Error in Transaction: ${options.debugTag}`)
        }

        const filePositions =
            this.#inTransactionMode || options.inTransaction
                ? await LinePositionsManager.getFilePositionsNoLock(
                      this.#filename.toString(),
                  )
                : await LinePositionsManager.getFilePositions(
                      this.#filename.toString(),
                  )

        // Convert single object to array
        const dataArray = Array.isArray(data) ? data : [data]

        const payload = async () => {
            // Проверяем существование файла и открываем с нужным флагом

            // step 1: update existing records
            // return positions only [byId:id, byId:id, ...]
            const existingIds =
                await filePositions.getPositionsByArrayOfDataNoLock(
                    dataArray,
                    (item) => [`byId:${item.id}`],
                )

            // check if file exists and open it with r+ flag
            const fileExists = await this.#fileExists(this.#filename.toString())
            const fileHandle = await fs.promises.open(
                this.#filename,
                fileExists ? 'r+' : 'w',
            )
            try {
                // Обрабатываем существующие записи
                for (const [posId, existingPositions] of existingIds) {
                    // get item with updating data from dataArray by id
                    let id = posId
                    if (id.toString().includes(':')) {
                        const splittedId = id.toString().split(':')
                        id = splittedId[1]
                    }

                    const item = dataArray.find((item) => {
                        if (typeof item.id === 'string') {
                            return item.id === id
                        }
                        return item.id === Number(id)
                    })
                    if (!item) {
                        throw new Error(
                            `Item with id ${id} not found in dataArray. Data for update is corrupted`,
                        )
                    }
                    // lets calculate other indexes of existing line to reindex them
                    const newIndexesToReindex = this.#idFn(item).filter(
                        (index) => {
                            if (typeof index === 'string') {
                                return !index.toString().startsWith('byId:')
                            }
                            return false
                        },
                    )
                    let indexesToRemove: (string | number)[] = []
                    let indexesToAdd: (string | number)[] = []
                    let fullCurrentIndexes: (string | number)[] = []
                    // if there are some other indexes exept byId - we need reindex them after update
                    if (newIndexesToReindex.length > 0) {
                        // ok first read existing record by id
                        const existingRecord = await this.readByFilter(
                            { id } as Partial<T>,
                            { ...options, inTransaction: true },
                        )
                        if (existingRecord.length === 0) {
                            throw new Error(`Record with id ${id} not found`)
                        }
                        if (existingRecord.length > 1) {
                            throw new Error(
                                `readByFilter: for id ${id} returned multiple records`,
                            )
                        }
                        fullCurrentIndexes = this.#idFn(existingRecord[0])
                        const currentIndexesToReindex =
                            fullCurrentIndexes.filter((index) => {
                                if (typeof index === 'string') {
                                    return !index.toString().startsWith('byId:')
                                }
                                return false
                            })

                        // Находим индексы, которые нужно удалить (есть в текущих, но нет в новых)
                        indexesToRemove = currentIndexesToReindex.filter(
                            (currentIndex) =>
                                !newIndexesToReindex.includes(currentIndex),
                        )

                        // Находим индексы, которые нужно добавить (есть в новых, но нет в текущих)
                        indexesToAdd = newIndexesToReindex.filter(
                            (newIndex) =>
                                !currentIndexesToReindex.includes(newIndex),
                        )
                    }

                    // get line from item
                    let line = this.#stringify(item)
                    // encrypt if needed
                    if (this.#cypherKey) {
                        const encrypted = await this.#encrypt(
                            line,
                            this.#cypherKey,
                        )
                        if (typeof encrypted !== 'string') {
                            throw new Error('Encryption failed')
                        }
                        line = encrypted
                    }
                    // check if line length is greater than 80% of allocSize
                    if (line.length > this.#allocSize * 0.8) {
                        await this.reallocSize(
                            this.#calculateOptimalAllocSize(line.length),
                        )
                        if (line.length > this.#allocSize) {
                            throw new Error(
                                `Line length ${
                                    line.length
                                } is greater than allocSize ${this.#allocSize}`,
                            )
                        }
                    }
                    // align line length to allocSize
                    const padding = `${' '.repeat(
                        this.#allocSize - line.length - 1,
                    )}\n`
                    const resultLine = `${line}${padding}`
                    // update existing records
                    for (const existingPosition of existingPositions) {
                        const writePosition =
                            existingPosition instanceof FilePosition
                                ? existingPosition.position
                                : existingPosition
                        const result = await this.#updateExistingRecord(
                            fileHandle,
                            writePosition,
                            resultLine,
                        )

                        if (indexesToRemove.length > 0) {
                            for (const index of indexesToRemove) {
                                if (typeof index !== 'string') {
                                    continue
                                }
                                await filePositions.removePositionByIndexNoLock(
                                    index.toString(),
                                    existingPosition,
                                )
                            }
                        }

                        if (indexesToAdd.length > 0) {
                            const currentIndexeToFirstFindFrom =
                                fullCurrentIndexes.filter((index) => {
                                    if (typeof index === 'string') {
                                        return index
                                            .toString()
                                            .startsWith('byId:')
                                    }
                                    return false
                                })[0]
                            const existingFilePositions = (
                                await filePositions.getAllPositionsNoLock(
                                    'byId:',
                                )
                            ).get(currentIndexeToFirstFindFrom)

                            const filePosition: FilePosition =
                                existingFilePositions &&
                                existingFilePositions.length > 0
                                    ? (existingFilePositions.find(
                                          (position) => {
                                              if (
                                                  position instanceof
                                                  FilePosition
                                              ) {
                                                  return (
                                                      position.position ===
                                                      writePosition
                                                  )
                                              }
                                              return false
                                          },
                                      ) as FilePosition)
                                    : new FilePosition(
                                          writePosition,
                                          false,
                                          crypto.randomUUID(),
                                      )

                            for (const index of indexesToAdd) {
                                if (typeof index !== 'string') {
                                    continue
                                }

                                await filePositions.addPositionByIndexNoLock(
                                    index.toString(),
                                    filePosition,
                                )
                            }
                        }

                        if (result.includes('error')) {
                            throw new Error('Error updating existing record')
                        }
                    }
                }
            } finally {
                if (fileHandle) {
                    await fileHandle.close()
                }
            }

            // step 2: write new records - append to the end of the file
            const fileExistsAppend = await this.#fileExists(
                this.#filename.toString(),
            )
            const fileHandleAppend = await fs.promises.open(
                this.#filename,
                fileExistsAppend ? 'a' : 'w',
            )
            // let newPosition: number = 0

            const stats = await fileHandleAppend.stat()
            let position = stats.size

            try {
                for (const item of dataArray) {
                    if (existingIds.has(item.id)) {
                        continue
                    }
                    // get line from item
                    let line = this.#stringify(item)
                    // encrypt if needed
                    if (this.#cypherKey) {
                        const encrypted = await this.#encrypt(
                            line,
                            this.#cypherKey,
                        )
                        if (typeof encrypted !== 'string') {
                            throw new Error('Encryption failed')
                        }
                        line = encrypted
                    }
                    // check if line length is greater than 80% of allocSize
                    if (line.length > this.#allocSize * 0.8) {
                        await this.reallocSize(
                            this.#calculateOptimalAllocSize(line.length),
                        )
                        if (line.length > this.#allocSize) {
                            throw new Error(
                                `Line length ${
                                    line.length
                                } is greater than allocSize ${this.#allocSize}`,
                            )
                        }
                        const stats = await fileHandleAppend.stat()
                        position = stats.size
                    }
                    // align line length to allocSize
                    const padding = `${' '.repeat(
                        this.#allocSize - line.length - 1,
                    )}\n`
                    const resultLine = `${line}${padding}`
                    //  this.#logTest('mark-1 write in transaction mode: ', debugTag)

                    await fileHandleAppend.write(resultLine)
                    await filePositions.setPositionByDataNoLock(
                        item,
                        new FilePosition(position, false, crypto.randomUUID()),
                        this.#idFn,
                    )
                    position += resultLine.length
                    //  this.#logTest('position in write append step:', position)
                }
            } finally {
                if (fileHandleAppend) {
                    await fileHandleAppend.close()
                }
            }
        }

        if (this.#inTransactionMode || options.inTransaction) {
            //  this.#logTest('end write in transaction mode: ', debugTag, result)
            return await payload()
        }
        //  this.#logTest('end write in no transaction mode: ', debugTag, result)
        return await filePositions.getMutex().withWriteLock(payload)
    }

    async #readByIndexedData(
        data: Partial<T>,
        options?: LineDbAdapterOptions,
        filterFunction?: FilterFunction<T>,
    ): Promise<T[]> {
        this.#ensureInitialized()
        if (!options) {
            options = this.#defaultMethodsOptions.inTransaction
                ? this.#defaultMethodsOptions
                : {
                      inTransaction: false,
                      strictCompare: false,
                  }
        }
        this.#transactionGuard(options)

        const filePositions =
            this.#inTransactionMode || options.inTransaction
                ? await LinePositionsManager.getFilePositionsNoLock(
                      this.#filename.toString(),
                  )
                : await LinePositionsManager.getFilePositions(
                      this.#filename.toString(),
                  )
        // we need to read all indexes byIndexedFields: and then deserialize content after : and filter
        if (Object.keys(data).length === 0) {
            // Get all positions from indexed fields
            const positions = new Set<number | FilePosition>()
            const payload = async () => {
                const indexedPositions =
                    await filePositions.getAllPositionsNoLock(
                        'byIndexedFields:',
                    )
                for (const [key, value] of indexedPositions) {
                    const stringKey = key as string
                    let indexedObject: Partial<T> = {}
                    try {
                        indexedObject = JSON.parse(
                            stringKey.replace('byIndexedFields:', ''),
                        )
                    } catch {
                        continue
                    }
                    // if filter function is provided and its result is false - continue
                    if (!filterFunction?.(indexedObject as T)) {
                        continue
                    }
                    // add position to set
                    for (const position of value) {
                        positions.add(position)
                    }
                }
                // return filterFunction ? records.filter(filterFunction) : records
                return await this.#readRecords(positions)
            }
            if (this.#inTransactionMode || options.inTransaction) {
                return await payload()
            }
            return await filePositions.getMutex().withReadLock(payload)
        }

        // this code block for the case then filer is base

        // Создаем временный объект с id для поиска
        const searchData = { ...data } as T
        // if (!searchData.id && data.id) {
        //     searchData.id = data.id
        // }

        // полезная нагрузка
        const payload = async () => {
            const positions = await filePositions.getPositionByDataNoLock(
                searchData,
                this.#idFn,
            )
            //  this.#logTest('Reading data by positions:', positions)
            return this.#readRecords(positions)
        }
        if (this.#inTransactionMode || options.inTransaction) {
            // запуск без блокировок
            return await payload()
        }
        return await filePositions.getMutex().withReadLock(payload)
    }

    #fallbackFilter =
        (filterData: Partial<T>, options: LineDbAdapterOptions) =>
        (record: Partial<T>) => {
            return Object.entries(filterData).every(([key, value]) => {
                const recordValue = record[key as keyof T]
                if (
                    typeof value === 'string' &&
                    typeof recordValue === 'string' &&
                    options?.strictCompare == false
                ) {
                    return recordValue
                        .toLowerCase()
                        .includes(value.toLowerCase())
                }
                return recordValue === value
            })
        }

    async readByFilter(
        filter:
            | Partial<T>
            | Record<string, unknown>
            | string
            | FilterFunction<T>,
        options?: LineDbAdapterOptions,
    ): Promise<T[]> {
        this.#ensureInitialized()
        if (!options) {
            options = this.#defaultMethodsOptions.inTransaction
                ? this.#defaultMethodsOptions
                : {
                      inTransaction: false,
                      strictCompare: true,
                      filterType: 'object',
                  }
        }

        this.#transactionGuard(options)

        let filterData:
            | Partial<T>
            | Record<string, unknown>
            | string
            | FilterFunction<T> = filter

        let filterFunctionForIndexedSearch: FilterFunction<T> =
            filter instanceof Function ? filter : (data: T) => true
        let filterFunction: FilterFunction<T> =
            filter instanceof Function ? filter : (data: Partial<T>) => true

        let doIndexedSearch = false

        if (filter instanceof Function) {
            filterFunction = filter
            filterData = {}
        } else {
            if (
                filter &&
                (typeof filter === 'string' ||
                    options.filterType === 'string' ||
                    options.filterType === 'filtrex')
            ) {
                // if filter is string, we need to check if it is indexed field
                // this.#logTest('test type:', 'filter is string')
                if (this.#constructorOptions.indexedFields) {
                    try {
                        filterFunctionForIndexedSearch = createSafeFilter<
                            Partial<T>
                        >(filter as string, {
                            allowedFields:
                                this.#constructorOptions.indexedFields,
                        })
                        doIndexedSearch = true
                    } catch (error) {
                        doIndexedSearch = false
                    }
                }
                filterFunction = createSafeFilter<Partial<T>>(filter as string)
                filterData = {}
            } else if (
                filter &&
                typeof filter === 'object' &&
                isPartialT<T>(filter) &&
                !isMongoDbLikeFilter(filter) &&
                (options.filterType === 'object' ||
                    options.filterType === 'base')
            ) {
                // this.#logTest('test type:', 'simple')
                // we need build filter function as simple compare algorithm
                filterData = filter
                doIndexedSearch = true
                filterFunctionForIndexedSearch = this.#fallbackFilter(
                    filterData as Partial<T>,
                    options,
                )
                filterFunction = filterFunctionForIndexedSearch
            } else if (filter && typeof filter === 'object') {
                // our filter is in mongoDB style
                if (
                    isMongoDbLikeFilter(filter) ||
                    options.filterType === 'sift' ||
                    options.filterType === 'mongodb'
                ) {
                    // this.#logTest('test type:', 'mongodb')
                    if (this.#constructorOptions.indexedFields) {
                        try {
                            filterFunctionForIndexedSearch =
                                createSafeSiftFilter<Partial<T>>(filter, {
                                    allowedFields:
                                        this.#constructorOptions.indexedFields,
                                })
                            doIndexedSearch = true
                        } catch (error) {
                            doIndexedSearch = false
                        }
                    }

                    filterFunction = createSafeSiftFilter<Partial<T>>(filter)
                    filterData = {}
                } else {
                    doIndexedSearch = true
                    filterFunctionForIndexedSearch = this.#fallbackFilter(
                        filter as Partial<T>,
                        options,
                    )
                    filterFunction = filterFunctionForIndexedSearch
                    filterData = filter as Partial<T>
                }
            }
        }

        // Сначала пробуем найти по индексу
        if (doIndexedSearch && !(filter instanceof Function)) {
            let indexedResults: T[] = []
            try {
                indexedResults = await this.#readByIndexedData(
                    filterData as Partial<T>,
                    options,
                    filterFunctionForIndexedSearch,
                )
                // this.#logTest('indexedResults', indexedResults)
                // this.#logTest('indexedResults length', indexedResults.length)
                // const endTimeToReadWithFilter = Date.now()
                // this.#logTest(
                //     'time to read with filter',
                //     endTimeToReadWithFilter - startTimeToReadWithFilter,
                //     endTimeToReadWithFilter,
                //     startTimeToReadWithFilter,
                // )
            } catch (error) {
                if (error instanceof Error) {
                    // this.#logTest('Error message:', error.message)
                }
            }

            // Если нашли результаты по индексу, возвращаем их
            if (indexedResults.length > 0) {
                // this.#logTest('Found results by index:', indexedResults.length)
                // this.#logTest('filter param:', filter, typeof filter)

                return indexedResults
            }
        }
        // Если по индексу ничего не нашли, читаем все записи и фильтруем
        // this.#logTest('No results by index, reading all records')
        // this.#logTest('filter param:', filter, typeof filter)

        const allFilteredRecords = await this.#readAllFromFile(
            filterFunction,
            options,
        )
        if (!Array.isArray(allFilteredRecords)) {
            throw new Error(allFilteredRecords.error)
        }

        return allFilteredRecords
    }

    async delete(
        data: Partial<T> | Partial<T>[],
        options?: LineDbAdapterOptions,
    ): Promise<number> {
        this.#ensureInitialized()
        if (!options) {
            options = this.#defaultMethodsOptions
        }
        this.#transactionGuard(options)

        // Если уже в транзакции, просто вызываем приватный метод
        if (options.inTransaction) {
            return await this.#delete(data, options)
        }

        // Если не в транзакции, открываем транзакцию
        const transactionId = await this.beginTransaction({
            rollback: true,
            timeout: 20_000,
        })

        let result: number = 0
        try {
            await this.withTransaction(
                async (adapter, txOptions) => {
                    const deletedCount = await adapter.#delete(data, {
                        ...options,
                        inTransaction: true,
                        transactionId,
                    })
                    result = deletedCount
                    await this.endTransaction()
                },
                {
                    inTransaction: true,
                    transactionId,
                },
            )
        } catch (error) {
            await this.endTransaction()
            throw error
        }

        return result
    }

    async insert(
        data: (Partial<T> | T) | (Partial<T> | T)[],
        options?: LineDbAdapterOptions,
    ): Promise<void> {
        this.#ensureInitialized()
        if (!options) {
            options = this.#defaultMethodsOptions
        }
        this.#transactionGuard(options)
        let mergedData: Partial<T>[] = Array.isArray(data)
            ? data.map((item) => item as Partial<T>)
            : [data as Partial<T>]

        // check if all records have id
        const itemsWithoutIds: Partial<T>[] = mergedData.filter(
            (item) => !item.id,
        )
        if (itemsWithoutIds.length > 0) {
            throw new Error(
                `All records must contain id field. Records without id: ${itemsWithoutIds
                    .map((item) => JSON.stringify(item))
                    .join(', ')}`,
            )
        }

        if (mergedData.length > 1) {
            // Remove full duplicates, leaving only the last element
            const uniqueData = mergedData.reduce(
                (acc: Partial<T>[], current: Partial<T>) => {
                    const isDuplicate = acc.some(
                        (item: Partial<T>) =>
                            JSON.stringify(item) === JSON.stringify(current),
                    )
                    if (!isDuplicate) {
                        acc.push(current)
                    }
                    return acc
                },
                [],
            )

            // Group records by id for merging
            const groupedById = uniqueData.reduce(
                (acc: Map<string, Partial<T>[]>, current: Partial<T>) => {
                    const id = current.id as string
                    if (!acc.has(id)) {
                        acc.set(id, [])
                    }
                    acc.get(id)?.push(current)
                    return acc
                },
                new Map(),
            )

            // Merge records with the same id, keeping the priority of the last values
            mergedData = Array.from(groupedById.values()).map(
                (group: Partial<T>[]) => {
                    return group.reduce(
                        (acc: Partial<T>, current: Partial<T>) => ({
                            ...acc,
                            ...current,
                        }),
                        {} as Partial<T>,
                    )
                },
            )
        }
        if (mergedData.length > 0) {
            // if we are already in transaction, just write
            if (options.inTransaction) {
                const filePositions =
                    await LinePositionsManager.getFilePositions(
                        this.#filename.toString(),
                    )
                const existingPositions =
                    await filePositions.getPositionsByArrayOfDataNoLock(
                        mergedData as T[],
                        (item) => [`byId:${item.id}`],
                    )
                if (existingPositions.size > 0) {
                    throw new Error(
                        `One or more record(s) already exists (checked by id): ${Array.from(
                            existingPositions.keys(),
                        )
                            .map((item) =>
                                (item as string).replace('byId:', ''),
                            )
                            .map((item) => `id=${item}`)
                            .join(', ')}`,
                    )
                }
                return await this.write(mergedData as T[], options)
            }

            // if not in transaction, open transaction like update
            const transactionId = await this.beginTransaction({
                rollback: true,
                timeout: 20_000,
            })
            await this.withTransaction(
                async (adapter, txOptions) => {
                    await adapter.insert(mergedData as T[], {
                        ...options,
                        inTransaction: true,
                        transactionId,
                    })
                },
                {
                    inTransaction: true,
                    transactionId,
                },
            )
            await this.endTransaction()
            return
        }
        return undefined
    }

    async update(
        data: Partial<T> | Partial<T>[],
        filterData?:
            | Partial<T>
            | Record<string, unknown>
            | string
            | FilterFunction<T>,
        options?: LineDbAdapterOptions,
    ): Promise<T[]> {
        this.#ensureInitialized()
        if (!options) {
            options = this.#defaultMethodsOptions
        }
        this.#transactionGuard(options)

        // Transform input data to array
        const dataArray = Array.isArray(data) ? data : [data]
        if (dataArray.length === 0) {
            return []
        }

        let mergedData: Partial<T>[] = dataArray.length === 1 ? dataArray : []

        if (dataArray.length > 1) {
            // Remove full duplicates, leaving only the last element
            const uniqueData = dataArray.reduce(
                (acc: Partial<T>[], current: Partial<T>) => {
                    const isDuplicate = acc.some(
                        (item: Partial<T>) =>
                            JSON.stringify(item) === JSON.stringify(current),
                    )
                    if (!isDuplicate) {
                        acc.push(current)
                    }
                    return acc
                },
                [],
            )

            // Group records by id for merging
            const groupedById = uniqueData.reduce(
                (acc: Map<string, Partial<T>[]>, current: Partial<T>) => {
                    const id = current.id as string
                    if (!acc.has(id)) {
                        acc.set(id, [])
                    }
                    acc.get(id)?.push(current)
                    return acc
                },
                new Map(),
            )

            // Merge records with the same id, keeping the priority of the last values
            mergedData = Array.from(groupedById.values()).map(
                (group: Partial<T>[]) => {
                    return group.reduce(
                        (acc: Partial<T>, current: Partial<T>) => ({
                            ...acc,
                            ...current,
                        }),
                        {} as Partial<T>,
                    )
                },
            )
        }

        //  this.#logTest('mergedData', mergedData)
        const allUpdatedRecords: T[] = []
        const payload = async (options?: LineDbAdapterOptions) => {
            for (const item of mergedData) {
                let existingRecords: T[] = []
                if (filterData) {
                    existingRecords = await this.readByFilter(
                        filterData,
                        options,
                    )
                    if (existingRecords.length === 0) {
                        continue
                    }
                }
                if (existingRecords.length === 0) {
                    existingRecords = await this.readByFilter(item, options)
                }

                const updatedRecords = existingRecords.map((record) => {
                    const existingRecordId = record.id

                    return {
                        ...record,
                        ...item,
                        id: existingRecordId,
                    }
                })
                for (const updatedRecord of updatedRecords) {
                    if (
                        allUpdatedRecords.some(
                            (record) => record.id === updatedRecord.id,
                        )
                    ) {
                        continue
                    }
                    allUpdatedRecords.push(updatedRecord)
                    // Эмитим событие обновления только если кэш включен
                    if (this.#hasCache()) {
                        this.#events.emit('record:update', updatedRecord)
                    }
                }
            }
            await this.write(allUpdatedRecords, options)
        }
        if (this.#inTransactionMode || options.inTransaction) {
            await payload(options)
        } else {
            const transactionId = await this.beginTransaction({
                rollback: true,

                timeout: 20_000,
            })
            await this.withTransaction(
                async (adapter, options) => {
                    await payload(options)
                },
                {
                    inTransaction: true,
                    transactionId,
                },
            )
            await this.endTransaction()
        }

        return allUpdatedRecords
    }

    async select(
        filter?:
            | FilterFunction<T>
            | Partial<T>
            | Record<string, unknown>
            | string,
        options?: LineDbAdapterOptions,
    ): Promise<T[]> {
        const cacheKey = this.#getCacheKey(filter, options)

        // Проверяем кэш только если он включен
        const cachedData = this.#getFromCache(cacheKey)
        if (cachedData) {
            return cachedData.data
        }

        this.#ensureInitialized()
        if (!options) {
            options = this.#defaultMethodsOptions.inTransaction
                ? this.#defaultMethodsOptions
                : {
                      inTransaction: false,
                      strictCompare: true,
                      filterType: 'base',
                  }
        }
        this.#transactionGuard(options)

        // Если фильтр - объект с одним полем id, используем прямой доступ к индексу
        if (
            (typeof filter === 'object' &&
                !Array.isArray(filter) &&
                Object.keys(filter).length === 1 &&
                'id' in filter) ||
            typeof filter === 'string'
        ) {
            if (typeof filter === 'string') {
                // Проверяем строку фильтра на соответствие шаблону id===value или id === value
                // Значение id может быть числовым или строковым
                const idMatch = filter.match(/id\s*===?\s*(['"]?[^'"]+['"]?)/)
                if (idMatch) {
                    // Проверяем наличие кавычек в значении id
                    const hasQuotes =
                        idMatch[1].startsWith('"') || idMatch[1].startsWith("'")
                    const idValue = hasQuotes
                        ? idMatch[1].slice(1, -1)
                        : Number(idMatch[1])
                    filter = { id: idValue }
                }
            }

            if (
                typeof filter === 'object' &&
                typeof filter.id === 'object' &&
                '$eq' in (filter?.id || {})
            ) {
                filter = {
                    id: (filter as Record<string, { $eq: string | number }>).id
                        ?.$eq,
                }
            }
            const filePositions = await LinePositionsManager.getFilePositions(
                this.#filename.toString(),
            )
            const positions = await filePositions.getPositionByDataNoLock(
                { id: (filter as Record<string, unknown>).id as string },
                (data) => [`byId:${data.id}`],
            )
            if (positions.size > 0) {
                const result = await this.#readRecords(positions)
                if (result.length > 0) {
                    // Сохраняем в кэш только если он включен
                    this.#setToCache(cacheKey, result, result.length)
                    return result
                }
            }
        }

        return filter
            ? await this.readByFilter(filter, options)
            : await this.read()
    }

    async selectWithPagination(
        filter:
            | FilterFunction<T>
            | Partial<T>
            | Record<string, unknown>
            | string,
        page: number = 1,
        limit: number = 20,
        options?: LineDbAdapterOptions,
    ): Promise<PaginatedResult<T>> {
        const cacheKey = this.#getCacheKey(filter, options)

        // 1. try to get from cache
        const cached = this.#getFromCache(cacheKey)
        let data: T[]
        let total: number

        if (cached) {
            data = cached.data
            total = cached.total
        } else {
            // 2. get all data and cache it
            data = await this.select(filter, {
                ...options,
                inTransaction: true,
            })
            total = data.length
            this.#setToCache(cacheKey, data, total)
        }

        // 3. return needed page
        const start = (page - 1) * limit
        const end = start + limit
        const paginatedData = data.slice(start, end)

        return {
            data: paginatedData,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
        }
    }

    async beginTransaction(options?: TransactionOptions): Promise<string> {
        const beginTransactionMutex = this.#beginTransactionMutex
        const defaultMutex = (
            await LinePositionsManager.getFilePositions(
                this.#filename.toString(),
            )
        ).getMutex()
        const tmpDir = os.tmpdir()
        const transactionId = crypto.randomUUID()
        const backupFile = path.join(
            tmpDir,
            `elinedb-${path.basename(
                this.#filename.toString(),
            )}.${transactionId}.backup`,
        )
        // const localMutex = options?.mutex ?? defaultMutex
        // const localMutex = options?.mutex ?? new RWMutex()
        return await beginTransactionMutex.withWriteLock<string>(
            async (): Promise<string> => {
                // if (this.#transaction) {
                const startTime = Date.now()
                const timeout = (options?.timeout ?? 5000) / 2

                while (Date.now() - startTime < timeout) {
                    if (!this.#transaction) {
                        // const endTimeToWait = Date.now()
                        // this.#logTest(
                        //     true,
                        //     'time to wait',
                        //     endTimeToWait - startTime,
                        // )
                        this.#inTransactionMode = true
                        this.#transaction = new JSONLTransaction({
                            id: transactionId,
                            mode: 'write',
                            timeout: options?.timeout ?? 10_000,
                            rollback: options?.rollback ?? true,
                            backupFile,
                            doNotDeleteBackupFile: false,
                            mutex: options?.mutex ?? defaultMutex,
                        })

                        const defaultMethodsOptions: LineDbAdapterOptions = {
                            inTransaction: true,
                            transactionId,
                        }
                        this.#defaultMethodsOptions = defaultMethodsOptions
                        return this.#transaction?.transactionId ?? '-1'
                    }
                    // Wait 100 ms before next try
                    await new Promise((resolve) => setTimeout(resolve, 1))
                }
                return '-1'
            },
            7500,
        )
    }

    async endTransaction(): Promise<boolean> {
        return await this.#endTransactionMutex.withWriteLock<boolean>(
            async (): Promise<boolean> => {
                this.#inTransactionMode = false
                this.#transaction?.clearTimeout()
                this.#transaction = null
                this.#defaultMethodsOptions = { inTransaction: false }
                await new Promise((resolve) => setTimeout(resolve, 1))
                return true
            },
            10_000,
        )
    }

    #transactionGuard(options?: LineDbAdapterOptions) {
        if (!options) {
            options = this.#defaultMethodsOptions
        }
        if (
            (this.#transaction || options.inTransaction) &&
            this.#transaction?.transactionId !== options?.transactionId
        ) {
            throw new Error(
                `Transaction Error: transaction id does not match: ${this
                    .#transaction?.transactionId} \n ${JSON.stringify(
                    options,
                )}`,
            )
        }
    }

    async withTransaction(
        callBack: (
            adapter: JSONLFile<T>,
            options?: LineDbAdapterOptions,
        ) => Promise<unknown>,
        options?: LineDbAdapterOptions,
    ): Promise<void> {
        if (!this.#transaction) {
            throw new Error('Transaction not started')
        }
        if (!options) {
            options = { ...this.#defaultMethodsOptions, inTransaction: true }
        }
        this.#transactionGuard(options)

        const filePositions = await LinePositionsManager.getFilePositions(
            this.#filename.toString(),
        )
        const mutexLocal: RWMutex =
            this.#transaction.mutex || filePositions.getMutex()

        const transactionLocal = this.#transaction

        let backupCreated = false
        const positionsBackup = new Map<
            string | number,
            (number | FilePosition)[]
        >()
        try {
            try {
                return await mutexLocal.withWriteLock(async () => {
                    if (transactionLocal?.rollback) {
                        // Сохраняем текущее состояние файла данных
                        try {
                            await fs.promises.copyFile(
                                this.#filename.toString(),
                                transactionLocal.getBackupFile(),
                            )
                            // Создаем глубокую копию карты позиций
                            for (const [
                                key,
                                positions,
                            ] of await filePositions.getAllPositionsNoLock()) {
                                const positionsDeepClone = cloneDeep(positions)
                                positionsBackup.set(key, positionsDeepClone)
                            }
                            backupCreated = true
                        } catch (err) {
                            // if file not exists, it's ok for new DB
                            if (
                                (err as NodeJS.ErrnoException).code !== 'ENOENT'
                            ) {
                                throw err
                            }
                        }
                    }
                    // call useful function
                    await callBack(this, options ?? this.#defaultMethodsOptions)
                })
            } catch (err) {
                if (transactionLocal?.rollback) {
                    // restore filePositions state
                    try {
                        await filePositions.setAllPositionsNoLock(
                            positionsBackup,
                        )
                    } catch (restoreErr) {
                        throw new Error(
                            `Failed to restore filePositions: ${restoreErr}. Original error: ${err}`,
                        )
                    }
                }
                throw new Error(
                    `Error in transaction mode. Rollback: ${
                        transactionLocal?.rollback ? 'done' : 'not done'
                    }. ${this.#collectionName}: ${err}`,
                )
            }
        } catch (err) {
            // Восстанавливаем состояние из бэкапа при ошибке
            if (backupCreated && transactionLocal?.rollback) {
                try {
                    await fs.promises.copyFile(
                        transactionLocal.getBackupFile(),
                        this.#filename.toString(),
                    )
                    // await fs.copyFile(backupFile, '/tmp/elinedb-error.err')
                } catch (restoreErr) {
                    throw new Error(
                        `Failed to restore from backup: ${restoreErr}. Original error: ${err}`,
                    )
                }
            }

            throw new Error(
                `Error in transaction mode. Rollback: ${
                    transactionLocal?.rollback ? 'done' : 'not done'
                }. ${this.#collectionName}: ${err}`,
            )
        } finally {
            this.#inTransactionMode = false

            // Удаляем временный файл
            if (
                backupCreated &&
                transactionLocal?.rollback &&
                !transactionLocal?.doNotDeleteBackupFile
            ) {
                try {
                    await fs.promises.unlink(transactionLocal.getBackupFile())
                } catch (unlinkErr) {
                    // log error of removing backup file, but not break execution
                    console.error(`Failed to remove backup file: ${unlinkErr}`)
                }
            }
        }
    }

    // Метод для очистки при уничтожении объекта
    destroy() {
        if (this.#hasCache()) {
            this.#selectCache!.unsubscribeFromEvents(this.#events)
        }
        this.#events.removeAllListeners()
    }

    // Метод для проверки наличия кэша
    #hasCache(): boolean {
        return this.#selectCache !== null
    }

    // Метод для безопасной работы с кэшем
    #getFromCache(key: string): { data: T[]; total: number } | null {
        if (!this.#hasCache()) return null
        return this.#selectCache!.get(key)
    }

    // Метод для безопасного сохранения в кэш
    #setToCache(key: string, data: T[], total: number): void {
        if (!this.#hasCache()) return
        this.#selectCache!.set(key, data, total)
    }

    // Метод для генерации ключа кэша
    #getCacheKey(
        filter?:
            | FilterFunction<T>
            | Partial<T>
            | Record<string, unknown>
            | string,
        options?: LineDbAdapterOptions,
    ): string {
        return JSON.stringify({
            filter: typeof filter === 'function' ? filter.toString() : filter,
            options,
        })
    }
}

function isPartialT<T>(
    filter: Partial<T> | Record<string, unknown> | string,
): filter is Partial<T> {
    // Если это строка, то это не Partial<T>
    if (typeof filter === 'string') {
        return false
    }

    // Если это null или undefined, то это не Partial<T>
    if (filter == null) {
        return false
    }

    // Проверяем, что все ключи в объекте соответствуют ключам типа T
    // Для этого используем keyof T
    const keys = Object.keys(filter)

    // Если объект пустой, считаем его Partial<T>
    if (keys.length === 0) {
        return true
    }

    // Проверяем, что все значения в объекте имеют тип, совместимый с T
    // Это приблизительная проверка, так как мы не можем точно определить типы во время выполнения
    return keys.every((key) => {
        const value = (filter as Record<string, unknown>)[key]
        // Проверяем, что значение не является undefined
        return value !== undefined
    })
}
