import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { temporaryFile } from 'tempy';
import { YAMLFile, YAMLFileSync } from './YAMLFile.js';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';

interface TestData {
    id: number;
    name: string;
    nested?: {
        value: string;
        date?: Date;
    };
    array?: any[];
}

describe('YAMLFile', () => {    
    const secretKey = undefined;
    let tempFile: string;
    let yamlFile: YAMLFile<TestData>;
    let yamlFileSync: YAMLFileSync<TestData>;

    beforeEach(() => {
        tempFile = temporaryFile();
        yamlFile = new YAMLFile<TestData>(tempFile, secretKey);
        yamlFileSync = new YAMLFileSync<TestData>(tempFile, secretKey);
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
            const result = await yamlFile.read();
            expect(result).toBeNull();
        });

        it('should write and read simple data', async () => {
            const data: TestData = { id: 1, name: 'test' };
            await yamlFile.write(data);
            const result = await yamlFile.read();
            expect(result).toEqual(data);
        });

        it('should write and read complex data', async () => {
            const data: TestData = {
                id: 1,
                name: 'test',
                nested: {
                    value: 'nested value',
                    date: new Date()
                },
                array: [1, 2, 3]
            };
            await yamlFile.write(data);
            if (process.env.NODE_ENV === 'test') {
                const content = await fs.readFile(tempFile, 'utf-8');
                // fsSync.writeFileSync("c:\\tmp\\test.yaml", content);
                console.log('result in file after write unencrypted:\n', content);
            }            
            const result = await yamlFile.read();
            expect(result).toEqual(data);
        });

        it('should handle encryption and decryption', async () => {
            yamlFile = new YAMLFile<TestData>(tempFile, "secretKey");
            const data: TestData = {
                id: 1,
                name: 'test',
                nested: {
                    value: 'nested value',
                    date: new Date()
                }
            };
            await yamlFile.write(data);
            if (process.env.NODE_ENV === 'test') {
                const content = await fs.readFile(tempFile, 'utf-8');
                console.log('result in file after write:', content);
            }
            const result = await yamlFile.read();
            expect(result).toEqual(data);
        });

        it('should handle encryption errors', async () => {
            const customFile = new YAMLFile<TestData>(tempFile, "secretKey-encryption-error", {
                encrypt: async () => { return { error: 'Encryption failed' } },
                decrypt: async () => { return { error: 'Decryption failed' } }
            });

            const data: TestData = { id: 1, name: 'test' };
            await expect(customFile.write(data)).rejects.toThrow(/^Encryption failed/);
        });

        it('should handle decryption errors', async () => {
            const customFile = new YAMLFile<TestData>(tempFile, "secretKey-decryption-error", {
                decrypt: async () => { return { error: 'Decryption failed' } }
            });

            const data: TestData = { id: 1, name: 'test' };
            await yamlFile.write(data);
            await expect(customFile.read()).rejects.toThrow(/^Decryption failed/);
        });

        it('should handle race conditions', async () => {
            const promises: Promise<void>[] = [];
            for (let i = 0; i < 10; i++) {
                promises.push(yamlFile.write({ id: i, name: `test${i}` }));
            }
            await Promise.all(promises);
            const result = await yamlFile.read();
            expect(result).toBeDefined();
        });
    });

    describe('Sync Operations', () => {
        it('should return null for non-existent file', () => {
            const tempFileLocal = temporaryFile();
            const yamlFileSyncLocal = new YAMLFileSync<TestData>(tempFileLocal, secretKey);
            const result = yamlFileSyncLocal.read();
            expect(result).toBeNull();
            try {
                fsSync.unlinkSync(tempFileLocal);
            } catch (error) {
                // Ignore errors if file doesn't exist
            }
        });

        it('should write and read simple data', () => {
            const data: TestData = { id: 1, name: 'test' };
            yamlFileSync.write(data);
            const result = yamlFileSync.read();
            expect(result).toEqual(data);
        });

        it('should write and read complex data', () => {
            const data: TestData = {
                id: 1,
                name: 'test',
                nested: {
                    value: 'nested value',
                    date: new Date()
                },
                array: [1, 2, 3]
            };
            yamlFileSync.write(data);
            const result = yamlFileSync.read();
            expect(result).toEqual(data);
        });

        it('should handle encryption and decryption', () => {
            const tempFileLocal = temporaryFile();
            const yamlFileSyncLocal = new YAMLFileSync<TestData>(tempFileLocal, "secretKey");
            const data: TestData = {
                id: 1,
                name: 'test',
                nested: {
                    value: 'nested value',
                    date: new Date()
                }
            };
            yamlFileSyncLocal.write(data);
            if (process.env.NODE_ENV === 'test') {
                const content = fsSync.readFileSync(tempFileLocal, 'utf-8');
                console.log('result in file after write:', content);
            }
            const result = yamlFileSyncLocal.read();
            expect(result).toEqual(data);
        });

        it('should handle encryption errors', () => {
            const customFile = new YAMLFileSync<TestData>(tempFile, "secretKey", {
                encrypt: () => ({ error: 'Encryption failed' })
            });

            const data: TestData = { id: 1, name: 'test' };
            expect(() => customFile.write(data)).toThrow('Encryption failed');
        });

        it('should handle decryption errors', () => {
            const customFile = new YAMLFileSync<TestData>(tempFile, "secretKey", {
                decrypt: () => ({ error: 'Decryption failed' })
            });

            const data: TestData = { id: 1, name: 'test' };
            yamlFileSync.write(data);
            expect(() => customFile.read()).toThrow('Decryption failed');
        });
    });
}); 