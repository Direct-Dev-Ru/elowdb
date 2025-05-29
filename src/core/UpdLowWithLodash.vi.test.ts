/* eslint-disable @typescript-eslint/require-await */
import { TestData } from '../../common/interfaces/test-data.js'
import { unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { JSONFile } from '../adapters/node/JSONFile.js'
import { UpdLowWithLodash } from './UpdLowWithLodash.js'

>
    posts: Array<{
        id: number
        title: string
        authorId: number
        tags: string[]
    }>
}

describe('UpdLowWithLodash', () => {
    let testFilePath: string
    let adapter: JSONFile<TestData>
    let db: UpdLowWithLodash<TestData>

    beforeEach(() => {
        testFilePath = join(tmpdir(), `test-${Date.now()}.json`)
        adapter = new JSONFile<TestData>(testFilePath)
        db = new UpdLowWithLodash(adapter, 5000, {
            users: [],
            posts: [],
        })
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
        try {
            unlinkSync(testFilePath)
        } catch (e) {
            // Ignore file not found errors
        }
    })

    it('should initialize with chain property', () => {
        expect(db.chain).toBeDefined()
        expect(typeof db.chain.value).toBe('function')
    })

    it('should handle basic lodash operations', async () => {
        await db.update({ users: [] }, async (data: Partial<TestData>) => {
            data.users?.push(
                { id: 1, name: 'John', age: 30, active: true },
                { id: 2, name: 'Jane', age: 25, active: false },
            )
            return { result: true, data }
        })

        const activeUsers = db.chain
            .get('users')
            .filter({ active: true })
            .value()
        expect(activeUsers).toHaveLength(1)
        expect(activeUsers[0]?.name).toBe('John')
    })

    it('should handle smart refresh with lodash operations', async () => {
        db.startSmartRefresh(2000)

        // Изначальные данные
        await db.update({ users: [] }, async (data: Partial<TestData>) => {
            data.users?.push({ id: 1, name: 'John', age: 30, active: true })
            return { result: true, data }
        })

        // Изменяем файл напрямую
        writeFileSync(
            testFilePath,
            JSON.stringify({
                users: [
                    { id: 1, name: 'John', age: 30, active: true },
                    { id: 2, name: 'Jane', age: 25, active: false },
                ],
                posts: [],
            }),
        )

        // Ждем обновления
        await vi.advanceTimersByTimeAsync(10_000)

        const users = db.chain.get('users').value()
        expect(users).toHaveLength(2)
    })

    it('should maintain chain after multiple updates', async () => {
        await db.update({ posts: [] }, async (data: Partial<TestData>) => {
            data.posts?.push(
                { id: 1, title: 'First', authorId: 1, tags: ['tech'] },
                { id: 2, title: 'Second', authorId: 1, tags: ['js'] },
            )
            return { result: true, data }
        })

        const initialCount = db.chain.get('posts').size().value()
        expect(initialCount).toBe(2)

        await db.update({ users: [] }, async (data: Partial<TestData>) => {
            data?.posts?.push({
                id: 3,
                title: 'Third',
                authorId: 2,
                tags: ['tech'],
            })
            return { result: true, data }
        })

        const updatedCount = db.chain.get('posts').size().value()
        expect(updatedCount).toBe(3)
    })

    it('should handle complex queries with smart refresh', async () => {
        db.startSmartRefresh(1000)

        // Изначальные данные
        await db.update({ users: [] }, async (data: Partial<TestData>) => {
            data.posts?.push(
                { id: 1, title: 'First', authorId: 1, tags: ['tech'] },
                { id: 2, title: 'Second', authorId: 1, tags: ['js'] },
            )
            return { result: true, data }
        })

        // Изменяем файл
        writeFileSync(
            testFilePath,
            JSON.stringify({
                users: [],
                posts: [
                    { id: 1, title: 'First', authorId: 1, tags: ['tech'] },
                    { id: 2, title: 'Second', authorId: 1, tags: ['js'] },
                    { id: 3, title: 'Third', authorId: 2, tags: ['tech'] },
                ],
            }),
        )

        // Ждем обновления
        await vi.advanceTimersByTimeAsync(2000)

        // Сложный запрос
        const techPosts = db.chain
            .get('posts')
            .filter((post) => post.tags.includes('tech'))
            .groupBy('authorId')
            .value()

        expect(techPosts).toEqual({
            1: [{ id: 1, title: 'First', authorId: 1, tags: ['tech'] }],
            2: [{ id: 3, title: 'Third', authorId: 2, tags: ['tech'] }],
        })
    })

    it('should stop smart refresh and maintain chain', async () => {
        db.startSmartRefresh(1000)
        expect(db['cronJob']).toBeDefined()

        db.stopSmartRefresh()
        expect(db['cronJob']).toBeUndefined()

        // Проверяем, что цепочка все еще работает
        await db.update({ users: [] }, async (data: Partial<TestData>) => {
            data.users?.push({ id: 1, name: 'John', age: 30, active: true })
            return { result: true, data }
        })

        const user = db.chain.get('users').find({ id: 1 }).value()
        expect(user?.name).toBe('John')
    })
})
