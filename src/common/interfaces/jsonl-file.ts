/* eslint-disable @typescript-eslint/no-explicit-any */
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
    idFn?: (data: T) => (string | number)[]
    decryptKey?: string // This key will be used to decrypt the file and stay it unencrypted (_cypherKey is null)
    skipInvalidLines?: boolean
}

export interface LineDbAdapter {
    id: string | number
}

export interface LineDbAdapterOptions {
    inTransaction: boolean
    transactionId?: string
    debugTag?: string
    strictCompare?: boolean
}

export interface AdapterLine<T extends LineDbAdapter> {
    init(force: boolean, options?: LineDbAdapterOptions): Promise<void>
    // read(fn?: (data: T) => boolean): Promise<T[]>
    // write(data: T | T[]): Promise<void>

    insert(data: T | T[], options?: LineDbAdapterOptions): Promise<void>
    update(
        data: Partial<T> | Partial<T>[],
        options?: LineDbAdapterOptions,
    ): Promise<void>
    delete(
        data: Partial<T> | Partial<T>[],
        options?: LineDbAdapterOptions,
    ): Promise<number>
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
