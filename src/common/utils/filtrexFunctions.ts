/**
 * Получает длину строки
 * @param s - Входная строка
 * @returns Длина строки
 */
function strLen(s: string): number {
    return s.length
}

/**
 * Сравнивает две строки
 * @param s1 - Первая строка
 * @param s2 - Вторая строка
 * @returns -1 если s1 < s2, 0 если равны, 1 если s1 > s2
 */
function strCmp(s1: string, s2: string): number {
    return s1.localeCompare(s2)
}

/**
 * Объединяет две строки
 * @param s1 - Первая строка
 * @param s2 - Вторая строка
 * @returns Объединенная строка
 */
function strConcat(s1: string, s2: string): string {
    return s1 + s2
}

/**
 * Разбивает строку по разделителю
 * @param s - Входная строка
 * @param delimiter - Разделитель
 * @returns Массив подстрок
 */
function strSplit(s: string, delimiter: string): string[] {
    return s.split(delimiter)
}

/**
 * Объединяет массив строк с разделителем
 * @param arr - Массив строк
 * @param separator - Разделитель
 * @returns Объединенная строка
 */
function strJoin(arr: string[], separator: string): string {
    return arr.join(separator)
}

/**
 * Заменяет подстроку в строке
 * @param s - Входная строка
 * @param search - Искомая подстрока
 * @param replace - Строка для замены
 * @returns Новая строка с заменой
 */
function strReplace(s: string, search: string, replace: string): string {
    return s.replace(search, replace)
}

/**
 * Преобразует строку в нижний регистр
 * @param s - Входная строка
 * @returns Строка в нижнем регистре
 */
function strToLower(s: string): string {
    return s.toLowerCase()
}

/**
 * Преобразует строку в верхний регистр
 * @param s - Входная строка
 * @returns Строка в верхнем регистре
 */
function strToUpper(s: string): string {
    return s.toUpperCase()
}

/**
 * Удаляет пробелы в начале и конце строки
 * @param s - Входная строка
 * @returns Обрезанная строка
 */
function strTrim(s: string): string {
    return s.trim()
}

/**
 * Дополняет строку слева до указанной длины
 * @param s - Входная строка
 * @param length - Желаемая длина
 * @param pad - Символ для дополнения
 * @returns Дополненная строка
 */
function strPad(s: string, length: number, pad: string): string {
    return s.padStart(length, pad)
}

/**
 * Дополняет строку справа до указанной длины
 * @param s - Входная строка
 * @param length - Желаемая длина
 * @param pad - Символ для дополнения
 * @returns Дополненная строка
 */
function strPadRight(s: string, length: number, pad: string): string {
    return s.padEnd(length, pad)
}

/**
 * Повторяет строку указанное количество раз
 * @param s - Входная строка
 * @param count - Количество повторений
 * @returns Повторенная строка
 */
function strRepeat(s: string, count: number): string {
    return s.repeat(count)
}

/**
 * Извлекает часть строки
 * @param s - Входная строка
 * @param start - Начальный индекс
 * @param end - Конечный индекс
 * @returns Извлеченная подстрока
 */
function strSlice(s: string, start: number, end: number): string {
    return s.slice(start, end)
}

/**
 * Извлекает часть строки
 * @param s - Входная строка
 * @param start - Начальный индекс
 * @param end - Конечный индекс
 * @returns Извлеченная подстрока
 */
function strSubstring(s: string, start: number, end: number): string {
    return s.substring(start, end)
}

/**
 * Проверяет, начинается ли строка с указанного префикса
 * @param s - Входная строка
 * @param prefix - Префикс
 * @returns true если строка начинается с префикса
 */
function strStartsWith(s: string, prefix: string): boolean {
    return s.startsWith(prefix)
}

/**
 * Проверяет, заканчивается ли строка на указанный суффикс
 * @param s - Входная строка
 * @param suffix - Суффикс
 * @returns true если строка заканчивается суффиксом
 */
function strEndsWith(s: string, suffix: string): boolean {
    return s.endsWith(suffix)
}

/**
 * Проверяет, содержит ли строка указанную подстроку
 * @param s - Входная строка
 * @param substring - Подстрока
 * @returns true если строка содержит подстроку
 */
function strContains(s: string, substring: string): boolean {
    return s.includes(substring)
}

/**
 * Находит индекс первого вхождения подстроки в строку
 * @param s - Входная строка
 * @param substring - Подстрока
 * @returns Индекс первого вхождения подстроки или -1 если не найдено
 */
function strIndexOf(s: string, substring: string): number {
    return s.indexOf(substring)
}


/**
 * Получает год из временной метки
 * @param timestamp - Временная метка в миллисекундах
 * @returns Год
 */
function getFullYear(timestamp: number): number {
    return new Date(timestamp).getFullYear()
}

