# JSONLFile

`JSONLFile` - это класс для работы с JSONL (JSON Lines) файлами, предоставляющий функциональность для хранения и управления данными в формате JSONL с поддержкой транзакций, индексации и кэширования.

## Установка

```bash
npm install @direct-dev-ru/linedb
# или
yarn add @direct-dev-ru/linedb
```

## Импорт

```typescript
import { JSONLFile } from '@direct-dev-ru/linedb';
```

## Основные возможности

- Хранение данных в формате JSONL
- Поддержка транзакций с возможностью отката
- Индексация полей для быстрого поиска
- Кэширование результатов запросов
- Шифрование данных
- Поддержка фильтрации данных
- Пагинация результатов
- Атомарные операции вставки, обновления и удаления

## Создание экземпляра

```typescript
import { JSONLFile } from '@direct-dev-ru/linedb';

// Определение типа данных
interface User {
    id: string;
    name: string;
    email: string;
    age?: number;
    createdAt: Date;
}

// Базовое создание
const db = new JSONLFile<User>('path/to/file.jsonl');

// С дополнительными опциями
const db = new JSONLFile<User>('path/to/file.jsonl', 'encryption-key', {
    allocSize: 1024,                    // Размер блока для записи
    collectionName: 'users',            // Имя коллекции
    cacheTTL: 60000,                    // Время жизни кэша в мс
    cacheLimit: 1000,                   // Максимальное количество записей в кэше
    indexedFields: ['email', 'name'],   // Индексируемые поля
    skipInvalidLines: true,             // Пропускать невалидные строки
    parse: customParse,                 // Кастомная функция парсинга
    stringify: customStringify,         // Кастомная функция сериализации
    encrypt: customEncrypt,             // Кастомная функция шифрования
    decrypt: customDecrypt              // Кастомная функция дешифрования
});
```

### Опции конфигурации

При создании экземпляра `JSONLFile` можно указать следующие опции:

| Опция | Тип | По умолчанию | Описание |
|-------|-----|--------------|-----------|
| `allocSize` | number | 1024 | Размер блока для записи в байтах. Влияет на производительность при работе с большими файлами |
| `collectionName` | string | undefined | Имя коллекции. Используется для логирования и отладки |
| `cacheTTL` | number | 0 | Время жизни кэша в миллисекундах. 0 означает отключение кэширования |
| `cacheLimit` | number | 1000 | Максимальное количество записей в кэше |
| `indexedFields` | string[] | [] | Массив полей для индексации. Индексация ускоряет поиск по указанным полям |
| `skipInvalidLines` | boolean | false | Если true, пропускает невалидные строки при чтении файла |
| `parse` | function | JSON.parse | Кастомная функция для парсинга JSON строк |
| `stringify` | function | JSON.stringify | Кастомная функция для сериализации объектов в JSON |
| `encrypt` | function | undefined | Кастомная функция шифрования данных |
| `decrypt` | function | undefined | Кастомная функция дешифрования данных |

### Примеры конфигурации

```typescript
// Базовая конфигурация без опций
const db1 = new JSONLFile<User>('users.jsonl');

// Конфигурация с шифрованием
const db2 = new JSONLFile<User>('users.jsonl', 'secret-key');

// Конфигурация с кэшированием и индексацией
const db3 = new JSONLFile<User>('users.jsonl', '', {
    cacheTTL: 60000,
    cacheLimit: 500,
    indexedFields: ['email', 'name']
});

// Конфигурация с кастомными функциями
const db4 = new JSONLFile<User>('users.jsonl', '', {
    parse: (str) => JSON.parse(str, (key, value) => {
        if (key === 'createdAt') return new Date(value);
        return value;
    }),
    stringify: (obj) => JSON.stringify(obj, (key, value) => {
        if (value instanceof Date) return value.toISOString();
        return value;
    })
});

// Полная конфигурация
const db5 = new JSONLFile<User>('users.jsonl', 'secret-key', {
    allocSize: 2048,
    collectionName: 'users',
    cacheTTL: 300000,
    cacheLimit: 2000,
    indexedFields: ['email', 'name', 'age'],
    skipInvalidLines: true,
    parse: customParse,
    stringify: customStringify,
    encrypt: customEncrypt,
    decrypt: customDecrypt
});
```

## Инициализация

```typescript
// Инициализация базы данных
await db.init();

// Принудительная инициализация
await db.init(true);
```

## Базовые операции

### Вставка данных

```typescript
// Вставка одной записи
await db.insert({
    id: '1',
    name: 'John Doe',
    email: 'john@example.com'
});

// Вставка нескольких записей
await db.insert([
    {
        id: '2',
        name: 'Jane Doe',
        email: 'jane@example.com'
    },
    {
        id: '3',
        name: 'Bob Smith',
        email: 'bob@example.com'
    }
]);
```

### Обновление данных

