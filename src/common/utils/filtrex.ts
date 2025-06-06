/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable no-control-regex */
import { compileExpression } from 'filtrex'

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
 * Создает безопасный фильтр для фильтрации данных на основе строкового выражения
 * @param expression Строковое выражение для фильтрации
 * @param config Конфигурация фильтра
 * @returns Функция фильтрации
 */
export function createSafeFilter<T>(
    expression: string,
    config: FilterConfig<T> = {},
): (data: T) => boolean {
    try {
        // Нормализуем выражение перед компиляцией
        const normalizedExpression = normalizeExpression(expression)

        // Компилируем выражение без дополнительных опций
        const filter = compileExpression(normalizedExpression)

        // Создаем обертку для проверки разрешенных полей и операторов
        return (data: T) => {
            // Удаляем все строковые литералы (одинарные и двойные кавычки)
            const expressionWithoutStrings = normalizedExpression.replace(
                /(["'])(?:\\.|[^\\])*?\1/g,
                '',
            )
            const usedFields =
                expressionWithoutStrings.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []

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
