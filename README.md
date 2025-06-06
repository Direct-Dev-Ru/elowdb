# @direct-dev-ru/linedb (<https://github.com/direct-dev-ru/linedb>)

## forked from lowdb project (<https://github.com/typicode/lowdb>)

> Simple to use type-safe local JSON database 🦉
>
> If you know JavaScript, you know how to use lowdb.

to run vitest for node:

```bash
npm run test:vitest:node .\src\adapters\node\BSONFile.vi.test.ts
```

Read or create `db.json`

```js
const db = await JSONFilePreset('db.json', { posts: [] })
```

Use plain JavaScript to change data

```js
const post = { id: 1, title: 'lowdb is awesome', views: 100 }

// In two steps
db.data.posts.push(post)
await db.write()

// Or in one
await db.update(({ posts }) => posts.push(post))
```

```js
// db.json
{
  "posts": [
    { "id": 1, "title": "lowdb is awesome", "views": 100 }
  ]
}
```

In the same spirit, query using native `Array` functions:

```js
const { posts } = db.data

posts.at(0) // First post
posts.filter((post) => post.title.includes('lowdb')) // Filter by title
posts.find((post) => post.id === 1) // Find by id
posts.toSorted((a, b) => a.views - b.views) // Sort by views
```

It's that simple. `db.data` is just a JavaScript object, no magic.

## Установка

```sh
npm install @direct-dev-ru/linedb
```

## использование

```js
import { JSONFilePreset } from '@direct-dev-ru/linedb/node'

// Read or create db.json
const defaultData = { posts: [] }
const db = await JSONFilePreset('db.json', defaultData)

// Update db.json
await db.update(({ posts }) => posts.push('hello world'))

// Alternatively you can call db.write() explicitely later
// to write to db.json
db.data.posts.push('hello world')
await db.write()
```

```js
// db.json
{
  "posts": [ "hello world" ]
}
```

### TypeScript

You can use TypeScript to check your data types.

```ts
type Data = {
    messages: string[]
}

const defaultData: Data = { messages: [] }
const db = await JSONPreset<Data>('db.json', defaultData)

db.data.messages.push('foo') // ✅ Success
db.data.messages.push(1) // ❌ TypeScript error
```

### Lodash

You can extend lowdb with Lodash (or other libraries). To be able to extend it, we're not using `JSONPreset` here. Instead, we're using lower components.

```ts
import { Low } from '@direct-dev-ru/linedb'
import { JSONFile } from '@direct-dev-ru/linedb/node'
import lodash from 'lodash'

type Post = {
    id: number
    title: string
}

type Data = {
    posts: Post[]
}

// Extend Low class with a new `chain` field
class LowWithLodash<T> extends Low<T> {
    chain: lodash.ExpChain<this['data']> = lodash.chain(this).get('data')
}

const defaultData: Data = {
    posts: [],
}
const adapter = new JSONFile<Data>('db.json', defaultData)

const db = new LowWithLodash(adapter)
await db.read()

// Instead of db.data use db.chain to access lodash API
const post = db.chain.get('posts').find({ id: 1 }).value() // Important: value() must be called to execute chain
```

### CLI, Server, Browser and in tests usage

See [`src/examples/`](src/examples) directory.

## API

### Presets

Lowdb provides four presets for common cases.

- `JSONFilePreset(filename, defaultData)`
- `JSONFileSyncPreset(filename, defaultData)`
- `LocalStoragePreset(name, defaultData)`
- `SessionStoragePreset(name, defaultData)`

See [`src/examples/`](src/examples) directory for usage.

Lowdb is extremely flexible, if you need to extend it or modify its behavior, use the classes and adapters below instead of the presets.

### Classes

Lowdb has two classes (for asynchronous and synchronous adapters).

#### `new Low(adapter, defaultData)`

