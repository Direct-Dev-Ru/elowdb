import { promisify } from "node:util"
import { deflate, inflate } from "node:zlib"

function capitalize(str?: string | null): string {
    if (!str) return ''
    return str[0].toUpperCase() + str.slice(1)
}

export { capitalize }

const deflatePromise = promisify(deflate)
const inflatePromise = promisify(inflate)

/**
 * Compress a string and return as Base64
 * @param input String to compress
 * @returns Promise resolving to Base64 compressed string
 */
export async function compressToBase64(input: string): Promise<string> {
    // Compress the string using zlib
    const compressed = await deflatePromise(input)

    // Convert to Base64
    return compressed.toString('base64')
}

/**
 * Decompress a Base64 string back to original
 * @param base64String Base64 compressed string
 * @returns Promise resolving to original uncompressed string
 */
export async function decompressFromBase64(
    base64String: string,
): Promise<string> {
    // Convert from Base64 to Buffer
    const compressed = Buffer.from(base64String, 'base64')

    // Decompress the buffer
    const decompressed = await inflatePromise(compressed)

    // Convert back to string
    return decompressed.toString('utf8')
}
