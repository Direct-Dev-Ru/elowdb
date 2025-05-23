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
import { promises as fs } from 'node:fs'
import { createReadStream } from 'node:fs'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import readline from 'node:readline'

import { RWMutex } from '@direct-dev-ru/rwmutex-ts'
import { PathLike } from 'fs'
import path from 'path'

import { LineDbAdapter } from '../../core/LineDbv2.js'
import { AdapterLine } from '../../core/Low.js'
import { defNodeDecrypt, defNodeEncrypt } from './TextFile.js'

export interface TransactionOptions {
    rollback?: boolean
    mutex?: RWMutex
    backupFile?: string
    doNotDeleteBackupFile?: boolean
}

export class FilePositions {
    private positions: Map<string | number, number[]> = new Map()
    private mutex = new RWMutex()

    getMutex(): RWMutex {
        return this.mutex
    }

    async getPosition(id: string | number): Promise<number[] | undefined> {
        return await this.mutex.withReadLock(async () => {
            return this.positions.get(id)
        })
    }

    async getPositionNoLock(
        id: string | number,
    ): Promise<number[] | undefined> {
        return this.positions.get(id)
    }

    async setPosition(id: string | number, position: number): Promise<void> {
        await this.mutex.withWriteLock(async () => {
            const positions = this.positions.get(id) || []
            positions.push(position)
            this.positions.set(id, positions)
        })
    }

    async setPositionNoLock(
        id: string | number,
        position: number,
    ): Promise<void> {
        const positions = this.positions.get(id) || []
        positions.push(position)
        this.positions.set(id, positions)
    }

    async replacePositionNoLock(
        oldPosition: number,
        newPosition: number,
    ): Promise<void> {
        // Проходим по всем записям в карте
        for (const [currentId, positions] of this.positions.entries()) {
            const index = positions.indexOf(oldPosition)
            if (index !== -1) {
                positions[index] = newPosition
                this.positions.set(currentId, positions)
            }
        }
    }
    async replacePosition(
        id: string | number,
        oldPosition: number,
        newPosition: number,
    ): Promise<void> {
        await this.mutex.withWriteLock(async () => {
            await this.replacePositionNoLock(oldPosition, newPosition)
        })
    }

    async clear(): Promise<void> {
        await this.mutex.withWriteLock(async () => {
            this.positions.clear()
        })
    }

    async clearNoLock(): Promise<void> {
        this.positions.clear()
    }

    async getAllPositions(): Promise<Map<string | number, number[]>> {
        return await this.mutex.withReadLock(async () => {
            return this.positions
        })
    }

    async getAllPositionsNoLock(): Promise<Map<string | number, number[]>> {
        return this.positions
    }

    async setAllPositions(
        positions: Map<string | number, number[]>,
    ): Promise<void> {
        await this.mutex.withWriteLock(async () => {
            this.positions = positions
        })
    }

    async setAllPositionsNoLock(
        positions: Map<string | number, number[]>,
    ): Promise<void> {
        this.positions = positions
    }

    async getPositionByData<T extends { id: string | number }>(
        data: T,
        timeoutMs?: number,
        idFn?: (data: T) => (string | number)[],
    ): Promise<Map<string | number, number[]>> {
        return await this.mutex.withReadLock(async () => {
            const ids = idFn ? idFn(data) : [`byId:${data.id}`]
            const result = new Map<string | number, number[]>()
            for (const id of ids) {
                const positions = this.positions.get(id)
                if (positions) {
                    result.set(id, positions)
                }
            }
            return result
        }, timeoutMs)
    }

    async getPositionByDataNoLock<T extends LineDbAdapter>(
        data: T,
        idFn?: (data: T) => (string | number)[],
    ): Promise<Map<string | number, number[]>> {
        const ids = idFn ? idFn(data) : [`byId:${data.id}`]
        const result = new Map<string | number, number[]>()
        for (const id of ids) {
            const positions = this.positions.get(id)
            if (positions) {
                result.set(id, positions)
            }
        }
        return result
    }

