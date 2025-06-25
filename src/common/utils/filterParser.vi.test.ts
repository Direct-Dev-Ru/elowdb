import { describe, it, expect } from 'vitest'
import {
    parseFilterString,
    stringifyFilter,
    isValidFilterString,
    extractFieldNames,
    extractOperators,
} from './filterParser.js'
import { log } from 'console'

describe('filterParser', () => {
    describe('parseFilterString', () => {
        it('should parse simple equalities', () => {
            const result = parseFilterString('field1 === value1')
            expect(result).toEqual({ field1: 'value1' })
        })

        it('should parse multiple conditions with and', () => {
            const result = parseFilterString(
                `field1 === 'value1' and field2 == 10 && field3 == 20`,
            )
            expect(result).toEqual({ field1: 'value1', field2: 10, field3: 20 })
        })

        it('должен парсить множественные условия с &&', () => {
            const result = parseFilterString(
                'field1 == value1 && field2 == value2',
            )
            expect(result).toEqual({ field1: 'value1', field2: 'value2' })
        })

        it('должен парсить условия с ===', () => {
            const result = parseFilterString('field1 === value1')
            expect(result).toEqual({ field1: 'value1' })
        })

        it('должен парсить строковые значения в кавычках', () => {
            const result = parseFilterString('name == "John Doe"')
            expect(result).toEqual({ name: 'John Doe' })
        })

        it('должен парсить числовые значения', () => {
            const result = parseFilterString('age == 25')
            expect(result).toEqual({ age: 25 })
        })

        it('должен парсить булевы значения', () => {
            const result = parseFilterString('active == true')
            expect(result).toEqual({ active: true })
        })

        it('должен парсить null значения', () => {
            const result = parseFilterString('description == null')
            expect(result).toEqual({ description: null })
        })

        it('должен парсить операторы сравнения', () => {
            const result = parseFilterString('age >= 18 and price < 100')
            expect(result).toEqual({
                age: { $gte: 18 },
                price: { $lt: 100 },
            })
        })

        it('должен парсить сложные условия', () => {
            const result = parseFilterString(
                'name == "John" && age >= 18 && active == true',
            )
            expect(result).toEqual({
                name: 'John',
                age: { $gte: 18 },
                active: true,
            })
        })

        it('должен обрабатывать пустую строку', () => {
            const result = parseFilterString('')
            expect(result).toEqual({})
        })

        it('должен обрабатывать null и undefined', () => {
            expect(parseFilterString(null as any)).toEqual({})
            expect(parseFilterString(undefined as any)).toEqual({})
        })

        it('должен парсить условия с пробелами', () => {
            const result = parseFilterString(
                '  field1  ==  value1  and  field2  ==  value2  ',
            )
            expect(result).toEqual({ field1: 'value1', field2: 'value2' })
        })

        it('должен парсить условия с одинарными кавычками', () => {
            const result = parseFilterString("name == 'John Doe'")
            expect(result).toEqual({ name: 'John Doe' })
        })

        it.skip('должен парсить условия с экранированными кавычками', () => {
            const result = parseFilterString('name == "John \\"Doe\\""')
            expect(result).toEqual({ name: 'John "Doe"' })
        })
    })

    describe('stringifyFilter', () => {
        it('должен преобразовывать простой объект в строку', () => {
            const result = stringifyFilter({ field1: 'value1' })
            expect(result).toBe('field1 == "value1"')
        })

        it('должен преобразовывать объект с несколькими полями', () => {
            const result = stringifyFilter({ field1: 'value1', field2: 25 })
            expect(result).toBe('field1 == "value1" and field2 == 25')
        })

        it.skip('должен преобразовывать объект с операторами сравнения', () => {
            const result = stringifyFilter({
                age: { $gte: 18 },
                price: { $lt: 100 },
            })
            expect(result).toBe('age >= 18 and price < 100')
        })

        it('должен преобразовывать булевы значения', () => {
            const result = stringifyFilter({ active: true, verified: false })
            expect(result).toBe('active == true and verified == false')
        })

        it.skip('должен преобразовывать null значения', () => {
            const result = stringifyFilter({ description: null })
            expect(result).toBe('description == null')
        })

        it('должен экранировать кавычки в строках', () => {
            const result = stringifyFilter({ name: 'John "Doe"' })
            expect(result).toBe('name == "John \\"Doe\\""')
        })

        it('должен обрабатывать пустой объект', () => {
            const result = stringifyFilter({})
            expect(result).toBe('')
        })

        it('должен пропускать null и undefined значения', () => {
            const result = stringifyFilter({
                field1: 'value1',
                field2: null,
                field3: undefined,
            })
            expect(result).toBe('field1 == "value1"')
        })

        it('должен обрабатывать числа с плавающей точкой', () => {
            const result = stringifyFilter({ price: 99.99 })
            expect(result).toBe('price == 99.99')
        })
    })

    describe('isValidFilterString', () => {
        it('должен возвращать true для валидных фильтров', () => {
            expect(isValidFilterString('field1 == value1')).toBe(true)
            expect(isValidFilterString('name == "John" && age >= 18')).toBe(
                true,
            )

            expect(isValidFilterString('active == true')).toBe(true)
        })

        it('should return false for invalid filters', () => {
            expect(isValidFilterString('')).toBe(false)
            expect(isValidFilterString('invalid filter')).toBe(false)
            expect(isValidFilterString('== value1')).toBe(false)
        })

        it('должен возвращать false для null и undefined', () => {
            expect(isValidFilterString(null as any)).toBe(false)
            expect(isValidFilterString(undefined as any)).toBe(false)
        })
    })

    describe('extractFieldNames', () => {
        it('должен извлекать имена полей из фильтра', () => {
            const result = extractFieldNames(
                'field1 == value1 and field2 == value2',
            )
            expect(result).toEqual(['field1', 'field2'])
        })

        it('должен извлекать имена полей с операторами сравнения', () => {
            const result = extractFieldNames('age >= 18 and price < 100')
            expect(result).toEqual(['age', 'price'])
        })

        it('должен возвращать пустой массив для невалидных фильтров', () => {
            expect(extractFieldNames('')).toEqual([])
            expect(extractFieldNames('invalid filter')).toEqual([])
        })
    })

    describe('extractOperators', () => {
        it('должен извлекать операторы из фильтра', () => {
            const result = extractOperators(
                'field1 == value1 and field2 >= value2',
            )
            expect(result).toEqual(['==', 'and', '>='])
        })

        it('должен извлекать логические операторы', () => {
            const result = extractOperators(
                'field1 == value1 && field2 == value2',
            )
            expect(result).toEqual(['==', '&&', '=='])
        })

        it('должен возвращать пустой массив для фильтров без операторов', () => {
            expect(extractOperators('')).toEqual([])
            expect(extractOperators('invalid filter')).toEqual([])
        })
    })

    // describe('Интеграционные тесты', () => {
    //     it('должен корректно работать цикл parse -> stringify', () => {
    //         const originalFilter = 'name == "John Doe" && age >= 25 && active == true'
    //         const parsed = parseFilterString(originalFilter)
    //         const stringified = stringifyFilter(parsed)
    //         console.log('stringified', stringified);

    //         // Проверяем, что результат содержит все необходимые условия
    //         expect(stringified).toContain('name == "John Doe"')
    //         expect(stringified).toContain('age $gte 25')
    //         expect(stringified).toContain('active == true')
    //     })

    //     // it('должен корректно обрабатывать сложные фильтры', () => {
    //     //     const complexFilter = 'status == "active" && age >= 18 && age <= 65 && verified == true'
    //     //     const parsed = parseFilterString(complexFilter)

    //     //     expect(parsed).toEqual({
    //     //         status: 'active',
    //     //         age: { $>=: 18, $<=: 65 },
    //     //         verified: true
    //     //     })
    //     // })

    //     // it('должен корректно обрабатывать фильтры с числами', () => {
    //     //     const numericFilter = 'price >= 10.50 && quantity <= 100 && discount == 0.15'
    //     //     const parsed = parseFilterString(numericFilter)

    //     //     expect(parsed).toEqual({
    //     //         price: { $>=: 10.5 },
    //     //         quantity: { $<=: 100 },
    //     //         discount: 0.15
    //     //     })
    //     // })
    // })
})