/**
 * Получает месяц из временной метки (0-11)
 * @param timestamp - Временная метка в миллисекундах
 * @returns Месяц (0-11)
 */
function getMonth(timestamp: number): number {
    return new Date(timestamp).getMonth()
}

/**
 * Получает день недели из временной метки (0-6)
 * @param timestamp - Временная метка в миллисекундах
 * @returns День недели (0-6)
 */
function getDay(timestamp: number): number {
    return new Date(timestamp).getDay()
}

/**
 * Получает часы из временной метки (0-23)
 * @param timestamp - Временная метка в миллисекундах
 * @returns Часы (0-23)
 */
function getHours(timestamp: number): number {
    return new Date(timestamp).getHours()
}

/**
 * Получает минуты из временной метки (0-59)
 * @param timestamp - Временная метка в миллисекундах
 * @returns Минуты (0-59)
 */
function getMinutes(timestamp: number): number {
    return new Date(timestamp).getMinutes()
}

/**
 * Получает секунды из временной метки (0-59)
 * @param timestamp - Временная метка в миллисекундах
 * @returns Секунды (0-59)
 */
function getSeconds(timestamp: number): number {
    return new Date(timestamp).getSeconds()
}

/**
 * Получает миллисекунды из временной метки (0-999)
 * @param timestamp - Временная метка в миллисекундах
 * @returns Миллисекунды (0-999)
 */
function getMilliseconds(timestamp: number): number {
    return new Date(timestamp).getMilliseconds()
}

/**
 * Получает временную метку из даты
 * @param timestamp - Временная метка в миллисекундах
 * @returns Временная метка
 */
function getTime(timestamp: number): number {
    return new Date(timestamp).getTime()
}

/**
 * Проверяет, является ли значение числом
 * @param value - Проверяемое значение
 * @returns true если значение является числом
 */
function isNumber(value: any): boolean {
    return typeof value === 'number' && !isNaN(value)
}

/**
 * Проверяет, является ли значение целым числом
 * @param value - Проверяемое значение
 * @returns true если значение является целым числом
 */
function isInteger(value: any): boolean {
    return Number.isInteger(value)
}

/**
 * Проверяет, является ли значение строкой
 * @param value - Проверяемое значение
 * @returns true если значение является строкой
 */
function isString(value: any): boolean {
    return typeof value === 'string'
}

/**
 * Проверяет, является ли значение булевым
 * @param value - Проверяемое значение
 * @returns true если значение является булевым
 */
function isBoolean(value: any): boolean {
    return typeof value === 'boolean'
}

/**
 * Проверяет, является ли значение массивом
 * @param value - Проверяемое значение
 * @returns true если значение является массивом
 */
function isArray(value: any): boolean {
    return Array.isArray(value)
}

/**
 * Проверяет, является ли значение объектом
 * @param value - Проверяемое значение
 * @returns true если значение является объектом
 */
function isObject(value: any): boolean {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Проверяет, является ли значение null
 * @param value - Проверяемое значение
 * @returns true если значение является null
 */
function isNull(value: any): boolean {
    return value === null
}

/**
 * Проверяет, является ли значение undefined
 * @param value - Проверяемое значение
 * @returns true если значение является undefined
 */
function isUndefined(value: any): boolean {
    return value === undefined
}

/**
 * Округляет число до указанного количества знаков после запятой
 * @param num - Число для округления
 * @param decimals - Количество знаков после запятой
 * @returns Округленное число
 */
function round(num: number, decimals: number = 0): number {
    return Number(Math.round(Number(num + 'e' + decimals)) + 'e-' + decimals)
}

/**
 * Вычисляет абсолютное значение числа
 * @param num - Входное число
 * @returns Абсолютное значение
 */
function abs(num: number): number {
    return Math.abs(num)
}

/**
 * Вычисляет минимальное значение из массива чисел
 * @param numbers - Массив чисел
 * @returns Минимальное значение
 */
function min(...numbers: number[]): number {
    return Math.min(...numbers)
}

/**
 * Вычисляет максимальное значение из массива чисел
 * @param numbers - Массив чисел
 * @returns Максимальное значение
 */
function max(...numbers: number[]): number {
    return Math.max(...numbers)
}

/**
 * Проверяет, находится ли число в указанном диапазоне
 * @param num - Проверяемое число
 * @param min - Минимальное значение
 * @param max - Максимальное значение
 * @returns true если число находится в диапазоне
 */
function inRange(num: number, min: number, max: number): boolean {
    return num >= min && num <= max
}

/**
 * Форматирует дату в строку
 * @param timestamp - Временная метка в миллисекундах
 * @param format - Формат даты (например, 'YYYY-MM-DD')
 * @returns Отформатированная дата
 */
function formatDate(timestamp: number, format: string = 'YYYY-MM-DD'): string {
    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')

    return format
        .replace('YYYY', String(year))
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds)
}

