import lodash from 'lodash'

import type { Adapter } from './Low.js'
import { Low } from './Low.js'

/**
 * Расширенная версия Low с поддержкой Lodash
 * @template T - тип данных
 */
export class LowWithLodash<T> extends Low<T> {
    /**
     * Цепочка операций Lodash
     */
    chain: lodash.ExpChain<this['data']>

    /**
     * Создает новый экземпляр LowWithLodash
     * @param adapter - адаптер для чтения/записи данных
     * @param defaultData - данные по умолчанию
     */
    constructor(adapter: Adapter<T>, defaultData: T) {
        super(adapter, defaultData)
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
        fn: (data: T) => void | Promise<void>,
    ): Promise<void> {
        await super.update(fn)
        this.reloadChain()
    }
}