```js
import { Low } from '@direct-dev-ru/linedb'
import { JSONFile } from '@direct-dev-ru/linedb/node'

const db = new Low(new JSONFile('file.json'), {})
await db.read()
await db.write()
```

#### `new LowSync(adapterSync, defaultData)`

```js
import { LowSync } from '@direct-dev-ru/linedb'
import { JSONFileSync } from '@direct-dev-ru/linedb/node'

const db = new LowSync(new JSONFileSync('file.json'), {})
db.read()
db.write()
```

### Methods

#### `db.read()`

Calls `adapter.read()` and sets `db.data`.

**Note:** `JSONFile` and `JSONFileSync` adapters will set `db.data` to `null` if file doesn't exist.

```js
db.data // === null
db.read()
db.data // !== null
```

#### `db.write()`

Calls `adapter.write(db.data)`.

```js
db.data = { posts: [] }
db.write() // file.json will be { posts: [] }
db.data = {}
db.write() // file.json will be {}
```

#### `db.update(fn)`

Calls `fn()` then `db.write()`.

```js
db.update((data) => {
    // make changes to data
    // ...
})
// files.json will be updated
```

### Properties

#### `db.data`

Holds your db content. If you're using the adapters coming with lowdb, it can be any type supported by [`JSON.stringify`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify).

For example:

```js
db.data = 'string'
db.data = [1, 2, 3]
db.data = { key: 'value' }
```

## Расширенные примеры использования

### 1. Работа с пользователями и аутентификацией

```typescript
import { JSONFilePreset } from '@direct-dev-ru/linedb/node'

interface User {
  id: string
  username: string
  password: string
  role: 'admin' | 'user'
}

const db = await JSONFilePreset('users.json', { users: [] })

// Добавление нового пользователя
await db.update(({ users }) => {
  users.push({
    id: '1',
    username: 'admin',
    password: 'hashed_password',
    role: 'admin'
  })
})

// Поиск пользователя по имени
const user = db.data.users.find(u => u.username === 'admin')
```

### 2. Управление задачами (Todo List)

```typescript
import { JSONFilePreset } from '@direct-dev-ru/linedb/node'

interface Task {
  id: string
  title: string
  completed: boolean
  createdAt: Date
}

const db = await JSONFilePreset('tasks.json', { tasks: [] })

// Добавление задачи
await db.update(({ tasks }) => {
  tasks.push({
    id: Date.now().toString(),
    title: 'Изучить lowdb',
    completed: false,
    createdAt: new Date()
  })
})

// Отметить задачу как выполненную
await db.update(({ tasks }) => {
  const task = tasks.find(t => t.id === '1')
  if (task) task.completed = true
})
```

### 3. Блог с комментариями

```typescript
import { JSONFilePreset } from '@direct-dev-ru/linedb/node'

interface Post {
  id: string
  title: string
  content: string
  comments: Comment[]
}

interface Comment {
  id: string
  author: string
  content: string
  createdAt: Date
}

const db = await JSONFilePreset('blog.json', { posts: [] })

// Добавление комментария к посту
await db.update(({ posts }) => {
  const post = posts.find(p => p.id === '1')
  if (post) {
    post.comments.push({
      id: Date.now().toString(),
      author: 'Пользователь',
      content: 'Отличный пост!',
      createdAt: new Date()
    })
  }
})
```

### 4. Система рейтингов и отзывов

```typescript
import { JSONFilePreset } from '@direct-dev-ru/linedb/node'

interface Product {
  id: string
  name: string
  price: number
  reviews: Review[]
}

interface Review {
  id: string
  userId: string
  rating: number
  comment: string
}

const db = await JSONFilePreset('products.json', { products: [] })

// Добавление отзыва к продукту
await db.update(({ products }) => {
  const product = products.find(p => p.id === '1')
  if (product) {
    product.reviews.push({
      id: Date.now().toString(),
      userId: 'user1',
      rating: 5,
      comment: 'Отличный продукт!'
    })
  }
})

// Расчет среднего рейтинга
const avgRating = db.data.products
  .find(p => p.id === '1')
  ?.reviews.reduce((acc, review) => acc + review.rating, 0) / 
  db.data.products.find(p => p.id === '1')?.reviews.length
```

