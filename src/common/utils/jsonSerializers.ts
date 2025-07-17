/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
const UNDEFINED_MARKER = '__UNDEFINED_VALUE__'

export function stringifyWithUndefined(data: any): string {
    return JSON.stringify(data, (key, value) => {
        if (value === undefined) {
            return UNDEFINED_MARKER
        }
        return value
    })
}

export function parseWithUndefined(str: string): any {
    let hasUndefined = false
    const result = JSON.parse(str, (key, value) => {
        if (value === UNDEFINED_MARKER) {
            hasUndefined = true
            return UNDEFINED_MARKER
        }
        return value
    })

    if (hasUndefined) {
        replaceUndefinedMarkers(result)
    }
    return result
}

function replaceUndefinedMarkers(obj: any): void {
    if (obj === null || typeof obj !== 'object') {
        return
    }

    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            if (obj[i] === UNDEFINED_MARKER) {
                obj[i] = undefined
            } else if (typeof obj[i] === 'object' && obj[i] !== null) {
                replaceUndefinedMarkers(obj[i])
            }
        }
    } else {
        for (const key in obj) {
            if (obj[key] === UNDEFINED_MARKER) {
                obj[key] = undefined
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                replaceUndefinedMarkers(obj[key])
            }
        }
    }
}

export function stringifyWithSchema(
    data: any,
    schema: Record<string, string>,
): string {
    const processedData = { ...data }
    const fieldTypes: Record<string, string> = {}

    Object.keys(schema).forEach((field) => {
        const fieldSchema = schema[field]
        const value = processedData[field]

        if (value === undefined && fieldSchema.includes('?')) {
            fieldTypes[field] = 'undefined'
            processedData[field] = null
        } else if (value === null && fieldSchema.includes('null')) {
            fieldTypes[field] = 'null'
        }
    })

    const result = {
        ...processedData,
        __fieldTypes: fieldTypes,
    }

    return JSON.stringify(result)
}

export function parseWithSchema(
    str: string,
    schema: Record<string, string>,
): any {
    const parsed = JSON.parse(str)
    const { __fieldTypes, ...data } = parsed

    if (__fieldTypes && typeof __fieldTypes === 'object') {
        Object.keys(__fieldTypes).forEach((field) => {
            if (__fieldTypes[field] === 'undefined') {
                data[field] = undefined
            }
            // null остается null
        })
    }

    return data
}
