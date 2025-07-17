import { describe, it, expect } from 'vitest'
import {
    stringifyWithUndefined,
    parseWithUndefined,
    stringifyWithSchema,
    parseWithSchema,
} from './jsonSerializers'
import { logTest } from './log'

describe('jsonSerializers', () => {
    describe('stringifyWithUndefined', () => {
        it('should serialize object with undefined values', () => {
            const data = {
                name: 'test',
                age: undefined,
                city: 'Moscow',
                country: undefined,
            }

            const result = stringifyWithUndefined(data)
            const expected = '{"name":"test","age":"__UNDEFINED_VALUE__","city":"Moscow","country":"__UNDEFINED_VALUE__"}'

            expect(result).toBe(expected)
        })

        it('should serialize array with undefined values', () => {
            const data = [1, undefined, 'test', undefined, 5]

            const result = stringifyWithUndefined(data)
            const expected = '[1,"__UNDEFINED_VALUE__","test","__UNDEFINED_VALUE__",5]'

            expect(result).toBe(expected)
        })

        it('должен сериализовать вложенные объекты с undefined', () => {
            const data = {
                user: {
                    name: 'John',
                    email: undefined,
                    settings: {
                        theme: undefined,
                        language: 'ru'
                    }
                }
            }

            const result = stringifyWithUndefined(data)
            const expected = '{"user":{"name":"John","email":"__UNDEFINED_VALUE__","settings":{"theme":"__UNDEFINED_VALUE__","language":"ru"}}}'

            expect(result).toBe(expected)
        })

        it('should handle null values as regular values', () => {
            const data = {
                name: null,
                age: undefined,
                active: false
            }

            const result = stringifyWithUndefined(data)
            const expected = '{"name":null,"age":"__UNDEFINED_VALUE__","active":false}'

            expect(result).toBe(expected)
        })
    })

    describe('parseWithUndefined', () => {
        it('should deserialize object with undefined values', () => {
            const str = '{"name":"test","age":"__UNDEFINED_VALUE__","city":"Moscow","country":"__UNDEFINED_VALUE__"}'

            const result = parseWithUndefined(str)
            const expected = {
                name: 'test',
                age: undefined,
                city: 'Moscow',
                country: undefined,
            }
            logTest(true, 'parseWithUndefined result:', result)
            
            logTest(true, 'expected:', expected)
            expect(result).toEqual(expected)
        })

        it('должен десериализовать массив с undefined значениями', () => {
            const str = '[1,"__UNDEFINED_VALUE__","test","__UNDEFINED_VALUE__",5]'

            const result = parseWithUndefined(str)
            const expected = [1, undefined, 'test', undefined, 5]

            expect(result).toEqual(expected)
        })

        it('должен десериализовать вложенные объекты с undefined', () => {
            const str = '{"user":{"name":"John","email":"__UNDEFINED_VALUE__","settings":{"theme":"__UNDEFINED_VALUE__","language":"ru"}}}'

            const result = parseWithUndefined(str)
            const expected = {
                user: {
                    name: 'John',
                    email: undefined,
                    settings: {
                        theme: undefined,
                        language: 'ru'
                    }
                }
            }

            expect(result).toEqual(expected)
        })

        it('должен сохранять null значения', () => {
            const str = '{"name":null,"age":"__UNDEFINED_VALUE__","active":false}'

            const result = parseWithUndefined(str)
            const expected = {
                name: null,
                age: undefined,
                active: false
            }

            expect(result).toEqual(expected)
        })

        it('должен обрабатывать пустые объекты и массивы', () => {
            const str = '{"emptyObj":{},"emptyArr":[],"mixed":{"a":"__UNDEFINED_VALUE__","b":[]}}'

            const result = parseWithUndefined(str)
            const expected = {
                emptyObj: {},
                emptyArr: [],
                mixed: {
                    a: undefined,
                    b: []
                }
            }

            expect(result).toEqual(expected)
        })
    })

    describe('stringifyWithSchema', () => {
        it('должен сериализовать объект с схемой и undefined полями', () => {
            const data = {
                name: 'test',
                age: undefined,
                city: 'Moscow',
                country: undefined,
            }

            const schema = {
                name: 'string',
                age: 'number?',
                city: 'string',
                country: 'string?',
            }

            const result = stringifyWithSchema(data, schema)
            const parsed = JSON.parse(result)

            expect(parsed.name).toBe('test')
            expect(parsed.age).toBe(null)
            expect(parsed.city).toBe('Moscow')
            expect(parsed.country).toBe(null)
            expect(parsed.__fieldTypes).toEqual({
                age: 'undefined',
                country: 'undefined'
            })
        })

        it('должен обрабатывать null значения в схеме', () => {
            const data = {
                name: 'test',
                age: null,
                city: 'Moscow',
            }

            const schema = {
                name: 'string',
                age: 'number|null',
                city: 'string',
            }

            const result = stringifyWithSchema(data, schema)
            const parsed = JSON.parse(result)

            expect(parsed.name).toBe('test')
            expect(parsed.age).toBe(null)
            expect(parsed.city).toBe('Moscow')
            expect(parsed.__fieldTypes).toEqual({
                age: 'null'
            })
        })

        it('должен обрабатывать объект без undefined полей', () => {
            const data = {
                name: 'test',
                age: 25,
                city: 'Moscow',
            }

            const schema = {
                name: 'string',
                age: 'number?',
                city: 'string',
            }

            const result = stringifyWithSchema(data, schema)
            const parsed = JSON.parse(result)

            expect(parsed.name).toBe('test')
            expect(parsed.age).toBe(25)
            expect(parsed.city).toBe('Moscow')
            expect(parsed.__fieldTypes).toEqual({})
        })

        it('должен обрабатывать поля, которых нет в схеме', () => {
            const data = {
                name: 'test',
                age: undefined,
                extra: 'value',
            }

            const schema = {
                name: 'string',
                age: 'number?',
            }

            const result = stringifyWithSchema(data, schema)
            const parsed = JSON.parse(result)

            expect(parsed.name).toBe('test')
            expect(parsed.age).toBe(null)
            expect(parsed.extra).toBe('value')
            expect(parsed.__fieldTypes).toEqual({
                age: 'undefined'
            })
        })
    })

    describe('parseWithSchema', () => {
        it('должен десериализовать объект с схемой и восстановить undefined поля', () => {
            const str = '{"name":"test","age":null,"city":"Moscow","country":null,"__fieldTypes":{"age":"undefined","country":"undefined"}}'

            const schema = {
                name: 'string',
                age: 'number?',
                city: 'string',
                country: 'string?',
            }

            const result = parseWithSchema(str, schema)
            const expected = {
                name: 'test',
                age: undefined,
                city: 'Moscow',
                country: undefined,
            }

            expect(result).toEqual(expected)
        })

        it('должен сохранять null значения из схемы', () => {
            const str = '{"name":"test","age":null,"city":"Moscow","__fieldTypes":{"age":"null"}}'

            const schema = {
                name: 'string',
                age: 'number|null',
                city: 'string',
            }

            const result = parseWithSchema(str, schema)
            const expected = {
                name: 'test',
                age: null,
                city: 'Moscow',
            }

            expect(result).toEqual(expected)
        })

        it('должен обрабатывать объект без __fieldTypes', () => {
            const str = '{"name":"test","age":25,"city":"Moscow"}'

            const schema = {
                name: 'string',
                age: 'number?',
                city: 'string',
            }

            const result = parseWithSchema(str, schema)
            const expected = {
                name: 'test',
                age: 25,
                city: 'Moscow',
            }

            expect(result).toEqual(expected)
        })

        it('должен обрабатывать пустой объект __fieldTypes', () => {
            const str = '{"name":"test","age":25,"city":"Moscow","__fieldTypes":{}}'

            const schema = {
                name: 'string',
                age: 'number?',
                city: 'string',
            }

            const result = parseWithSchema(str, schema)
            const expected = {
                name: 'test',
                age: 25,
                city: 'Moscow',
            }

            expect(result).toEqual(expected)
        })

        it('должен обрабатывать объект с дополнительными полями', () => {
            const str = '{"name":"test","age":null,"extra":"value","__fieldTypes":{"age":"undefined"}}'

            const schema = {
                name: 'string',
                age: 'number?',
            }

            const result = parseWithSchema(str, schema)
            const expected = {
                name: 'test',
                age: undefined,
                extra: 'value',
            }

            expect(result).toEqual(expected)
        })
    })

    describe('интеграционные тесты', () => {
        it('должен корректно работать цикл stringifyWithUndefined -> parseWithUndefined', () => {
            const originalData = {
                name: 'test',
                age: undefined,
                city: 'Moscow',
                settings: {
                    theme: undefined,
                    language: 'ru'
                }
            }

            const serialized = stringifyWithUndefined(originalData)
            logTest(true, 'serialized:', serialized)
            const deserialized = parseWithUndefined(serialized)
            logTest(true, 'deserialized:', deserialized)

            expect(deserialized).toEqual(originalData)
        })

        it('должен корректно работать цикл stringifyWithSchema -> parseWithSchema', () => {
            const originalData = {
                name: 'test',
                age: undefined,
                city: 'Moscow',
                country: undefined,
            }

            const schema = {
                name: 'string',
                age: 'number?',
                city: 'string',
                country: 'string?',
            }

            const serialized = stringifyWithSchema(originalData, schema)
            const deserialized = parseWithSchema(serialized, schema)

            expect(deserialized).toEqual(originalData)
        })
    })
}) 