### 5. Система уведомлений

```typescript
import { JSONFilePreset } from '@direct-dev-ru/linedb/node'

interface Notification {
  id: string
  userId: string
  message: string
  read: boolean
  createdAt: Date
}

const db = await JSONFilePreset('notifications.json', { notifications: [] })

// Добавление уведомления
await db.update(({ notifications }) => {
  notifications.push({
    id: Date.now().toString(),
    userId: 'user1',
    message: 'У вас новое сообщение',
    read: false,
    createdAt: new Date()
  })
})

// Отметить уведомление как прочитанное
await db.update(({ notifications }) => {
  const notification = notifications.find(n => n.id === '1')
  if (notification) notification.read = true
})
```

### 6. Система заказов

```typescript
import { JSONFilePreset } from '@direct-dev-ru/linedb/node'

interface Order {
  id: string
  userId: string
  items: OrderItem[]
  status: 'pending' | 'processing' | 'completed' | 'cancelled'
  total: number
}

interface OrderItem {
  productId: string
  quantity: number
  price: number
}

const db = await JSONFilePreset('orders.json', { orders: [] })

// Создание нового заказа
await db.update(({ orders }) => {
  orders.push({
    id: Date.now().toString(),
    userId: 'user1',
    items: [
      {
        productId: '1',
        quantity: 2,
        price: 100
      }
    ],
    status: 'pending',
    total: 200
  })
})

// Обновление статуса заказа
await db.update(({ orders }) => {
  const order = orders.find(o => o.id === '1')
  if (order) order.status = 'processing'
})
```

### 7. Система чата

```typescript
import { JSONFilePreset } from '@direct-dev-ru/linedb/node'

interface Message {
  id: string
  senderId: string
  receiverId: string
  content: string
  timestamp: Date
}

const db = await JSONFilePreset('messages.json', { messages: [] })

// Отправка сообщения
await db.update(({ messages }) => {
  messages.push({
    id: Date.now().toString(),
    senderId: 'user1',
    receiverId: 'user2',
    content: 'Привет!',
    timestamp: new Date()
  })
})

// Получение истории сообщений между двумя пользователями
const chatHistory = db.data.messages
  .filter(m => 
    (m.senderId === 'user1' && m.receiverId === 'user2') ||
    (m.senderId === 'user2' && m.receiverId === 'user1')
  )
  .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
```

### 8. Система настроек пользователя

```typescript
import { JSONFilePreset } from '@direct-dev-ru/linedb/node'

interface UserSettings {
  userId: string
  theme: 'light' | 'dark'
  language: string
  notifications: {
    email: boolean
    push: boolean
  }
}

const db = await JSONFilePreset('settings.json', { settings: [] })

// Сохранение настроек пользователя
await db.update(({ settings }) => {
  const userSettings = settings.find(s => s.userId === 'user1')
  if (userSettings) {
    userSettings.theme = 'dark'
    userSettings.language = 'ru'
  } else {
    settings.push({
      userId: 'user1',
      theme: 'dark',
      language: 'ru',
      notifications: {
        email: true,
        push: false
      }
    })
  }
})
```

### 9. Система статистики

```typescript
import { JSONFilePreset } from '@direct-dev-ru/linedb/node'

interface Statistic {
  id: string
  type: 'pageView' | 'click' | 'conversion'
  page: string
  timestamp: Date
  metadata: Record<string, any>
}

const db = await JSONFilePreset('statistics.json', { statistics: [] })

// Запись статистики
await db.update(({ statistics }) => {
  statistics.push({
    id: Date.now().toString(),
    type: 'pageView',
    page: '/home',
    timestamp: new Date(),
    metadata: {
      userAgent: 'Mozilla/5.0...',
      referrer: 'https://google.com'
    }
  })
})

// Анализ статистики за последние 24 часа
const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000)
const recentStats = db.data.statistics
  .filter(s => s.timestamp > last24Hours)
  .reduce((acc, stat) => {
    acc[stat.type] = (acc[stat.type] || 0) + 1
    return acc
  }, {})
```

