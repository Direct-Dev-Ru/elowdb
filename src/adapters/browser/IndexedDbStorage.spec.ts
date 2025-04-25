import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IndexedDbStorage } from './IndexedDbStorage.js';

describe('IndexedDbStorage', () => {
    let storage: IndexedDbStorage<any>;
    const testDbName = 'app';
    const testStoreName = 'data';

    beforeEach(() => {
        // Create a new instance before each test
        // storage = new IndexedDbStorage(testDbName, testStoreName);
    });

    afterEach(async () => {        
        // await storage.write(null);
    });

    it('should initialize with default values', () => {
        storage = new IndexedDbStorage(testDbName, testStoreName);
        expect(storage).toBeDefined();
    });

    it('should write and read simple data', async () => {
        storage = new IndexedDbStorage(testDbName, testStoreName);
        const testData = { name: 'test', value: 123 };
        await storage.write(testData);
        const result = await storage.read();
        expect(result).toEqual(testData);
    });

    it('should handle null values', async () => {
        await storage.write(null);
        const result = await storage.read();
        expect(result).toBeNull();
    });

    it('should handle complex nested objects', async () => {
        const complexData = {
            user: {
                name: 'John',
                age: 30,
                address: {
                    city: 'New York',
                    zip: '10001'
                }
            },
            items: [1, 2, 3, { nested: true }]
        };
        await storage.write(complexData);
        const result = await storage.read();
        expect(result).toEqual(complexData);
    });

    it('should handle custom parse and stringify functions', async () => {
        const customStorage = new IndexedDbStorage(testDbName, testStoreName, {
            parse: (str: string) => str.toUpperCase(),
            stringify: (data: any) => data.toLowerCase()
        });

        const testData = 'Hello World';
        await customStorage.write(testData);
        const result = await customStorage.read();
        expect(result).toBe(testData.toUpperCase());
    });

    it('should handle encryption when cypherKey is provided', async () => {
        const encryptedStorage = new IndexedDbStorage(testDbName, testStoreName, {
            _cypherKey: 'test-key'
        });

        const testData = { secret: 'sensitive-data' };
        await encryptedStorage.write(testData);
        const result = await encryptedStorage.read();
        expect(result).toEqual(testData);
    });

    it('should handle empty objects', async () => {
        const emptyData = {};
        await storage.write(emptyData);
        const result = await storage.read();
        expect(result).toEqual(emptyData);
    });

    it('should handle arrays', async () => {
        const arrayData = [1, 2, 3, 'test', { nested: true }];
        await storage.write(arrayData);
        const result = await storage.read();
        expect(result).toEqual(arrayData);
    });
}); 