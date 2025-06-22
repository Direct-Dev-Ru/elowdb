# Конфигурация LineDB через YAML файл

LineDB поддерживает инициализацию из YAML файла конфигурации, что позволяет легко настраивать базу данных без изменения кода.

## Настройка

1. Создайте YAML файл конфигурации
2. Установите переменную окружения `LINEDB_INITFILE_PATH` с путем к файлу
3. Создайте экземпляр LineDB без явных опций и вызовите `init()`

## Пример использования

```typescript
import { LineDb } from './src/core/LineDbv2.js'

// Установите переменную окружения
process.env.LINEDB_INITFILE_PATH = './config/linedb.yaml'

// Создайте экземпляр без явных опций
const db = new LineDb()

// Инициализируйте базу данных
await db.init()
```

## Структура YAML файла

```yaml
# Основные настройки кэша
cacheSize: 2000
cacheTTL: 300000  # 5 минут в миллисекундах

# Папка для хранения данных
dbFolder: "./data"

# Коллекции
collections:
  - collectionName: "users"
    encryptKeyForLineDb: ""
    indexedFields: ["id", "email", "name"]
    allocSize: 512
    skipInvalidLines: true
    
  - collectionName: "orders"
    encryptKeyForLineDb: ""
    indexedFields: ["id", "userId", "status"]
    allocSize: 1024
    skipInvalidLines: true

# Партиционирование
partitions:
  - collectionName: "orders"
    partIdFn: "userId"  # Имя поля для партиционирования
```

## Поддерживаемые опции

### Основные настройки
- `cacheSize` - размер кэша (по умолчанию: 1000)
- `cacheTTL` - время жизни записи в кэше в миллисекундах (по умолчанию: 0 - отключено)
- `dbFolder` - папка для хранения файлов базы данных (по умолчанию: "./linedb")

### Коллекции
Каждая коллекция поддерживает все опции `JSONLFileOptions`:
- `collectionName` - имя коллекции
- `encryptKeyForLineDb` - ключ шифрования
- `indexedFields` - индексируемые поля
- `allocSize` - размер выделения памяти
- `skipInvalidLines` - пропускать невалидные строки
- И другие опции...

### Партиционирование
- `collectionName` - имя коллекции для партиционирования
- `partIdFn` - функция партиционирования (может быть строкой с именем поля)

## Приоритет опций

1. Явно переданные опции в конструкторе или методе `init()`
2. Опции из YAML файла (если установлена переменная `LINEDB_INITFILE_PATH`)
3. Опции по умолчанию

## Обработка ошибок

Если YAML файл не найден или содержит ошибки, LineDB продолжит работу с опциями по умолчанию. Ошибки логируются в консоль при включенном режиме отладки.

## Примеры

### Простая конфигурация
```yaml
dbFolder: "./my-database"
collections:
  - collectionName: "users"
    indexedFields: ["id", "email"]
```

### Конфигурация с партиционированием
```yaml
dbFolder: "./partitioned-db"
collections:
  - collectionName: "orders"
    indexedFields: ["id", "userId", "status"]
partitions:
  - collectionName: "orders"
    partIdFn: "userId"
```

### Конфигурация с шифрованием
```yaml
dbFolder: "./secure-db"
collections:
  - collectionName: "users"
    encryptKeyForLineDb: "your-secret-key"
    indexedFields: ["id", "email"]
``` 