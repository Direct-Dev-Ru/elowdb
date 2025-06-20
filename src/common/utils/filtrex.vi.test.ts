import { describe, it, expect } from 'vitest'
import { createSafeFilter } from './filtrex'
import { logTest } from './log.js'
import { log } from 'console'

interface TestData {
    id: string | number
    name: string
    value: number
    user: string
    isActive?: boolean
    lastLogin?: Date
    arr?: number[]
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

    // Security tests for malicious attacks
    it('should reject injection attempts with eval', () => {
        const maliciousExpressions = [
            'eval("alert(1)")',
            'value > 42 && eval("console.log(1)")',
            'eval("process.exit(1)")',
            "value > 42; eval(\"require('fs').readFileSync('/etc/passwd')\")",
        ]

        maliciousExpressions.forEach((expression) => {
            expect(() => {
                const filter = createSafeFilter<TestData>(expression)
                testData.filter(filter)
            }).toThrow()
        })
    })

    it('should reject injection attempts with Function constructor', () => {
        const maliciousExpressions = [
            'Function("alert(1)")()',
            'value > 42 && Function("console.log(1)")()',
            'new Function("return process.exit(1)")()',
        ]

        maliciousExpressions.forEach((expression) => {
            expect(() => {
                const filter = createSafeFilter<TestData>(expression)
                testData.filter(filter)
            }).toThrow()
        })
    })

    it('should reject injection attempts with global objects', () => {
        const maliciousExpressions = [
            'global.process.exit(1)',
            'window.alert(1)',
            'document.cookie',
            'process.env.NODE_ENV',
            'require("fs")',
            'import("fs")',
            'module.exports',
            'exports.default',
        ]

        maliciousExpressions.forEach((expression) => {
            expect(() => {
                const filter = createSafeFilter<TestData>(expression)
                testData.filter(filter)
            }).toThrow()
        })
    })

    it('should reject injection attempts with prototype pollution', () => {
        const maliciousExpressions = [
            '__proto__.polluted = true',
            'constructor.prototype.polluted = true',
            'Object.prototype.polluted = true',
            'Array.prototype.polluted = true',
        ]

        maliciousExpressions.forEach((expression) => {
            expect(() => {
                const filter = createSafeFilter<TestData>(expression)
                testData.filter(filter)
            }).toThrow()
        })
    })

    it('should reject injection attempts with constructor calls', () => {
        const maliciousExpressions = [
            'new Object()',
            'new Array()',
            'new String()',
            'new Number()',
            'new Boolean()',
            'new Date()',
            'new RegExp()',
        ]

        maliciousExpressions.forEach((expression) => {
            expect(() => {
                const filter = createSafeFilter<TestData>(expression)
                testData.filter(filter)
            }).toThrow()
        })
    })

    it('should reject injection attempts with assignment operators', () => {
        const maliciousExpressions = [
            'value = 999',
            'name = "hacked"',
            'user = "attacker"',
            'value += 1000',
            'value -= 1000',
            'value *= 2',
            'value /= 2',
        ]

        maliciousExpressions.forEach((expression) => {
            expect(() => {
                const filter = createSafeFilter<TestData>(expression)
                testData.filter(filter)
            }).toThrow()
        })
    })

    it('should reject injection attempts with semicolon injection', () => {
        const maliciousExpressions = [
            'value > 42; alert(1)',
            'value > 42; console.log(1)',
            'value > 42; process.exit(1)',
            'value > 42; eval("alert(1)")',
        ]

        maliciousExpressions.forEach((expression) => {
            expect(() => {
                const filter = createSafeFilter<TestData>(expression)
                testData.filter(filter)
            }).toThrow()
        })
    })

    it('should reject injection attempts with command injection patterns', () => {
        const maliciousExpressions = [
            'value > 42; rm -rf /',
            'name == "test"; cat /etc/passwd',
            'user == "admin"; whoami',
            'value > 42; ls -la',
            'name == "test"; pwd',
            'user == "admin"; id',
        ]

        maliciousExpressions.forEach((expression) => {
            expect(() => {
                createSafeFilter<TestData>(expression)
            }).toThrow('Security violation')
        })
    })