/**
 * Получает длину массива
 * @param arr - Входной массив
 * @returns Длина массива
 */
function arrLen<T>(arr: T[]): number {
    return arr.length
}

/**
 * Проверяет, содержит ли массив указанный элемент
 * @param arr - Входной массив
 * @param item - Искомый элемент
 * @returns true если элемент найден
 */
function arrIncludes<T>(arr: T[], item: T): boolean {
    return arr.includes(item)
}

/**
 * Находит индекс элемента в массиве
 * @param arr - Входной массив
 * @param item - Искомый элемент
 * @returns Индекс элемента или -1 если не найден
 */
function arrIndexOf<T>(arr: T[], item: T): number {
    return arr.indexOf(item)
}

/**
 * Получает первый элемент массива
 * @param arr - Входной массив
 * @returns Первый элемент или undefined если массив пуст
 */
function arrFirst<T>(arr: T[]): T | undefined {
    return arr[0]
}

/**
 * Получает последний элемент массива
 * @param arr - Входной массив
 * @returns Последний элемент или undefined если массив пуст
 */
function arrLast<T>(arr: T[]): T | undefined {
    return arr[arr.length - 1]
}

/**
 * Объединяет два массива
 * @param arr1 - Первый массив
 * @param arr2 - Второй массив
 * @returns Объединенный массив
 */
function arrConcat<T>(arr1: T[], arr2: T[]): T[] {
    return arr1.concat(arr2)
}

/**
 * Фильтрует массив по условию
 * @param arr - Входной массив
 * @param predicate - Функция-предикат
 * @returns Отфильтрованный массив
 */
function arrFilter<T>(arr: T[], predicate: (item: T) => boolean): T[] {
    return arr.filter(predicate)
}

/**
 * Преобразует элементы массива
 * @param arr - Входной массив
 * @param transform - Функция преобразования
 * @returns Преобразованный массив
 */
function arrMap<T, R>(arr: T[], transform: (item: T) => R): R[] {
    return arr.map(transform)
}

/**
 * Проверяет, удовлетворяет ли хотя бы один элемент условию
 * @param arr - Входной массив
 * @param predicate - Функция-предикат
 * @returns true если хотя бы один элемент удовлетворяет условию
 */
function arrSome<T>(arr: T[], predicate: (item: T) => boolean): boolean {
    return arr.some(predicate)
}

/**
 * Проверяет, удовлетворяют ли все элементы условию
 * @param arr - Входной массив
 * @param predicate - Функция-предикат
 * @returns true если все элементы удовлетворяют условию
 */
function arrEvery<T>(arr: T[], predicate: (item: T) => boolean): boolean {
    return arr.every(predicate)
}

/**
 * Находит первый элемент, удовлетворяющий условию
 * @param arr - Входной массив
 * @param predicate - Функция-предикат
 * @returns Найденный элемент или undefined
 */
function arrFind<T>(arr: T[], predicate: (item: T) => boolean): T | undefined {
    return arr.find(predicate)
}

/**
 * Находит индекс первого элемента, удовлетворяющего условию
 * @param arr - Входной массив
 * @param predicate - Функция-предикат
 * @returns Индекс элемента или -1 если не найден
 */
function arrFindIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
    return arr.findIndex(predicate)
}

/**
 * Сортирует массив
 * @param arr - Входной массив
 * @param compareFn - Функция сравнения
 * @returns Отсортированный массив
 */
function arrSort<T>(arr: T[], compareFn?: (a: T, b: T) => number): T[] {
    return [...arr].sort(compareFn)
}

/**
 * Переворачивает массив
 * @param arr - Входной массив
 * @returns Перевернутый массив
 */
function arrReverse<T>(arr: T[]): T[] {
    return [...arr].reverse()
}

/**
 * Получает срез массива
 * @param arr - Входной массив
 * @param start - Начальный индекс
 * @param end - Конечный индекс
 * @returns Срез массива
 */
function arrSlice<T>(arr: T[], start?: number, end?: number): T[] {
    return arr.slice(start, end)
}

/**
 * Удаляет дубликаты из массива
 * @param arr - Входной массив
 * @returns Массив без дубликатов
 */
function arrUnique<T>(arr: T[]): T[] {
    return [...new Set(arr)]
}

/**
 * Объединяет все элементы массива в строку
 * @param arr - Входной массив
 * @param separator - Разделитель
 * @returns Объединенная строка
 */
function arrJoin<T>(arr: T[], separator: string = ','): string {
    return arr.join(separator)
}

/**
 * Создает Map из массива пар ключ-значение
 * @param entries - Массив пар [ключ, значение]
 * @returns Новый Map
 */
