import { TestData } from '../../common/interfaces/test-data.js'
import { CookieStorage } from './CookieStorage.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('CookieStorage', () => {
    let cookieStorage: CookieStorage<string>;
    const TEST_KEY = 'testKey';
    const TEST_VALUE = 'testValue';

    beforeEach(() => {
        // Clear all cookies before each test
        document.cookie.split(';').forEach(cookie => {
            const [name] = cookie.split('=');
            if (name) {
                document.cookie = `${name.trim()}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
            }
        });

        cookieStorage = new CookieStorage<string>(TEST_KEY);
    });

    afterEach(() => {
        // Clear all cookies after each test
        document.cookie.split(';').forEach(cookie => {
            const [name] = cookie.split('=');
            if (name) {
                document.cookie = `${name.trim()}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
            }
        });
    });

    it('should write and read a value', async () => {
        await cookieStorage.write(TEST_VALUE);
        const result = await cookieStorage.read();
        expect(result).toBe(TEST_VALUE);
    });

    it('should return null for non-existent key', async () => {
        const result = await cookieStorage.read();
        expect(result).toBeNull();
    });

    it('should handle custom parse and stringify functions', async () => {
        

        const testData: TestData = { id: 1, name: 'test' };
        const customStorage = new CookieStorage<TestData>(TEST_KEY, {
            parse: (str: string) => JSON.parse(atob(str)),
            stringify: (data: TestData) => btoa(JSON.stringify(data))
        });

        await customStorage.write(testData);
        const result = await customStorage.read();

        expect(result).toEqual(testData);
    });

    it('should handle encryption and decryption', async () => {
        const secretKey = 'testSecretKey';
        const customStorage = new CookieStorage<string>(TEST_KEY, {
            _cypherKey: secretKey
        });

        await customStorage.write(TEST_VALUE);
        const result = await customStorage.read();
        expect(result).toBe(TEST_VALUE);
    });

    it('should handle encryption errors gracefully', async () => {
        const customStorage = new CookieStorage<string>(TEST_KEY, {
            encrypt: async () => ({ error: 'Encryption failed' }),
            decrypt: async () => ({ error: 'Decryption failed' }),
            _cypherKey: 'testKey'
        });

        await expect(customStorage.write(TEST_VALUE)).rejects.toThrow('Encryption failed');
        // await expect(customStorage.read()).rejects.toThrow('Decryption failed');
    });

    it('should handle decryption errors gracefully', async () => {
        const customStorage = new CookieStorage<string>(TEST_KEY, {
            encrypt: async (v) => { return v },
            decrypt: async () => ({ error: 'Decryption failed' }),
            // decrypt: async (v) => { return v },
            _cypherKey: 'testKey'
        });

        await customStorage.write(TEST_VALUE);

        await expect(customStorage.read()).rejects.toThrow('Decryption failed');
    });
}); 