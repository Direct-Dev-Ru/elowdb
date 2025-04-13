/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { PathLike } from 'fs'

import { DataFile, DataFileSync } from './DataFile.js'

export class Serializers<T> {
    parse: (str: string) => T = JSON.parse
    stringify: (data: T) => string = (data: T) => JSON.stringify(data, null, 2)
}

export const defaultSerializers = new Serializers<any>()

export class JSONFile<T> extends DataFile<T> {
    constructor(
        filename: PathLike,
        _cypherKey: string = '',
        serializers: Serializers<T> = defaultSerializers,
    ) {
        super(filename, _cypherKey, serializers)
    }
}

export class JSONFileSync<T> extends DataFileSync<T> {
    constructor(
        filename: PathLike,
        _cypherKey: string = '',
        _serializers: Serializers<T> = defaultSerializers,
    ) {
        super(filename, _cypherKey, _serializers)
    }
}
