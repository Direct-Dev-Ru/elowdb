import { describe, it, expect } from 'vitest'
import { createSafeFilter } from './filtrex'
import { log } from 'console'

interface TestData {
    id: string | number
    name: string
    value: number
    user: string
    isActive?: boolean
    lastLogin?: Date
}

describe('createSafeFilter', () => {
    const testData: TestData[] = [
        { id: 1, name: 'Test1', value: 42, user: 'User1', isActive: true },
        { id: 2, name: 'Test2', value: 43, user: 'User2', isActive: false },
        { id: 3, name: 'Test3', value: 44, user: 'User1', isActive: true },
        { id: 4, name: 'Test4', value: 45, user: 'User2', isActive: false },
        { id: 5, name: 'Test5', value: 46, user: 'User1', isActive: true },
        { id: 6, name: 'Test6', value: 47, user: 'User2', isActive: false },
        { id: 7, name: 'Test7', value: 48, user: 'User1', isActive: true },
        { id: 8, name: 'Test8', value: 49, user: 'User2', isActive: false },
        { id: 9, name: 'Test9', value: 50, user: 'User1', isActive: true },
        { id: 10, name: 'Test10', value: 51, user: 'User2', isActive: false },
    ]

    it('should filter data with basic comparison operators', () => {
        const filter = createSafeFilter<TestData>(
            'value > 46 and user == "User1"',
        )
        const result = testData.filter(filter)
        expect(result).toHaveLength(2)
        expect(result.map((r) => r.id)).toEqual([7, 9])
    })

    it('should support parentheses in expressions', () => {
        const filter = createSafeFilter<TestData>(
            '(value >= 42 && user === "User1") or (value < 44 and name == "Test2")',
        )
        const result = testData.filter(filter)
        expect(result).toHaveLength(6)

        expect(result.map((r) => r.id)).toEqual([1, 2, 3, 5, 7, 9])
    })

    it('should support nested parentheses', () => {
        const filter = createSafeFilter<TestData>(
            `((value > 42 and user == "User1") or (value < 44 and name == "Test2")) and (id != 3)`,
        )
        const result = testData.filter(filter)

        expect(result).toHaveLength(4)
        expect(result.map((r) => r.id)).toEqual([2, 5, 7, 9])
    })

    it('should support priority of operators', () => {
        const filter = createSafeFilter<TestData>(
            '(value > 42 or value < 30) and (user == "User1" or user == "User20")',
        )
        const result = testData.filter(filter)
        console.log(result)
        expect(result).toHaveLength(4)
        expect(result.map((r) => r.id)).toEqual([3, 5, 7, 9])
    })

    it('should limit allowed fields', () => {
        const filter = createSafeFilter<TestData>('value > 46', {
            allowedFields: ['value'],
        })
        const result = testData.filter(filter)
        expect(result).toHaveLength(5)
        expect(result.map((r) => r.id)).toEqual([6, 7, 8, 9, 10])
        const filter2 = createSafeFilter<TestData>('id > 5', {
            allowedFields: ['value'],
        })
        expect(() => testData.filter(filter2)).toThrow('Unauthorized field')
    })

    it('should limit allowed operators', () => {
        const filter = createSafeFilter<TestData>('value > 42', {
            allowedOperators: ['>'],
        })
        const result = testData.filter(filter)
        expect(result).toHaveLength(9)
        expect(result.map((r) => r.id)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10])
        const filter2 = createSafeFilter<TestData>('value > 42', {
            allowedOperators: ['=='],
        })
        expect(() => testData.filter(filter2)).toThrow('Unauthorized operator')
        const filter3 = createSafeFilter<TestData>(
            'value == 42 or value === 46',
            {
                allowedOperators: ['===', '==', 'or'],
            },
        )
        const result3 = testData.filter(filter3)
        expect(result3).toHaveLength(2)
        expect(result3.map((r) => r.id)).toEqual([1, 5])
    })

    it('should handle special characters in strings', () => {
        const dataWithSpecialChars: TestData[] = [
            { id: 1, name: 'Test "1"', value: 42, user: 'User "1"' },
            { id: 2, name: "Test '2'", value: 43, user: "User '2'" },
        ]
        const filter = createSafeFilter<TestData>('user === "User \\"1\\""')
        const result = dataWithSpecialChars.filter(filter)
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe(1)
    })
})
