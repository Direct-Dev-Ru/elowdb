import { EventEmitter } from 'events'

export interface Cache<T extends { id: string | number }> {
    get(key: string): { data: T[]; total: number } | null
    set(key: string, data: T[], total: number): boolean
    getCacheSize(key?: string): number
    clear(): void
    clearByTTL(): void
    subscribeToEvents(emitter: EventEmitter): void
    unsubscribeFromEvents(emitter: EventEmitter): void
}