function mapFromEntries<K, V>(entries: [K, V][]): Map<K, V> {
    return new Map(entries)
}

/**
 * Получает значение из Map по ключу
 * @param map - Map
 * @param key - Ключ
 * @returns Значение или undefined если ключ не найден
 */
function mapGet<K, V>(map: Map<K, V>, key: K): V | undefined {
    return map.get(key)
}

/**
 * Проверяет наличие ключа в Map
 * @param map - Map
 * @param key - Ключ
 * @returns true если ключ существует
 */
function mapHas<K, V>(map: Map<K, V>, key: K): boolean {
    return map.has(key)
}

/**
 * Получает все ключи из Map
 * @param map - Map
 * @returns Массив ключей
 */
function mapKeys<K, V>(map: Map<K, V>): K[] {
    return Array.from(map.keys())
}

/**
 * Получает все значения из Map
 * @param map - Map
 * @returns Массив значений
 */
function mapValues<K, V>(map: Map<K, V>): V[] {
    return Array.from(map.values())
}

/**
 * Получает все пары ключ-значение из Map
 * @param map - Map
 * @returns Массив пар [ключ, значение]
 */
function mapEntries<K, V>(map: Map<K, V>): [K, V][] {
    return Array.from(map.entries())
}

/**
 * Получает размер Map
 * @param map - Map
 * @returns Количество элементов
 */
function mapSize<K, V>(map: Map<K, V>): number {
    return map.size
}

/**
 * Создает Set из массива значений
 * @param values - Массив значений
 * @returns Новый Set
 */
function setFromValues<T>(values: T[]): Set<T> {
    return new Set(values)
}

/**
 * Проверяет наличие значения в Set
 * @param set - Set
 * @param value - Значение
 * @returns true если значение существует
 */
function setHas<T>(set: Set<T>, value: T): boolean {
    return set.has(value)
}

/**
 * Получает все значения из Set
 * @param set - Set
 * @returns Массив значений
 */
function setValues<T>(set: Set<T>): T[] {
    return Array.from(set.values())
}

/**
 * Получает размер Set
 * @param set - Set
 * @returns Количество элементов
 */
function setSize<T>(set: Set<T>): number {
    return set.size
}

/**
 * Объединяет два Set
 * @param set1 - Первый Set
 * @param set2 - Второй Set
 * @returns Новый Set, содержащий все элементы
 */
function setUnion<T>(set1: Set<T>, set2: Set<T>): Set<T> {
    return new Set([...set1, ...set2])
}

/**
 * Находит пересечение двух Set
 * @param set1 - Первый Set
 * @param set2 - Второй Set
 * @returns Новый Set, содержащий общие элементы
 */
function setIntersection<T>(set1: Set<T>, set2: Set<T>): Set<T> {
    return new Set([...set1].filter(x => set2.has(x)))
}

/**
 * Находит разность двух Set
 * @param set1 - Первый Set
 * @param set2 - Второй Set
 * @returns Новый Set, содержащий элементы из set1, которых нет в set2
 */
function setDifference<T>(set1: Set<T>, set2: Set<T>): Set<T> {
    return new Set([...set1].filter(x => !set2.has(x)))
}

export const filtrexFunctions = {
    // Строковые функции
    strLen,
    strCmp,
    strConcat,
    strSplit,
    strJoin,
    strReplace,
    strToLower,
    strToUpper,
    strTrim,
    strPad,
    strPadRight,
    strRepeat,
    strSlice,
    strSubstring,
    strStartsWith,
    strEndsWith,
    strContains,
    strIndexOf,

    // Функции для работы с датами
    getFullYear,
    getMonth,
    getDay,
    getHours,
    getMinutes,
    getSeconds,
    getMilliseconds,
    getTime,
    formatDate,

    // Функции для проверки типов
    isNumber,
    isInteger,
    isString,
    isBoolean,
    isArray,
    isObject,
    isNull,
    isUndefined,

    // Математические функции
    round,
    abs,
    min,
    max,
    inRange,

    // Функции для работы с массивами
    arrLen,
    arrIncludes,
    arrIndexOf,
    arrFirst,
    arrLast,
    arrConcat,
    arrFilter,
    arrMap,
    arrSome,
    arrEvery,
    arrFind,
    arrFindIndex,
    arrSort,
    arrReverse,
    arrSlice,
    arrUnique,
    arrJoin,

    // Функции для работы с Map
    mapFromEntries,
    mapGet,
    mapHas,
    mapKeys,
    mapValues,
    mapEntries,
    mapSize,

    // Функции для работы с Set
    setFromValues,
    setHas,
    setValues,
    setSize,
    setUnion,
    setIntersection,
    setDifference,
}

export default filtrexFunctions