```typescript
// Обновление по фильтру
await db.update(
    { name: 'John Updated' },
    { email: 'john@example.com' }
);

// Обновление нескольких записей
await db.update([
    { id: '1', name: 'John Updated' },
    { id: '2', name: 'Jane Updated' }
]);
```

### Удаление данных

```typescript
// Удаление по фильтру
const deletedCount = await db.delete({ email: 'john@example.com' });

// Удаление нескольких записей
const deletedCount = await db.delete([
    { id: '1' },
    { id: '2' }
]);
```

### Поиск данных

```typescript
// Простой поиск
const users = await db.select({ name: 'John' });

// Поиск с фильтром
const users = await db.select((user) => user.age > 18);

// Поиск с пагинацией
const result = await db.selectWithPagination(
    { name: 'John' },
    1,  // страница
    10  // количество записей на странице
);
```

## Работа с транзакциями

```typescript
// Начало транзакции
const transactionId = await db.beginTransaction({
    rollback: true,
    timeout: 20000
});

try {
    // Выполнение операций в транзакции
    await db.withTransaction(async (adapter) => {
        await adapter.insert({ id: '1', name: 'John' });
        await adapter.update({ name: 'John Updated' }, { id: '1' });
    }, { inTransaction: true, transactionId });
} finally {
    // Завершение транзакции
    await db.endTransaction();
}
```

## Использование фильтров

```typescript
// Простой фильтр
const users = await db.select({ name: 'John' });

// MongoDB-подобный фильтр
const users = await db.select({
    age: { $gt: 18 },
    name: { $regex: '^J' }
});

// Строковый фильтр
const users = await db.select('age > 18 && name.startsWith("J")');

// Функция-фильтр
const users = await db.select((user) => 
    user.age > 18 && user.name.startsWith('J')
);
```

## Работа с кэшем

```typescript
// Создание с включенным кэшем
const db = new JSONLFile<User>('users.jsonl', '', {
    cacheTTL: 60000,    // Кэш живет 1 минуту
    cacheLimit: 1000    // Максимум 1000 записей в кэше
});

// Очистка кэша при уничтожении объекта
db.destroy();
```

## Обработка ошибок

```typescript
try {
    await db.insert({ id: '1', name: 'John' });
} catch (error) {
    if (error.message.includes('already exists')) {
        // Обработка ошибки дублирования
    } else if (error.message.includes('Transaction Error')) {
        // Обработка ошибки транзакции
    } else {
        // Обработка других ошибок
    }
}
```

## Типизация

```typescript
interface User {
    id: string;
    name: string;
    email: string;
    age?: number;
    createdAt: Date;
}

const db = new JSONLFile<User>('users.jsonl');

// TypeScript будет проверять типы
await db.insert({
    id: '1',
    name: 'John',
    email: 'john@example.com',
    createdAt: new Date()
});
```

## Лучшие практики

1. Всегда инициализируйте базу данных перед использованием:

```typescript
await db.init();
```

2.Используйте транзакции для атомарных операций:

```typescript
const transactionId = await db.beginTransaction();
try {
    await db.withTransaction(async (adapter) => {
        // Операции
    });
} finally {
    await db.endTransaction();
}
```

3.Правильно обрабатывайте ошибки:

```typescript
try {
    await db.insert(data);
} catch (error) {
    // Обработка ошибок
}
```

4.Используйте индексацию для часто используемых полей поиска:

```typescript
const db = new JSONLFile<User>('users.jsonl', '', {
    indexedFields: ['email', 'name']
});
```

5.Настраивайте кэш в зависимости от требований:

```typescript
const db = new JSONLFile<User>('users.jsonl', '', {
    cacheTTL: 60000,
    cacheLimit: 1000
});
```

6.Очищайте ресурсы при завершении работы:

```typescript
db.destroy();
```

## Полный пример использования

```typescript
import { JSONLFile } from '@direct-dev-ru/linedb';

// Определение типа данных
interface User {
    id: string;
    name: string;
    email: string;
    age?: number;
    createdAt: Date;
}

async function main() {
    // Создание экземпляра базы данных
    const db = new JSONLFile<User>('users.jsonl', '', {
        indexedFields: ['email', 'name'],
        cacheTTL: 60000
    });

    // Инициализация
    await db.init();

    try {
        // Вставка данных
        await db.insert({
            id: '1',
            name: 'John Doe',
            email: 'john@example.com',
            createdAt: new Date()
        });

        // Поиск данных
        const users = await db.select({ name: 'John' });
        console.log('Found users:', users);

        // Обновление данных
        await db.update(
            { name: 'John Updated' },
            { email: 'john@example.com' }
        );

        // Поиск с пагинацией
        const paginatedResult = await db.selectWithPagination(
            { name: 'John' },
            1,
            10
        );
        console.log('Paginated result:', paginatedResult);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        // Очистка ресурсов
        db.destroy();
    }
}

main().catch(console.error);
```
