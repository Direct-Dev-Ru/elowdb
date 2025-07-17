# Полное руководство по использованию JSONLFile

## Содержание

1. [Введение](#введение)
2. [Установка и импорт](#установка-и-импорт)
3. [Создание экземпляра](#создание-экземпляра)
4. [Конфигурация и опции](#конфигурация-и-опции)
5. [Инициализация](#инициализация)
6. [Базовые операции CRUD](#базовые-операции-crud)
7. [Поиск и фильтрация](#поиск-и-фильтрация)
8. [Транзакции](#транзакции)
9. [Кэширование](#кэширование)
10. [Шифрование](#шифрование)
11. [Индексация](#индексация)
12. [Пагинация](#пагинация)
13. [Обработка ошибок](#обработка-ошибок)
14. [Производительность](#производительность)
15. [Примеры использования](#примеры-использования)

## Введение

`JSONLFile` - это класс для работы с JSONL (JSON Lines) файлами, предоставляющий полнофункциональную NoSQL базу данных с поддержкой транзакций, индексации, кэширования и шифрования.

### Основные возможности

- ✅ **Хранение данных в формате JSONL** - эффективное хранение JSON объектов по одному на строку
- ✅ **Поддержка транзакций** - атомарные операции с возможностью отката
- ✅ **Индексация полей** - быстрый поиск по индексированным полям
- ✅ **Кэширование результатов** - ускорение повторных запросов
- ✅ **Шифрование данных** - защита конфиденциальной информации
- ✅ **Гибкая фильтрация** - поддержка различных типов фильтров
- ✅ **Пагинация** - эффективная работа с большими наборами данных
- ✅ **Атомарные операции** - вставка, обновление, удаление с проверкой целостности

## Установка и импорт

### Установка

```bash
npm install @direct-dev-ru/linedb
# или
yarn add @direct-dev-ru/linedb
```

### Импорт

```typescript
import { JSONLFile } from '@direct-dev-ru/linedb';
```

## Создание экземпляра

### Базовое создание

```typescript
// Определение типа данных
interface User {
    id: string;
    name: string;
    email: string;
    age?: number;
    createdAt: Date;
    isActive: boolean;
}

// Простое создание
const db = new JSONLFile<User>('users.jsonl');
```

### Создание с шифрованием

```typescript
// С ключом шифрования
const db = new JSONLFile<User>('users.jsonl', 'your-secret-key');
```

### Создание с опциями

```typescript
const db = new JSONLFile<User>('users.jsonl', 'encryption-key', {
    allocSize: 1024,
    collectionName: 'users',
    cacheTTL: 60000,
    cacheLimit: 1000,
    indexedFields: ['email', 'name'],
    skipInvalidLines: true
});
```

## Конфигурация и опции

### Полный список опций

| Опция | Тип | По умолчанию | Описание |
|-------|-----|--------------|----------|
| `allocSize` | `number` | `1024` | Размер блока для записи в байтах |
| `collectionName` | `string` | `undefined` | Имя коллекции для логирования |
| `cacheTTL` | `number` | `0` | Время жизни кэша в миллисекундах |
| `cacheLimit` | `number` | `1000` | Максимальное количество записей в кэше |
| `cacheCleanupInterval` | `number` | `60000` | Интервал очистки кэша в миллисекундах |
| `indexedFields` | `(keyof T)[]` | `[]` | Массив полей для индексации |
| `skipInvalidLines` | `boolean` | `false` | Пропускать невалидные строки |
| `convertStringIdToNumber` | `boolean` | `false` | Автоматически конвертировать строковые ID в числа |
| `parse` | `(str: string) => T` | `JSON.parse` | Кастомная функция парсинга |
| `stringify` | `(data: T) => string` | `JSON.stringify` | Кастомная функция сериализации |
| `encrypt` | `(text: string, key: string) => Promise<string>` | `undefined` | Кастомная функция шифрования |
| `decrypt` | `(text: string, key: string) => Promise<string>` | `undefined` | Кастомная функция дешифрования |
| `idFn` | `(data: T) => (string \| number)[]` | `(data) => ['byId:${data.id}']` | Функция генерации индексов |
| `cache` | `Cache<T>` | `undefined` | Кастомный экземпляр кэша |

### Примеры конфигурации

```typescript
// Базовая конфигурация
const basicDb = new JSONLFile<User>('users.jsonl');

// Конфигурация с кэшированием
const cachedDb = new JSONLFile<User>('users.jsonl', '', {
    cacheTTL: 300000,        // 5 минут
    cacheLimit: 500,
    cacheCleanupInterval: 120000  // 2 минуты
});

// Конфигурация с индексацией
const indexedDb = new JSONLFile<User>('users.jsonl', '', {
    indexedFields: ['email', 'name', 'age'],
    collectionName: 'users'
});

// Конфигурация с шифрованием
const encryptedDb = new JSONLFile<User>('users.jsonl', 'secret-key', {
    skipInvalidLines: true,
    allocSize: 2048
});

// Полная конфигурация
const fullDb = new JSONLFile<User>('users.jsonl', 'secret-key', {
    allocSize: 2048,
    collectionName: 'users',
    cacheTTL: 600000,
    cacheLimit: 2000,
    cacheCleanupInterval: 300000,
    indexedFields: ['email', 'name', 'age'],
    skipInvalidLines: true,
    convertStringIdToNumber: true,
    parse: customParse,
    stringify: customStringify,
    encrypt: customEncrypt,
    decrypt: customDecrypt
});
```

## Инициализация

Перед использованием базы данных необходимо выполнить инициализацию:

```typescript
// Обычная инициализация
await db.init();

// Принудительная инициализация (пересоздание индексов)
await db.init(true);
```

### Что происходит при инициализации

1. **Создание файла** - если файл не существует, он создается
2. **Чтение данных** - все существующие записи читаются из файла
3. **Построение индексов** - создаются индексы для быстрого поиска
4. **Валидация данных** - проверяется целостность данных
5. **Оптимизация размера блоков** - автоматическая настройка размера блоков

## Базовые операции CRUD

### Вставка данных (Create)

```typescript
// Вставка одной записи
await db.insert({
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
    age: 30,
    createdAt: new Date(),
    isActive: true
});

// Вставка нескольких записей
await db.insert([
    {
        id: '2',
        name: 'Jane Doe',
        email: 'jane@example.com',
        age: 25,
        createdAt: new Date(),
        isActive: true
    },
    {
        id: '3',
        name: 'Bob Smith',
        email: 'bob@example.com',
        age: 35,
        createdAt: new Date(),
        isActive: false
    }
]);

// Проверка на дубликаты
try {
    await db.insert({ id: '1', name: 'Duplicate' });
} catch (error) {
    console.log('Запись с таким ID уже существует');
}
```

### Чтение данных (Read)

```typescript
// Чтение всех записей
const allUsers = await db.read();

// Чтение с фильтром
const activeUsers = await db.read((user) => user.isActive);

// Чтение по ID
const user = await db.select({ id: '1' });

// Чтение по нескольким критериям
const users = await db.select({ 
    age: { $gt: 25 },
    isActive: true 
});

// Чтение с текстовым фильтром
const users = await db.select(`age >= 25 && isActive`);
const users = await db.select(`not isActive`);
```

### Обновление данных (Update)

```typescript
// Обновление по фильтру - первый параметр поля и значения для обновления
// второй параметр - фильтр для отбора записей
await db.update(
    { name: 'John Updated', age: 31 },
    { email: 'john@example.com' }
);

// Обновление нескольких записей - указан только один параметр - обязательно должен быть указан id
await db.update([
    { id: '1', name: 'John Updated' },
    { id: '2', name: 'Jane Updated' }
]);

// Обновление всех активных пользователей - в данном примере все активные пользователи станут неактивными
await db.update(
    { isActive: false },
    { isActive: true }
);
```

### Удаление данных (Delete)

```typescript
// Удаление по фильтру
const deletedCount = await db.delete({ email: 'john@example.com' });

// Удаление нескольких записей
const deletedRecords = await db.delete([
    { id: '1' },
    { id: '2' }
]);

// Удаление всех неактивных пользователей
const deletedCount = await db.delete({ isActive: false });

const delTextFilter = await jsonlFile.delete(`not isActive`)
```

## Поиск и фильтрация

### Типы фильтров

#### 1. Простой объектный фильтр

```typescript
// Точное совпадение
const users = await db.select({ name: 'John' });

// Поиск по нескольким полям
const users = await db.select({ 
    name: 'John',
    isActive: true 
});
```

#### 2. MongoDB-подобный фильтр

```typescript
// Операторы сравнения
const users = await db.select({
    age: { $gt: 25 },
    name: { $regex: '^J' },
    email: { $in: ['john@example.com', 'jane@example.com'] }
});

// Логические операторы
const users = await db.select({
    $or: [
        { age: { $lt: 25 } },
        { age: { $gt: 50 } }
    ],
    isActive: true
});
```

#### 3. Строковый фильтр (filtrex)

```typescript
// Простые условия
const users = await db.select('age > 25');

// Сложные условия
const users = await db.select('age > 25 && name.startsWith("J") && isActive');

// Использование функций
const users = await db.select('name.length > 3 && email.includes("@")');
```

#### 4. Функция-фильтр

```typescript
// Простая функция
const users = await db.select((user) => user.age > 25);

// Сложная логика
const users = await db.select((user) => {
    const isAdult = user.age >= 18;
    const hasValidEmail = user.email.includes('@');
    const isActive = user.isActive;
    return isAdult && hasValidEmail && isActive;
});
```

### Опции фильтрации

```typescript
// Строгое сравнение
const users = await db.select(
    { name: 'John' },
    { strictCompare: true }
);

// Нестрогое сравнение (поиск подстроки)
const users = await db.select(
    { name: 'John' },
    { strictCompare: false }
);

// Указание типа фильтра
const users = await db.select(
    { age: { $gt: 25 } },
    { filterType: 'mongodb' }
);
```

## Транзакции

### Простые транзакции

```typescript
// Использование withTransaction
await db.withTransaction(async (adapter) => {
    await adapter.insert({ id: '1', name: 'John' });
    await adapter.update({ name: 'John Updated' }, { id: '1' });
    await adapter.delete({ id: '2' });
}, {
    rollback: true,
    timeout: 20000
});
```

### Сложные транзакции

```typescript
// Начало транзакции
const transactionId = await db.beginTransaction({
    rollback: true,
    timeout: 30000
});

try {
    // Выполнение операций
    await db.insert({ id: '1', name: 'John' }, { 
        inTransaction: true, 
        transactionId 
    });
    
    await db.update({ name: 'John Updated' }, { id: '1' }, {
        inTransaction: true,
        transactionId
    });
    
    // Если все успешно, транзакция автоматически коммитится
} catch (error) {
    // При ошибке происходит автоматический откат
    console.error('Ошибка в транзакции:', error);
} finally {
    // Завершение транзакции
    await db.endTransaction();
}
```

### Опции транзакций

```typescript
const transactionOptions = {
    rollback: true,           // Включить откат при ошибке
    timeout: 30000,           // Таймаут в миллисекундах
    backupFile: '/tmp/backup', // Кастомный путь для бэкапа
    doNotDeleteBackupFile: false // Не удалять бэкап после завершения
};

await db.withTransaction(async (adapter) => {
    // Операции в транзакции
}, transactionOptions);
```

## Кэширование

### Настройка кэша

```typescript
const db = new JSONLFile<User>('users.jsonl', '', {
    cacheTTL: 300000,        // 5 минут
    cacheLimit: 1000,         // Максимум 1000 записей
    cacheCleanupInterval: 120000  // Очистка каждые 2 минуты
});
```

### Работа с кэшем

```typescript
// Получение кэша
const cache = db.getSelectCache();

// Очистка кэша
if (cache) {
    cache.clear();
}

// Проверка наличия кэша
if (db.getSelectCache()) {
    console.log('Кэш включен');
}
```

### События кэша

```typescript
// Подписка на события
db.getSelectCache()?.subscribeToEvents(db.events);

// Обработка событий
db.events.on('record:insert', (record) => {
    console.log('Новая запись:', record);
});

db.events.on('record:update', (record) => {
    console.log('Обновлена запись:', record);
});

db.events.on('record:delete', (record) => {
    console.log('Удалена запись:', record);
});
```

## Шифрование

### Базовое шифрование

```typescript
// Создание с шифрованием
const db = new JSONLFile<User>('users.jsonl', 'your-secret-key');

// Все данные автоматически шифруются при записи
await db.insert({
    id: '1',
    name: 'John Doe',
    email: 'john@example.com'
});
```

### Кастомные функции шифрования

```typescript
// Функция шифрования
const customEncrypt = async (text: string, key: string): Promise<string> => {
    // Ваша логика шифрования
    return encryptedText;
};

// Функция дешифрования
const customDecrypt = async (text: string, key: string): Promise<string> => {
    // Ваша логика дешифрования
    return decryptedText;
};

const db = new JSONLFile<User>('users.jsonl', 'key', {
    encrypt: customEncrypt,
    decrypt: customDecrypt
});
```

### Получение ключа шифрования

```typescript
const encryptionKey = db.getEncryptKey();
console.log('Ключ шифрования:', encryptionKey);
```

## Индексация

### Настройка индексов

```typescript
const db = new JSONLFile<User>('users.jsonl', '', {
    indexedFields: ['email', 'name', 'age']
});
```

### Кастомная функция индексации

```typescript
const customIdFn = (data: User) => [
    `byId:${data.id}`,
    `byEmail:${data.email}`,
    `byName:${data.name}`,
    `byAge:${data.age}`
];

const db = new JSONLFile<User>('users.jsonl', '', {
    idFn: customIdFn
});
```

### Поиск по индексам

```typescript
// Поиск по индексированным полям (быстрый)
const users = await db.select({ email: 'john@example.com' });
const users = await db.select({ name: 'John' });
const users = await db.select({ age: 30 });
```

## Пагинация

### Базовая пагинация

```typescript
const result = await db.selectWithPagination(
    { isActive: true },  // фильтр
    1,                   // страница
    10                   // количество записей на странице
);

console.log('Данные:', result.data);
console.log('Всего записей:', result.total);
console.log('Текущая страница:', result.page);
console.log('Записей на странице:', result.limit);
console.log('Всего страниц:', result.pages);
```

### Навигация по страницам

```typescript
// Первая страница
const page1 = await db.selectWithPagination({}, 1, 10);

// Вторая страница
const page2 = await db.selectWithPagination({}, 2, 10);

// Последняя страница
const lastPage = await db.selectWithPagination({}, result.pages, 10);
```

### Пагинация с фильтрами

```typescript
// Пагинация с MongoDB-фильтром
const result = await db.selectWithPagination(
    { age: { $gt: 25 } },
    1,
    20
);

// Пагинация с функцией-фильтром
const result = await db.selectWithPagination(
    (user) => user.isActive && user.age > 18,
    1,
    15
);
```

## Обработка ошибок

### Типичные ошибки

```typescript
try {
    await db.insert({ id: '1', name: 'John' });
} catch (error) {
    if (error.message.includes('already exists')) {
        console.log('Запись уже существует');
    } else if (error.message.includes('invalid id')) {
        console.log('Неверный ID');
    } else {
        console.error('Неизвестная ошибка:', error);
    }
}
```

### Проверка инициализации

```typescript
try {
    const users = await db.read();
} catch (error) {
    if (error.message.includes('init() must be called')) {
        await db.init();
        const users = await db.read();
    }
}
```

### Обработка ошибок транзакций

```typescript
try {
    await db.withTransaction(async (adapter) => {
        await adapter.insert({ id: '1', name: 'John' });
        throw new Error('Искусственная ошибка');
    });
} catch (error) {
    console.log('Транзакция откачена:', error.message);
    // Данные не были сохранены
}
```

## Производительность

### Оптимизация размера блоков

```typescript
// Автоматическая оптимизация
const db = new JSONLFile<User>('users.jsonl', '', {
    allocSize: 1024  // Начальный размер блока
});

// Ручная оптимизация
await db.reallocSize(2048);  // Увеличить размер блока
```

### Мониторинг производительности

```typescript
// Получение размера блока
const allocSize = db.getAllocSize();
console.log('Текущий размер блока:', allocSize);

// Получение имени файла
const filename = db.getFilename();
console.log('Файл базы данных:', filename);

// Получение имени коллекции
const collectionName = db.getCollectionName();
console.log('Коллекция:', collectionName);
```

### Очистка ресурсов

```typescript
// Уничтожение экземпляра
db.destroy();
```

## Примеры использования

### Пример 1: Простая база данных пользователей

```typescript
interface User {
    id: string;
    name: string;
    email: string;
    age: number;
    isActive: boolean;
    createdAt: Date;
}

// Создание базы данных
const userDb = new JSONLFile<User>('users.jsonl', '', {
    cacheTTL: 300000,
    indexedFields: ['email', 'name'],
    collectionName: 'users'
});

// Инициализация
await userDb.init();

// Добавление пользователей
await userDb.insert([
    {
        id: '1',
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
        isActive: true,
        createdAt: new Date()
    },
    {
        id: '2',
        name: 'Jane Smith',
        email: 'jane@example.com',
        age: 25,
        isActive: true,
        createdAt: new Date()
    }
]);

// Поиск пользователей
const activeUsers = await userDb.select({ isActive: true });
const john = await userDb.select({ email: 'john@example.com' });
const adults = await userDb.select({ age: { $gte: 18 } });

// Обновление пользователя
await userDb.update(
    { age: 31, name: 'John Updated' },
    { id: '1' }
);

// Удаление неактивных пользователей
await userDb.delete({ isActive: false });
```

### Пример 2: База данных с транзакциями

```typescript
interface Order {
    id: string;
    userId: string;
    items: string[];
    total: number;
    status: 'pending' | 'completed' | 'cancelled';
    createdAt: Date;
}

const orderDb = new JSONLFile<Order>('orders.jsonl', '', {
    indexedFields: ['userId', 'status'],
    collectionName: 'orders'
});

await orderDb.init();

// Создание заказа в транзакции
await orderDb.withTransaction(async (adapter) => {
    const order: Order = {
        id: 'order-1',
        userId: 'user-1',
        items: ['item-1', 'item-2'],
        total: 100.50,
        status: 'pending',
        createdAt: new Date()
    };
    
    await adapter.insert(order);
    
    // Обновление статуса
    await adapter.update(
        { status: 'completed' },
        { id: 'order-1' }
    );
}, {
    rollback: true,
    timeout: 10000
});
```

### Пример 3: База данных с шифрованием

```typescript
interface SensitiveData {
    id: string;
    username: string;
    password: string;
    personalInfo: {
        fullName: string;
        ssn: string;
        address: string;
    };
}

const secureDb = new JSONLFile<SensitiveData>('secure.jsonl', 'super-secret-key', {
    skipInvalidLines: true,
    collectionName: 'secure_data'
});

await secureDb.init();

// Данные автоматически шифруются
await secureDb.insert({
    id: '1',
    username: 'john_doe',
    password: 'hashed_password',
    personalInfo: {
        fullName: 'John Doe',
        ssn: '123-45-6789',
        address: '123 Main St'
    }
});

// При чтении данные автоматически расшифровываются
const user = await secureDb.select({ username: 'john_doe' });
```

### Пример 4: Сложные запросы с пагинацией

```typescript
interface Product {
    id: string;
    name: string;
    category: string;
    price: number;
    inStock: boolean;
    tags: string[];
    createdAt: Date;
}

const productDb = new JSONLFile<Product>('products.jsonl', '', {
    indexedFields: ['category', 'inStock'],
    cacheTTL: 600000,
    collectionName: 'products'
});

await productDb.init();

// Сложный запрос с пагинацией
const result = await productDb.selectWithPagination(
    {
        price: { $gte: 10, $lte: 100 },
        inStock: true,
        category: { $in: ['electronics', 'books'] }
    },
    1,  // страница
    20  // количество на странице
);

console.log(`Найдено ${result.total} товаров`);
console.log(`Страница ${result.page} из ${result.pages}`);
console.log('Товары:', result.data);
```

### Пример 5: Работа с событиями

```typescript
interface Log {
    id: string;
    level: 'info' | 'warn' | 'error';
    message: string;
    timestamp: Date;
    userId?: string;
}

const logDb = new JSONLFile<Log>('logs.jsonl', '', {
    collectionName: 'logs'
});

await logDb.init();

// Подписка на события
const cache = logDb.getSelectCache();
if (cache) {
    cache.subscribeToEvents(logDb.events);
}

// Обработка событий
logDb.events.on('record:insert', (log: Log) => {
    console.log(`Новый лог: ${log.level} - ${log.message}`);
});

logDb.events.on('record:update', (log: Log) => {
    console.log(`Лог обновлен: ${log.id}`);
});

logDb.events.on('record:delete', (log: Log) => {
    console.log(`Лог удален: ${log.id}`);
});

// Добавление логов
await logDb.insert([
    {
        id: '1',
        level: 'info',
        message: 'Application started',
        timestamp: new Date(),
        userId: 'system'
    },
    {
        id: '2',
        level: 'error',
        message: 'Database connection failed',
        timestamp: new Date(),
        userId: 'admin'
    }
]);
```

## Заключение

`JSONLFile` предоставляет мощный и гибкий инструмент для работы с данными в формате JSONL. Класс поддерживает все необходимые функции современной NoSQL базы данных, включая транзакции, индексацию, кэширование и шифрование.

Основные преимущества:

- ✅ Высокая производительность
- ✅ Простота использования
- ✅ Гибкая конфигурация
- ✅ Надежность и целостность данных
- ✅ Поддержка сложных запросов
- ✅ Встроенная безопасность

Для получения дополнительной информации обратитесь к документации по конкретным методам и опциям.
