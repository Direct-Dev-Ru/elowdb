import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { temporaryFile } from 'tempy';
import { JSONFile, JSONFileSync, Serializers } from './JSONFile.js';
import fs from 'node:fs/promises';

interface TestData {
    id: number;
    name: string;
    nested?: {
        value: string;
    };
}

describe('JSONFile', () => {
    const secretKey = 'Testkey25!';
    let tempFile: string;
    let jsonFile: JSONFile<TestData>;
    let jsonFileSync: JSONFileSync<TestData>;

    beforeEach(() => {
        tempFile = temporaryFile();
        jsonFile = new JSONFile<TestData>(tempFile, secretKey);
        jsonFileSync = new JSONFileSync<TestData>(tempFile, secretKey);
    });

    afterEach(async () => {
        try {
            await fs.unlink(tempFile);
        } catch (error) {
            // Ignore errors if file doesn't exist
        }
    });

    describe('Async Operations', () => {
        it('should return null for non-existent file', async () => {
            const result = await jsonFile.read();
            expect(result).toBeNull();
        });

        it('should write and read simple data', async () => {
            const data: TestData = { id: 1, name: 'test' };
            await jsonFile.write(data);
            const result = await jsonFile.read();
            expect(result).toEqual(data);
        });

        it('should write and read nested data', async () => {
            const data: TestData = {
                id: 1,
                name: 'test',
                nested: { value: 'nested value' }
            };
            await jsonFile.write(data);
            const result = await jsonFile.read();
            expect(result).toEqual(data);
        });

        it('should handle custom serializers', async () => {
            const customSerializers = new Serializers<TestData>();
            customSerializers.parse = (str: string) => JSON.parse(atob(str));
            customSerializers.stringify = (data: TestData) => btoa(JSON.stringify(data));

            const customFile = new JSONFile<TestData>(tempFile, secretKey, {
                serializers: customSerializers
            });

            const data: TestData = { id: 1, name: 'test' };
            await customFile.write(data);
            const result = await customFile.read();
            expect(result).toEqual(data);
        });

        it('should handle encryption and decryption', async () => {
            const data: TestData = { id: 1, name: 'test' };
            await jsonFile.write(data);
            const result = await jsonFile.read();
            expect(result).toEqual(data);
        });

        it('should handle encryption errors', async () => {
            const customFile = new JSONFile<TestData>(tempFile, secretKey, {
                encrypt: async () => ({ error: 'Encryption failed' })
            });

            const data: TestData = { id: 1, name: 'test' };
            await expect(customFile.write(data)).rejects.toThrow('Encryption failed');
        });

        it('should handle decryption errors', async () => {
            const customFile = new JSONFile<TestData>(tempFile, secretKey, {
                decrypt: async () => ({ error: 'Decryption failed' })
            });

            const data: TestData = { id: 1, name: 'test' };
            await jsonFile.write(data);
            await expect(customFile.read()).rejects.toThrow('Decryption failed');
        });

        it('should handle race conditions', async () => {
            const promises: Promise<void>[] = [];
            for (let i = 0; i < 10; i++) {
                promises.push(jsonFile.write({ id: i, name: `test${i}` }));
            }
            await Promise.all(promises);
            const result = await jsonFile.read();
            expect(result).toBeDefined();
        });
    });

    describe('Sync Operations', () => {
        it('should return null for non-existent file', () => {
            const result = jsonFileSync.read();
            expect(result).toBeNull();
        });

        it('should write and read simple data', () => {
            const data: TestData = { id: 1, name: 'test' };
            jsonFileSync.write(data);
            const result = jsonFileSync.read();
            expect(result).toEqual(data);
        });

        it('should write and read nested data', () => {
            const data: TestData = {
                id: 1,
                name: 'test',
                nested: { value: 'nested value' }
            };
            jsonFileSync.write(data);
            const result = jsonFileSync.read();
            expect(result).toEqual(data);
        });

        it('should handle custom serializers', () => {
            const customSerializers = new Serializers<TestData>();
            customSerializers.parse = (str: string) => JSON.parse(atob(str));
            customSerializers.stringify = (data: TestData) => btoa(JSON.stringify(data));

            const customFile = new JSONFileSync<TestData>(tempFile, secretKey, {
                serializers: customSerializers
            });

            const data: TestData = { id: 1, name: 'test' };
            customFile.write(data);
            const result = customFile.read();
            expect(result).toEqual(data);
        });

        it('should handle encryption and decryption', () => {
            const data: TestData = { id: 1, name: 'test' };
            jsonFileSync.write(data);
            const result = jsonFileSync.read();
            expect(result).toEqual(data);
        });

        it('should handle encryption errors', () => {
            const customFile = new JSONFileSync<TestData>(tempFile, secretKey, {
                encrypt: () => ({ error: 'Encryption failed' })
            });

            const data: TestData = { id: 1, name: 'test' };
            expect(() => customFile.write(data)).toThrow('Encryption failed');
        });

        it('should handle decryption errors', () => {
            const customFile = new JSONFileSync<TestData>(tempFile, secretKey, {
                decrypt: () => ({ error: 'Decryption failed' })
            });

            const data: TestData = { id: 1, name: 'test' };
            jsonFileSync.write(data);
            expect(() => customFile.read()).toThrow('Decryption failed');
        });
    });
}); 