### 10. Система кэширования

```typescript
import { JSONFilePreset } from '@direct-dev-ru/linedb/node'

interface CacheItem {
  key: string
  value: any
  expiresAt: Date
}

const db = await JSONFilePreset('cache.json', { cache: [] })

// Сохранение в кэш
await db.update(({ cache }) => {
  cache.push({
    key: 'user:1:profile',
    value: { name: 'John', age: 30 },
    expiresAt: new Date(Date.now() + 3600000) // 1 час
  })
})

// Получение из кэша с проверкой срока действия
const getFromCache = (key: string) => {
  const now = new Date()
  const item = db.data.cache.find(c => c.key === key && c.expiresAt > now)
  return item?.value
}

// Очистка устаревшего кэша
await db.update(({ cache }) => {
  const now = new Date()
  db.data.cache = cache.filter(c => c.expiresAt > now)
})
```

## Примеры использования разных адаптеров

### 1. Использование BSONFile (бинарный формат)

```typescript
import { Low } from '@direct-dev-ru/linedb'
import { BSONFile } from '@direct-dev-ru/linedb/node'

interface User {
  id: string
  name: string
  data: Uint8Array // BSON хорошо подходит для бинарных данных
}

const adapter = new BSONFile<User[]>('users.bson')
const db = new Low(adapter, [])

// Запись бинарных данных
await db.update((users) => {
  users.push({
    id: '1',
    name: 'John',
    data: new Uint8Array([1, 2, 3, 4, 5])
  })
})
```

### 2. Использование YAMLFile (YAML формат)

```typescript
import { Low } from '@direct-dev-ru/linedb'
import { YAMLFile } from '@direct-dev-ru/linedb/node'

interface Config {
  server: {
    port: number
    host: string
  }
  database: {
    url: string
    credentials: {
      username: string
      password: string
    }
  }
}

const adapter = new YAMLFile<Config>('config.yaml')
const db = new Low(adapter, {
  server: {
    port: 3000,
    host: 'localhost'
  },
  database: {
    url: 'mongodb://localhost:27017',
    credentials: {
      username: 'admin',
      password: 'secret'
    }
  }
})

// Чтение конфигурации
await db.read()
console.log(db.data.server.port)
```

### 3. Использование с шифрованием

```typescript
import { Low } from '@direct-dev-ru/linedb'
import { DataFile } from '@direct-dev-ru/linedb/node'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const algorithm = 'aes-256-cbc'
const key = randomBytes(32)
const iv = randomBytes(16)

const encryptedAdapter = new DataFile('encrypted.json', {
  parse: (data) => {
    const decipher = createDecipheriv(algorithm, key, iv)
    return JSON.parse(decipher.update(data, 'hex', 'utf8') + decipher.final('utf8'))
  },
  stringify: (data) => {
    const cipher = createCipheriv(algorithm, key, iv)
    return cipher.update(JSON.stringify(data), 'utf8', 'hex') + cipher.final('hex')
  }
})

const db = new Low(encryptedAdapter, { secret: 'data' })
await db.write() // Данные будут зашифрованы при записи
```

### 4. Использование Memory адаптера (для тестов)

```typescript
import { Low } from '@direct-dev-ru/linedb'
import { Memory } from '@direct-dev-ru/linedb'

interface TestData {
  items: string[]
}

const adapter = new Memory<TestData>()
const db = new Low(adapter, { items: [] })

// Данные хранятся только в памяти
await db.update(({ items }) => {
  items.push('test')
})
console.log(db.data.items) // ['test']
```

