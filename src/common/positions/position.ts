/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { RWMutex } from '@direct-dev-ru/rwmutex-ts'

import { LineDbAdapter } from '../../core/LineDbv2'

export class FilePosition {
    private _position: number
    private _isDeleted?: boolean
    private _partition?: string | number
    constructor(
        position: number,
        isDeleted?: boolean,
        partition?: string | number,
    ) {
        this._position = position
        this._isDeleted = isDeleted
        this._partition = partition
    }

    get position(): number {
        return this._position
    }

    set position(position: number) {
        this._position = position
    }

    get isDeleted(): boolean {
        return this._isDeleted as boolean
    }
    set isDeleted(isDeleted: boolean) {
        this._isDeleted = isDeleted
    }

    get partition(): string | number {
        return this._partition as string | number
    }

    set partition(partition: string | number) {
        this._partition = partition
    }
}

export class FilePositions {
    private positions: Map<string | number, (number | FilePosition)[]> =
        new Map()
    private mutex = new RWMutex()

    getMutex(): RWMutex {
        return this.mutex
    }

    async getPosition(
        id: string | number,
    ): Promise<(number | FilePosition)[] | undefined> {
        return await this.mutex.withReadLock(async () => {
            return this.positions.get(id)
        })
    }

    async getPositionNoLock(
        id: string | number,
    ): Promise<(number | FilePosition)[] | undefined> {
        return this.positions.get(id)
    }

    async setPosition(
        id: string | number,
        position: number | FilePosition,
    ): Promise<void> {
        await this.mutex.withWriteLock(async () => {
            const positions = this.positions.get(id) || []
            positions.push(position)
            this.positions.set(id, positions)
        })
    }

    async setPositionNoLock(
        id: string | number,
        position: number | FilePosition,
    ): Promise<void> {
        const positions = this.positions.get(id) || []
        positions.push(position)
        this.positions.set(id, positions)
    }

    async recalculatePositionNoLock(k: number = 2): Promise<void> {
        // Проходим по всем записям в карте
        for (const [currentId, positions] of this.positions.entries()) {
            for (let index = 0; index < positions.length; index++) {
                let position = positions[index]
                if (position instanceof FilePosition) {
                    position.position *= k
                } else {
                    position *= k
                }
                positions[index] = position
            }
            this.positions.set(currentId, positions)
        }
    }

    async replacePositionNoLock(
        oldPosition: number | FilePosition,
        newPosition: number | FilePosition,
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
        oldPosition: number | FilePosition,
        newPosition: number | FilePosition,
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

    async getAllPositions(
        idxName?: string,
    ): Promise<Map<string | number, (number | FilePosition)[]>> {
        return await this.mutex.withReadLock(async () => {
            return this.getAllPositionsNoLock(idxName)
        })
    }

    async getAllPositionsNoLock(
        idxName?: string,
    ): Promise<Map<string | number, (number | FilePosition)[]>> {
        if (!idxName) {
            return this.positions
        }
        const result = new Map<string | number, (number | FilePosition)[]>()
        for (const [id, positions] of this.positions.entries()) {
            if (idxName && !id.toString().includes(idxName)) {
                continue
            }
            result.set(id, positions)
        }
        return result
    }

    async setAllPositions(
        positions: Map<string | number, (number | FilePosition)[]>,
    ): Promise<void> {
        await this.mutex.withWriteLock(async () => {
            this.positions = positions
        })
    }

    async setAllPositionsNoLock(
        positions: Map<string | number, (number | FilePosition)[]>,
    ): Promise<void> {
        this.positions = positions
    }

    async getPositionByData<T extends { id: string | number }>(
        data: T,
        timeoutMs?: number,
        idFn?: (data: T) => (string | number)[],
    ): Promise<Map<string | number, (number | FilePosition)[]>> {
        return await this.mutex.withReadLock(async () => {
            const ids = idFn ? idFn(data) : [`byId:${data.id}`]
            const result = new Map<string | number, (number | FilePosition)[]>()
            for (const id of ids) {
                const positions = this.positions.get(id)
                if (positions) {
                    result.set(id, positions)
                }
            }
            return result
        }, timeoutMs)
    }

    async getPositionsByArrayOfDataNoLock<T extends { id: string | number }>(
        data: T[],
        idFn?: (data: T) => (string | number)[],
    ): Promise<Map<string | number, (number | FilePosition)[]>> {
        const result = new Map<string | number, (number | FilePosition)[]>()
        for (const item of data) {
            const ids = idFn ? idFn(item) : [`byId:${item.id}`]
            for (const id of ids) {
                const positions = this.positions.get(id)
                if (positions) {
                    const resId = id.toString().includes(':')
                        ? id.toString().split(':')[1]
                        : id
                    result.set(resId, positions)
                }
            }
        }
        return result
    }

    async getPositionByDataNoLock<T extends LineDbAdapter>(
        data: T,
        idFn?: (data: T) => (string | number)[],
    ): Promise<Map<string | number, (number | FilePosition)[]>> {
        const ids = idFn ? idFn(data) : [`byId:${data.id}`]
        const result = new Map<string | number, (number | FilePosition)[]>()
        for (const id of ids) {
            const positions = this.positions.get(id)
            if (positions) {
                result.set(id, positions)
            }
        }
        return result
    }

    async getPositionByRecordNoLock<T extends Record<string, unknown>>(
        data: T,
        idFn: (data: T) => (string | number)[] = (data) => [`byId:${data.id}`],
    ): Promise<Map<string | number, (number | FilePosition)[]>> {
        const ids = idFn(data)
        const result = new Map<string | number, (number | FilePosition)[]>()
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
        position: number | FilePosition,
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
        position: number | FilePosition,
        idFn?: (data: T) => (string | number)[],
    ): Promise<void> {
        const ids = idFn ? idFn(data) : [`byId:${data.id}`]
        for (const id of ids) {
            const positions = this.positions.get(id) || []
            const exists = positions.some((p) => {
                if (p instanceof FilePosition) {
                    return p.position === (position as FilePosition).position
                }
                return p === (position as number)
            })
            if (!exists) {
                positions.push(position)
                this.positions.set(id, positions)
            }
        }
    }

    async addPositionByIndexNoLock(
        index: string,
        position: number | FilePosition,
    ): Promise<void> {
        const positions = this.positions.get(index) || []
        const exists = positions.some((p) => {
            if (p instanceof FilePosition) {
                return p.position === (position as FilePosition).position
            }
            return p === (position as number)
        })
        if (!exists) {
            positions.push(position)
            this.positions.set(index, positions)
        }
    }

    async removePositionByIndexNoLock(
        index: string,
        position: number | FilePosition,
    ): Promise<void> {
        const positions = this.positions.get(index) || []
        const indexToRemove = positions.indexOf(position)
        if (indexToRemove !== -1) {
            positions.splice(indexToRemove, 1)
            this.positions.set(index, positions)
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
