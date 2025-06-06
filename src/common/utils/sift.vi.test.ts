import { describe, it, expect } from 'vitest'
import {
    createSafeSiftFilter,
    filterArrayWithSift,
    isMongoDbLikeFilter,
    matchesQueryWithSift,
} from './sift'
import sift from 'sift'

interface TestData {
    id: number
    name: string
    value: number
    user: string
    isActive?: boolean
    tags?: string[]
    metadata?: {
        created: Date
        updated: Date
    }
    scores?: number[]
}

type SiftOperator =
    | '$in'
    | '$nin'
    | '$exists'
    | '$gte'
    | '$gt'
    | '$lte'
    | '$lt'
    | '$eq'
    | '$ne'
    | '$mod'
    | '$all'
    | '$and'
    | '$or'
    | '$nor'
    | '$not'
    | '$size'
    | '$type'
    | '$regex'
    | '$where'
    | '$elemMatch'
    | '$like'

describe('Sift Filter Tests', () => {
    const testData: TestData[] = [
        {
            id: 1,
            name: 'Test1',
            value: 42,
            user: 'User1',
            isActive: true,
            tags: ['tag1', 'tag2'],
            scores: [10, 20, 30],
            metadata: {
                created: new Date('2023-01-01'),
                updated: new Date('2023-01-02'),
            },
        },
        {
            id: 2,
            name: 'Test2',
            value: 43,
            user: 'User2',
            isActive: false,
            tags: ['tag2', 'tag3'],
            scores: [15, 25, 35],
            metadata: {
                created: new Date('2023-01-31'),
                updated: new Date('2023-01-04'),
            },
        },
        {
            id: 3,
            name: 'Test3',
            value: 44,
            user: 'User1',
            isActive: true,
            tags: ['tag1', 'tag3'],
            scores: [20, 30, 40],
            metadata: {
                created: new Date('2023-01-05'),
                updated: new Date('2023-01-06'),
            },
        },
    ]

    it.only('should check if filter is mongo db like', () => {
        const query = { value: { $gte: 42 }, user: 'User1' }
        expect(isMongoDbLikeFilter(query)).toBe(true)
        const query2 = {
            value: { $gte: 42 }
        }
        expect(isMongoDbLikeFilter(query2)).toBe(true)
        const query3 = {
            value: { $gte: 42 },
            user: 'User1',
            $or: [{ value: { $gte: 42 } }, { user: 'User2' }],
        }
        expect(isMongoDbLikeFilter(query3)).toBe(true)
        const query4 = {
            value: { $gte: 42 },
            user: 'User1',
            $or: [{ value: { $lte: 42 } }, { user: 'User2' }],
        }
        expect(isMongoDbLikeFilter(query4)).toBe(true)
        const query5 = {
            value: 42 ,
            user: 'User1'
        }
        expect(isMongoDbLikeFilter(query5)).toBe(false)
    })

    it('should create and use filter function directly', () => {
        const query = { value: { $gte: 42 }, user: 'User1' }
        const filter = createSafeSiftFilter<TestData>(query)

        // Проверяем каждый элемент массива
        const firstElement = filter(testData[0])
        const secondElement = filter(testData[1])
        const thirdElement = filter(testData[2])
        expect(firstElement).toBe(true) // value: 42, user: 'User1'
        expect(secondElement).toBe(false) // value: 43, user: 'User2'
        expect(thirdElement).toBe(true) // value: 44, user: 'User1'

        // Проверяем с ограничением полей
        const config = {
            allowedFields: ['value', 'user'] as Array<keyof TestData>,
        }
        const filterWithConfig = createSafeSiftFilter<TestData>(query, config)
        expect(filterWithConfig(testData[0])).toBe(true)
        expect(filterWithConfig(testData[1])).toBe(false)
        expect(filterWithConfig(testData[2])).toBe(true)

        // Проверяем с ограничением операторов
        const config2 = {
            allowedOperators: ['$gte', '$eq'] as SiftOperator[],
        }
        const filterWithOperators = createSafeSiftFilter<TestData>(
            query,
            config2,
        )
        expect(filterWithOperators(testData[0])).toBe(true)
        expect(filterWithOperators(testData[1])).toBe(false)
        expect(filterWithOperators(testData[2])).toBe(true)

        // Проверяем обработку ошибок
        try {
            const invalidQuery = { value: { $invalid: 42 } }
            const filterWithError = createSafeSiftFilter<TestData>(
                invalidQuery,
                config2,
            )
        } catch (error) {
            expect(error).toBeInstanceOf(Error)
            expect(error.message).toBe('Unauthorized operator in query')
        }
    })

    it('should filter with basic comparison operators', () => {
        const query = { value: { $gt: 42 }, user: 'User1' }
        const result = filterArrayWithSift(testData, query)
        expect(result).toHaveLength(1)
        expect(result.map((r) => r.id)).toEqual([3])
    })

    it('should support logical operators', () => {
        const query = {
            $or: [{ value: { $gt: 43 } }, { user: 'User2' }],
        }
        const result = filterArrayWithSift(testData, query)
        expect(result).toHaveLength(2)
        expect(result.map((r) => r.id)).toEqual([2, 3])
    })

    it('should support array operators', () => {
        const query = { tags: { $in: ['tag1'] } }
        const result = filterArrayWithSift(testData, query)
        expect(result).toHaveLength(2)
        expect(result.map((r) => r.id)).toEqual([1, 3])
    })

    it('should support nested object queries', () => {
        const query = {
            'metadata.created': {
                $gt: new Date('2023-01-02'),
            },
        }
        const result = filterArrayWithSift(testData, query)
        expect(result).toHaveLength(2)
        expect(result.map((r) => r.id)).toEqual([2, 3])
    })

    it('should limit allowed fields', () => {
        const config = {
            allowedFields: ['value'] as Array<keyof TestData>,
        }
        const query = { id: 1 }
        try {
            filterArrayWithSift(testData, query, config)
        } catch (error) {
            expect(error).toBeInstanceOf(Error)
            expect(error.message).toBe('Unauthorized field in query')
        }
    })

    it('should limit allowed operators', () => {
        const query = { value: { $gt: 42 } }
        const config = {
            allowedOperators: ['$gt'] as SiftOperator[],
        }
        const result = filterArrayWithSift(testData, query, config)
        expect(result).toHaveLength(2)
        expect(result.map((r) => r.id)).toEqual([2, 3])

        const query2 = { value: { $lt: 44 } }
        expect(() => filterArrayWithSift(testData, query2, config)).toThrow(
            'Unauthorized operator in query',
        )
    })

    it('should handle single object matching', () => {
        const query = { value: { $gte: 42 }, user: 'User1' }
        const object = testData[0]
        expect(matchesQueryWithSift(object, query)).toBe(true)
    })

    it('should handle complex queries with multiple conditions', () => {
        const query = {
            $and: [
                { value: { $gte: 42 } },
                { $or: [{ user: 'User1' }, { isActive: true }] },
                { tags: { $in: ['tag1'] } },
            ],
        }
        const result = filterArrayWithSift(testData, query)
        expect(result).toHaveLength(2)
        expect(result.map((r) => r.id)).toEqual([1, 3])
    })

    it('should handle regex queries', () => {
        const query = { name: { $regex: '^Test[13]$' } }
        const result = filterArrayWithSift(testData, query)
        expect(result).toHaveLength(2)
        expect(result.map((r) => r.id)).toEqual([1, 3])
    })

    it('should handle exists operator', () => {
        const query = { metadata: { $exists: true } }
        const result = filterArrayWithSift(testData, query)
        expect(result).toHaveLength(3)

        const query2 = { nonExistentField: { $exists: true } }
        const result2 = filterArrayWithSift(testData, query2)
        expect(result2).toHaveLength(0)
    })

    it('should handle $mod operator', () => {
        const query = { value: { $mod: [2, 0] } } // четные числа
        const result = filterArrayWithSift(testData, query)
        expect(result).toHaveLength(2)
        expect(result.map((r) => r.id)).toEqual([1, 3])
    })

    it('should handle $all operator', () => {
        const query = { tags: { $all: ['tag1', 'tag2'] } }
        const result = filterArrayWithSift(testData, query)
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe(1)
    })

    it('should handle $size operator', () => {
        const query = { scores: { $size: 3 } }
        const result = filterArrayWithSift(testData, query)
        expect(result).toHaveLength(3)
    })

    it('should handle $type operator', () => {
        const query = { value: { $type: 'number' } }
        const result = filterArrayWithSift(testData, query)
        expect(result).toHaveLength(3)
    })

    it('should handle $elemMatch operator', () => {
        const query = { scores: { $elemMatch: { $gt: 35 } } }
        const result = filterArrayWithSift(testData, query)
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe(3)
    })

    it('should handle $nor operator', () => {
        const query = {
            $nor: [{ value: { $gt: 43 } }, { user: 'User2' }],
        }
        const result = filterArrayWithSift(testData, query)
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe(1)
    })

    it('should handle $like operator with % wildcard', () => {
        const query = { name: { $like: 'Test%' } }
        const result = filterArrayWithSift(testData, query)
        expect(result).toHaveLength(3)
        expect(result.map((r) => r.id)).toEqual([1, 2, 3])
    })

    it('should handle $like operator with _ wildcard', () => {
        const query = { name: { $like: 'Test_' } }
        const result = filterArrayWithSift(testData, query)
        expect(result).toHaveLength(3)
        expect(result.map((r) => r.id)).toEqual([1, 2, 3])
    })

    it('should handle $like operator with mixed wildcards', () => {
        const query = { name: { $like: 'T%t_' } }
        const result = filterArrayWithSift(testData, query)
        expect(result).toHaveLength(3)
        expect(result.map((r) => r.id)).toEqual([1, 2, 3])
    })

    it('should handle $like operator with exact match', () => {
        const query = { name: { $like: 'Test1' } }
        const result = filterArrayWithSift(testData, query)
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe(1)
    })

    it('should handle $like operator with special characters', () => {
        const testDataWithSpecialChars: TestData[] = [
            {
                id: 1,
                name: 'Test.1',
                value: 42,
                user: 'User1',
            },
            {
                id: 2,
                name: 'Test*2',
                value: 43,
                user: 'User2',
            },
        ]
        const query = { name: { $like: 'Test.%' } }
        const result = filterArrayWithSift(testDataWithSpecialChars, query)
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe(1)
    })

    it('should handle $like operator in complex queries', () => {
        const query = {
            $and: [
                { name: { $like: 'Test%' } },
                { $or: [{ user: 'User1' }, { isActive: true }] },
            ],
        }
        const result = filterArrayWithSift(testData, query)
        expect(result).toHaveLength(2)
        expect(result.map((r) => r.id)).toEqual([1, 3])
    })

    it('should handle $like operator with field restrictions', () => {
        const query = { name: { $like: 'Test%' } }
        const config = {
            allowedFields: ['name'] as Array<keyof TestData>,
            allowedOperators: ['$like'] as SiftOperator[],
        }
        const result = filterArrayWithSift(testData, query, config)
        expect(result).toHaveLength(3)
        expect(result.map((r) => r.id)).toEqual([1, 2, 3])

        const query2 = { user: { $like: 'User%' } }
        expect(() => filterArrayWithSift(testData, query2, config)).toThrow(
            'Unauthorized field in query',
        )
    })

    it('should handle $like operator with operator restrictions', () => {
        const query = { name: { $like: 'Test%' } }
        const config = {
            allowedOperators: ['$like'] as SiftOperator[],
        }
        const result = filterArrayWithSift(testData, query, config)
        expect(result).toHaveLength(3)
        expect(result.map((r) => r.id)).toEqual([1, 2, 3])

        const query2 = { name: { $eq: 'Test1' } }
        expect(() => filterArrayWithSift(testData, query2, config)).toThrow(
            'Unauthorized operator in query',
        )
    })

    it('should throw error for non-object query', () => {
        // @ts-expect-error Testing invalid input
        expect(() => createSafeSiftFilter('invalid')).toThrow()
        // @ts-expect-error Testing invalid input
        expect(() => createSafeSiftFilter(42)).toThrow()
        // @ts-expect-error Testing invalid input
        expect(() => createSafeSiftFilter(null)).toThrow()
        // @ts-expect-error Testing invalid input
        expect(() => createSafeSiftFilter(undefined)).toThrow()
    })

    it('should throw error for invalid operator in query', () => {
        const query = { name: { $invalid: 'Test' } }
        expect(() => createSafeSiftFilter(query)).toThrow(
            'Unauthorized operator in query',
        )
    })

    it('should throw error for invalid operator in nested query', () => {
        const query = {
            $or: [{ name: { $invalid: 'Test' } }, { value: { $gt: 42 } }],
        }
        expect(() => createSafeSiftFilter(query)).toThrow()
    })

    it('should throw error for invalid operator in array query', () => {
        const query = {
            tags: { $invalid: ['tag1'] },
        }
        expect(() => createSafeSiftFilter(query)).toThrow(
            'Unauthorized operator in query',
        )
    })

    it('should throw error for invalid field in query', () => {
        const config = {
            allowedFields: ['name'] as Array<keyof TestData>,
        }
        const query = { invalidField: 'value' }
        expect(() => createSafeSiftFilter(query, config)).toThrow(
            'Unauthorized field in query',
        )
    })

    it('should throw error for invalid field in nested query', () => {
        const config = {
            allowedFields: ['name'] as Array<keyof TestData>,
        }
        const query = {
            $or: [{ invalidField: 'value' }, { name: 'Test1' }],
        }
        expect(() => createSafeSiftFilter(query, config)).toThrow(
            'Unauthorized field in query',
        )
    })

    it('should throw error for invalid field in array query', () => {
        const config = {
            allowedFields: ['name'] as Array<keyof TestData>,
        }
        const query = {
            $or: [{ tags: { $in: ['tag1'] } }, { name: 'Test1' }],
        }
        expect(() => createSafeSiftFilter(query, config)).toThrow(
            'Unauthorized field in query',
        )
    })

    it('should throw error for invalid operator in $like query', () => {
        const config = {
            allowedOperators: ['$eq'] as SiftOperator[],
        }
        const query = { name: { $like: 'Test%' } }
        expect(() => createSafeSiftFilter(query, config)).toThrow(
            'Unauthorized operator in query',
        )
    })

    it('should throw error for invalid field in $like query', () => {
        const config = {
            allowedFields: ['value'] as Array<keyof TestData>,
            allowedOperators: ['$like'] as SiftOperator[],
        }
        const query = { name: { $like: 'Test%' } }
        expect(() => createSafeSiftFilter(query, config)).toThrow(
            'Unauthorized field in query',
        )
    })

    it('should convert $like to $regex correctly', () => {
        const query = {
            $and: [
                { name: { $like: 'Test%' } },
                { $or: [{ user: 'User1' }, { isActive: true }] },
            ],
        }
        const result = filterArrayWithSift(testData, query)
        expect(result).toHaveLength(2)
        expect(result.map((r) => r.id)).toEqual([1, 3])
    })

    it('should handle nested $like operators', () => {
        const query = {
            $and: [
                { name: { $like: 'Test%' } },
                {
                    $or: [
                        { user: { $like: 'User1' } },
                        { user: { $like: 'User2' } },
                    ],
                },
            ],
        }
        const result = filterArrayWithSift(testData, query)
        expect(result).toHaveLength(3)
        expect(result.map((r) => r.id)).toEqual([1, 2, 3])
    })
})
