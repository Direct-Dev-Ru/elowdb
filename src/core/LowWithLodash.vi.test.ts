import { TestData } from '../../common/interfaces/test-data.js'
import { unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { JSONFile } from '../adapters/node/JSONFile.js'
import { LowWithLodash } from './LowWithLodash.js'

>
    posts: Array<{
        id: number
        title: string
        authorId: number
        tags: string[]
    }>
}

describe('LowWithLodash', () => {
    let testFilePath: string
    let adapter: JSONFile<TestData>
    let db: LowWithLodash<TestData>

    beforeEach(() => {
        testFilePath = join(tmpdir(), `test-${Date.now()}.json`)
        adapter = new JSONFile<TestData>(testFilePath)
        db = new LowWithLodash(adapter, {
            users: [],
            posts: [],
        })
    })

    afterEach(() => {
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
        // Добавляем тестовые данные
        await db.update((data) => {
            data.users.push(
                { id: 1, name: 'John', age: 30, active: true },
                { id: 2, name: 'Jane', age: 25, active: false },
            )
        })

        // Тестируем цепочки Lodash
        const activeUsers = db.chain
            .get('users')
            .filter({ active: true })
            .value()
        expect(activeUsers).toHaveLength(1)
        expect(activeUsers[0]?.name).toBe('John')

        const userNames = db.chain.get('users').map('name').value()
        expect(userNames).toEqual(['John', 'Jane'])

        const userById = db.chain.get('users').find({ id: 2 }).value()
        expect(userById?.name).toBe('Jane')
    })

    it('should handle complex lodash operations', async () => {
        // Добавляем тестовые данные
        await db.update((data) => {
            data.posts.push(
                {
                    id: 1,
                    title: 'First Post',
                    authorId: 1,
                    tags: ['tech', 'js'],
                },
                { id: 2, title: 'Second Post', authorId: 1, tags: ['js'] },
                { id: 3, title: 'Third Post', authorId: 2, tags: ['tech'] },
            )
        })

        // Группировка по тегам
        const postsByTag = db.chain
            .get('posts')
            .flatMap('tags')
            .countBy()
            .value()
        expect(postsByTag).toEqual({ tech: 2, js: 2 })

        // Сортировка и ограничение
        const latestPosts = db.chain
            .get('posts')
            .orderBy('id', 'desc')
            .take(2)
            .value()
        expect(latestPosts).toHaveLength(2)
        expect(latestPosts[0]?.id).toBe(3)
    })

    it('should reload chain after data updates', async () => {
        await db.update((data) => {
            data.users.push({ id: 1, name: 'John', age: 30, active: true })
        })

        const initialCount = db.chain.get('users').size().value()
        expect(initialCount).toBe(1)

        await db.update((data) => {
            data.users.push({ id: 2, name: 'Jane', age: 25, active: false })
        })

        const updatedCount = db.chain.get('users').size().value()
        expect(updatedCount).toBe(2)
    })

    it('should handle read operations with chain', async () => {
        // Записываем данные напрямую в файл
        writeFileSync(
            testFilePath,
            JSON.stringify({
                users: [{ id: 1, name: 'John', age: 30, active: true }],
                posts: [],
            }),
        )

        await db.read()

        const user = db.chain.get('users').find({ id: 1 }).value()
        expect(user?.name).toBe('John')
    })
})
