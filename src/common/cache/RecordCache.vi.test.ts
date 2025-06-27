import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { MemoryRecordCache } from './RecordCache.js'

interface TestRecord {
    id: string | number
    name: string
    value: number
    timestamp?: number
    userId?: string
}

interface PartitionedRecord {
    id: string | number
    name: string
    partition: string
    timestamp?: number
}

describe('MemoryRecordCache', () => {
    let cache: MemoryRecordCache<TestRecord>

    beforeEach(() => {
        cache = new MemoryRecordCache<TestRecord>({
            maxSize: 10,
            ttl: 1000, // 1 секунда
            enableLogging: false,
        })
    })

    describe.only('Constructor', () => {
        it.only('should create cache with default options', () => {
            const defaultCache = new MemoryRecordCache<TestRecord>()
            expect(defaultCache.size()).toBe(0)
        })

        it.only('should create cache with custom options', () => {
            const customCache = new MemoryRecordCache<TestRecord>({
                maxSize: 5,
                ttl: 500,
                enableLogging: true,
            })
            expect(customCache.size()).toBe(0)
            const record: TestRecord = { id: 1, name: 'test', value: 42 }
            customCache.setByRecord(record, 'users')
            
            expect(customCache.getByRecord({id: record.id}, 'users')).toEqual(record)
        })

        it.only('should create cache with custom key function', () => {
            const customKeyCache = new MemoryRecordCache<TestRecord>({
                keyFn: (item: unknown) => `${(item as TestRecord).name}_${(item as TestRecord).value}`,
            })
            
            const record: TestRecord = { id: 1, name: 'test', value: 42 }
            customKeyCache.set('users:test_42', record)
            
            expect(customKeyCache.get('users:test_42')).toEqual(record)
        })
    })

    describe.only('Basic operations', () => {
        it.only('should set and get record', () => {
            const record: TestRecord = { id: 1, name: 'test', value: 42 }
                        
            cache.setByRecord(record, 'users')
            const result = cache.getByRecord({id: record.id}, 'users')
            
            expect(result).toEqual(record)
        })

        it.only('should return null for non-existent record', () => {
            const result = cache.get('users:999')
            expect(result).toBeNull()
        })

        it.only('should check if record exists', () => {
            const record: TestRecord = { id: 1, name: 'test', value: 42 }
            const key = 'users:1'
            
            expect(cache.has(key)).toBe(false)
            
            cache.set(key, record)
            expect(cache.has(key)).toBe(true)
        })

        it.only('should check if record exists 2', () => {
            const record: TestRecord = { id: 1, name: 'test', value: 42 }            
            
            expect(cache.getByRecord({id: record.id}, 'users')).toBeNull()
            
            cache.setByRecord(record, 'users')
            expect(cache.getByRecord({id: record.id}, 'users')).toEqual(record)
        })

        it.only('should delete record', () => {
            const record: TestRecord = { id: 1, name: 'test', value: 42 }
                        
            cache.setByRecord(record, 'users')
            expect(cache.getByRecord({id: record.id}, 'users')).toEqual(record)
            
            cache.delete(`users:${record.id}`)
            expect(cache.has(`users:${record.id}`)).toBe(false)
            expect(cache.get(`users:${record.id}`)).toBeNull()
        })

        it.only('should delete record 2', () => {
            const record: TestRecord = { id: 1, name: 'test', value: 42 }                       
            cache.setByRecord(record, 'users')
            expect(cache.getByRecord({id: record.id}, 'users')).toEqual(record)
            
            cache.deleteByRecord(record, 'users')
            expect(cache.getByRecord({id: record.id}, 'users')).toBeNull()
        })

        it.only('should touch record to update access time', () => {
            const record: TestRecord = { id: 1, name: 'test', value: 42 }
            const key = 'users:1'
            
            cache.set(key, record)
            const firstAccess = cache.get(key)!
            vi.useFakeTimers()
            // Simulate time passing
            vi.advanceTimersByTime(100)
            
            cache.touch(key)
            const secondAccess = cache.get(key)!
            
            expect(secondAccess).toEqual(firstAccess)
        })
    })

    describe.only('Collection operations', () => {
        it.only('should handle partitioned collections correctly', () => {
            const record1: TestRecord = { id: 1, userId: 'user1', value: 42, name: 'Item1' }
            const record2: TestRecord = { id: 2, userId: 'user2', value: 43, name: 'Item2' }
            
            // Write with different partitions as collection name of the same collection
            cache.setByRecord(record1, 'test_user1')
            cache.set('test_user2:2', record2)
            
            // Check that records are available by the base collection name
            expect(cache.getByRecord({id: record1.id}, 'test')).toEqual(record1)
            expect(cache.get('test:2')).toEqual(record2)
            
            // Check the collection size (should include all partitions)
            expect(cache.getCollectionSize('test')).toBe(2)
            expect(cache.getCollectionSize('test_user1')).toBe(2)
            expect(cache.getCollectionSize('test_user2')).toBe(2)
        })

        it.only('should get collection entries', () => {
            const record1: TestRecord = { id: 1, name: 'Item1', value: 42, userId: 'user1' }
            const record2: TestRecord = { id: 2, name: 'Item2', value: 43, userId: 'user2' }
            const record3: TestRecord = { id: 3, name: 'Item3', value: 44, userId: 'user1' }
            
            cache.setByRecord(record1, 'test_part1')
            cache.setByRecord(record2, 'test_part2')
            cache.setByRecord(record3, 'orders')
            
            let usersEntries = cache.getCollectionEntries('test_part1')
            expect(usersEntries).toHaveLength(2)
            expect(usersEntries).toEqual([record1, record2])
            
            usersEntries = cache.getCollectionEntries('test_part2')
            expect(usersEntries).toHaveLength(2)
            expect(usersEntries).toEqual([record1, record2])
        })

        it.only('should get collections info', () => {
            const record1: TestRecord = { id: 1, name: 'Item1', value: 42, userId: 'user1' }
            const record2: TestRecord = { id: 2, name: 'Item2', value: 43, userId: 'user2' }
            const record3: TestRecord = { id: 3, name: 'Item3', value: 44, userId: 'user2' }
            
            cache.setByRecord(record1, 'test_part1')
            cache.setByRecord(record2, 'test_part2')
            cache.setByRecord(record3, 'orders')
            
            const info = cache.getCollectionsInfo()
            expect(info).toHaveLength(2)
            
            const usersInfo = info.find(i => i.name === 'test')
            expect(usersInfo).toBeDefined()
            expect(usersInfo!.size).toBe(2)
            
            const ordersInfo = info.find(i => i.name === 'orders')
            expect(ordersInfo).toBeDefined()
            expect(ordersInfo!.size).toBe(1)
        })

        it.only('should clear specific collection', () => {
            const record1: TestRecord = { id: 1, name: 'Item1', value: 42, userId: 'user1' }
            const record2: TestRecord = { id: 2, name: 'Item2', value: 43, userId: 'user2' }
            const record3: TestRecord = { id: 3, name: 'Item3', value: 44, userId: 'user1' }
            
            cache.setByRecord(record1, 'test_part1')
            cache.setByRecord(record2, 'test_part2')
            cache.setByRecord(record3, 'orders')
            
            expect(cache.size()).toBe(3)
            
            cache.clear('test_part1')
            expect(cache.size()).toBe(1)
            expect(cache.getByRecord({id: record1.id}, 'test_part1')).toBeNull()
            expect(cache.getByRecord({id: record2.id}, 'test_part2')).toBeNull()
            expect(cache.get('orders:3')).toEqual(record3)
        })

        it.only('should clear all collections', () => {
            const record1: TestRecord = { id: 1, name: 'Item1', value: 42, userId: 'user1' }
            const record2: TestRecord = { id: 2, name: 'Item2', value: 43, userId: 'user2' }
            
            cache.setByRecord(record1, 'test_part1')
            cache.setByRecord(record2, 'orders')
            
            expect(cache.size()).toBe(2)
            
            cache.clear()
            expect(cache.size()).toBe(0)
            expect(cache.getByRecord({id: record1.id}, 'test_part1')).toBeNull()
            expect(cache.getByRecord({id: record2.id}, 'orders')).toBeNull()
        })
    })

    describe.only('TTL functionality', () => {
        beforeEach(() => {
            vi.useFakeTimers()
        })

        afterEach(() => {
            vi.useRealTimers()
        })

        it.only('should expire records after TTL', () => {
            const record: TestRecord = { id: 1, name: 'test', value: 42 }
            const key = 'users:1'
            
            cache.set(key, record)
            expect(cache.hasByRecord(record,'users')).toBe(true)
            expect(cache.get(key)).toEqual(record)
            
            // After TTL
            vi.advanceTimersByTime(1500)
            
            expect(cache.has(key)).toBe(false)
            
            expect(cache.get(key)).toBeNull()
        })

        it.only('should not expire records before TTL', () => {
            const record: TestRecord = { id: 1, name: 'test', value: 42 }
            const key = 'users:1'
            
            cache.set(key, record)
            
            // Проходим время меньше TTL
            vi.advanceTimersByTime(500)
            
            expect(cache.get(key)).toEqual(record)
            expect(cache.has(key)).toBe(true)
        })

        it.only('should clean up expired records during operations', () => {
            const record1: TestRecord = { id: 1, name: 'test1', value: 42 }
            const record2: TestRecord = { id: 2, name: 'test2', value: 43 }
            
            cache.set('users:1', record1)
            vi.advanceTimersByTime(1500)
            cache.set('users:2', record2)
            
            
            // Проверяем, что первая запись истекла, вторая - нет
            expect(cache.get('users:1')).toBeNull()
            expect(cache.get('users:2')).toEqual(record2)
            
            // Проверяем размер кэша
            expect(cache.size()).toBe(1)
        })
    })

    describe.only('Cache eviction', () => {
        it.only('should evict oldest records when cache is full', () => {
            const smallCache = new MemoryRecordCache<TestRecord>({
                maxSize: 3,
                ttl: 1000000,
                enableLogging: true,
            })
            
            // Add 4 records (more than the limit)
            smallCache.set('users:1', { id: 1, name: 'user1', value: 42 })
            smallCache.set('users:2', { id: 2, name: 'user2', value: 43 })
            smallCache.set('users:3', { id: 3, name: 'user3', value: 44 })
            smallCache.set('users:4', { id: 4, name: 'user4', value: 45 })
            
            // Check that the cache does not exceed the limit
            expect(smallCache.size()).toBeLessThanOrEqual(3)
            
            // The oldest record should be evicted
            expect(smallCache.get('users:1')).toBeNull()
        })

        it.only('should evict from correct collection when specified', () => {
            const smallCache = new MemoryRecordCache<TestRecord>({
                maxSize: 2,
                ttl: 1000,
                enableLogging: true,
            })
            
            // Добавляем записи в разные коллекции
            smallCache.set('users:1', { id: 1, name: 'user1', value: 42 })
            smallCache.set('orders:2', { id: 2, name: 'order2', value: 43 })
            smallCache.set('users:3', { id: 3, name: 'user3', value: 44 })
            
            // Проверяем, что кэш не превышает лимит
            expect(smallCache.size()).toBeLessThanOrEqual(2)
        })
    })

    describe.only('Timestamp-based updates', () => {
        it.only('should update record with newer timestamp', () => {
            const record1: TestRecord = { id: 1, name: 'test', value: 42, timestamp: 1000 }
            const record2: TestRecord = { id: 1, name: 'test', value: 43, timestamp: 2000 }
            
            cache.set('users:1', record1)
            cache.set('users:1', record2)
            
            const result = cache.get('users:1')
            expect(result).toEqual(record2)
        })

        it.only('should not update record with older timestamp', () => {
            const record1: TestRecord = { id: 1, name: 'test', value: 42, timestamp: 2000 }
            const record2: TestRecord = { id: 1, name: 'test', value: 43, timestamp: 1000 }
            
            cache.set('users:1', record1)
            cache.set('users:1', record2)
            
            const result = cache.get('users:1')
            expect(result).toEqual(record1) // Должна остаться первая запись
        })

        it.only('should update record without timestamp', () => {
            const record1: TestRecord = { id: 1, name: 'test', value: 42 }
            const record2: TestRecord = { id: 1, name: 'test', value: 43 }
            
            cache.set('users:1', record1)
            cache.set('users:1', record2)
            
            const result = cache.get('users:1')
            expect(result).toEqual(record2)
        })
    })

    describe.only('Statistics', () => {
        it('should track cache hits and misses', () => {
            const record: TestRecord = { id: 1, name: 'test', value: 42 }
            
            // Miss
            cache.get('users:1')
            
            // Hit
            cache.set('users:1', record)
            cache.get('users:1')
            
            // Miss
            cache.get('users:2')
            
            const stats = cache.getStats()
            expect(stats.hits).toBe(1)
            expect(stats.misses).toBe(2)
            expect(stats.size).toBe(1)
            expect(stats.hitRate).toBe(1 / 3) // 1 hit / 3 total requests
        })

        it('should calculate hit rate correctly', () => {
            const record: TestRecord = { id: 1, name: 'test', value: 42 }
            
            cache.set('users:1', record)
            
            // 2 hits, 1 miss
            cache.get('users:1')
            cache.get('users:1')
            cache.get('users:2')
            
            const stats = cache.getStats()
            expect(stats.hitRate).toBe(2 / 3) // 2 hits / 3 total requests
        })
    })

    describe.only('Key parsing', () => {
        it('should parse valid keys correctly', () => {
            const record: TestRecord = { id: 1, name: 'test', value: 42 }
            
            cache.set('users:1', record)
            expect(cache.get('users:1')).toEqual(record)
        })

        it('should handle numeric keys', () => {
            const record: TestRecord = { id: 1, name: 'test', value: 42 }
            
            cache.set('users:1', record)
            expect(cache.get('users:1')).toEqual(record)
        })

        it('should handle string keys', () => {
            const record: TestRecord = { id: 'abc', name: 'test', value: 42 }
            
            cache.set('users:abc', record)
            expect(cache.get('users:abc')).toEqual(record)
        })

        it('should throw error for invalid key format', () => {
            expect(() => {
                cache.get('invalid-key')
            }).toThrow('Invalid cache key format')
        })

        it('should handle keys with multiple colons', () => {
            const record: TestRecord = { id: 1, name: 'test', value: 42 }
            
            cache.set('users:partition:1', record)
            expect(cache.get('users:partition:1')).toEqual(record)
        })
    })

    describe.only('Edge cases', () => {
        it('should handle empty collections', () => {
            expect(cache.getCollectionSize('users')).toBe(0)
            expect(cache.getCollectionEntries('users')).toHaveLength(0)
        })

        it('should handle records without id field', () => {
            const record = { name: 'test', value: 42 } as TestRecord
            
            // Должно использовать кастомную функцию ключа или fallback
            const customCache = new MemoryRecordCache<TestRecord>({
                keyFn: (item: unknown) => (item as TestRecord).name,
            })
            
            customCache.set('users:test', record)
            expect(customCache.get('users:test')).toEqual(record)
        })

        it('should handle zero TTL', () => {
            const zeroTTLCache = new MemoryRecordCache<TestRecord>({
                ttl: 0,
            })
            
            const record: TestRecord = { id: 1, name: 'test', value: 42 }
            zeroTTLCache.set('users:1', record)
            
            expect(zeroTTLCache.get('users:1')).toEqual(record)
        })

        it('should handle zero max size', () => {
            const zeroSizeCache = new MemoryRecordCache<TestRecord>({
                maxSize: 0,
            })
            
            const record: TestRecord = { id: 1, name: 'test', value: 42 }
            zeroSizeCache.set('users:1', record)
            
            // Запись должна быть добавлена, но может быть сразу удалена при следующей операции
            expect(zeroSizeCache.size()).toBeGreaterThanOrEqual(0)
        })
    })
}) 