# Пользовательские функции Filtrex

Этот документ описывает набор пользовательских функций, доступных для использования в фильтрах Filtrex.

## Содержание

1. [Строковые функции](#строковые-функции)
   - [strLen](#strlens-string-number)
   - [strCmp](#strcmps1-string-s2-string-number)
   - [strConcat](#strconcats1-string-s2-string-string)
   - [strSplit](#strsplits-string-delimiter-string-string)
   - [strJoin](#strjoinarr-string-separator-string-string)
   - [strReplace](#strreplaces-string-search-string-replace-string-string)
   - [strToLower](#strtolowers-string-string)
   - [strToUpper](#strtouppers-string-string)
   - [strTrim](#strtrims-string-string)
   - [strPad](#strpads-string-length-number-pad-string-string)
   - [strPadRight](#strpadrights-string-length-number-pad-string-string)
   - [strRepeat](#strrepeats-string-count-number-string)
   - [strSlice](#strslices-string-start-number-end-number-string)
   - [strSubstring](#strsubstrings-string-start-number-end-number-string)

2. [Функции для работы с датами](#функции-для-работы-с-датами)
   - [getFullYear](#getfullyeartimestamp-number-number)
   - [getMonth](#getmonthtimestamp-number-number)
   - [getDay](#getdaytimestamp-number-number)
   - [getHours](#gethourstimestamp-number-number)
   - [getMinutes](#getminutestimestamp-number-number)
   - [getSeconds](#getsecondstimestamp-number-number)
   - [getMilliseconds](#getmillisecondstimestamp-number-number)
   - [getTime](#gettimetimestamp-number-number)
   - [formatDate](#formatdatetimestamp-number-format-string-string)

3. [Функции для проверки типов](#функции-для-проверки-типов)
   - [isNumber](#isnumbervalue-any-boolean)
   - [isInteger](#isintegervalue-any-boolean)
   - [isString](#isstringvalue-any-boolean)
   - [isBoolean](#isbooleanvalue-any-boolean)
   - [isArray](#isarrayvalue-any-boolean)
   - [isObject](#isobjectvalue-any-boolean)
   - [isNull](#isnullvalue-any-boolean)
   - [isUndefined](#isundefinedvalue-any-boolean)

4. [Математические функции](#математические-функции)
   - [round](#roundnum-number-decimals-number-0-number)
   - [abs](#absnum-number-number)
   - [min](#minnumbers-number-number)
   - [max](#maxnumbers-number-number)
   - [inRange](#inrangenum-number-min-number-max-number-boolean)

5. [Функции для работы с массивами](#функции-для-работы-с-массивами)
   - [arrLen](#arrlenarr-t-number)
   - [arrIncludes](#arrincludesarr-t-item-t-boolean)
   - [arrIndexOf](#arrindexofarr-t-item-t-number)
   - [arrFirst](#arrfirstarr-t-t-undefined)
   - [arrLast](#arrlastarr-t-t-undefined)
   - [arrConcat](#arrconcatarr1-t-arr2-t-t)
   - [arrFilter](#arrfilterarr-t-predicate-item-t-boolean-t)
   - [arrMap](#arrmaparr-t-transform-item-t-r-r)
   - [arrSome](#arrsomearr-t-predicate-item-t-boolean-boolean)
   - [arrEvery](#arreveryarr-t-predicate-item-t-boolean-boolean)
   - [arrFind](#arrfindarr-t-predicate-item-t-boolean-t-undefined)
   - [arrFindIndex](#arrfindindexarr-t-predicate-item-t-boolean-number)
   - [arrSort](#arrsortarr-t-comparefn-a-t-b-t-number-t)
   - [arrReverse](#arrreversearr-t-t)
   - [arrSlice](#arrslicearr-t-start-number-end-number-t)
   - [arrUnique](#arruniquearr-t-t)
   - [arrJoin](#arrjoinarr-t-separator-string-string)

6. [Функции для работы с Map](#функции-для-работы-с-map)
   - [mapFromEntries](#mapfromentriesk-v-entries-k-v-mapk-v)
   - [mapGet](#mapgetk-v-map-mapk-v-key-k-v-undefined)
   - [mapHas](#maphask-v-map-mapk-v-key-k-boolean)
   - [mapKeys](#mapkeysk-v-map-mapk-v-k)
   - [mapValues](#mapvaluesk-v-map-mapk-v-v)
   - [mapEntries](#mapentriesk-v-map-mapk-v-k-v)
   - [mapSize](#mapsizek-v-map-mapk-v-number)

7. [Функции для работы с Set](#функции-для-работы-с-set)
   - [setFromValues](#setfromvaluest-values-t-sett)
   - [setHas](#sethast-set-sett-value-t-boolean)
   - [setValues](#setvaluest-set-sett-t)
   - [setSize](#setsizet-set-sett-number)
   - [setUnion](#setuniont-set1-sett-set2-sett-sett)
   - [setIntersection](#setintersectiont-set1-sett-set2-sett-sett)
   - [setDifference](#setdifferencet-set1-sett-set2-sett-sett)

## Строковые функции

### strLen(s: string): number
Получает длину строки.
```typescript
strLen("Hello") // 5
```

### strCmp(s1: string, s2: string): number
Сравнивает две строки. Возвращает:
- -1 если s1 < s2
- 0 если строки равны
- 1 если s1 > s2
```typescript
strCmp("abc", "def") // -1
strCmp("abc", "abc") // 0
strCmp("def", "abc") // 1
```

### strConcat(s1: string, s2: string): string
Объединяет две строки.
```typescript
strConcat("Hello", "World") // "HelloWorld"
```

### strSplit(s: string, delimiter: string): string[]
Разбивает строку по разделителю.
```typescript
strSplit("a,b,c", ",") // ["a", "b", "c"]
```

### strJoin(arr: string[], separator: string): string
Объединяет массив строк с разделителем.
```typescript
strJoin(["a", "b", "c"], ",") // "a,b,c"
```

### strReplace(s: string, search: string, replace: string): string
Заменяет подстроку в строке.
```typescript
strReplace("Hello World", "World", "Universe") // "Hello Universe"
```

### strToLower(s: string): string
Преобразует строку в нижний регистр.
```typescript
strToLower("Hello") // "hello"
```

### strToUpper(s: string): string
Преобразует строку в верхний регистр.
```typescript
strToUpper("hello") // "HELLO"
```

### strTrim(s: string): string
Удаляет пробелы в начале и конце строки.
```typescript
strTrim("  Hello  ") // "Hello"
```

### strPad(s: string, length: number, pad: string): string
Дополняет строку слева до указанной длины.
```typescript
strPad("123", 5, "0") // "00123"
```

### strPadRight(s: string, length: number, pad: string): string
Дополняет строку справа до указанной длины.
```typescript
strPadRight("123", 5, "0") // "12300"
```

### strRepeat(s: string, count: number): string
Повторяет строку указанное количество раз.
```typescript
strRepeat("a", 3) // "aaa"
```

### strSlice(s: string, start: number, end: number): string
Извлекает часть строки.
```typescript
strSlice("Hello", 1, 4) // "ell"
```

### strSubstring(s: string, start: number, end: number): string
Извлекает часть строки.
```typescript
strSubstring("Hello", 1, 4) // "ell"
```

## Функции для работы с датами

### getFullYear(timestamp: number): number
Получает год из временной метки.
```typescript
getFullYear(1646092800000) // 2022
```

### getMonth(timestamp: number): number
Получает месяц из временной метки (0-11).
```typescript
getMonth(1646092800000) // 2 (март)
```

### getDay(timestamp: number): number
Получает день недели из временной метки (0-6).
```typescript
getDay(1646092800000) // 3 (четверг)
```

### getHours(timestamp: number): number
Получает часы из временной метки (0-23).
```typescript
getHours(1646092800000) // 12
```

### getMinutes(timestamp: number): number
Получает минуты из временной метки (0-59).
```typescript
getMinutes(1646092800000) // 0
```

### getSeconds(timestamp: number): number
Получает секунды из временной метки (0-59).
```typescript
getSeconds(1646092800000) // 0
```

### getMilliseconds(timestamp: number): number
Получает миллисекунды из временной метки (0-999).
```typescript
getMilliseconds(1646092800000) // 0
```

### getTime(timestamp: number): number
Получает временную метку из даты.
```typescript
getTime(1646092800000) // 1646092800000
```

### formatDate(timestamp: number, format: string = 'YYYY-MM-DD'): string
Форматирует дату в строку.
```typescript
formatDate(1646092800000) // "2022-03-01"
formatDate(1646092800000, "YYYY-MM-DD HH:mm:ss") // "2022-03-01 12:00:00"
```

## Функции для проверки типов

### isNumber(value: any): boolean
Проверяет, является ли значение числом.
```typescript
isNumber(123) // true
isNumber("123") // false
```

### isInteger(value: any): boolean
Проверяет, является ли значение целым числом.
```typescript
isInteger(123) // true
isInteger(123.45) // false
```

### isString(value: any): boolean
Проверяет, является ли значение строкой.
```typescript
isString("hello") // true
isString(123) // false
```

### isBoolean(value: any): boolean
Проверяет, является ли значение булевым.
```typescript
isBoolean(true) // true
isBoolean("true") // false
```

### isArray(value: any): boolean
Проверяет, является ли значение массивом.
```typescript
isArray([1, 2, 3]) // true
isArray("123") // false
```

### isObject(value: any): boolean
Проверяет, является ли значение объектом.
```typescript
isObject({}) // true
isObject([]) // false
```

### isNull(value: any): boolean
Проверяет, является ли значение null.
```typescript
isNull(null) // true
isNull(undefined) // false
```

### isUndefined(value: any): boolean
Проверяет, является ли значение undefined.
```typescript
isUndefined(undefined) // true
isUndefined(null) // false
```

## Математические функции

### round(num: number, decimals: number = 0): number
Округляет число до указанного количества знаков после запятой.
```typescript
round(3.14159, 2) // 3.14
```

### abs(num: number): number
Вычисляет абсолютное значение числа.
```typescript
abs(-5) // 5
```

### min(...numbers: number[]): number
Вычисляет минимальное значение из массива чисел.
```typescript
min(1, 2, 3) // 1
```

### max(...numbers: number[]): number
Вычисляет максимальное значение из массива чисел.
```typescript
max(1, 2, 3) // 3
```

### inRange(num: number, min: number, max: number): boolean
Проверяет, находится ли число в указанном диапазоне.
```typescript
inRange(5, 1, 10) // true
inRange(15, 1, 10) // false
```

## Функции для работы с массивами

### arrLen<T>(arr: T[]): number
Получает длину массива.
```typescript
arrLen([1, 2, 3]) // 3
```

### arrIncludes<T>(arr: T[], item: T): boolean
Проверяет, содержит ли массив указанный элемент.
```typescript
arrIncludes([1, 2, 3], 2) // true
arrIncludes([1, 2, 3], 4) // false
```

### arrIndexOf<T>(arr: T[], item: T): number
Находит индекс элемента в массиве.
```typescript
arrIndexOf([1, 2, 3], 2) // 1
arrIndexOf([1, 2, 3], 4) // -1
```

### arrFirst<T>(arr: T[]): T | undefined
Получает первый элемент массива.
```typescript
arrFirst([1, 2, 3]) // 1
arrFirst([]) // undefined
```

### arrLast<T>(arr: T[]): T | undefined
Получает последний элемент массива.
```typescript
arrLast([1, 2, 3]) // 3
arrLast([]) // undefined
```

### arrConcat<T>(arr1: T[], arr2: T[]): T[]
Объединяет два массива.
```typescript
arrConcat([1, 2], [3, 4]) // [1, 2, 3, 4]
```

### arrFilter<T>(arr: T[], predicate: (item: T) => boolean): T[]
Фильтрует массив по условию.
```typescript
arrFilter([1, 2, 3, 4], x => x > 2) // [3, 4]
```

### arrMap<T, R>(arr: T[], transform: (item: T) => R): R[]
Преобразует элементы массива.
```typescript
arrMap([1, 2, 3], x => x * 2) // [2, 4, 6]
```

### arrSome<T>(arr: T[], predicate: (item: T) => boolean): boolean
Проверяет, удовлетворяет ли хотя бы один элемент условию.
```typescript
arrSome([1, 2, 3], x => x > 2) // true
arrSome([1, 2, 3], x => x > 3) // false
```

### arrEvery<T>(arr: T[], predicate: (item: T) => boolean): boolean
Проверяет, удовлетворяют ли все элементы условию.
```typescript
arrEvery([1, 2, 3], x => x > 0) // true
arrEvery([1, 2, 3], x => x > 1) // false
```

### arrFind<T>(arr: T[], predicate: (item: T) => boolean): T | undefined
Находит первый элемент, удовлетворяющий условию.
```typescript
arrFind([1, 2, 3], x => x > 1) // 2
arrFind([1, 2, 3], x => x > 3) // undefined
```

### arrFindIndex<T>(arr: T[], predicate: (item: T) => boolean): number
Находит индекс первого элемента, удовлетворяющего условию.
```typescript
arrFindIndex([1, 2, 3], x => x > 1) // 1
arrFindIndex([1, 2, 3], x => x > 3) // -1
```

### arrSort<T>(arr: T[], compareFn?: (a: T, b: T) => number): T[]
Сортирует массив.
```typescript
arrSort([3, 1, 2]) // [1, 2, 3]
arrSort([3, 1, 2], (a, b) => b - a) // [3, 2, 1]
```

### arrReverse<T>(arr: T[]): T[]
Переворачивает массив.
```typescript
arrReverse([1, 2, 3]) // [3, 2, 1]
```

### arrSlice<T>(arr: T[], start?: number, end?: number): T[]
Получает срез массива.
```typescript
arrSlice([1, 2, 3, 4], 1, 3) // [2, 3]
```

### arrUnique<T>(arr: T[]): T[]
Удаляет дубликаты из массива.
```typescript
arrUnique([1, 2, 2, 3, 3, 3]) // [1, 2, 3]
```

### arrJoin<T>(arr: T[], separator: string = ','): string
Объединяет все элементы массива в строку.
```typescript
arrJoin([1, 2, 3]) // "1,2,3"
arrJoin([1, 2, 3], '-') // "1-2-3"
```

## Функции для работы с Map

### mapFromEntries<K, V>(entries: [K, V][]): Map<K, V>
Создает Map из массива пар ключ-значение.
```typescript
mapFromEntries([['a', 1], ['b', 2]]) // Map(2) { 'a' => 1, 'b' => 2 }
```

### mapGet<K, V>(map: Map<K, V>, key: K): V | undefined
Получает значение из Map по ключу.
```typescript
const map = new Map([['a', 1], ['b', 2]])
mapGet(map, 'a') // 1
mapGet(map, 'c') // undefined
```

### mapHas<K, V>(map: Map<K, V>, key: K): boolean
Проверяет наличие ключа в Map.
```typescript
const map = new Map([['a', 1], ['b', 2]])
mapHas(map, 'a') // true
mapHas(map, 'c') // false
```

### mapKeys<K, V>(map: Map<K, V>): K[]
Получает все ключи из Map.
```typescript
const map = new Map([['a', 1], ['b', 2]])
mapKeys(map) // ['a', 'b']
```

### mapValues<K, V>(map: Map<K, V>): V[]
Получает все значения из Map.
```typescript
const map = new Map([['a', 1], ['b', 2]])
mapValues(map) // [1, 2]
```

### mapEntries<K, V>(map: Map<K, V>): [K, V][]
Получает все пары ключ-значение из Map.
```typescript
const map = new Map([['a', 1], ['b', 2]])
mapEntries(map) // [['a', 1], ['b', 2]]
```

### mapSize<K, V>(map: Map<K, V>): number
Получает размер Map.
```typescript
const map = new Map([['a', 1], ['b', 2]])
mapSize(map) // 2
```

## Функции для работы с Set

### setFromValues<T>(values: T[]): Set<T>
Создает Set из массива значений.
```typescript
setFromValues([1, 2, 2, 3]) // Set(3) { 1, 2, 3 }
```

### setHas<T>(set: Set<T>, value: T): boolean
Проверяет наличие значения в Set.
```typescript
const set = new Set([1, 2, 3])
setHas(set, 2) // true
setHas(set, 4) // false
```

### setValues<T>(set: Set<T>): T[]
Получает все значения из Set.
```typescript
const set = new Set([1, 2, 3])
setValues(set) // [1, 2, 3]
```

### setSize<T>(set: Set<T>): number
Получает размер Set.
```typescript
const set = new Set([1, 2, 3])
setSize(set) // 3
```

### setUnion<T>(set1: Set<T>, set2: Set<T>): Set<T>
Объединяет два Set.
```typescript
const set1 = new Set([1, 2, 3])
const set2 = new Set([3, 4, 5])
setUnion(set1, set2) // Set(5) { 1, 2, 3, 4, 5 }
```

### setIntersection<T>(set1: Set<T>, set2: Set<T>): Set<T>
Находит пересечение двух Set.
```typescript
const set1 = new Set([1, 2, 3])
const set2 = new Set([3, 4, 5])
setIntersection(set1, set2) // Set(1) { 3 }
```

### setDifference<T>(set1: Set<T>, set2: Set<T>): Set<T>
Находит разность двух Set.
```typescript
const set1 = new Set([1, 2, 3])
const set2 = new Set([3, 4, 5])
setDifference(set1, set2) // Set(2) { 1, 2 }
``` 