### 5. Использование LocalStorage в браузере

```typescript
import { LowSync } from '@direct-dev-ru/linedb'
import { LocalStorage } from '@direct-dev-ru/linedb/browser'

interface BrowserData {
  theme: 'light' | 'dark'
  settings: {
    notifications: boolean
  }
}

const adapter = new LocalStorage<BrowserData>('app-settings')
const db = new LowSync(adapter, {
  theme: 'light',
  settings: {
    notifications: true
  }
})

// Сохранение настроек в localStorage
db.update(({ settings }) => {
  settings.notifications = false
})
```

### 6. Использование SessionStorage в браузере

```typescript
import { LowSync } from '@direct-dev-ru/linedb'
import { SessionStorage } from '@direct-dev-ru/linedb/browser'

interface SessionData {
  cart: {
    items: Array<{
      id: string
      quantity: number
    }>
  }
}

const adapter = new SessionStorage<SessionData>('shopping-cart')
const db = new LowSync(adapter, { cart: { items: [] } })

// Данные будут сохранены только на время сессии
db.update(({ cart }) => {
  cart.items.push({ id: '1', quantity: 2 })
})
```

### 7. Использование UpdLow (расширенная версия Low)

```typescript
import { UpdLow } from '@direct-dev-ru/linedb'
import { JSONFile } from '@direct-dev-ru/linedb/node'

interface User {
  id: string
  name: string
  lastModified: Date
}

const adapter = new JSONFile<User[]>('users.json')
const db = new UpdLow(adapter, [], 5000) // 5000ms - интервал автообновления

// Автоматическое обновление данных
db.startSmartRefresh(5000)

// Данные будут автоматически обновляться каждые 5 секунд
await db.update((users) => {
  users.push({
    id: '1',
    name: 'John',
    lastModified: new Date()
  })
})

// Остановка автообновления
db.stopSmartRefresh()
```

### 8. Комбинированное использование адаптеров

```typescript
import { Low } from '@direct-dev-ru/linedb'
import { JSONFile } from '@direct-dev-ru/linedb/node'
import { LocalStorage } from '@direct-dev-ru/linedb/browser'

// Определение фабрики адаптеров
const createAdapter = (type: 'node' | 'browser') => {
  if (type === 'node') {
    return new JSONFile('data.json')
  } else {
    return new LocalStorage('app-data')
  }
}

// Использование в Node.js
const nodeAdapter = createAdapter('node')
const nodeDb = new Low(nodeAdapter, {})

// Использование в браузере
const browserAdapter = createAdapter('browser')
const browserDb = new LowSync(browserAdapter, {})
```

### 9. Создание кастомного адаптера для работы с API

```typescript
import { Low } from '@direct-dev-ru/linedb'
import { Adapter } from '@direct-dev-ru/linedb'

class APIDataAdapter implements Adapter<Data> {
  private url: string
  private token: string

  constructor(url: string, token: string) {
    this.url = url
    this.token = token
  }

  async read() {
    const response = await fetch(this.url, {
      headers: {
        Authorization: `Bearer ${this.token}`
      }
    })
    return response.json()
  }

  async write(data: Data) {
    await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`
      },
      body: JSON.stringify(data)
    })
  }
}

const adapter = new APIDataAdapter('https://api.example.com/data', 'token')
const db = new Low(adapter, {})
```

### 10. Использование с компрессией данных

```typescript
import { Low } from '@direct-dev-ru/linedb'
import { DataFile } from '@direct-dev-ru/linedb/node'
import { gzipSync, gunzipSync } from 'zlib'
import { promisify } from 'util'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

const compressedAdapter = new DataFile("compressed.db", undefined, {
    parse: (data) => {
      const decompressed = gunzipSync(Buffer.from(data, "base64"));
      return JSON.parse(decompressed.toString());
    },
    stringify: (data) => {
      const compressed = gzipSync(JSON.stringify(data));
      return compressed.toString("base64");
    },
});

