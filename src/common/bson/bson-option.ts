import { deserialize, serialize } from 'bson'

// Utility functions for base64 encoding/decoding
function toBase64(array: Uint8Array): string {
    if (typeof Buffer !== 'undefined') {
        // Node.js environment
        return Buffer.from(array).toString('base64')
    } else {
        // Browser environment
        return btoa(String.fromCharCode(...array))
    }
}

function fromBase64(base64String: string): Uint8Array {
    if (typeof Buffer !== 'undefined') {
        // Node.js environment
        return new Uint8Array(Buffer.from(base64String, 'base64'))
    } else {
        // Browser environment
        return Uint8Array.from(atob(base64String), (c) => c.charCodeAt(0))
    }
}

// BSON-based parse and stringify options
export const bsonOptionsForStorage = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parse: (bufferString: string): any => {
        try {
            const buffer = fromBase64(bufferString)
            return deserialize(buffer)
        } catch (error) {
            console.error('Error parsing BSON data:', error)
            return null
        }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stringify: (data: any): string => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            const buffer = serialize(data)
            return toBase64(buffer)
        } catch (error) {
            console.error('Error stringifying BSON data:', error)
            return ''
        }
    },
}