    async setPositionByData<T extends { id: string | number }>(
        data: T,
        position: number,
        timeoutMs?: number,
        idFn?: (data: T) => (string | number)[],
    ): Promise<void> {
        await this.mutex.withWriteLock(async () => {
            const ids = idFn ? idFn(data) : [`byId:${data.id}`]
            for (const id of ids) {
                const positions = this.positions.get(id) || []
                if (!positions.includes(position)) {
                    positions.push(position)
                    this.positions.set(id, positions)
                }
            }
        }, timeoutMs)
    }

    async setPositionByDataNoLock<T extends { id: string | number }>(
        data: T,
        position: number,
        idFn?: (data: T) => (string | number)[],
    ): Promise<void> {
        const ids = idFn ? idFn(data) : [`byId:${data.id}`]
        for (const id of ids) {
            const positions = this.positions.get(id) || []
            if (!positions.includes(position)) {
                positions.push(position)
                this.positions.set(id, positions)
            }
        }
    }
}

export class LinePositionsManager {
    private static globalMutex = new RWMutex()
    private static filePositions: Map<string, FilePositions> = new Map()

    private constructor() {}

    static async getFilePositions(filename: string): Promise<FilePositions> {
        return await this.globalMutex.withReadLock(async () => {
            if (!this.filePositions.has(filename)) {
                this.filePositions.set(filename, new FilePositions())
            }
            return this.filePositions.get(filename)!
        })
    }

    static async getFilePositionsNoLock(
        filename: string,
    ): Promise<FilePositions> {
        if (!this.filePositions.has(filename)) {
            this.filePositions.set(filename, new FilePositions())
        }
        return this.filePositions.get(filename)!
    }

    static async clearFilePositions(filename: string): Promise<void> {
        const filePos = await this.getFilePositions(filename)
        await filePos.clear()
    }

    static async clearFilePositionsNoLock(filename: string): Promise<void> {
        const filePos = await this.getFilePositionsNoLock(filename)
        return filePos.clearNoLock()
    }

    static async removeFile(filename: string): Promise<void> {
        await this.globalMutex.withWriteLock(async () => {
            this.filePositions.delete(filename)
        })
    }

    static async removeFileNoLock(filename: string): Promise<void> {
        this.filePositions.delete(filename)
    }
}

// export class JSONLFile<T extends { id: string | number }>
export class JSONLFile<T extends LineDbAdapter> implements AdapterLine<T> {
    #parse: (str: string) => T
    #stringify: (data: T) => string
    #allocSize: number = 2048
    #padding: number = 512
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
    #idFn: (data: T) => (string | number)[] = (data) => [`byId:${data.id}`]
    #collectionName: string
    #hashFilename: string