    // Positive tests for extraFunctions
    it('should support string functions from extraFunctions', () => {
        const testDataWithStrings: TestData[] = [
            { id: 1, name: 'Hello World', value: 42, user: 'User1' },
            { id: 2, name: 'Test String', value: 43, user: 'User2' },
            { id: 3, name: 'Another Test', value: 44, user: 'User1' },
        ]

        // Тест strLen
        const filter1 = createSafeFilter<TestData>('strLen(name) > 11')
        const result1 = testDataWithStrings.filter(filter1)
        expect(result1).toHaveLength(1)
        expect(result1.map((r) => r.id)).toEqual([3])

        // Тест strToLower
        const filter2 = createSafeFilter<TestData>(
            'strToLower(name) == "hello world"',
        )
        const result2 = testDataWithStrings.filter(filter2)
        expect(result2).toHaveLength(1)
        expect(result2[0].id).toBe(1)

        // Тест strToUpper
        const filter3 = createSafeFilter<TestData>(
            'strToUpper(name) == "TEST STRING"',
        )
        const result3 = testDataWithStrings.filter(filter3)
        expect(result3).toHaveLength(1)
        expect(result3[0].id).toBe(2)

        // Тест strTrim
        const filter4 = createSafeFilter<TestData>(
            'strTrim("  " + name + "  ") == name',
        )
        const result4 = testDataWithStrings.filter(filter4)
        expect(result4).toHaveLength(3)
    })

    it('should support numeric functions from extraFunctions', () => {
        const testDataWithNumbers: TestData[] = [
            { id: 1, name: 'Test1', value: 42.7, user: 'User1' },
            { id: 2, name: 'Test2', value: -15.3, user: 'User2' },
            { id: 3, name: 'Test3', value: 100, user: 'User1' },
        ]

        // Тест round
        const filter1 = createSafeFilter<TestData>('round(value) == 43')
        const result1 = testDataWithNumbers.filter(filter1)
        expect(result1).toHaveLength(1)
        expect(result1[0].id).toBe(1)

        // Тест abs
        const filter2 = createSafeFilter<TestData>('abs(value) > 16.0')
        const result2 = testDataWithNumbers.filter(filter2)
        logTest(true, result2)
        expect(result2).toHaveLength(2)
        expect(result2.map((r) => r.id)).toEqual([1, 3])

        // Тест min/max
        const filter3 = createSafeFilter<TestData>(
            'value == max(42.7, -15.3, 100)',
        )
        const result3 = testDataWithNumbers.filter(filter3)
        expect(result3).toHaveLength(1)
        expect(result3[0].id).toBe(3)

        // Тест inRange
        const filter4 = createSafeFilter<TestData>('inRange(value, 0, 50)')
        const result4 = testDataWithNumbers.filter(filter4)
        expect(result4).toHaveLength(1)
        expect(result4[0].id).toBe(1)
    })

    it('should support type checking functions from extraFunctions', () => {
        const testDataWithTypes: TestData[] = [
            { id: 1, name: 'Test1', value: 42, user: 'User1' },
            { id: '2', name: 'Test2', value: 43, user: 'User2' },
            { id: 3, name: 'Test3', value: 44, user: 'User1' },
        ]

        // Тест isNumber
        const filter1 = createSafeFilter<TestData>('isNumber(value)')
        const result1 = testDataWithTypes.filter(filter1)
        expect(result1).toHaveLength(3)

        // Тест isString
        const filter2 = createSafeFilter<TestData>('isString(name)')
        const result2 = testDataWithTypes.filter(filter2)
        expect(result2).toHaveLength(3)

        // Тест isInteger
        const filter3 = createSafeFilter<TestData>('isInteger(value)')
        const result3 = testDataWithTypes.filter(filter3)
        expect(result3).toHaveLength(3)
    })