const db = new Low(compressedAdapter, { largeData: '...' })
await db.write() // Данные будут сжаты при записи
```

## Примеры использования Lodash-вариантов

### LowWithLodash

```typescript
import { LowWithLodash } from '@direct-dev-ru/linedb'
import { JSONFile } from '@direct-dev-ru/linedb/node'

interface User {
  id: number
  name: string
  age: number
  active: boolean
  department: string
}

interface Data {
  users: User[]
}

const adapter = new JSONFile<Data>('db.json')
const db = new LowWithLodash(adapter, { users: [] })

// Чтение данных
await db.read()

// Простые запросы
const activeUsers = db.chain
  .get('users')
  .filter({ active: true })
  .value()

const userNames = db.chain
  .get('users')
  .map('name')
  .value()

// Сложные запросы
const departmentStats = db.chain
  .get('users')
  .groupBy('department')
  .mapValues(users => ({
    count: users.length,
    avgAge: _.meanBy(users, 'age'),
    activeCount: _.countBy(users, 'active').true || 0
  }))
  .value()

// Сортировка и фильтрация
const topUsers = db.chain
  .get('users')
  .filter({ active: true })
  .orderBy(['age', 'name'], ['desc', 'asc'])
  .take(5)
  .value()

// Обновление данных
await db.update(data => {
  data.users.push({
    id: 1,
    name: 'John',
    age: 30,
    active: true,
    department: 'IT'
  })
})
```

### UpdLowWithLodash

```typescript
import { UpdLowWithLodash } from '@direct-dev-ru/linedb'
import { JSONFile } from '@direct-dev-ru/linedb/node'

interface Post {
  id: number
  title: string
  authorId: number
  tags: string[]
  views: number
  createdAt: Date
}

interface Data {
  posts: Post[]
}

const adapter = new JSONFile<Data>('db.json')
const db = new UpdLowWithLodash(adapter, 5000, { posts: [] })

// Включаем автообновление
db.startSmartRefresh(5000)

// Сложные аналитические запросы
const tagStats = db.chain
  .get('posts')
  .flatMap('tags')
  .countBy()
  .value()

const authorStats = db.chain
  .get('posts')
  .groupBy('authorId')
  .mapValues(posts => ({
    postCount: posts.length,
    totalViews: _.sumBy(posts, 'views'),
    popularTags: _.chain(posts)
      .flatMap('tags')
      .countBy()
      .entries()
      .sortBy(1)
      .reverse()
      .take(3)
      .fromPairs()
      .value()
  }))
  .value()

// Временные запросы
const recentPosts = db.chain
  .get('posts')
  .filter(post => {
    const daysAgo = 7
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - daysAgo)
    return post.createdAt > cutoff
  })
  .orderBy('views', 'desc')
  .take(10)
  .value()

// Обновление с проверкой
await db.update({ posts: [] }, async (data) => {
  const newPost = {
    id: 1,
    title: 'New Post',
    authorId: 1,
    tags: ['tech', 'js'],
    views: 0,
    createdAt: new Date()
  }
  
  data.posts?.push(newPost)
  return { result: true, data }
})

// Остановка автообновления
db.stopSmartRefresh()
```

### Преимущества использования Lodash-вариантов

1. **Цепочки операций**
   - Более читаемый и выразительный код
   - Возможность комбинировать множество операций
   - Ленивое выполнение (операции выполняются только при вызове `.value()`)

2. **Богатый набор методов**
   - Фильтрация, сортировка, группировка
   - Агрегация и статистика
   - Работа с массивами и объектами
   - Манипуляции с датами и строками

3. **Производительность**
   - Оптимизированные алгоритмы
   - Кэширование промежуточных результатов
   - Эффективная работа с большими наборами данных

4. **Типобезопасность**
   - Полная поддержка TypeScript
   - Автодополнение в IDE
   - Проверка типов во время компиляции

## Adapters

### Lowdb adapters

#### `JSONFile` `JSONFileSync`

Adapters for reading and writing JSON files.

```js
import { JSONFile, JSONFileSync } from '@direct-dev-ru/linedb/node'

