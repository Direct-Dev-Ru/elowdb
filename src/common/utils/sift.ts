/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
import sift from 'sift'

interface SiftConfig<T> {
    allowedFields?: Array<keyof T>
    allowedOperators?: Array<
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
    >
}

export function isMongoDbLikeFilter(obj: unknown): boolean {
    if (typeof obj !== 'object' || obj === null) return false

    const mongoOperators = [
        '$in',
        '$nin',
        '$exists',
        '$gte',
        '$gt',
        '$lte',
        '$lt',
        '$eq',
        '$ne',
        '$mod',
        '$all',
        '$and',
        '$or',
        '$nor',
        '$not',
        '$size',
        '$type',
        '$regex',
        '$where',
        '$elemMatch',
        '$like',
    ]

    const check = (value: unknown): boolean => {
        if (typeof value !== 'object' || value === null) return false
        for (const key of Object.keys(value)) {
            if (mongoOperators.includes(key)) return true
            // Рекурсивно проверяем вложенные объекты
            if (
                typeof value[key as keyof typeof value] === 'object' &&
                value[key as keyof typeof value] !== null &&
                !isBuiltInObject(value[key as keyof typeof value]) &&
                check(value[key as keyof typeof value])
            )
                return true
        }
        return false
    }

    return check(obj)
}

/**
 * Convert SQL-like pattern to regex
 * @param pattern SQL-like pattern (% - any number of characters, _ - one character)
 * @returns Regular expression
 */
function convertLikeToRegex(pattern: string): string {
    return pattern
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special regex characters
        .replace(/%/g, '.*') // Replace % with .*
        .replace(/_/g, '.') // Replace _ with .
}

/**
 * Check if value is a built-in JavaScript object
 * @param value Value to check
 * @returns true if value is a built-in JavaScript object
 */
function isBuiltInObject(value: unknown): boolean {
    return (
        value instanceof Date ||
        value instanceof RegExp ||
        value instanceof Map ||
        value instanceof Set ||
        value instanceof WeakMap ||
        value instanceof WeakSet ||
        value instanceof ArrayBuffer ||
        value instanceof DataView ||
        value instanceof Int8Array ||
        value instanceof Uint8Array ||
        value instanceof Uint8ClampedArray ||
        value instanceof Int16Array ||
        value instanceof Uint16Array ||
        value instanceof Int32Array ||
        value instanceof Uint32Array ||
        value instanceof Float32Array ||
        value instanceof Float64Array ||
        value instanceof BigInt64Array ||
        value instanceof BigUint64Array
    )
}

/**
 * Convert $like to $regex
 * @param query Query to convert
 * @returns Converted query
 */
function convertLikeToRegexQuery(
    query: Record<string, unknown>,
): Record<string, unknown> {
    const result: Record<string, unknown> = {}

    for (const key in query) {
        const value = query[key]

        if (typeof value === 'object' && value !== null) {
            if (isBuiltInObject(value)) {
                result[key] = value
            } else if (Array.isArray(value)) {
                result[key] = value.map((item) =>
                    typeof item === 'object' &&
                    item !== null &&
                    !isBuiltInObject(item)
                        ? convertLikeToRegexQuery(
                              item as Record<string, unknown>,
                          )
                        : item,
                )
            } else {
                const objValue = value as Record<string, unknown>
                result[key] =
                    '$like' in objValue && typeof objValue.$like === 'string'
                        ? {
                              $regex: convertLikeToRegex(objValue.$like),
                          }
                        : convertLikeToRegexQuery(objValue)
            }
        } else {
            result[key] = value
        }
    }

    return result
}

/**
 * createSafeSiftFilter creates a safe filter for filtering data based on MongoDB-like syntax
 * @param query MongoDB-like query
 * @param config Filter configuration
 * @returns Filter function
 */
