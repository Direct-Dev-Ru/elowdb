/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { gunzipSync, gzipSync } from 'zlib'

import { DataFile, LowWithLodash } from '../index.js'
// import { JSONFile } from '../index.js'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const log = console.log

interface TestData {
    timestamp: number
    lastThread: string
    data: any
}

interface ThreadStats {
    threadName: string
    readTimes: number[]
    writeTimes: number[]
    avgReadTime: number
    avgWriteTime: number
    minReadTime: number
    minWriteTime: number
    maxReadTime: number
    maxWriteTime: number
}

class LoadTest {
    private dataSize: number
    private threadCount: number
    private iterations: number
    private testDataPath: string
    private logPath: string
    private stats: Map<string, ThreadStats>
    private db: LowWithLodash<{ data: TestData[] }>
    minDelay: number
    maxDelay: number

    constructor(
        dataSize: number = 1024 * 2,
        threadCount: number = 5,
        iterations: number = 5,
        maxDelay: number = 2,
        minDelay: number = 1,
    ) {
        this.dataSize = dataSize
        this.threadCount = threadCount
        this.iterations = iterations
        this.maxDelay = maxDelay
        this.minDelay = minDelay
        this.testDataPath = path.join(__dirname, 'testData.json')
        this.logPath = path.join(__dirname, 'loadTest.log')
        this.stats = new Map()

        // const adapter = new JSONFile<{ data: TestData[] }>(this.testDataPath)
        const compressedAdapter = new DataFile('compressed.db', undefined, {
            parse: (data) => {
                const decompressed = gunzipSync(Buffer.from(data, 'base64'))
                return JSON.parse(decompressed.toString())
            },
            stringify: (data) => {
                const compressed = gzipSync(JSON.stringify(data))
                return compressed.toString('base64')
            },
        })
        // this.db = new LowWithLodash(adapter, { data: [] });
        this.db = new LowWithLodash(compressedAdapter, { data: [] })
    }

    private generateTestData(): TestData[] {
        const data: TestData[] = []
        const timestamp = Date.now()

        // Генерация данных
        while (JSON.stringify(data).length < this.dataSize) {
            data.push({
                timestamp,
                lastThread: 'initial',
                data: {
                    id: Math.random().toString(36).substring(7),
                    value: Math.random() * 1000,
                    description: 'Test data entry',
                },
            })
        }

        return data
    }

    private async writeTestData(data: TestData[]): Promise<void> {
        this.db.data.data = data
        await this.db.write()
    }

    private async readTestData(): Promise<TestData[]> {
        await this.db.read()
        return this.db.data.data || []
    }

    private async log(message: string): Promise<void> {
        const timestamp = new Date().toISOString()
        const logMessage = `[${timestamp}] ${message}\n`
        await fs.promises.appendFile(this.logPath, logMessage)
    }

