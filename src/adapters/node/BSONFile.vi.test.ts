import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { temporaryFile } from 'tempy';
import { BSONFile, BSONFileSync } from './BSONFile.js';
import fs from 'node:fs/promises';
import { ObjectId } from 'bson';
import { bsonOptionsForStorage, clearBsonOptionsForStorage } from '../../common/bson/bson-option.js';

interface TestData {
    _id?: ObjectId;
    id: number;
    name: string;
    nested?: {
        value: string;
        date?: Date;
    };
    array?: any[];
    binary?: Uint8Array;
}

describe('BSONFile', () => {
    const secretKey = 'Testkey25!';
    // const secretKey = undefined;
    let tempFile: string;
    let bsonFile: BSONFile<TestData>;
    let bsonFileSync: BSONFileSync<TestData>;

    beforeEach(() => {
        tempFile = temporaryFile();
        bsonFile = new BSONFile<TestData>(tempFile, secretKey);
        bsonFileSync = new BSONFileSync<TestData>(tempFile, secretKey);
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
            const result = await bsonFile.read();
            expect(result).toBeNull();
        });

        it('should write and read simple data', async () => {
            const bsonFile = new BSONFile<TestData>("c:\\tmp\\test.txt", 'secret',
                {...clearBsonOptionsForStorage  });
            const data: TestData = { id: 10, name: 'TheTest' };
            await bsonFile.write(data);
            const result = await bsonFile.read();
            if (process.env.NODE_ENV === 'test') {
                // console.log('result:', result);
            }
            expect(result).toEqual(data);
        });

        it('should write and read complex BSON data', async () => {
            const data: TestData = {
                _id: new ObjectId(),
                id: 1,
                name: 'test',
                nested: {
                    value: 'nested value',
                    date: new Date()
                },
                array: [1, 2, 3],
                // binary: new Uint8Array([1, 2, 3, 4, 5])
            };
            await bsonFile.write(data);
            const result = await bsonFile.read();
            expect(result).toEqual(data);
        });

        it.skip('should handle encryption and decryption', async () => {
            const data: TestData = {
                _id: new ObjectId(),
                id: 1,
                name: 'test',
                nested: {
                    value: 'nested value',
                    date: new Date()
                }
            };
            await bsonFile.write(data);
            const result = await bsonFile.read();
            expect(result).toEqual(data);
        });

        it.skip('should handle encryption errors', async () => {
            const customFile = new BSONFile<TestData>(tempFile, secretKey, {
                encrypt: async () => ({ error: 'Encryption failed' })
            });

            const data: TestData = { id: 1, name: 'test' };
            await expect(customFile.write(data)).rejects.toThrow('Encryption failed');
        });

        it.skip('should handle decryption errors', async () => {
            const customFile = new BSONFile<TestData>(tempFile, secretKey, {
                decrypt: async () => ({ error: 'Decryption failed' })
            });

            const data: TestData = { id: 1, name: 'test' };
            await bsonFile.write(data);
            await expect(customFile.read()).rejects.toThrow('Decryption failed');
        });

        it.skip('should handle race conditions', async () => {
            const promises: Promise<void>[] = [];
            for (let i = 0; i < 10; i++) {
                promises.push(bsonFile.write({ id: i, name: `test${i}` }));
            }
            await Promise.all(promises);
            const result = await bsonFile.read();
            expect(result).toBeDefined();
        });
    });

    describe.skip('Sync Operations', () => {
        it('should return null for non-existent file', () => {
            const result = bsonFileSync.read();
            expect(result).toBeNull();
        });

        it('should write and read simple data', () => {
            const data: TestData = { id: 1, name: 'test' };
            bsonFileSync.write(data);
            const result = bsonFileSync.read();
            expect(result).toEqual(data);
        });

        it('should write and read complex BSON data', () => {
            const data: TestData = {
                _id: new ObjectId(),
                id: 1,
                name: 'test',
                nested: {
                    value: 'nested value',
                    date: new Date()
                },
                array: [1, 2, 3],
                binary: new Uint8Array([1, 2, 3, 4, 5])
            };
            bsonFileSync.write(data);
            const result = bsonFileSync.read();
            expect(result).toEqual(data);
        });

        it('should handle encryption and decryption', () => {
            const data: TestData = {
                _id: new ObjectId(),
                id: 1,
                name: 'test',
                nested: {
                    value: 'nested value',
                    date: new Date()
                }
            };
            bsonFileSync.write(data);
            const result = bsonFileSync.read();
            expect(result).toEqual(data);
        });

        it('should handle encryption errors', () => {
            const customFile = new BSONFileSync<TestData>(tempFile, secretKey, {
                encrypt: () => ({ error: 'Encryption failed' })
            });

            const data: TestData = { id: 1, name: 'test' };
            expect(() => customFile.write(data)).toThrow('Encryption failed');
        });

        it('should handle decryption errors', () => {
            const customFile = new BSONFileSync<TestData>(tempFile, secretKey, {
                decrypt: () => ({ error: 'Decryption failed' })
            });

            const data: TestData = { id: 1, name: 'test' };
            bsonFileSync.write(data);
            expect(() => customFile.read()).toThrow('Decryption failed');
        });
    });
}); 