    constructor(
        filename: PathLike,
        _cypherKey: string = '',
        options: {
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
            padding?: number
            idFn?: (data: T) => (string | number)[]
        } = {},
    ) {
        this.#hashFilename = crypto
            .createHash('sha256')
            .update(filename.toString())
            .digest('hex')
        this.#collectionName = options.collectionName || this.#hashFilename
        this.#filename = filename
        this.#cypherKey = _cypherKey
        this.#parse = JSON.parse
        this.#stringify = JSON.stringify
        if (options.allocSize) {
            this.#allocSize = options.allocSize
        }
        if (options.padding) {
            this.#padding = options.padding
        }
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
        inTransaction: boolean = false,
    ): Promise<void> {
        if (this.#initialized && !force) {
            return
        }
        await this.#ensureFileExists()
        const result = await this.readJsonlFile(undefined, 5000, inTransaction)
        // this.#logTest('result in init', name, result)
        if (typeof result === 'object' && 'error' in result) {
            await this.#compressFile(inTransaction) // проводим сжатие файла
            // обновляем индекс
            await this.readJsonlFile(undefined, 5000, inTransaction)
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

    async #updateExistingRecord(
        fileHandle: fs.FileHandle,
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
            this.#logTest('no deleted records')
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

            for await (const line of rl) {
                const trimmedLine = line.trim()
                if (trimmedLine.length === 0) {
                    continue
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
            const fileHandle = await fs.open(this.#filename, 'w')
            try {
                for (const record of validRecords) {
                    const line = await this.#prepareLine(record)
                    await fileHandle.write(Buffer.from(line))
                }
            } finally {
                await fileHandle.close()
            }
        }
        return this.#inTransactionMode || inTransaction
            ? await payload()
            : await filePositions.getMutex().withWriteLock(payload, 10000)
    }

    async #ensureFileExists(): Promise<void> {
        return fs
            .access(this.#filename)
            .catch(() => fs.writeFile(this.#filename, ''))
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
        return line + ' '.repeat(this.#allocSize - line.length - 1) + '\n'
    }

    #logTest(...args: unknown[]): void {
        if (process.env.NODE_ENV === 'test') {
            console.log(...args)
        }
    }

    async #readRecords(
        positions: Map<string | number, number[]>,
    ): Promise<T[]> {
        const result: T[] = []
        const fileHandle = await fs.open(this.#filename, 'r')
        try {
            for (const [_, posArray] of positions) {
                for (const pos of posArray) {
                    if (pos < 0) continue // Пропускаем удаленные записи

                    const buffer = Buffer.alloc(this.#allocSize)
                    await fileHandle.read(buffer, 0, this.#allocSize, pos)
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

    async readJsonlFile(
        fn?: (data: T) => boolean,
        timeoutMs: number = 1000,
        inTransaction: boolean = false,
    ): Promise<T[] | { error: string }> {
        const result: T[] = []
        let position = 0

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
                if (lineData.length === 0) {
                    this.$hasDeletedRecords = true
                    return { error: 'need compress file' }
                }
                try {
                    // расшифровываем если нужно
                    if (this.#cypherKey) {
                        const decrypted = await this.#decrypt(
                            lineData,
                            this.#cypherKey,
                        )
                        if (typeof lineData !== 'string') {
                            return {
                                error: `Error decrypting line: ${line}`,
                            }
                        }
                        lineData = decrypted as string
                    }
                    // парсим строку
                    const obj = this.#parse(lineData)
                    // если есть функция фильтрации и она не проходит, то пропускаем
                    if (fn && !fn(obj)) {
                        position += line.length + 1 // +1 for newline
                        continue
                    }
                    // calculate id key for index
                    const id = this.#idFn(obj)
                    if (id.length > 0) {
                        // если есть что проиндексировать, то добавляем позицию в индекс
                        await filePositions.setPositionByDataNoLock(
                            obj,
                            position,
                            this.#idFn,
                        )
                    }
                    result.push(obj)
                } catch (err) {
                    return { error: `Error parsing line: ${line}: ${err}` }
                }
                position += line.length + 1 // +1 for newline
            }
        }

        const readResult =
            this.#inTransactionMode || inTransaction
                ? await payload()
                : await filePositions
                      .getMutex()
                      .withWriteLock(payload, timeoutMs)

        if (
            readResult &&
            typeof readResult === 'object' &&
            'error' in readResult
        ) {
            return readResult
        }
        return result
    }

    async delete(
        data: Partial<T> | Partial<T>[],
        inTransaction: boolean = false,
    ): Promise<number> {
        this.#ensureInitialized()
        const filePositions =
            this.#inTransactionMode || inTransaction
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

                if (positions.size > 0) {
                    const fileHandle = await fs.open(this.#filename, 'r+')
                    try {
                        // this.#logTest('filePositions before', filePositions)
                        for (const [id, posArray] of positions) {
                            for (const pos of posArray) {
                                // Заполняем строку пробелами
                                const emptyLine = `${' '.repeat(
                                    this.#allocSize - 1,
                                )}\n`
                                await fileHandle.write(
                                    Buffer.from(emptyLine),
                                    0,
                                    emptyLine.length,
                                    pos,
                                )
                                // this.#logTest(
                                //     'filePositions before',
                                //     filePositions,
                                // )
                                await filePositions.replacePositionNoLock(
                                    pos,
                                    -100,
                                )
                                deletedCount++
                                // this.#logTest(
                                //     'filePositions after',
                                //     filePositions,
                                // )
                                this.$hasDeletedRecords = true
                            }
                            // this.#logTest('filePositions after', filePositions)
                        }
                        return deletedCount
                    } finally {
                        await fileHandle.close()
                    }
                }
            }
            return deletedCount
        }
        if (this.#inTransactionMode || inTransaction) {
            // запуск без блокировок
            return await payload()
        }
        return await filePositions.getMutex().withWriteLock(payload)
    }

    async read(
        fn?: (data: T) => boolean,
        inTransaction: boolean = false,
    ): Promise<T[]> {
        this.#ensureInitialized()
        const filePositions =
            this.#inTransactionMode || inTransaction
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
            this.#inTransactionMode || inTransaction
                ? await payload()
                : await filePositions.getMutex().withReadLock(payload)

        if (fn) {
            return result.filter(fn)
        }
        return result
    }

    async write(
        data: T | T[],
        inTransaction: boolean = false,
        debugTag?: string,
    ): Promise<void> {
        this.#ensureInitialized()
        // error throwing for test
        if (debugTag === 'test-5') {
            // await new Promise((resolve) => setTimeout(resolve, 300))
            this.#logTest('error in Transaction: ', debugTag)
            throw new Error(`error in Transaction: ${debugTag}`)
        }

        const filePositions =
            this.#inTransactionMode || inTransaction
                ? await LinePositionsManager.getFilePositionsNoLock(
                      this.#filename.toString(),
                  )
                : await LinePositionsManager.getFilePositions(
                      this.#filename.toString(),
                  )

        // Преобразуем одиночный объект в массив
        const dataArray = Array.isArray(data) ? data : [data]

        const payload = async () => {
            for (const item of dataArray) {
                // Получаем позицию из индекса byId:
                const positions = await filePositions.getPositionByDataNoLock(
                    item,
                    (data) => {
                        return [`byId:${data.id}`]
                    },
                )

                let line = this.#stringify(item)

                if (this.#cypherKey) {
                    const encrypted = await this.#encrypt(line, this.#cypherKey)
                    if (typeof encrypted !== 'string') {
                        throw new Error('Encryption failed')
                    }
                    line = encrypted
                }

                // Проверяем длину строки
                if (line.length > this.#allocSize - 1) {
                    // -1 для символа перевода строки
                    throw new Error(
                        `Line length (${line.length}) exceeds allocSize (${
                            this.#allocSize
                        })`,
                    )
                }

                // Выравниваем длину строки до allocSize
                const padding = `${' '.repeat(
                    this.#allocSize - line.length - 1,
                )}\n`
                line += padding
                // this.#logTest('mark-1 write in transaction mode: ', debugTag)
                if (positions.size > 0) {
                    // Если позиции найдены, обновляем существующие записи
                    // Проверяем существование файла
                    const fileExists = await this.#fileExists(
                        this.#filename.toString(),
                    )

                    const fileHandle = await fs.open(
                        this.#filename,
                        fileExists ? 'r+' : 'w',
                    )
                    try {
                        for (const [_, posArray] of positions) {
                            for (const pos of posArray) {
                                const result = await this.#updateExistingRecord(
                                    fileHandle,
                                    pos,
                                    line,
                                )
                                if (result === 'error') {
                                    throw new Error(
                                        'Error updating existing record',
                                    )
                                }
                            }
                        }
                    } finally {
                        await fileHandle.close()
                    }
                } else {
                    // Если позиции не найдены, добавляем в конец файла
                    // Проверяем существование файла

                    const fileExists = await this.#fileExists(
                        this.#filename.toString(),
                    )

                    const fileHandle = await fs.open(
                        this.#filename,
                        fileExists ? 'a' : 'w',
                    )
                    try {
                        const stats = await fileHandle.stat()
                        const position = stats.size
                        await fileHandle.write(line)
                        await filePositions.setPositionByDataNoLock(
                            item,
                            position,
                            this.#idFn,
                        )
                    } finally {
                        await fileHandle.close()
                    }
                }
            }
        }
        if (this.#inTransactionMode || inTransaction) {
            // запуск без блокировок
            // this.#logTest('start write in transaction mode: ', debugTag)
            const result = await payload()
            // this.#logTest('end write in transaction mode: ', debugTag, result)
            return result
        }
        // запуск с блокировкой - не в транзакции
        // this.#logTest('start write in no transaction mode: ', debugTag)
        const result = await filePositions.getMutex().withWriteLock(payload)
        // this.#logTest('end write in no transaction mode: ', debugTag, result)
        return result
    }

    async #readByIndexedData(
        data: Partial<T>,
        inTransaction: boolean = false,
    ): Promise<T[]> {
        this.#ensureInitialized()
        const filePositions =
            this.#inTransactionMode || inTransaction
                ? await LinePositionsManager.getFilePositionsNoLock(
                      this.#filename.toString(),
                  )
                : await LinePositionsManager.getFilePositions(
                      this.#filename.toString(),
                  )

        // Создаем временный объект с id для поиска
        const searchData = { ...data } as T
        if (!searchData.id && data.id) {
            searchData.id = data.id
        }
        // полезная нагрузка
        const payload = async () => {
            const positions = await filePositions.getPositionByDataNoLock(
                searchData,
                this.#idFn,
            )
            // this.#logTest('Reading data by positions:', positions)
            return this.#readRecords(positions)
        }
        if (this.#inTransactionMode || inTransaction) {
            // запуск без блокировок
            return await payload()
        }
        return await filePositions.getMutex().withReadLock(payload)
    }

    async readByData(
        data: Partial<T>,
        options?: { strictCompare?: boolean; inTransaction?: boolean },
        inTransaction: boolean = false,
    ): Promise<T[]> {
        this.#ensureInitialized()

        // Сначала пробуем найти по индексу
        const indexedResults = await this.#readByIndexedData(
            data,
            this.#inTransactionMode || inTransaction,
        )
        // this.#logTest('indexedResults', indexedResults)

        // Если нашли результаты по индексу, возвращаем их
        if (indexedResults.length > 0) {
            // this.#logTest('Found results by index:', indexedResults.length)
            return indexedResults
        }

        // Если по индексу ничего не нашли, читаем все записи и фильтруем
        // this.#logTest('No results by index, reading all records')
        const allRecords = await this.readJsonlFile(
            undefined,
            5000,
            this.#inTransactionMode || options?.inTransaction,
        )
        if (!Array.isArray(allRecords)) {
            throw new Error(allRecords.error)
        }

        // Фильтруем записи по всем полям из data
        return allRecords.filter((record) => {
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

    async withTransaction(
        fn: (adapter: JSONLFile<T>) => Promise<unknown>,
        options: TransactionOptions = {},
    ): Promise<void> {
        const filePositions = await LinePositionsManager.getFilePositions(
            this.#filename.toString(),
        )
        const mutexLocal = options?.mutex || filePositions.getMutex()
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
        this.#logTest('options', options)
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
        const positionsBackup = new Map<string | number, number[]>()
        try {
            try {
                return await mutexLocal.withWriteLock(async () => {
                    if (options?.rollback) {
                        // Сохраняем текущее состояние файла
                        try {
                            await fs.copyFile(
                                this.#filename.toString(),
                                backupFile,
                            )
                            // Создаем глубокую копию карты позиций
                            for (const [
                                key,
                                positions,
                            ] of await filePositions.getAllPositionsNoLock()) {
                                positionsBackup.set(key, [...positions])
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
                    await fs.copyFile(backupFile, this.#filename.toString())
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
                    await fs.unlink(backupFile)
                } catch (unlinkErr) {
                    // Логируем ошибку удаления, но не прерываем выполнение
                    console.error(`Failed to remove backup file: ${unlinkErr}`)
                }
            }
        }
    }
}
