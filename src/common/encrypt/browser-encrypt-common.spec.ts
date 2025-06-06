import { TestData } from '../../common/interfaces/test-data.js'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encryptString } from './browser-encrypt-common.js';
import { decryptString } from '../decrypt/browser-decrypt-common.js';

describe('browser-encrypt-common', () => {
    beforeEach(() => {
        // Reset any mocks or state before each test
    });

    afterEach(() => {
        // Clean up after each test
        vi.clearAllMocks();
    });

    it('should encrypt a string', async () => {
        const input = 'test data';
        const password = 'test password';
        const encrypted = await encryptString(input, password);
        
        expect(encrypted).toMatch(/^\$ENCRYPTED;1\.1;AES-GCM/);
        expect(encrypted).toContain('\n');
    });

    it('should throw error when trying to encrypt already encrypted data', async () => {
        const input = '$ENCRYPTED;1.1;AES-GCM\nencrypted_data';
        const password = 'test password';
        
        await expect(encryptString(input, password)).rejects.toThrow(
            'data already encrypted and no force flag provided'
        );
    });

    it('should encrypt with force flag even if data is already encrypted', async () => {
        const input = '$ENCRYPTED;1.1;AES-GCM\nencrypted_data';
        const password = 'test password';
        const encrypted = await encryptString(input, password, true);
        
        expect(encrypted).toMatch(/^\$ENCRYPTED;1\.1;AES-GCM/);
        expect(encrypted).toContain('\n');
    });

    
    it('should encrypt same data with same password differently(cause salt is random)', async () => {
        const password = 'test password';
        const encrypted1 = await encryptString('test data 1', password);
        const encrypted2 = await encryptString('test data 1', password);
        
        expect(encrypted1).not.toEqual(encrypted2);
    });

    it('should encrypt different data with same password differently', async () => {
        const password = 'test password';
        const encrypted1 = await encryptString('test data 1', password);
        const encrypted2 = await encryptString('test data 2', password);
        
        expect(encrypted1).not.toEqual(encrypted2);
    });

    it('should encrypt same data with different passwords differently', async () => {
        const input = 'test data';
        const encrypted1 = await encryptString(input, 'password1');
        const encrypted2 = await encryptString(input, 'password2');
        
        expect(encrypted1).not.toEqual(encrypted2);
    });

    it('should handle empty password', async () => {
        const input = 'test data';
        const password = '';
        
        await expect(encryptString(input, password)).rejects.toThrow(
            'password is required for encryption'
        );
    });

    it('should handle special characters in password', async () => {
        const input = 'test data';
        const password = '!@#$%^&*()_+-=[]{}|;:,.<>?';
        const encrypted = await encryptString(input, password);
        
        expect(encrypted).toMatch(/^\$ENCRYPTED;1\.1;AES-GCM/);
        expect(encrypted).toContain('\n');
    });

    it('should handle binary data', async () => {
        const input = new TextEncoder().encode(
            String.fromCharCode(...Array.from({ length: 256 }, (_, i) => i))
        ).toString();
        const password = 'binary test';
        const encrypted = await encryptString(input, password);
        
        expect(encrypted).toMatch(/^\$ENCRYPTED;1\.1;AES-GCM/);
        expect(encrypted).toContain('\n');
    });

    it('should handle very long input strings', async () => {
        const longInput = 'a'.repeat(10000);
        const password = 'test password';
        const encrypted = await encryptString(longInput, password);
        
        expect(encrypted).toMatch(/^\$ENCRYPTED;1\.1;AES-GCM/);
        expect(encrypted).toContain('\n');
    });

    it('should handle very long passwords', async () => {
        const input = 'test data';
        const longPassword = 'a'.repeat(1000);
        const encrypted = await encryptString(input, longPassword);
        
        expect(encrypted).toMatch(/^\$ENCRYPTED;1\.1;AES-GCM/);
        expect(encrypted).toContain('\n');
    });

    it('should handle repeated encryption with same input and password', async () => {
        const input = 'test data';
        const password = 'test password';
        const results = new Set();
        
        for (let i = 0; i < 10; i++) {
            const encrypted = await encryptString(input, password);
            results.add(encrypted);
        }
        
        // Each encryption should produce a different result due to random salt
        expect(results.size).toBe(10);
    });

    it('should complete encryption and decryption cycle successfully', async () => {
        const testCases = [
            { input: 'simple text', password: 'password123' },
            { input: 'text with spaces', password: 'complex password' },
            { input: 'text with special chars: !@#$%^&*()', password: 'password with spaces' },
            { input: 'text with newlines\nand\r\ncarriage returns', password: 'password\nwith\nnewlines' },
            { input: 'a'.repeat(10000), password: 'long text test' },
            { input: 'Unicode text: 你好世界', password: 'password with unicode' },
            { input: 'Emoji text: 😀🎉🌟', password: 'password with emoji' },
            { input: 'Mixed content: Hello 你好 😀', password: 'mixed password 密码 😊' },
            { input: 'Empty string', password: 'empty string test' },
            { input: 'Single character: a', password: 'single char test' },
            { input: 'Very long password: ' + 'a'.repeat(1000), password: 'short input' },
            { input: 'JSON data: {"key": "value", "array": [1,2,3]}', password: 'json test' },
            { input: 'HTML content: <div>Test</div>', password: 'html test' },
            { input: 'SQL query: SELECT * FROM users', password: 'sql test' },
            { input: 'Base64 string: aGVsbG8gd29ybGQ=', password: 'base64 test' }
        ];

        for (const { input, password } of testCases) {
            const encrypted = await encryptString(input, password);
            const decrypted = await decryptString(encrypted, password);
            expect(decrypted).toEqual(input);
        }
    });
}); 