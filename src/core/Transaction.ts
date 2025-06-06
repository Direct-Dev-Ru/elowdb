/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { RWMutex } from '@direct-dev-ru/rwmutex-ts'

import { ITransaction } from '../common/interfaces/jsonl-file'

export class JSONLTransaction implements ITransaction {
    transactionMode: 'read' | 'write'
    transactionId: string
    timeoutMs: number
    timeoutId: NodeJS.Timeout
    rollback: boolean
    backupFile: string
    doNotDeleteBackupFile: boolean
    mutex: RWMutex

    constructor(
        options: {
            mode: 'read' | 'write'
            id: string
            timeout: number
            rollback: boolean
            backupFile: string
            doNotDeleteBackupFile: boolean
            mutex: RWMutex
        } = {
            mode: 'write',
            id: crypto.randomUUID(),
            timeout: 10000,
            rollback: false,
            backupFile: '',
            doNotDeleteBackupFile: false,
            mutex: new RWMutex(),
        },
    ) {
        this.transactionMode = options.mode
        this.mutex = options.mutex
        this.transactionId = options.id
        this.timeoutMs = options.timeout
        this.rollback = options.rollback
        this.backupFile = options.backupFile
        this.doNotDeleteBackupFile = options.doNotDeleteBackupFile
        this.timeoutId = setTimeout(() => {
            throw new Error(`Transaction timeout after ${options.timeout} ms`)
        }, options.timeout)
    }

    /**
     * Очищает таймаут транзакции
     */
    clearTimeout(): void {
        clearTimeout(this.timeoutId)
    }

    /**
     * Проверяет, является ли транзакция активной
     */
    isActive(): boolean {
        return this.timeoutId !== null
    }

    /**
     * Проверяет, является ли транзакция режимом чтения
     */
    isReadMode(): boolean {
        return this.transactionMode === 'read'
    }

    /**
     * Проверяет, является ли транзакция режимом записи
     */
    isWriteMode(): boolean {
        return this.transactionMode === 'write'
    }

    /**
     * Проверяет, требуется ли откат транзакции при ошибке
     */
    shouldRollback(): boolean {
        return this.rollback
    }

    /**
     * Проверяет, нужно ли сохранять резервную копию
     */
    shouldKeepBackup(): boolean {
        return this.doNotDeleteBackupFile
    }

    /**
     * Получает путь к файлу резервной копии
     */
    getBackupFile(): string {
        return this.backupFile
    }

    /**
     * Устанавливает путь к файлу резервной копии
     */
    setBackupFile(path: string): void {
        this.backupFile = path
    }
}
