/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { LineDbAdapterOptions } from '../interfaces/jsonl-file'

/**
 * Парсит строку фильтра в объект
 * Поддерживает форматы: field1 == value1 and field2 == value2
 * или field1 === value1 && field2 === value2
 *
 * @param filterString - строка фильтра для парсинга
 * @returns объект с полями и значениями
 *
 * @example
 * parseFilterString('field1 == value1 and field2 == value2')
 * // Returns: { field1: 'value1', field2: 'value2' }
 *
 * @example
 * parseFilterString('name === "John Doe" && age >= 25')
 * // Returns: { name: 'John Doe', age: 25 }
 */
export function parseFilterString(
    filterString: string,
): Record<string, unknown> {
    if (!filterString || typeof filterString !== 'string') {
        return {}
    }

    const result: Record<string, unknown> = {}

    // Нормализуем строку: заменяем && на and, === на ==
    const normalizedString = filterString
        .replace(/&&/g, 'and')
        .replace(/===/g, '==')
        .replace(/!==/g, '!=')
        .replace(/\|\|/g, 'or')

    // Разбиваем по логическим операторам
    const conditions = normalizedString.split(/\s+(?:and|or)\s+/i)

    for (const condition of conditions) {
        const trimmedCondition = condition.trim()
        if (!trimmedCondition) continue

        // Ищем операторы сравнения
        const operatorMatch = trimmedCondition.match(/\s*(==|!=|>=|<=|>|<)\s*/)

        if (operatorMatch) {
            const operator = operatorMatch[1]
            const parts = trimmedCondition.split(operatorMatch[0])

            if (parts.length === 2) {
                const field = parts[0].trim()
                let value = parts[1].trim()

                // Убираем кавычки если есть
                if (
                    (value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))
                ) {
                    value = value.slice(1, -1)
                }

                // Преобразуем значение в соответствующий тип
                const parsedValue = parseValue(value)

                // Для операторов == добавляем в результат
                if (operator === '==') {
                    result[field] = parsedValue
                }
                // Для других операторов создаем объект с оператором
                else {
                    // Заменяем оператор на MongoDB-подобный
                    const mongoOpMap: Record<string, string> = {
                        '>': 'gt',
                        '<': 'lt',
                        '>=': 'gte',
                        '<=': 'lte',
                        '!=': 'ne',
                        '==': 'eq',
                    }
                    const mongoOperator = mongoOpMap[operator]
                        ? `$${mongoOpMap[operator]}`
                        : operator
                    result[field] = { [mongoOperator]: parsedValue }
                    // result[field] = { [`$${operator}`]: parsedValue }
                }
            }
        }
    }

    return result
}

/**
 * Парсит значение в соответствующий тип данных
 * @param value - строковое значение
 * @returns преобразованное значение
 */
function parseValue(value: string): unknown {
    // Проверяем на null
    if (value.toLowerCase() === 'null') {
        return null
    }

    // Проверяем на boolean
    if (value.toLowerCase() === 'true') {
        return true
    }
    if (value.toLowerCase() === 'false') {
        return false
    }

    // Проверяем на число
    if (!isNaN(Number(value)) && value.trim() !== '') {
        const num = Number(value)
        // Возвращаем целое число если это возможно
        return Number.isInteger(num) ? Math.floor(num) : num
    }

    // Возвращаем как строку
    return value
}

/**
 * Преобразует объект обратно в строку фильтра
 * @param filterObject - объект фильтра
 * @returns строка фильтра
 *
 * @example
 * stringifyFilter({ field1: 'value1', field2: 25 })
 * // Returns: 'field1 == "value1" and field2 == 25'
 */
export function stringifyFilter(filterObject: Record<string, unknown>): string {
    if (!filterObject || typeof filterObject !== 'object') {
        return ''
    }

    const conditions: string[] = []

    for (const [field, value] of Object.entries(filterObject)) {
        if (value === null || value === undefined) {
            continue
        }

        if (typeof value === 'object' && value !== null) {
            // Обрабатываем операторы сравнения
            for (const [operator, operatorValue] of Object.entries(value)) {
                if (operator.startsWith('$')) {
                    const cleanOperator = operator.slice(1) // убираем $
                    const stringValue = stringifyValue(operatorValue)
                    conditions.push(`${field} ${cleanOperator} ${stringValue}`)
                }
            }
        } else {
            // Обычное равенство
            const stringValue = stringifyValue(value)
            conditions.push(`${field} == ${stringValue}`)
        }
    }

    return conditions.join(' and ')
}

/**
 * Преобразует значение в строку для фильтра
 * @param value - значение для преобразования
 * @returns строковое представление значения
 */
function stringifyValue(value: unknown): string {
    if (value === null) {
        return 'null'
    }

    if (typeof value === 'boolean') {
        return value.toString()
    }

    if (typeof value === 'number') {
        return value.toString()
    }

    if (typeof value === 'string') {
        // Экранируем кавычки и оборачиваем в двойные кавычки
        const escaped = value.replace(/"/g, '\\"')
        return `"${escaped}"`
    }

    // Для объектов и массивов используем JSON.stringify
    return JSON.stringify(value)
}

/**
 * Проверяет, является ли строка валидным фильтром
 * @param filterString - строка для проверки
 * @returns true если строка является валидным фильтром
 */
export function isValidFilterString(filterString: string): boolean {
    if (!filterString || typeof filterString !== 'string') {
        return false
    }

    try {
        const result = parseFilterString(filterString)
        return (
            Object.keys(result).length > 0 &&
            Object.keys(result).some((key) => key.length > 0)
        )
    } catch {
        return false
    }
}

/**
 * Извлекает имена полей из строки фильтра
 * @param filterString - строка фильтра
 * @returns массив имен полей
 */
export function extractFieldNames(filterString: string): string[] {
    if (!filterString || typeof filterString !== 'string') {
        return []
    }

    const result = parseFilterString(filterString)
    return Object.keys(result)
}

/**
 * Извлекает операторы из строки фильтра
 * @param filterString - строка фильтра
 * @returns массив операторов
 */
export function extractOperators(filterString: string): string[] {
    if (!filterString || typeof filterString !== 'string') {
        return []
    }

    const operators: string[] = []
    const operatorRegex = /\s*(==|!=|>=|<=|>|<|&&|\|\||and|or)\s*/gi
    let match

    while ((match = operatorRegex.exec(filterString)) !== null) {
        operators.push(match[1])
    }

    return operators
}

export const defaultFilterData =
    <T>(filterData: Partial<T>, options?: LineDbAdapterOptions) =>
    (record: Partial<T>) => {
        return Object.entries(filterData).every(([key, value]) => {
            const recordValue = record[key as keyof T]
            if (key === 'id') {
                // Пытаемся преобразовать recordValue к числу
                const recordValueNum = Number(recordValue)
                const valueNum = Number(value)
                const bothAreNumbers =
                    !isNaN(recordValueNum) && !isNaN(valueNum)
                if (bothAreNumbers) {
                    return recordValueNum === valueNum
                }
                const strValue = String(value).trim()
                const strRecordValue = String(recordValue).toString().trim()
                return strRecordValue === strValue
            }

            if (
                typeof value === 'string' &&
                typeof recordValue === 'string' &&
                options?.strictCompare == false
            ) {
                return recordValue.toLowerCase().includes(value.toLowerCase())
            }
            return recordValue === value
        })
    }
