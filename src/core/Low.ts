export interface Adapter<T> {
    read: () => Promise<T | null>
    write: (data: T) => Promise<void>
    decrypt?: (encryptedText: string) => Promise<string | { error: string }>
    encrypt?: (
        secretkey: string,
    ) => Promise<string | { error: string }>
    // _cypherKey?: string
}

export interface SyncAdapter<T> {
    read: () => T | null
    write: (data: T) => void
    decrypt?: (encryptedText: string) => string | { error: string }
    encrypt?: (
        secretkey: string,
        text: string,
    ) => string | { error: string }
    // _cypherKey?: string
}

function checkArgs(adapter: unknown, defaultData: unknown) {
    if (adapter === undefined) throw new Error('lowdb: missing adapter')
    if (defaultData === undefined)
        throw new Error('lowdb: missing default data')
}

export class Low<T = unknown> {
    adapter: Adapter<T>
    data: T

    constructor(adapter: Adapter<T>, defaultData: T) {
        checkArgs(adapter, defaultData)
        this.adapter = adapter
        this.data = defaultData
    }

    async read(): Promise<void> {
        const data = await this.adapter.read()
        if (data) this.data = data
    }

    async write(): Promise<void> {
        if (this.data) await this.adapter.write(this.data)
    }

    async update(fn: (data: T) => unknown): Promise<void> {
        fn(this.data)
        await this.write()
    }
}

export class LowSync<T = unknown> {
    adapter: SyncAdapter<T>
    data: T

    constructor(adapter: SyncAdapter<T>, defaultData: T) {
        checkArgs(adapter, defaultData)
        this.adapter = adapter
        this.data = defaultData
    }

    read(): void {
        const data = this.adapter.read()
        if (data) this.data = data
    }

    write(): void {
        if (this.data) this.adapter.write(this.data)
    }

    update(fn: (data: T) => unknown): void {
        fn(this.data)
        this.write()
    }
}

// Updatable low class
export class UpdLow<T = unknown> {
    adapter: Adapter<T>
    public isDirty: boolean = false
    private _data!: T
    private refreshInterval?: NodeJS.Timeout
    private refreshIntervalMs?: number
    private lastModified: number = 0 // Track local modifications
    private lastFetched: number = 0 // Track last fetch time
    private _reading = false

    constructor(
        adapter: Adapter<T>,
        defaultData: T = {} as T,
        _refreshIntervalMs?: number,
    ) {
        checkArgs(adapter, defaultData)
        this.adapter = adapter
        this._data = defaultData
        if (!defaultData) {
            setImmediate(() => {
                // Using void to explicitly ignore the promise
                void this.read().catch((error) =>
                    console.error('Initial read failed:', error),
                )
            })
        }
        this.refreshIntervalMs = _refreshIntervalMs
        if ((_refreshIntervalMs || 0) > 0) {
            this.startSmartRefresh(_refreshIntervalMs)
        }
    }

    /**
     * Clean up all resources
     */
    destroy(): void {
        this.stopSmartRefresh()
    }

    /**
     * For async disposal pattern
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    async [Symbol.asyncDispose](): Promise<void> {
        this.destroy()
    }

    // Getter for data (read-only access)
    get data(): T {
        return this._data
    }

    // Setter for data (tracks modifications)
    set data(value: T) {
        this._data = value
        this.lastModified = Date.now()
        this.isDirty = true
    }

    get lastMod(): number {
        return this.lastModified
    }

    get lastFetch(): number {
        return this.lastFetched
    }

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

    async write(): Promise<void> {
        if (this._data) {
            await this.adapter.write(this._data)
            const timestamp = Date.now()
            this.lastFetched = timestamp // Mark local fetching
            this.lastModified = timestamp // Mark local modification
            this.isDirty = false
        }
    }

    async update(fn: (data: T) => Promise<boolean>): Promise<boolean> {
        if (this._data) {
            if (await fn(this._data)) {
                await this.write()
                this.isDirty = false
                return true
            }
        }
        return false
    }

    // Smart refresh - only updates if data is unchanged locally
    startSmartRefresh(intervalMs: number = this.refreshIntervalMs || 0): void {
        this.stopSmartRefresh()
        if (intervalMs > 0) {
            this.refreshInterval = setInterval(() => {
                void (async () => {
                    try {
                        if (
                            !this._reading &&
                            this.lastModified <= this.lastFetched
                        ) {
                            await this.read()
                            console.log('interval reading:', this._data)
                        }
                    } catch (error) {
                        console.error('Smart refresh failed:', error)
                    }
                })()
            }, intervalMs)
        }
    }

    stopSmartRefresh(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval)
            this.refreshInterval = undefined
        }
    }
}