new Low(new JSONFile(filename), {})
new LowSync(new JSONFileSync(filename), {})
```

#### `Memory` `MemorySync`

In-memory adapters. Useful for speeding up unit tests. See [`src/examples/`](src/examples) directory.

```js
import { Memory, MemorySync } from '@direct-dev-ru/linedb'

new Low(new Memory(), {})
new LowSync(new MemorySync(), {})
```

#### `LocalStorage` `SessionStorage`

Synchronous adapter for `window.localStorage` and `window.sessionStorage`.

```js
import { LocalStorage, SessionStorage } from '@direct-dev-ru/linedb/browser'
new LowSync(new LocalStorage(name), {})
new LowSync(new SessionStorage(name), {})
```

### Utility adapters

#### `TextFile` `TextFileSync`

Adapters for reading and writing text. Useful for creating custom adapters.

#### `DataFile` `DataFileSync`

Adapters for easily supporting other data formats or adding behaviors (encrypt, compress...).

```js
import { DataFile } from '@direct-dev-ru/linedb/node'
new DataFile(filename, {
    parse: YAML.parse,
    stringify: YAML.stringify,
})
new DataFile(filename, {
    parse: (data) => {
        decypt(JSON.parse(data))
    },
    stringify: (str) => {
        encrypt(JSON.stringify(str))
    },
})
```

### Third-party adapters

If you've published an adapter for lowdb, feel free to create a PR to add it here.

### Writing your own adapter

You may want to create an adapter to write `db.data` to YAML, XML, encrypt data, a remote storage, ...

An adapter is a simple class that just needs to expose two methods:

```js
class AsyncAdapter {
    read() {
        /* ... */
    } // should return Promise<data>
    write(data) {
        /* ... */
    } // should return Promise<void>
}

class SyncAdapter {
    read() {
        /* ... */
    } // should return data
    write(data) {
        /* ... */
    } // should return nothing
}
```

For example, let's say you have some async storage and want to create an adapter for it:

```js
import { Low } from '@direct-dev-ru/linedb'
import { api } from './AsyncStorage'

class CustomAsyncAdapter {
    // Optional: your adapter can take arguments
    constructor(args) {
        // ...
    }

    async read() {
        const data = await api.read()
        return data
    }

    async write(data) {
        await api.write(data)
    }
}

const adapter = new CustomAsyncAdapter()
const db = new Low(adapter, {})
```

See [`src/adapters/`](src/adapters) for more examples.

#### Custom serialization

To create an adapter for another format than JSON, you can use `TextFile` or `TextFileSync`.

For example:

```js
import { Adapter, Low } from '@direct-dev-ru/linedb'
import { TextFile } from '@direct-dev-ru/linedb/node'
import YAML from 'yaml'

class YAMLFile {
    constructor(filename) {
        this.adapter = new TextFile(filename)
    }

    async read() {
        const data = await this.adapter.read()
        if (data === null) {
            return null
        } else {
            return YAML.parse(data)
        }
    }

    write(obj) {
        return this.adapter.write(YAML.stringify(obj))
    }
}

const adapter = new YAMLFile('file.yaml')
const db = new Low(adapter, {})
```

## Ограничения по использованию

Enclowdb doesn't support Node's cluster module.

If you have large JavaScript objects (`~10-100MB`) you may hit some performance issues. This is because whenever you call `db.write`, the whole `db.data` is serialized using `JSON.stringify` and written to storage.

Depending on your use case, this can be fine or not. It can be mitigated by doing batch operations and calling `db.write` only when you need it.

If you plan to scale, it's highly recommended to use databases like PostgreSQL or MongoDB instead.
