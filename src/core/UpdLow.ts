import cron from 'node-cron'

import { Adapter } from './Low.js'

/**
 * A class that provides updatable low-level data management with automatic refresh capabilities.
 * It maintains data synchronization between local and remote storage while handling dirty states.
 *
 * @template T - The type of data being managed
 */
export class UpdLow<T = unknown> {
    /** The adapter used for reading and writing data */
    adapter: Adapter<T>

    /** Indicates whether the local data has been modified and needs to be written */
    public isDirty: boolean = false

    /** The internal data storage */
    private _data!: T

    /** The scheduled cron job for automatic updates */
    private cronJob?: cron.ScheduledTask

    /** The interval in milliseconds between automatic updates */
    private refreshIntervalMs?: number

    /** Timestamp of the last local modification */
    private lastModified: number = 0

    /** Timestamp of the last successful data fetch */
    private lastFetched: number = 0

    /** Flag to prevent concurrent read operations */
    private _reading = false

    /**
     * Creates a new instance of UpdLow
     *
     * @param adapter - The adapter used for reading and writing data
     * @param _refreshIntervalMs - The interval in milliseconds between automatic updates (defaults to 200ms)
     * @param defaultData - Optional initial data to use
     */
    constructor(
        adapter: Adapter<T>,
        _refreshIntervalMs?: number,
        defaultData?: T,
    ) {
        // checkArgs(adapter, defaultData || {})
        this.adapter = adapter
        if (!defaultData) {
            console.log('init data reading from disk ... ')
            setTimeout(() => {
                this.read()
                    .then(() => {
                        if (this._data) {
                            console.log(
                                'init data reading from disk is: ',
                                this._data,
                            )
                        } else {
                            this._data = null as unknown as T
                            console.error('Initial read failed - set to null')
                        }
                    })
                    .catch((error) => {
                        console.error('Initial read failed:', error)
                        this._data = {} as T
                    })
            }, 0)
        } else {
            this._data = defaultData
        }
        this.refreshIntervalMs = _refreshIntervalMs || 2000
        if ((_refreshIntervalMs || 0) > 0) {
            this.startSmartRefresh(_refreshIntervalMs)
        }
    }

    waitForData(timeoutMs: number = 2000): Promise<void> {
        return new Promise((resolve, reject) => {
            const startTime = Date.now()

            const checkData = () => {
                if (this._data !== undefined && this._data !== null) {
                    resolve() // Data is ready
                } else if (Date.now() - startTime >= timeoutMs) {
                    reject(
                        new Error(
                            `Timeout waiting for data to initialize after ${timeoutMs}ms`,
                        ),
                    )
                } else {
                    setTimeout(checkData, 50) // Check again in 50ms
                }
            }

            checkData() // Start first check
        })
    }

    /**
     * Cleans up all resources and stops any running updates
     */
    destroy(): void {
        if (process.env.NODE_ENV === 'test') {
            console.log('UpdLow is destroyed:')
        }
        this.stopSmartRefresh()
    }

    /**
     * Implements the async disposal pattern
     *
     * @returns A promise that resolves when disposal is complete
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    async [Symbol.asyncDispose](): Promise<void> {
        this.destroy()
    }

    /**
     * Gets the current data
     *
     * @returns The current data
     */
    get data(): T {
        return this._data
    }

    /**
     * Sets new data and marks it as dirty
     *
     * @param value - The new data to set
     */
    set data(value: T) {
        this._data = value
        this.lastModified = Date.now()
        this.isDirty = true
        // Stop updates when data becomes dirty
        this.stopSmartRefresh()
    }

    /**
     * Gets the timestamp of the last local modification
     *
     * @returns The timestamp of the last modification
     */
    get lastMod(): number {
        return this.lastModified
    }

    /**
     * Gets the timestamp of the last successful data fetch
     *
     * @returns The timestamp of the last fetch
     */
    get lastFetch(): number {
        return this.lastFetched
    }

    /**
     * Reads data from the adapter and updates local data if appropriate
     *
     * @returns A promise that resolves when the read operation is complete
     */
    async read(): Promise<void> {
        if (this._reading) {
            return
        }
        try {
            this._reading = true
            const remoteData = await this.adapter.read()
            if (remoteData) {
                // Only update if no local modifications since last fetch
                if (this.lastModified <= this.lastFetched) {
                    this._data = remoteData
                    const timestamp = Date.now()
                    this.lastFetched = timestamp
                    this.isDirty = false
                } else {
                    // Partial update data
                    this._data = { ...remoteData, ...this._data }
                    this.isDirty = true
                }
            }
        } finally {
            this._reading = false
        }
    }

    /**
     * Writes the current data to the adapter and resets the dirty state
     *
     * @returns A promise that resolves when the write operation is complete
     */
    async write(): Promise<void> {
        if (!this._data) {
            return
        }
        await this.adapter.write(this._data)
        const timestamp = Date.now()
        this.lastFetched = timestamp
        this.lastModified = timestamp
        this.isDirty = false
        // Restart updates after data is flushed
        if (this.refreshIntervalMs) {
            this.startSmartRefresh(this.refreshIntervalMs)
        }
    }

    /**
     * Updates the data using a provided function and writes if the function returns true
     *
     * @param fn - A function that takes the current data and returns a promise of boolean
     * @returns A promise that resolves to true if the update was successful, false otherwise
     */
    async update(
        data: Partial<T>,
        fn?: (
            data: Partial<T>,
        ) => Promise<{ result: boolean; data: Partial<T> }>,
    ): Promise<{ result: boolean; error: string }> {
        if (data && fn) {
            try {
                const res = await fn(data)
                if (!res.result) {
                    return { result: false, error: 'result of fn is false' }
                }
                this._data = { ...this._data, ...res.data }
                await this.write()
                this.isDirty = false
                const timestamp = Date.now()
                this.lastFetched = timestamp
                this.lastModified = timestamp
                return { result: true, error: '' }
            } catch (e: unknown) {
                return {
                    result: true,
                    error:
                        (e as Error)?.message ?? 'undefined error while update',
                }
            }
        }
        return { result: false, error: 'no data provided for update' }
    }

    /**
     * Starts the automatic refresh process using cron scheduling
     *
     * @param intervalMs - The interval in milliseconds between updates
     */
    startSmartRefresh(intervalMs: number = this.refreshIntervalMs || 0): void {
        this.stopSmartRefresh()
        if (intervalMs > 0) {
            let seconds = Math.floor(intervalMs / 1000)
            if (seconds === 0) {
                seconds = 2
            }
            const cronExpression = `*/${seconds} * * * * *`

            // Use arrow function to preserve this context
            const refreshTask = async () => {
                try {
                    if (
                        !this._reading &&
                        !this.isDirty &&
                        this.lastModified <= this.lastFetched
                    ) {
                        await this.read()
                        if (process.env.NODE_ENV === 'test') {
                            console.log('interval reading:', this._data)
                        }
                    }
                } catch (error) {
                    if (process.env.NODE_ENV === 'test') {
                        console.error('Smart refresh failed:', error)
                    }
                    // Stop the cron job on error to prevent repeated failures
                    this.stopSmartRefresh()
                }
            }

            this.cronJob = cron.schedule(cronExpression, refreshTask)
        }
    }

    /**
     * Stops the automatic refresh process
     */
    stopSmartRefresh(): void {
        if (this.cronJob) {
            this.cronJob.stop()
            this.cronJob = undefined
        }
    }
}