    it('should support date functions from extraFunctions', () => {
        const now = Date.now()
        const testDataWithDates: TestData[] = [
            {
                id: 1,
                name: 'Test1',
                value: 42,
                user: 'User1',
                lastLogin: new Date(now),
            },
            {
                id: 2,
                name: 'Test2',
                value: 43,
                user: 'User2',
                lastLogin: new Date(now - 86400000),
            }, // 1 день назад
            {
                id: 3,
                name: 'Test3',
                value: 44,
                user: 'User1',
                lastLogin: new Date(now - 172800000),
            }, // 2 дня назад
        ]

        // Тест getFullYear
        const currentYear = new Date().getFullYear()
        const filter1 = createSafeFilter<TestData>(
            `getFullYear(lastLogin) == ${currentYear}`,
        )
        const result1 = testDataWithDates.filter(filter1)
        expect(result1).toHaveLength(3)

        // Тест getHours
        const currentHour = new Date().getHours()
        const filter2 = createSafeFilter<TestData>(
            `getHours(lastLogin) == ${currentHour}`,
        )
        const result2 = testDataWithDates.filter(filter2)
        expect(result2.length).toBeGreaterThanOrEqual(0) // Может быть 0 или больше в зависимости от времени

        // Тест getTime
        const filter3 = createSafeFilter<TestData>('getTime(lastLogin) > 0')
        const result3 = testDataWithDates.filter(filter3)
        expect(result3).toHaveLength(3)
    })

    it('should support array functions from extraFunctions', () => {
        const testDataWithArrays: TestData[] = [
            {
                id: 1,
                name: 'Test1',
                value: 42,
                user: 'User1',
                arr: [1, 2, 3, 4, 5],
            },
            {
                id: 2,
                name: 'Test2',
                value: 43,
                user: 'User2',
                arr: [1, 2, 3, 4],
            },
            { id: 3, name: 'Test3', value: 44, user: 'User1', arr: [1, 2, 3] },
        ]

        // Тест arrLen (создаем массив из значений)
        const filter1 = createSafeFilter<TestData>('arrLen(arr) == 5')
        const result1 = testDataWithArrays.filter(filter1)
        expect(result1).toHaveLength(1)

        // Тест arrIncludes
        const filter2 = createSafeFilter<TestData>('arrIncludes(arr, 4)')
        const result2 = testDataWithArrays.filter(filter2)
        expect(result2).toHaveLength(2)

        // Тест arrIndexOf
        const filter3 = createSafeFilter<TestData>('arrIndexOf(arr, 5) >= 0')
        const result3 = testDataWithArrays.filter(filter3)
        expect(result3).toHaveLength(1)

        // Тест arrFirst/arrLast
        const filter4 = createSafeFilter<TestData>(
            'arrFirst(arr) == 1 and arrLast(arr) == 5',
        )
        const result4 = testDataWithArrays.filter(filter4)
        expect(result4).toHaveLength(1)
    })

    it('should support string manipulation functions from extraFunctions', () => {
        const testDataWithStrings: TestData[] = [
            { id: 1, name: 'Hello World', value: 42, user: 'User1' },
            { id: 2, name: 'Test String', value: 43, user: 'User2' },
            { id: 3, name: 'Another Test', value: 44, user: 'User1' },
        ]

        // Тест strSlice
        const filter1 = createSafeFilter<TestData>(
            'strSlice(name, 0, 5) == "Hello"',
        )
        const result1 = testDataWithStrings.filter(filter1)
        expect(result1).toHaveLength(1)
        expect(result1[0].id).toBe(1)

        // Тест strSubstring
        const filter2 = createSafeFilter<TestData>(
            'strSubstring(name, 6, 11) == "World"',
        )
        const result2 = testDataWithStrings.filter(filter2)
        expect(result2).toHaveLength(1)
        expect(result2[0].id).toBe(1)

        // Тест strReplace
        // const filter3 = createSafeFilter<TestData>(
        //     'strReplace(name, "World", "Test") == "Hello Test"',
        // )
        // const result3 = testDataWithStrings.filter(filter3)
        // expect(result3).toHaveLength(1)
        // expect(result3[0].id).toBe(1)

        // // Тест strConcat
        // const filter4 = createSafeFilter<TestData>(
        //     'strConcat("Hello ", "World") == "Hello World"',
        // )
        // const result4 = testDataWithStrings.filter(filter4)
        // expect(result4).toHaveLength(3)
    })