    private getRandomDelay(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1) + min) * 1000
    }

    private async threadFunction(threadName: string): Promise<void> {
        const stats: ThreadStats = {
            threadName,
            readTimes: [],
            writeTimes: [],
            avgReadTime: 0,
            avgWriteTime: 0,
            minReadTime: Infinity,
            maxReadTime: Infinity,
            minWriteTime: Infinity,
            maxWriteTime: Infinity,
        }

        for (let i = 0; i < this.iterations; i++) {
            log(
                `Thread ${threadName}: Iteration ${i + 1} of ${
                    this.iterations
                } started`,
            )
            // Случайная задержка 1
            await new Promise((resolve) =>
                setTimeout(
                    resolve,
                    this.getRandomDelay(this.minDelay, this.maxDelay),
                ),
            )

            // Чтение данных
            log(
                `Thread ${threadName}: Reading Iteration ${i + 1} of ${
                    this.iterations
                } started`,
            )
            const readStart = Date.now()
            const data = await this.readTestData()
            const readTime = Date.now() - readStart
            stats.readTimes.push(readTime)
            stats.minReadTime = Math.min(stats.minReadTime, readTime)
            stats.maxReadTime = Math.max(stats.maxReadTime, readTime)
            await this.log(
                `Thread ${threadName}: Iteration ${i + 1} of ${
                    this.iterations
                } Read operation took ${readTime}ms`,
            )
            log(
                `Thread ${threadName}: Reading Iteration ${i + 1} of ${
                    this.iterations
                } completed`,
            )

            // Случайная задержка
            await new Promise((resolve) =>
                setTimeout(
                    resolve,
                    this.getRandomDelay(this.minDelay, this.maxDelay),
                ),
            )

            // Обновление данных
            const updatedData = data.map((item) => ({
                ...item,
                timestamp: Date.now(),
                lastThread: threadName,
            }))

            // Запись данных
            log(
                `Thread ${threadName}: Writing Iteration ${i + 1} of ${
                    this.iterations
                } started`,
            )
            const writeStart = Date.now()
            await this.writeTestData(updatedData)
            log(
                `Thread ${threadName}: Writing Iteration ${i + 1} of ${
                    this.iterations
                } completed`,
            )
            const writeTime = Date.now() - writeStart
            stats.writeTimes.push(writeTime)
            stats.minWriteTime = Math.min(stats.minWriteTime, writeTime)
            stats.maxWriteTime = Math.max(stats.maxWriteTime, writeTime)
            await this.log(
                `Thread ${threadName}: Iteration ${i + 1} of ${
                    this.iterations
                } Write operation took ${writeTime}ms`,
            )
            log(
                `Thread ${threadName}: Iteration ${i + 1} of ${
                    this.iterations
                } completed`,
            )
        }

        // Расчет средних значений
        stats.avgReadTime =
            stats.readTimes.reduce((a, b) => a + b, 0) / stats.readTimes.length
        stats.avgWriteTime =
            stats.writeTimes.reduce((a, b) => a + b, 0) /
            stats.writeTimes.length

        this.stats.set(threadName, stats)
    }

    public async run(): Promise<void> {
        // Инициализация лог-файла
        await fs.promises.writeFile(this.logPath, 'Load Test Started\n')

        // Инициализация базы данных
        await this.db.read()
        if (!this.db.data) {
            this.db.data = { data: [] }
        }

        // Генерация и запись начальных данных
        const initialData = this.generateTestData()
        await this.writeTestData(initialData)
        await this.log(
            `Initial test data generated (${
                JSON.stringify(initialData).length
            } bytes)`,
        )

        // Запуск потоков
        const threads = Array.from({ length: this.threadCount }, (_, i) =>
            this.threadFunction(`Thread-${i + 1}`),
        )

        await Promise.all(threads)

        // Вывод итоговой статистики
        log('\nLoad Test Results:')
        log('=================')

        for (const [threadName, stats] of this.stats) {
            log(`\nThread: ${threadName}`)
            log(`Average Read Time: ${stats.avgReadTime.toFixed(2)}ms`)
            log(`Average Write Time: ${stats.avgWriteTime.toFixed(2)}ms`)
            log(`Minimum Read Time: ${stats.minReadTime}ms`)
            log(`Minimum Write Time: ${stats.minWriteTime}ms`)
        }

        // Запись итогов в лог
        await this.log('\nLoad Test Completed')
        for (const [threadName, stats] of this.stats) {
            await this.log(`\nThread: ${threadName}`)
            await this.log(
                `Average Read Time: ${stats.avgReadTime.toFixed(2)}ms`,
            )
            await this.log(
                `Average Write Time: ${stats.avgWriteTime.toFixed(2)}ms`,
            )
            await this.log(`Minimum Read Time: ${stats.minReadTime}ms`)
            await this.log(`Minimum Write Time: ${stats.minWriteTime}ms`)
        }
    }
}

// Парсинг аргументов командной строки
const args = process.argv.slice(2)
const dataSize = parseInt(args[0]) || 1024 * 20
const threadCount = parseInt(args[1]) || 2
const iterations = parseInt(args[2]) || 5
const maxDelay = parseInt(args[3]) || 3
const minDelay = parseInt(args[4]) || 1

// Запуск теста
const loadTest = new LoadTest(
    dataSize,
    threadCount,
    iterations,
    maxDelay,
    minDelay,
)
loadTest.run().catch(console.error)
