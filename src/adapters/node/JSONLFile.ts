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

import { log } from 'node:console'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { promises as fsPromises } from 'node:fs'
import { createReadStream } from 'node:fs'
import { PathLike } from 'node:fs'
import { FileHandle } from 'node:fs/promises'
import os from 'node:os'
import readline from 'node:readline'

import { RWMutex } from '@direct-dev-ru/rwmutex-ts'
import { cloneDeep } from 'lodash'
import path from 'path'

import {
    ITransaction,
    LineDbAdapterOptions,
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
import { JSONLTransaction } from '../../core/Transaction'
import { defNodeDecrypt, defNodeEncrypt } from './TextFile.js'

export interface TransactionOptions {
    rollback?: boolean
    mutex?: RWMutex
    backupFile?: string
    doNotDeleteBackupFile?: boolean
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

    #initialized = false
    #inTransactionMode = false
    #transaction: ITransaction | null = null
    #idFn: (data: T) => (string | number)[] = (data) => [`byId:${data.id}`]
    #collectionName: string
    #hashFilename: string
    #constructorOptions: JSONLFileOptions<T> = {}

    constructor(
        filename: PathLike,
        _cypherKey: string = '',
        options: JSONLFileOptions<T> = { allocSize: 256 },
    ) {
        this.#constructorOptions = options
        this.#hashFilename = crypto
            .createHash('sha256')
            .update(filename.toString())
            .digest('hex')
        this.#collectionName = options.collectionName || this.#hashFilename
        this.#filename = filename
        this.#cypherKey = _cypherKey
        this.#parse = JSON.parse
        this.#stringify = JSON.stringify
        this.#allocSize = options?.allocSize || 256

        let _decrypt = defNodeDecrypt
        let _encrypt = defNodeEncrypt
        if (options.decrypt) {
            _decrypt = options.decrypt
        }
        if (options.encrypt) {
            _encrypt = options.encrypt
        }
        // resulting decryption function
        this.#decrypt = async (
            _text,
            _cypherKey = this.#cypherKey,
        ): Promise<
            | string
            | {
                  error: string
              }
        > => {
            const texttoDecrypt = Buffer.from(_text, 'base64').toString('utf8')
            const decrypted = await _decrypt(texttoDecrypt, _cypherKey)
            if (typeof decrypted !== 'string') {
                return { error: decrypted.error }
            }
            return decrypted
        }
        // resulting encryption function
        this.#encrypt = async (
            _text,
            _cypherKey = this.#cypherKey,
        ): Promise<
            | string
            | {
                  error: string
              }
        > => {
            const encrypted = await _encrypt(_text, _cypherKey)
            if (typeof encrypted !== 'string') {
                return { error: encrypted.error }
            }
            return Buffer.from(encrypted, 'utf8').toString('base64')
        }
        if (options.idFn) {
            this.#idFn = (data) => {
                return options.idFn
                    ? [...options.idFn(data), `byId:${data.id}`]
                    : [`byId:${data.id}`]
            }
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
        this.#initialized = false
        await this.#ensureFileExists()
        const result = await this.#initReadJsonlFile(
            undefined,
            5000,
            options.inTransaction,
        )
        // this.#logTest('result in init', name, result)
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
                // this.#logTest('filePositions in init', filePositions)
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
                'JSONLFile: Необходимо вызвать init() перед использованием экземпляра',
            )
        }
    }

    #transactionGuard(options: LineDbAdapterOptions) {
        if (
            (this.#transaction || options.inTransaction) &&
            this.#transaction?.transactionId !== options?.transactionId
        ) {
            throw new Error(
                `error in Transaction - transaction id do not match: ${options.debugTag}`,
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
            // this.#logTest('updated on pos:', pos, '\nline:', line.trim())

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
            // this.#logTest('no deleted records')
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
        const MAX_ALLOC_SIZE = 65_536
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
        positions: Map<string | number, (number | FilePosition)[]>,
        filterFn?: (data: T) => boolean,
    ): Promise<T[]> {
        const result: T[] = []
        const fileHandle = await fs.promises.open(this.#filename, 'r')
        try {
            for (const [_, posArray] of positions) {
                for (const pos of posArray) {
                    const readPosition =
                        pos instanceof FilePosition ? pos.position : pos
                    if (readPosition < 0) continue // Пропускаем удаленные записи

                    const buffer = Buffer.alloc(this.#allocSize)
                    await fileHandle.read(
                        buffer,
                        0,
                        this.#allocSize,
                        readPosition,
                    )
                    const line = buffer.toString().trim()

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
            }
        } finally {
            await fileHandle.close()
        }
        return result
    }

    async beginTransaction(): Promise<string> {
        if (this.#transaction) {
            return '-1' // transaction already started
        }
        this.#inTransactionMode = true
        this.#transaction = new JSONLTransaction()
        this.#transaction.transactionId = crypto.randomUUID()
        return this.#transaction.transactionId
    }

    async endTransaction(): Promise<boolean> {
        if (!this.#transaction) {
            return false
        }
        this.#inTransactionMode = false
        this.#transaction?.clearTimeout()
        this.#transaction = null
        return true
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

        // если инициализация и пустая строка, то возврат ошибки, чтобы сжать файл
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
                new FilePosition(position, false, 'main'),
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

        // Читаем файл под блокировкой записи
        const payload = async () => {
            // если нет функции фильтрации, то очищаем позиции
            if (!fn) {
                await filePositions.clearNoLock()
            }
            for await (const line of rl) {
                let lineData = line.trim()
                if (line.length > maxLineLength && lineData.length > 0) {
                    maxLineLength = line.length
                }
                if (
                    lineData.length > 0 &&
                    line.length + 1 !== this.#allocSize
                ) {
                    this.#allocSize = line.length + 1
                    this.#logTest(true, 'allocSize::::>', this.#allocSize)
                }
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
                    // this.#logTest(true, 'allocSize::::>', this.#allocSize)
                    // this.#logTest(true, 'line.length::::>', line.length)
                    // this.#logTest(
                    //     true,
                    //     'getPositionsNoLock()::::>',
                    //     await this.getPositionsNoLock(),
                    // )
                }

                let obj: T = { id: 'invalid_id' } as T
                // если инициализация и пустая строка, то возврат ошибки, чтобы сжать файл
                if (lineData.length === 0 && !this.#initialized) {
                    this.$hasDeletedRecords = true
                    return { error: 'need compress file' }
                }
                try {
                    // если указан ключ шифрования, то пробуем расшифровать
                    if (this.#cypherKey) {
                        try {
                            // Пробуем расшифровать
                            const decrypted = await this.#decrypt(
                                lineData,
                                this.#cypherKey,
                            )
                            if (typeof decrypted === 'string') {
                                lineData = decrypted
                            } else {
                                // Если расшифровка не удалась, пробуем прочитать как обычный JSON
                                try {
                                    obj = this.#parse(lineData)
                                    // Если JSON валидный, значит это незашифрованные данные
                                    needRewrite = true
                                } catch (err) {
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
                        // возможно не смогли распарсить так как строка зашифрована, а мы не указали ключ шифрования
                        if (
                            !this.#cypherKey &&
                            this.#constructorOptions?.decryptKey
                        ) {
                            try {
                                // Пробуем расшифровать
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
                                    needRewrite = true
                                    continue
                                }
                                return {
                                    error: `Error parsing line: ${line}: ${err}`,
                                }
                            }
                        }
                    }
                    // если после попытки распарсить строку, id все еще invalid_id, то возвращаем ошибку
                    if (obj.id === 'invalid_id') {
                        if (this.#constructorOptions.skipInvalidLines) {
                            needRewrite = true
                            continue
                        }
                        return {
                            error: `Error parsing line: ${line}`,
                        }
                    }
                    // если есть функция фильтрации и она не проходит, то пропускаем
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
                        // если есть что проиндексировать, то добавляем позицию в индекс
                        await filePositions.setPositionByDataNoLock(
                            obj,
                            new FilePosition(position, false, 'main'),
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
        filterFn?: (data: Partial<T>) => boolean,
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
                    // если указан ключ шифрования, то пробуем расшифровать
                    if (this.#cypherKey) {
                        try {
                            // Пробуем расшифровать
                            const decrypted = await this.#decrypt(
                                lineData,
                                this.#cypherKey,
                            )
                            if (typeof decrypted === 'string') {
                                lineData = decrypted
                            } else {
                                // Если расшифровка не удалась, пробуем прочитать как обычный JSON
                                try {
                                    obj = this.#parse(lineData)
                                    // Если JSON валидный, значит это незашифрованные данные
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
                        // возможно не смогли распарсить так как строка зашифрована, а мы не указали ключ шифрования
                        if (
                            !this.#cypherKey &&
                            this.#constructorOptions?.decryptKey
                        ) {
                            try {
                                // Пробуем расшифровать
                                const decrypted = await this.#decrypt(
                                    lineData,
                                    this.#constructorOptions.decryptKey,
                                )
                                if (typeof decrypted === 'string') {
                                    lineData = decrypted
                                }
                                obj = this.#parse(lineData)
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
                    // если после попытки распарсить строку, id = invalid_id, то возвращаем ошибку если не настроен skipInvalidLines
                    if (obj.id === 'invalid_id') {
                        if (this.#constructorOptions.skipInvalidLines) {
                            continue
                        }
                        return {
                            error: `Error parsing line: ${line}`,
                        }
                    }
                    // если есть функция фильтрации и она не проходит, то пропускаем
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

    async delete(
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
                `error in Transaction - transaction id do not match: ${options.debugTag}`,
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
        fn?: (data: T) => boolean,
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
            // this.#logTest('read allPositions', allPositions)
            const filteredPositionsById = new Map(
                Array.from(allPositions.entries()).filter(([key, posArray]) =>
                    key.toString().includes('byId:'),
                ),
            )

            // this.#logTest('read filteredPositions', filteredPositionsById)
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
            // this.#logTest('newAllocSize', newAllocSize)
            // this.#logTest(
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

    async write(
        data: T | T[],
        options: LineDbAdapterOptions = {
            inTransaction: false,
        },
        // inTransaction: boolean = false,
        // transactionId?: string,
        // debugTag?: string,
    ): Promise<void> {
        this.#ensureInitialized()

        this.#transactionGuard(options)

        // error throwing for test
        if (options.debugTag === 'throwError') {
            // await new Promise((resolve) => setTimeout(resolve, 300))
            throw new Error(`error in Transaction: ${options.debugTag}`)
        }

        const filePositions =
            this.#inTransactionMode || options.inTransaction
                ? await LinePositionsManager.getFilePositionsNoLock(
                      this.#filename.toString(),
                  )
                : await LinePositionsManager.getFilePositions(
                      this.#filename.toString(),
                  )

        // Преобразуем одиночный объект в массив
        const dataArray = Array.isArray(data) ? data : [data]

        const payload = async () => {
            // Проверяем существование файла и открываем с нужным флагом
            // step 1: update existing records

            const existingIds =
                await filePositions.getPositionsByArrayOfDataNoLock(dataArray)

            // check if file exists and open it with r+ flag
            const fileExists = await this.#fileExists(this.#filename.toString())
            const fileHandle = await fs.promises.open(
                this.#filename,
                fileExists ? 'r+' : 'w',
            )
            try {
                // Обрабатываем существующие записи
                for (const [posId, existingPositions] of existingIds) {
                    // get item from dataArray by id
                    let id = posId
                    if (id.toString().includes(':')) {
                        id = id.toString().split(':')[1]
                    }
                    const item = dataArray.find((item) => item.id === id)
                    if (!item) {
                        throw new Error(
                            `Item with id ${id} not found in dataArray`,
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
                    // this.#logTest('mark-1 write in transaction mode: ', debugTag)

                    await fileHandleAppend.write(resultLine)
                    await filePositions.setPositionByDataNoLock(
                        item,
                        new FilePosition(position, false, 'main'),
                        this.#idFn,
                    )
                    position += resultLine.length
                    // this.#logTest('position in write append step:', position)
                }
            } finally {
                if (fileHandleAppend) {
                    await fileHandleAppend.close()
                }
            }
        }

        if (this.#inTransactionMode || options.inTransaction) {
            // this.#logTest('end write in transaction mode: ', debugTag, result)
            return await payload()
        }
        // this.#logTest('end write in no transaction mode: ', debugTag, result)
        return await filePositions.getMutex().withWriteLock(payload)
    }

    async #readByIndexedData(
        data: Partial<T>,
        options: LineDbAdapterOptions = {
            inTransaction: false,
            strictCompare: false,
        },
    ): Promise<T[]> {
        this.#ensureInitialized()
        this.#transactionGuard(options)

        const filePositions =
            this.#inTransactionMode || options.inTransaction
                ? await LinePositionsManager.getFilePositionsNoLock(
                      this.#filename.toString(),
                  )
                : await LinePositionsManager.getFilePositions(
                      this.#filename.toString(),
                  )

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
            // this.#logTest('Reading data by positions:', positions)
            return this.#readRecords(positions)
        }
        if (this.#inTransactionMode || options.inTransaction) {
            // запуск без блокировок
            return await payload()
        }
        return await filePositions.getMutex().withReadLock(payload)
    }

    async readByData(
        data: Partial<T>,
        options: LineDbAdapterOptions = {
            inTransaction: false,
            strictCompare: true,
        },
    ): Promise<T[]> {
        this.#ensureInitialized()

        this.#transactionGuard(options)

        // Сначала пробуем найти по индексу
        const indexedResults = await this.#readByIndexedData(data, options)
        // this.#logTest('indexedResults', indexedResults)

        // Если нашли результаты по индексу, возвращаем их
        if (indexedResults.length > 0) {
            this.#logTest('Found results by index:', indexedResults.length)
            return indexedResults
        }

        // Если по индексу ничего не нашли, читаем все записи и фильтруем
        // this.#logTest('No results by index, reading all records')

        const filterFn = (record: Partial<T>) => {
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
        }

        const allFilteredRecords = await this.#readAllFromFile(
            filterFn,
            options,
        )
        if (!Array.isArray(allFilteredRecords)) {
            throw new Error(allFilteredRecords.error)
        }

        return allFilteredRecords
    }

    async withTransaction(
        fn: (adapter: JSONLFile<T>) => Promise<unknown>,
        options: TransactionOptions = {},
    ): Promise<void> {
        const filePositions = await LinePositionsManager.getFilePositions(
            this.#filename.toString(),
        )
        const mutexLocal: RWMutex = options?.mutex || filePositions.getMutex()
        this.#inTransactionMode = true

        if (!('rollback' in options)) {
            options.rollback = true
        }
        if (!('backupFile' in options)) {
            options.backupFile = undefined
        }
        if (!('doNotDeleteBackupFile' in options)) {
            options.doNotDeleteBackupFile = false
        }
        // this.#logTest('options', options)
        // Создаем временный файл для бэкапа в системной папке для временных файлов
        const tmpDir = os.tmpdir()
        // Генерируем случайный идентификатор для уникальности имени файла
        const entropy = crypto.randomBytes(8).toString('hex')
        const backupFile =
            options?.backupFile ||
            path.join(
                tmpDir,
                `elinedb-${path.basename(
                    this.#filename.toString(),
                )}-${entropy}-${Date.now()}.backup`,
            )
        let backupCreated = false
        const positionsBackup = new Map<
            string | number,
            (number | FilePosition)[]
        >()
        try {
            try {
                return await mutexLocal.withWriteLock(async () => {
                    if (options?.rollback) {
                        // Сохраняем текущее состояние файла данных
                        try {
                            await fs.promises.copyFile(
                                this.#filename.toString(),
                                backupFile,
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
                            // Если файл не существует, это нормально для новой БД
                            if (
                                (err as NodeJS.ErrnoException).code !== 'ENOENT'
                            ) {
                                throw err
                            }
                        }
                    }
                    // вызов функции полезной функции
                    await fn(this)
                })
            } catch (err) {
                if (options?.rollback) {
                    // Восстанавливаем состояние filePositions
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
                    `error in transaction mode. rollback: ${
                        options?.rollback ? 'done' : 'not done'
                    }. ${this.#collectionName}: ${err}`,
                )
            }
        } catch (err) {
            // Восстанавливаем состояние из бэкапа при ошибке
            if (backupCreated && options?.rollback) {
                try {
                    await fs.promises.copyFile(
                        backupFile,
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
                `error in transaction mode. rollback: ${
                    options?.rollback ? 'done' : 'not done'
                }. ${this.#collectionName}: ${err}`,
            )
        } finally {
            this.#inTransactionMode = false

            // Удаляем временный файл
            if (
                backupCreated &&
                options?.rollback &&
                !options?.doNotDeleteBackupFile
            ) {
                try {
                    await fs.promises.unlink(backupFile)
                } catch (unlinkErr) {
                    // Логируем ошибку удаления, но не прерываем выполнение
                    console.error(`Failed to remove backup file: ${unlinkErr}`)
                }
            }
        }
    }
}