export function createSafeSiftFilter<T>(
    query: Record<string, unknown>,
    config: SiftConfig<T> = {},
): (data: T) => boolean {
    // Validate input
    if (typeof query !== 'object' || query === null) {
        throw new Error('Query must be an object')
    }

    if (!config.allowedOperators) {
        config.allowedOperators = [
            '$in',
            '$nin',
            '$exists',
            '$gte',
            '$gt',
            '$lte',
            '$lt',
            '$eq',
            '$ne',
            '$mod',
            '$all',
            '$and',
            '$or',
            '$nor',
            '$not',
            '$size',
            '$type',
            '$regex',
            '$where',
            '$elemMatch',
            '$like',
        ]
    }

    // Convert $like to $regex
    // const processedQuery = query
    const processedQuery = convertLikeToRegexQuery(query)

    // Check that only allowed fields are used
    if (config.allowedFields) {
        const checkFields = (obj: Record<string, unknown>): boolean => {
            for (const key in obj) {
                if (key.startsWith('$')) {
                    if (Array.isArray(obj[key])) {
                        const arrObjs = obj[key] as Record<string, unknown>[]
                        for (const item of arrObjs ) {
                            if (
                                typeof item === 'object' &&
                                !checkFields(item)
                            ) {
                                return false
                            }
                        }
                    } else if (
                        typeof obj[key] === 'object' &&
                        !checkFields(obj[key] as Record<string, unknown>)
                    ) {
                        return false
                    }
                } else if (!config.allowedFields?.includes(key as keyof T)) {
                    return false
                }
            }
            return true
        }

        if (!checkFields(processedQuery)) {
            throw new Error('Unauthorized field in query')
        }
    }

    // Check that only allowed operators are used
    if (config.allowedOperators) {
        if (
            config.allowedOperators.includes('$like') &&
            !config.allowedOperators.includes('$regex')
        ) {
            config.allowedOperators.push('$regex')
        }
        const checkOperators = (obj: Record<string, unknown>): boolean => {
            for (const key in obj) {
                if (key.startsWith('$')) {
                    if (
                        !config.allowedOperators?.includes(
                            key as (typeof config.allowedOperators)[number],
                        )
                    ) {
                        throw new Error('Unauthorized operator in query')
                    }
                    if (
                        typeof obj[key] === 'object' &&
                        !checkOperators(obj[key] as Record<string, unknown>)
                    ) {
                        throw new Error('Unauthorized operator')
                    }
                } else if (
                    config.allowedFields &&
                    !config.allowedFields?.includes(key as keyof T)
                ) {
                    throw new Error('Unauthorized field in query')
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    // Check operators inside field values
                    const value = obj[key] as Record<string, unknown>
                    for (const opKey in value) {
                        if (opKey.startsWith('$')) {
                            if (
                                !config.allowedOperators?.includes(
                                    opKey as (typeof config.allowedOperators)[number],
                                )
                            ) {
                                throw new Error(
                                    'Unauthorized operator in query',
                                )
                            }
                            if (
                                typeof value[opKey] === 'object' &&
                                !checkOperators(
                                    value[opKey] as Record<string, unknown>,
                                )
                            ) {
                                throw new Error('Unauthorized operator')
                            }
                        }
                    }
                }
            }
            return true
        }

        if (!checkOperators(processedQuery)) {
            throw new Error('Unauthorized operator in query')
        }
    }

    // Create filter with sift
    const filter = sift(processedQuery)

    return (data: T) => Boolean(filter(data))
}

/**
 * Filter array of objects with MongoDB-like syntax
 * @param array Array of objects to filter
 * @param query MongoDB-like query
 * @param config Filter configuration
 * @returns Filtered array
 */
export function filterArrayWithSift<T>(
    array: T[],
    query: Record<string, unknown>,
    config: SiftConfig<T> = {},
): T[] {
    const filter = createSafeSiftFilter(query, config)
    return array.filter(filter)
}

/**
 * Check if object matches the filter conditions
 * @param object Object to check
 * @param query MongoDB-like query
 * @param config Filter configuration
 * @returns true if object matches the filter conditions
 */
export function matchesQueryWithSift<T>(
    object: T,
    query: Record<string, unknown>,
    config: SiftConfig<T> = {},
): boolean {
    const filter = createSafeSiftFilter(query, config)
    return filter(object)
}
