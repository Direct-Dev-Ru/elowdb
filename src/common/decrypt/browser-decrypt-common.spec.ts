import { TestData } from '../../common/interfaces/test-data.js'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { decryptString } from './browser-decrypt-common.js';
import { encryptString } from '../encrypt/browser-encrypt-common.js';

describe('browser-decrypt-common', () => {
    beforeEach(() => {
        // Reset any mocks or state before each test
    });

    afterEach(() => {
        // Clean up after each test
        vi.clearAllMocks();
    });

    it.skip('should decrypt encrypted data', async () => {
        const input = 'test data';
        const password = 'test password';
        const encrypted = await encryptString(input, password);
        const decrypted = await decryptString(encrypted, password);
        
        expect(decrypted).toEqual(input);
    });

    it('should throw error for invalid password', async () => {
        const input = 'test data';
        const password = 'test password';
        const encrypted = await encryptString(input, password);

        await expect(decryptString(encrypted, 'wrong password')).rejects.toThrow(
            'decryption failed'
        );
    });



    it.skip('should handle Windows line endings', async () => {
        const input = 'test data';
        const password = 'test password';
        const encrypted = await encryptString(input, password);
        const encryptedWithWindowsEndings = encrypted.replace(/\n/g, '\r\n');
        
        const decrypted = await decryptString(encryptedWithWindowsEndings, password);
        expect(decrypted).toEqual(input);
    });

    it.skip('should handle empty strings', async () => {
        const input = '';
        const password = 'test password';
        const encrypted = await encryptString(input, password);
        const decrypted = await decryptString(encrypted, password);
        
        expect(decrypted).toEqual(input);
    });

    it.skip('should handle special characters', async () => {
        const input = '!@#$%^&*()_+-=[]{}|;:,.<>?';
        const password = 'test password';
        const encrypted = await encryptString(input, password);
        const decrypted = await decryptString(encrypted, password);
        
        expect(decrypted).toEqual(input);
    });

    it.skip('should handle Unicode characters', async () => {
        const input = '你好世界';
        const password = 'test password';
        const encrypted = await encryptString(input, password);
        const decrypted = await decryptString(encrypted, password);
        
        expect(decrypted).toEqual(input);
    });

    it.skip('should handle emoji characters', async () => {
        const input = '😀🎉🌟';
        const password = 'test password';
        const encrypted = await encryptString(input, password);
        const decrypted = await decryptString(encrypted, password);
        
        expect(decrypted).toEqual(input);
    });

    it.skip('should handle mixed content', async () => {
        const input = 'Hello 你好 😀';
        const password = 'test password';
        const encrypted = await encryptString(input, password);
        const decrypted = await decryptString(encrypted, password);
        
        expect(decrypted).toEqual(input);
    });

    it.skip('should handle very long input', async () => {
        const input = 'a'.repeat(10000);
        const password = 'test password';
        const encrypted = await encryptString(input, password);
        const decrypted = await decryptString(encrypted, password);
        
        expect(decrypted).toEqual(input);
    });

    it.skip('should handle very long password', async () => {
        const input = 'test data';
        const password = 'a'.repeat(1000);
        const encrypted = await encryptString(input, password);
        const decrypted = await decryptString(encrypted, password);
        
        expect(decrypted).toEqual(input);
    });

    it.skip('should handle binary data', async () => {
        const input = new TextEncoder().encode(
            String.fromCharCode(...Array.from({ length: 256 }, (_, i) => i))
        ).toString();
        const password = 'test password';
        const encrypted = await encryptString(input, password);
        const decrypted = await decryptString(encrypted, password);
        
        expect(decrypted).toEqual(input);
    });

    it.skip('should handle JSON data', async () => {
        const input = JSON.stringify({ key: 'value', array: [1, 2, 3] });
        const password = 'test password';
        const encrypted = await encryptString(input, password);
        const decrypted = await decryptString(encrypted, password);
        
        expect(decrypted).toEqual(input);
        expect(JSON.parse(decrypted)).toEqual(JSON.parse(input));
    });

    it.skip('should handle multiple encryption/decryption cycles', async () => {
        const input = 'test data';
        const password = 'test password';
        
        // Encrypt and decrypt multiple times
        let currentData = input;
        await Promise.all(Array.from({ length: 5 }).map(async () => {
            const encrypted = await encryptString(currentData, password, true);
            const decrypted = await decryptString(encrypted, password);
            expect(decrypted).toEqual(input);
            currentData = encrypted;
        }));
    });

    it.skip('should handle different encryption/decryption combinations', async () => {
        const inputs = ['test1', 'test2', 'test3'];
        const passwords = ['pass1', 'pass2', 'pass3'];
        
        for (const input of inputs) {
            for (const password of passwords) {
                const encrypted = await encryptString(input, password);
                const decrypted = await decryptString(encrypted, password);
                expect(decrypted).toEqual(input);
            }
        }
    });
}); 