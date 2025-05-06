import lodash from 'lodash'

import type { Adapter } from './Low.js'
import { UpdLow } from './UpdLow.js'

/**
 * Расширенная версия UpdLow с поддержкой Lodash
 * @template T - тип данных
 */
export class UpdLowWithLodash<T> extends UpdLow<T> {
    /**
     * Цепочка операций Lodash
     */
    chain: lodash.ExpChain<this['data']>

    /**
     * Создает новый экземпляр UpdLowWithLodash
     * @param adapter - адаптер для чтения/записи данных
     * @param defaultData - данные по умолчанию
     * @param refreshInterval - интервал автообновления в миллисекундах
     */
    constructor(adapter: Adapter<T>, refreshInterval: number, defaultData?: T) {
        super(adapter, refreshInterval, defaultData)
        this.chain = lodash.chain(this).get('data')
    }

    /**
     * Перезагружает цепочку Lodash после обновления данных
     */
    protected reloadChain(): void {
        this.chain = lodash.chain(this).get('data')
    }

    /**
     * Чтение данных с обновлением цепочки
     */
    override async read(): Promise<void> {
        await super.read()
        this.reloadChain()
    }

    /**
     * Обновление данных с обновлением цепочки
     * @param fn - функция обновления
     */
    override async update(
        data: Partial<T>,
        fn?: (
            data: Partial<T>,
        ) => Promise<{ result: boolean; data: Partial<T> }>,
    ): Promise<{ result: boolean; error: string }> {
        const res = await super.update(data, fn)
        this.reloadChain()
        return res
    }

    /**
     * Запуск автообновления с обновлением цепочки
     * @param interval - интервал обновления
     */
    override startSmartRefresh(interval: number): void {
        super.startSmartRefresh(interval)
        this.reloadChain()
    }
}