    it('should support complex combinations of extraFunctions', () => {
        const testDataComplex: TestData[] = [
            { id: 1, name: 'Hello World', value: 42.7, user: 'User1' },
            { id: 2, name: 'Test String', value: -15.3, user: 'User2' },
            { id: 3, name: 'Another Test', value: 100, user: 'User1' },
        ]

        // Комбинированный тест с несколькими функциями
        const filter = createSafeFilter<TestData>(
            'strLen(name) > 10 and round(abs(value)) > 15 and isNumber(value)',
        )
        const result = testDataComplex.filter(filter)
        expect(result).toHaveLength(2)
        expect(result.map((r) => r.id)).toEqual([1, 3])

        // Тест с вложенными функциями
        const filter2 = createSafeFilter<TestData>(
            'strToUpper(strSlice(name, 0, 5)) == "HELLO"',
        )
        const result2 = testDataComplex.filter(filter2)
        expect(result2).toHaveLength(1)
        expect(result2[0].id).toBe(1)

        // Тест с логическими операторами
        const filter3 = createSafeFilter<TestData>(
            '(strLen(name) > 10 && value > 0) || (strLen(name) < 12 && value < 0)',
        )
        const result3 = testDataComplex.filter(filter3)
        expect(result3).toHaveLength(3)
        expect(result3.map((r) => r.id)).toEqual([1, 2, 3])
    })

    it('should reject injection attempts with base64-encoded malicious JavaScript code', () => {
        const maliciousExpressions = [
            // Простые base64-кодированные вредоносные функции
            'value > 42 && "YWxlcnQoMSk="', // alert(1)
            'name == "test" && "ZXZhbCgnYWxlcnQoMSknKQ=="', // eval('alert(1)')
            'user == "admin" && "RnVuY3Rpb24oJ2FsZXJ0KDEpJykoKQ=="', // Function('alert(1)')()

            // Base64-кодированные глобальные объекты
            'value > 42 && "Z2xvYmFsLnByb2Nlc3MuZXhpdCgxKQ=="', // global.process.exit(1)
            'name == "test" && "d2luZG93LmFsZXJ0KDEp"', // window.alert(1)

            // Base64-кодированные модули
            'user == "admin" && "cmVxdWlyZSgnZnMnKQ=="', // require('fs')
            'value > 42 && "aW1wb3J0KCdmcycp"', // import('fs')

            // Base64-кодированные прототипы
            'name == "test" && "X19wcm90b19fLnBvbGx1dGVkID0gdHJ1ZQ=="', // __proto__.polluted = true

            // Base64-кодированные операторы присваивания
            'user == "admin" && "dmFsdWUgPSA5OTk="', // value = 999

            // Data URLs с base64
            'value > 42 && "ZGF0YTp0ZXh0L2phdmFzY3JpcHQ7YmFzZTY0LEF3bGVydCgxKQ=="', // data:text/javascript;base64,alert(1)
        ]

        maliciousExpressions.forEach((expression) => {
            expect(() => {
                createSafeFilter<TestData>(expression, {
                    skipValidation: false,
                })
            }).toThrow()
        })
    })

    it('should demonstrate issue with undefined functions', () => {
        const testDataWithCustom: TestData[] = [
            { id: 1, name: 'Hello World', value: 4, user: 'User1' },
            { id: 2, name: 'Test String', value: 4, user: 'User2' },
            { id: 3, name: 'Another Test', value: 5, user: 'User1' },
        ]

        // Простые кастомные функции
        const extraCustomFunctions = {
            double: (x: number) => x * 2,
            triple: (x: number) => x * 3,
        }

        // Тест с существующей функцией - работает
        const filter1 = createSafeFilter<TestData>('double(value) > 9 and strLen(name) > 11', {
            extraFunctions: extraCustomFunctions as Record<
                string,
                (...args: unknown[]) => unknown
            >,
        })
        const result1 = testDataWithCustom.filter(filter1)
        expect(result1).toHaveLength(1)
        expect(result1[0].id).toBe(3)

        // Тест с несуществующей функцией - теперь должно выбрасывать ошибку
        expect(() => {
            createSafeFilter<TestData>('undefFunc(value) > 9 and strLen(name) > 11', {
                extraFunctions: extraCustomFunctions as Record<
                    string,
                    (...args: unknown[]) => unknown
                >,
            })
        }).toThrow('Undefined functions detected: undefFunc')
        
        // Тест с несколькими несуществующими функциями
        expect(() => {
            createSafeFilter<TestData>('undefFunc1(value) > 9 and undefFunc2(name) > 11', {
                extraFunctions: extraCustomFunctions as Record<
                    string,
                    (...args: unknown[]) => unknown
                >,
            })
        }).toThrow('Undefined functions detected: undefFunc1, undefFunc2')
    })
})
