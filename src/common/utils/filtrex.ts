/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable no-control-regex */
import { compileExpression } from 'filtrex'

import filtrexFunctions from './filtrexFunctions'
// Тип для конфигурации фильтра
interface FilterConfig<T> {
    allowedFields?: Array<keyof T>
    allowedOperators?: Array<
        | '=='
        | '==='
        | '!='
        | '!=='
        | '>'
        | '>='
        | '<'
        | '<='
        | '&&'
        | '||'
        | 'and'
        | 'or'
    >
    allowFunctions?: boolean
    allowGlobals?: boolean
    skipValidation?: boolean
    extraFunctions?: Record<string, (...args: unknown[]) => unknown>
}

/**
 * Преобразует JavaScript-операторы в формат, поддерживаемый filtrex
 * @param expression Исходное выражение
 * @returns Преобразованное выражение
 */
function normalizeExpression(expression: string): string {
    return expression
        .replace(/&&/g, 'and')
        .replace(/\|\|/g, 'or')
        .replace(/===/g, '==')
        .replace(/!==/g, '!=')
        .replace(/'/g, '"')
}

/**
 * Декодирует base64 строку
 * @param str Строка для декодирования
 * @returns Декодированная строка или null если ошибка
 */
function decodeBase64(str: string): string | null {
    try {
        // Убираем возможные префиксы
        const cleanStr = str.replace(/^data:text\/javascript;base64,/, '')
        return atob(cleanStr)
    } catch {
        return null
    }
}

/**
 * Проверяет строку на наличие base64-кодированного JavaScript кода
 * @param str Строка для проверки
 * @returns true если обнаружен base64 JavaScript код
 */
function containsBase64JavaScript(
    str: string,
    safeFuncs: string[] = safeFunctions,
): boolean {
    // Паттерны для base64 JavaScript кода
    const base64Patterns = [
        // data:text/javascript;base64,
        /data:text\/javascript;base64,[A-Za-z0-9+/=]+/gi,
        // Просто base64 строки (проверяем на наличие JavaScript ключевых слов после декодирования)
        /[A-Za-z0-9+/]{10,}={0,2}/g, // base64 строки длиной 20+ символов
    ]

    for (const pattern of base64Patterns) {
        const matches = str.match(pattern)
        if (matches) {
            for (const match of matches) {
                const decoded = decodeBase64(match)
                if (decoded && containsJavaScriptCode(decoded, safeFuncs)) {
                    return true
                }
            }
        }
    }

    return false
}

/**
 * Список безопасных функций из filtrexFunctions
 */
const safeFunctions = [
    // Строковые функции
    'strLen',
    'strCmp',
    'strConcat',
    'strSplit',
    'strJoin',
    'strReplace',
    'strToLower',
    'strToUpper',
    'strTrim',
    'strPad',
    'strPadRight',
    'strRepeat',
    'strSlice',
    'strSubstring',

    // Функции для работы с датами
    'getFullYear',
    'getMonth',
    'getDay',
    'getHours',
    'getMinutes',
    'getSeconds',
    'getMilliseconds',
    'getTime',
    'formatDate',

    // Функции для проверки типов
    'isNumber',
    'isInteger',
    'isString',
    'isBoolean',
    'isArray',
    'isObject',
    'isNull',
    'isUndefined',

    // Математические функции
    'round',
    'abs',
    'min',
    'max',
    'inRange',

    // Функции для работы с массивами
    'arrLen',
    'arrIncludes',
    'arrIndexOf',
    'arrFirst',
    'arrLast',
    'arrConcat',
    'arrFilter',
    'arrMap',
    'arrSome',
    'arrEvery',
    'arrFind',
    'arrFindIndex',
    'arrSort',
    'arrReverse',
    'arrSlice',
    'arrUnique',
    'arrJoin',

    // Функции для работы с Map
    'mapFromEntries',
    'mapGet',
    'mapHas',
    'mapKeys',
    'mapValues',
    'mapEntries',
    'mapSize',

    // Функции для работы с Set
    'setFromValues',
    'setHas',
    'setValues',
    'setSize',
    'setUnion',
    'setIntersection',
    'setDifference',
]

/**
 * Проверяет строку на наличие JavaScript кода
 * @param str Строка для проверки
 * @returns true если обнаружен JavaScript код
 */
function containsJavaScriptCode(
    str: string,
    safeFuncs: string[] = safeFunctions,
): boolean {
    const jsPatterns = [
        // Исключаем ключевые слова JavaScript, которые могут выглядеть как функции
        /\b(function|var|let|const|if|else|for|while|do|switch|case|break|continue|return|throw|try|catch|finally|class|extends|super|new|delete|typeof|instanceof|void|in|of|with|debugger|export|import|default|async|await|yield|get|set|static|public|private|protected|interface|implements|enum|namespace|module|require|exports|global|window|document|console|alert|confirm|prompt|eval|Function|setTimeout|setInterval|setImmediate|clearTimeout|clearInterval|clearImmediate|requestAnimationFrame|cancelAnimationFrame|fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|process|Buffer|__dirname|__filename)\b/gi,

        // Функции и вызовы (исключая безопасные функции)
        /\b\w+\s*\(/g,
        /\bnew\s+\w+/g,

        // Операторы
        // /(===|==|!==|!=|<=|>=|<|>|\+\+|--|\+=|-=|\*=|\/=|%=|\*\*=|&=|\|=|\^=|<<=|>>=|>>>=|\+|-|\*|\/|%|\*\*|&|\||\^|~|<<|>>|>>>)/g,

        // Структуры данных
        /\[[^\]]*\]/g,
        /\{[^}]*\}/g,

        // Строковые литералы с потенциальным кодом
        /"[^"]*"/g,
        /'[^']*'/g,
        /`[^`]*`/g,

        // Комментарии
        /\/\/.*$/gm,
        /\/\*[\s\S]*?\*\//g,

        // Регулярные выражения
        /\/[^/]+\/[gimuy]*/g,

        // Точка с запятой и фигурные скобки
        /[;{}]/g,
    ]

    // Проверяем каждый паттерн
    for (const pattern of jsPatterns) {
        const matches = str.match(pattern)
        if (matches) {
            for (const match of matches) {
                // Проверяем, не является ли это безопасной функцией
                const isSafeFunction = safeFuncs.some((safeFunc) =>
                    match.toLowerCase().includes(safeFunc.toLowerCase()),
                )

                if (!isSafeFunction) {
                    return true
                }
            }
        }
    }

    return false
}

/**
 * Проверяет выражение на наличие вредоносных конструкций
 * @param expression Выражение для проверки
 * @throws Error если обнаружены вредоносные конструкции
 */
function validateExpressionSecurity(
    expression: string,
    safeFuncs: string[] = safeFunctions,
): void {
    // Проверяем на base64 JavaScript код
    if (containsBase64JavaScript(expression, safeFuncs)) {
        throw new Error(
            'Security violation: base64-encoded JavaScript code detected',
        )
    }

    // Проверяем на URL-encoded JavaScript код
    if (containsUrlEncodedJavaScript(expression, safeFuncs)) {
        throw new Error(
            'Security violation: URL-encoded JavaScript code detected',
        )
    }

    // Проверяем на hex-encoded JavaScript код
    if (containsHexEncodedJavaScript(expression, safeFuncs)) {
        throw new Error(
            'Security violation: hex-encoded JavaScript code detected',
        )
    }

    // Проверяем на Unicode-encoded JavaScript код
    if (containsUnicodeEncodedJavaScript(expression, safeFuncs)) {
        throw new Error(
            'Security violation: Unicode-encoded JavaScript code detected',
        )
    }

    // List of forbidden patterns
    const maliciousPatterns = [
        // eval и Function
        /\beval\s*\(/gi,
        /\bFunction\s*\(/gi,
        /\bnew\s+Function\s*\(/gi,

        // Global objects
        /\bglobal\b/gi,
        /\bwindow\b/gi,
        /\bdocument\b/gi,
        /\bprocess\b/gi,
        /\bconsole\b/gi,

        // Modules and imports
        /\brequire\s*\(/gi,
        /\bimport\s*\(/gi,
        /\bmodule\b/gi,
        /\bexports\b/gi,

        // Prototypes and constructors
        /\b__proto__\b/gi,
        /\bconstructor\b/gi,
        /\bprototype\b/gi,
        /\bnew\s+(Object|Array|String|Number|Boolean|Date|RegExp)\s*\(/gi,

        // Assignment operators
        /\b=\s*[^=]/g, // simple assignment
        /\b\+=/g,
        /\b-=/g,
        /\b\*=/g,
        /\b\/=/g,
        /\b%=/g,
        /\b\*\*=/g,

        // Semicolon (injection)
        /;/g,

        // Functions and calls (исключая безопасные функции)
        /\b\(\)/g, // пустые вызовы
        /\bnew\s+/gi,

        // Control characters
        /[\x00-\x1F\x7F-\x9F]/g,

        // HTML and JavaScript
        /<[^>]*>/g,
        /\bjavascript:/gi,

        // Debugging constructs
        /\bdebugger\b/gi,
        /\bwith\b/gi,

        // Classes and async/await
        /\bclass\b/gi,
        /\basync\b/gi,
        /\bawait\b/gi,
        /\byield\b/gi,

        // Other dangerous constructs
        /\bthis\b/gi,
        /\bsuper\b/gi,
        /\barguments\b/gi,
        /\bdelete\b/gi,
        /\btypeof\b/gi,
        /\binstanceof\b/gi,
        /\bvoid\b/gi,
        /\bin\b/gi,

        // Template literals
        /`[^`]*\$\{[^}]*\}[^`]*`/g,

        // Arrays and objects with potentially dangerous content
        // /\[[^\]]*\]/g,
        // /\{[^}]*\}/g,

        // Base64 patterns (дополнительные)
        /[A-Za-z0-9+/]{50,}={0,2}/g, // длинные base64 строки
        /data:[^;]+;base64,/gi, // data URLs с base64

        // Дополнительные проверки для base64
        /"[A-Za-z0-9+/]{20,}={0,2}"/g, // base64 строки в кавычках
        /'[A-Za-z0-9+/]{20,}={0,2}'/g, // base64 строки в одинарных кавычках
    ]

    // Проверяем каждый паттерн
    for (const pattern of maliciousPatterns) {
        if (pattern.test(expression)) {
            throw new Error(
                `Security violation: forbidden pattern detected in expression`,
            )
        }
    }

    // Дополнительные проверки
    const normalizedExpression = expression.toLowerCase()

    // Проверяем на наличие опасных функций (исключая безопасные)
    const dangerousFunctions = [
        'alert',
        'confirm',
        'prompt',
        'setTimeout',
        'setInterval',
        'setImmediate',
        'clearTimeout',
        'clearInterval',
        'clearImmediate',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'fetch',
        'XMLHttpRequest',
        'WebSocket',
        'localStorage',
        'sessionStorage',
        'indexedDB',
        'crypto',
        'performance',
        'navigator',
        'location',
        'history',
        'screen',
        'atob',
        'btoa',
        'unescape',
        'escape',
        'decodeURI',
        'decodeURIComponent',
        'encodeURI',
        'encodeURIComponent',
    ]

    for (const func of dangerousFunctions) {
        if (normalizedExpression.includes(func)) {
            throw new Error(
                `Security violation: forbidden function '${func}' detected`,
            )
        }
    }

    // Проверяем на наличие опасных объектов
    const dangerousObjects = [
        'global',
        'window',
        'document',
        'process',
        'console',
        'module',
        'exports',
        'require',
        'import',
        'arguments',
        'this',
        'super',
        '__proto__',
        'constructor',
        'prototype',
    ]

    for (const obj of dangerousObjects) {
        if (normalizedExpression.includes(obj)) {
            throw new Error(
                `Security violation: forbidden object '${obj}' detected`,
            )
        }
    }

    // Дополнительная проверка на base64 строки
    const base64Matches = expression.match(/"[A-Za-z0-9+/]{20,}={0,2}"/g)
    if (base64Matches) {
        for (const match of base64Matches) {
            const base64Str = match.slice(1, -1) // убираем кавычки
            try {
                const decoded = atob(base64Str)
                if (containsJavaScriptCode(decoded, safeFuncs)) {
                    throw new Error(
                        'Security violation: base64-encoded JavaScript code detected',
                    )
                }
            } catch {
                // Игнорируем ошибки декодирования
            }
        }
    }

    // Проверка на одинарные кавычки
    const base64MatchesSingle = expression.match(/'[A-Za-z0-9+/]{20,}={0,2}'/g)
    if (base64MatchesSingle) {
        for (const match of base64MatchesSingle) {
            const base64Str = match.slice(1, -1) // убираем кавычки
            try {
                const decoded = atob(base64Str)
                if (containsJavaScriptCode(decoded, safeFuncs)) {
                    throw new Error(
                        'Security violation: base64-encoded JavaScript code detected',
                    )
                }
            } catch {
                // Игнорируем ошибки декодирования
            }
        }
    }
}

/**
 * Проверяет строку на наличие URL-encoded JavaScript кода
 * @param str Строка для проверки
 * @returns true если обнаружен URL-encoded JavaScript код
 */
function containsUrlEncodedJavaScript(
    str: string,
    safeFuncs: string[] = safeFunctions,
): boolean {
    const urlEncodedPatterns = [
        /%[0-9A-Fa-f]{2}/g, // URL-encoded символы
    ]

    for (const pattern of urlEncodedPatterns) {
        const matches = str.match(pattern)
        if (matches && matches.length > 5) {
            // Если много URL-encoded символов
            try {
                const decoded = decodeURIComponent(str)
                if (containsJavaScriptCode(decoded, safeFuncs)) {
                    return true
                }
            } catch {
                // Игнорируем ошибки декодирования
            }
        }
    }

    return false
}

/**
 * Проверяет строку на наличие hex-encoded JavaScript кода
 * @param str Строка для проверки
 * @returns true если обнаружен hex-encoded JavaScript код
 */
function containsHexEncodedJavaScript(
    str: string,
    safeFuncs: string[] = safeFunctions,
): boolean {
    const hexPatterns = [
        /\\x[0-9A-Fa-f]{2}/g, // hex escape sequences
        /\\u[0-9A-Fa-f]{4}/g, // Unicode escape sequences
    ]

    for (const pattern of hexPatterns) {
        const matches = str.match(pattern)
        if (matches && matches.length > 3) {
            // Если много hex-encoded символов
            try {
                const decoded = str
                    .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) =>
                        String.fromCharCode(parseInt(hex, 16)),
                    )
                    .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) =>
                        String.fromCharCode(parseInt(hex, 16)),
                    )
                if (containsJavaScriptCode(decoded, safeFuncs)) {
                    return true
                }
            } catch {
                // Игнорируем ошибки декодирования
            }
        }
    }

    return false
}

/**
 * Проверяет строку на наличие Unicode-encoded JavaScript кода
 * @param str Строка для проверки
 * @returns true если обнаружен Unicode-encoded JavaScript код
 */
function containsUnicodeEncodedJavaScript(
    str: string,
    safeFuncs: string[] = safeFunctions,
): boolean {
    const unicodePatterns = [
        /\\u[0-9A-Fa-f]{4}/g, // Unicode escape sequences
        /\\u\{[0-9A-Fa-f]+\}/g, // Unicode code point escape sequences
    ]

    for (const pattern of unicodePatterns) {
        const matches = str.match(pattern)
        if (matches && matches.length > 2) {
            // Если много Unicode-encoded символов
            try {
                const decoded = str
                    .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) =>
                        String.fromCharCode(parseInt(hex, 16)),
                    )
                    .replace(/\\u\{([0-9A-Fa-f]+)\}/g, (_, hex) =>
                        String.fromCodePoint(parseInt(hex, 16)),
                    )
                if (containsJavaScriptCode(decoded, safeFuncs)) {
                    return true
                }
            } catch {
                // Игнорируем ошибки декодирования
            }
        }
    }

    return false
}
/**
 * Извлекает имена функций из выражения
 * @param expression Выражение для анализа
 * @returns Массив имен функций
 */
function extractFunctionNames(expression: string): string[] {
    // Паттерн для поиска вызовов функций: functionName(arguments)
    const functionCallPattern = /([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g
    const functionNames: string[] = []
    let match

    while ((match = functionCallPattern.exec(expression)) !== null) {
        const functionName = match[1]
        // Exclude JavaScript keywords that might look like functions
        const jsKeywords = [
            'if',
            'else',
            'for',
            'while',
            'do',
            'switch',
            'case',
            'break',
            'continue',
            'return',
            'throw',
            'try',
            'catch',
            'finally',
            'class',
            'extends',
            'super',
            'new',
            'delete',
            'typeof',
            'instanceof',
            'void',
            'in',
            'of',
            'with',
            'debugger',
            'export',
            'import',
            'default',
            'async',
            'await',
            'yield',
            'get',
            'set',
            'static',
            'public',
            'private',
            'protected',
            'interface',
            'implements',
            'enum',
            'namespace',
            'module',
            'require',
            'exports',
            'global',
            'window',
            'document',
            'process',
            'console',
            'debugger',
            'or',
            'and',
            'not',
            'true',
            'false',
            'null',
            'undefined',
            'this',
            'super',
            'prototype',
            'constructor',
            '__proto__',
            'Object',
            'Array',
        ]

        if (!jsKeywords.includes(functionName)) {
            functionNames.push(functionName)
        }
    }

    return [...new Set(functionNames)] // Убираем дубликаты
}

/**
 * Создает безопасный фильтр для фильтрации данных на основе строкового выражения
 * @param expression Строковое выражение для фильтрации
 * @param config Конфигурация фильтра
 * @returns Функция фильтрации
 */
export function createSafeFilter<T>(
    expression: string,
    config: FilterConfig<T> = { skipValidation: false },
): (data: T) => boolean {
    try {
        // Check security of the expression BEFORE compilation
        if (!config.skipValidation) {
            validateExpressionSecurity(expression, [
                ...safeFunctions,
                ...Object.keys(config.extraFunctions || {}),
            ])
        }

        // Normalize the expression BEFORE compilation
        const normalizedExpression = normalizeExpression(expression)
        let filtrexExtraFunctions = { ...filtrexFunctions }
        if (config.extraFunctions) {
            filtrexExtraFunctions = {
                ...filtrexExtraFunctions,
                ...config.extraFunctions,
            }
        }

        // Проверяем, что все функции в выражении существуют
        const functionNames = extractFunctionNames(normalizedExpression)
        const availableFunctions = [
            ...Object.keys(filtrexFunctions),
            ...Object.keys(config.extraFunctions || {}),
        ]

        const undefinedFunctions = functionNames.filter(
            (func) => !availableFunctions.includes(func),
        )

        if (undefinedFunctions.length > 0) {
            throw new Error(
                `Undefined functions detected: ${undefinedFunctions.join(
                    ', ',
                )}`,
            )
        }

        // Compile the expression without additional options
        const filter = compileExpression(normalizedExpression, {
            extraFunctions: filtrexExtraFunctions,
        })

        // Delete all string literals (single and double quotes)
        const expressionWithoutStrings = normalizedExpression.replace(
            /(["'])(?:\\.|[^\\])*?\1/g,
            '',
        )
        const usedFields =
            expressionWithoutStrings.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []

        // Создаем обертку для проверки разрешенных полей и операторов
        return (data: T) => {
            // Проверяем, что используются только разрешенные поля
            if (config.allowedFields) {
                const hasUnauthorizedField = usedFields.some(
                    (field) =>
                        !config.allowedFields?.includes(field as keyof T),
                )
                if (hasUnauthorizedField) {
                    throw new Error('Unauthorized field')
                }
            }

            // Проверяем, что используются только разрешенные операторы
            if (config.allowedOperators) {
                const operators = [
                    '==',
                    '===',
                    '!=',
                    '!==',
                    '>',
                    '>=',
                    '<',
                    '<=',
                    '&&',
                    '||',
                    'and',
                    'or',
                ] as const
                const usedOperators = operators.filter((op) =>
                    normalizedExpression.includes(op),
                )
                const hasUnauthorizedOperator = usedOperators.some(
                    (op) => !config.allowedOperators?.includes(op),
                )
                if (hasUnauthorizedOperator) {
                    throw new Error('Unauthorized operator')
                }
            }

            return Boolean(filter(data))
        }
    } catch (error) {
        console.error('Error in createSafeFilter:', error)
        throw new Error(`Error in createSafeFilter: ${error}`)
    }
}



export function sanitizeForEval(input: string): string {
    // Удаляем все потенциально опасные символы и конструкции
    return (
        input
            // Удаляем все комментарии
            .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
            // Удаляем все пробельные символы в начале и конце
            .trim()
            // Экранируем кавычки
            .replace(/"/g, '\\"')
            // Экранируем обратные слеши
            .replace(/\\/g, '\\\\')
            // Удаляем все управляющие символы
            .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
            // Удаляем все непечатаемые символы
            .replace(/[^\x20-\x7E]/g, '')
            // Удаляем все HTML-теги
            .replace(/<[^>]*>/g, '')
            // Удаляем все JavaScript-выражения
            .replace(/javascript:/gi, '')
            // Удаляем все попытки вызова функций
            .replace(/\(\)/g, '')
            // Удаляем все попытки присваивания
            .replace(/=/g, '')
            // Удаляем все попытки использования eval
            .replace(/eval/gi, '')
            // Удаляем все попытки использования Function
            .replace(/Function/gi, '')
            // Удаляем все попытки использования new
            .replace(/new\s+/gi, '')
            // Удаляем все попытки использования import
            .replace(/import/gi, '')
            // Удаляем все попытки использования require
            .replace(/require/gi, '')
            // Удаляем все попытки использования module
            .replace(/module/gi, '')
            // Удаляем все попытки использования exports
            .replace(/exports/gi, '')
            // Удаляем все попытки использования global
            .replace(/global/gi, '')
            // Удаляем все попытки использования window
            .replace(/window/gi, '')
            // Удаляем все попытки использования document
            .replace(/document/gi, '')
            // Удаляем все попытки использования process
            .replace(/process/gi, '')
            // Удаляем все попытки использования __dirname
            .replace(/__dirname/gi, '')
            // Удаляем все попытки использования __filename
            .replace(/__filename/gi, '')
            // Удаляем все попытки использования console
            .replace(/console/gi, '')
            // Удаляем все попытки использования debugger
            .replace(/debugger/gi, '')
            // Удаляем все попытки использования with
            .replace(/with/gi, '')
            // Удаляем все попытки использования this
            .replace(/this/gi, '')
            // Удаляем все попытки использования super
            .replace(/super/gi, '')
            // Удаляем все попытки использования prototype
            .replace(/prototype/gi, '')
            // Удаляем все попытки использования constructor
            .replace(/constructor/gi, '')
            // Удаляем все попытки использования __proto__
            .replace(/__proto__/gi, '')
            // Удаляем все попытки использования Object
            .replace(/Object/gi, '')
            // Удаляем все попытки использования Array
            .replace(/Array/gi, '')
            // Удаляем все попытки использования String
            .replace(/String/gi, '')
            // Удаляем все попытки использования Number
            .replace(/Number/gi, '')
            // Удаляем все попытки использования Boolean
            .replace(/Boolean/gi, '')
            // Удаляем все попытки использования Date
            .replace(/Date/gi, '')
            // Удаляем все попытки использования RegExp
            .replace(/RegExp/gi, '')
            // Удаляем все попытки использования Error
            .replace(/Error/gi, '')
            // Удаляем все попытки использования Promise
            .replace(/Promise/gi, '')
            // Удаляем все попытки использования async
            .replace(/async/gi, '')
            // Удаляем все попытки использования await
            .replace(/await/gi, '')
            // Удаляем все попытки использования yield
            .replace(/yield/gi, '')
            // Удаляем все попытки использования generator
            .replace(/generator/gi, '')
            // Удаляем все попытки использования iterator
            .replace(/iterator/gi, '')
            // Удаляем все попытки использования symbol
            .replace(/symbol/gi, '')
            // Удаляем все попытки использования proxy
            .replace(/proxy/gi, '')
            // Удаляем все попытки использования reflect
            .replace(/reflect/gi, '')
            // Удаляем все попытки использования weakmap
            .replace(/weakmap/gi, '')
            // Удаляем все попытки использования weakset
            .replace(/weakset/gi, '')
            // Удаляем все попытки использования map
            .replace(/map/gi, '')
            // Удаляем все попытки использования set
            .replace(/set/gi, '')
            // Удаляем все попытки использования weakref
            .replace(/weakref/gi, '')
            // Удаляем все попытки использования finalizationregistry
            .replace(/finalizationregistry/gi, '')
            // Удаляем все попытки использования bigint
            .replace(/bigint/gi, '')
            // Удаляем все попытки использования bigint64array
            .replace(/bigint64array/gi, '')
            // Удаляем все попытки использования biguint64array
            .replace(/biguint64array/gi, '')
            // Удаляем все попытки использования float32array
            .replace(/float32array/gi, '')
            // Удаляем все попытки использования float64array
            .replace(/float64array/gi, '')
            // Удаляем все попытки использования int8array
            .replace(/int8array/gi, '')
            // Удаляем все попытки использования int16array
            .replace(/int16array/gi, '')
            // Удаляем все попытки использования int32array
            .replace(/int32array/gi, '')
            // Удаляем все попытки использования uint8array
            .replace(/uint8array/gi, '')
            // Удаляем все попытки использования uint16array
            .replace(/uint16array/gi, '')
            // Удаляем все попытки использования uint32array
            .replace(/uint32array/gi, '')
            // Удаляем все попытки использования uint8clampedarray
            .replace(/uint8clampedarray/gi, '')
            // Удаляем все попытки использования arraybuffer
            .replace(/arraybuffer/gi, '')
            // Удаляем все попытки использования sharedarraybuffer
            .replace(/sharedarraybuffer/gi, '')
            // Удаляем все попытки использования dataview
            .replace(/dataview/gi, '')
            // Удаляем все попытки использования atob
            .replace(/atob/gi, '')
            // Удаляем все попытки использования btoa
            .replace(/btoa/gi, '')
            // Удаляем все попытки использования setinterval
            .replace(/setinterval/gi, '')
            // Удаляем все попытки использования settimeout
            .replace(/settimeout/gi, '')
            // Удаляем все попытки использования setimmediate
            .replace(/setimmediate/gi, '')
            // Удаляем все попытки использования clearinterval
            .replace(/clearinterval/gi, '')
            // Удаляем все попытки использования cleartimeout
            .replace(/cleartimeout/gi, '')
            // Удаляем все попытки использования clearimmediate
            .replace(/clearimmediate/gi, '')
            // Удаляем все попытки использования requestanimationframe
            .replace(/requestanimationframe/gi, '')
            // Удаляем все попытки использования cancelanimationframe
            .replace(/cancelanimationframe/gi, '')
            // Удаляем все попытки использования requestidlecallback
            .replace(/requestidlecallback/gi, '')
            // Удаляем все попытки использования cancelidlecallback
            .replace(/cancelidlecallback/gi, '')
            // Удаляем все попытки использования performance
            .replace(/performance/gi, '')
            // Удаляем все попытки использования navigator
            .replace(/navigator/gi, '')
            // Удаляем все попытки использования location
            .replace(/location/gi, '')
            // Удаляем все попытки использования history
            .replace(/history/gi, '')
            // Удаляем все попытки использования localStorage
            .replace(/localStorage/gi, '')
            // Удаляем все попытки использования sessionStorage
            .replace(/sessionStorage/gi, '')
            // Удаляем все попытки использования indexedDB
            .replace(/indexedDB/gi, '')
            // Удаляем все попытки использования webSQL
            .replace(/webSQL/gi, '')
            // Удаляем все попытки использования cookies
            .replace(/cookies/gi, '')
            // Удаляем все попытки использования cookie
            .replace(/cookie/gi, '')
            // Удаляем все попытки использования fetch
            .replace(/fetch/gi, '')
            // Удаляем все попытки использования XMLHttpRequest
            .replace(/XMLHttpRequest/gi, '')
            // Удаляем все попытки использования WebSocket
            .replace(/WebSocket/gi, '')
            // Удаляем все попытки использования EventSource
            .replace(/EventSource/gi, '')
            // Удаляем все попытки использования Worker
            .replace(/Worker/gi, '')
            // Удаляем все попытки использования SharedWorker
            .replace(/SharedWorker/gi, '')
            // Удаляем все попытки использования ServiceWorker
            .replace(/ServiceWorker/gi, '')
            // Удаляем все попытки использования BroadcastChannel
            .replace(/BroadcastChannel/gi, '')
            // Удаляем все попытки использования MessageChannel
            .replace(/MessageChannel/gi, '')
            // Удаляем все попытки использования MessagePort
            .replace(/MessagePort/gi, '')
            // Удаляем все попытки использования Image
            .replace(/Image/gi, '')
            // Удаляем все попытки использования Audio
            .replace(/Audio/gi, '')
            // Удаляем все попытки использования Video
            .replace(/Video/gi, '')
            // Удаляем все попытки использования Canvas
            .replace(/Canvas/gi, '')
            // Удаляем все попытки использования WebGL
            .replace(/WebGL/gi, '')
            // Удаляем все попытки использования WebGL2
            .replace(/WebGL2/gi, '')
            // Удаляем все попытки использования WebGLRenderingContext
            .replace(/WebGLRenderingContext/gi, '')
            // Удаляем все попытки использования WebGL2RenderingContext
            .replace(/WebGL2RenderingContext/gi, '')
            // Удаляем все попытки использования WebGLShader
            .replace(/WebGLShader/gi, '')
            // Удаляем все попытки использования WebGLProgram
            .replace(/WebGLProgram/gi, '')
            // Удаляем все попытки использования WebGLBuffer
            .replace(/WebGLBuffer/gi, '')
            // Удаляем все попытки использования WebGLFramebuffer
            .replace(/WebGLFramebuffer/gi, '')
            // Удаляем все попытки использования WebGLRenderbuffer
            .replace(/WebGLRenderbuffer/gi, '')
            // Удаляем все попытки использования WebGLTexture
            .replace(/WebGLTexture/gi, '')
            // Удаляем все попытки использования WebGLUniformLocation
            .replace(/WebGLUniformLocation/gi, '')
            // Удаляем все попытки использования WebGLActiveInfo
            .replace(/WebGLActiveInfo/gi, '')
            // Удаляем все попытки использования WebGLShaderPrecisionFormat
            .replace(/WebGLShaderPrecisionFormat/gi, '')
            // Удаляем все попытки использования WebGLContextEvent
            .replace(/WebGLContextEvent/gi, '')
            // Удаляем все попытки использования WebGLContextAttributes
            .replace(/WebGLContextAttributes/gi, '')
            // Удаляем все попытки использования WebGLContextLostEvent
            .replace(/WebGLContextLostEvent/gi, '')
            // Удаляем все попытки использования WebGLContextRestoredEvent
            .replace(/WebGLContextRestoredEvent/gi, '')
            // Удаляем все попытки использования WebGLPowerPreference
            .replace(/WebGLPowerPreference/gi, '')
            // Удаляем все попытки использования WebGLCompressedTextureS3TC
            .replace(/WebGLCompressedTextureS3TC/gi, '')
            // Удаляем все попытки использования WebGLCompressedTexturePVRTC
            .replace(/WebGLCompressedTexturePVRTC/gi, '')
            // Удаляем все попытки использования WebGLCompressedTextureETC1
            .replace(/WebGLCompressedTextureETC1/gi, '')
            // Удаляем все попытки использования WebGLCompressedTextureASTC
            .replace(/WebGLCompressedTextureASTC/gi, '')
            // Удаляем все попытки использования WebGLCompressedTextureATC
            .replace(/WebGLCompressedTextureATC/gi, '')
            // Удаляем все попытки использования WebGLCompressedTextureBPTC
            .replace(/WebGLCompressedTextureBPTC/gi, '')
            // Удаляем все попытки использования WebGLCompressedTextureRGTC
            .replace(/WebGLCompressedTextureRGTC/gi, '')
            // Удаляем все попытки использования WebGLCompressedTextureSRGB
            .replace(/WebGLCompressedTextureSRGB/gi, '')
            // Удаляем все попытки использования WebGLCompressedTextureRGBA
            .replace(/WebGLCompressedTextureRGBA/gi, '')
            // Удаляем все попытки использования WebGLCompressedTextureRGB
            .replace(/WebGLCompressedTextureRGB/gi, '')
            // Удаляем все попытки использования WebGLCompressedTextureLuminance
            .replace(/WebGLCompressedTextureLuminance/gi, '')
            // Удаляем все попытки использования WebGLCompressedTextureLuminanceAlpha
            .replace(/WebGLCompressedTextureLuminanceAlpha/gi, '')
            // Удаляем все попытки использования WebGLCompressedTextureAlpha
            .replace(/WebGLCompressedTextureAlpha/gi, '')
            // Удаляем все попытки использования WebGLCompressedTextureDepth
            .replace(/WebGLCompressedTextureDepth/gi, '')
            // Удаляем все попытки использования WebGLCompressedTextureStencil
            .replace(/WebGLCompressedTextureStencil/gi, '')
            // Удаляем все попытки использования WebGLCompressedTextureDepthStencil
            .replace(/WebGLCompressedTextureDepthStencil/gi, '')
            // Удаляем все попытки использования WebGLCompressedTextureSRGB_ALPHA
            .replace(/WebGLCompressedTextureSRGB_ALPHA/gi, '')
            // Удаляем все попытки использования WebGLCompressedTextureSRGB
            .replace(/WebGLCompressedTextureSRGB/gi, '')
            // Удаляем все попытки использования WebGLCompressedTextureSRGB_ALPHA
            .replace(/WebGLCompressedTextureSRGB_ALPHA/gi, '')
            // Удаляем все попытки использования WebGLCompressedTextureSRGB
            .replace(/WebGLCompressedTextureSRGB/gi, '')
            // Удаляем все попытки использования WebGLCompressedTextureSRGB_ALPHA
            .replace(/WebGLCompressedTextureSRGB_ALPHA/gi, '')
            // Удаляем все попытки использования WebGLCompressedTextureSRGB
            .replace(/WebGLCompressedTextureSRGB/gi, '')
    )
}

export function strictSanitizeForEval(input: string): string {
    // Разрешаем только цифры, буквы, пробелы и базовые арифметические операторы
    return input.replace(/[^0-9a-zA-Z+\-*/()., ]/g, '')
}
