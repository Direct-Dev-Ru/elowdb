import { TestData } from '../../common/interfaces/test-data.js'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encryptStringNodeAnsibleVault } from './node-encrypt.js';

describe('node-encrypt', () => {
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
        const encrypted = await encryptStringNodeAnsibleVault(input, password);
        
        expect(encrypted).toMatch(/^\$ANSIBLE_VAULT;1\.1;AES256/);
        expect(encrypted).toContain('\n');
    });

    it('should throw error when trying to encrypt already encrypted data', async () => {
        const input = '$ANSIBLE_VAULT;1.1;AES256\nencrypted_data';
        const password = 'test password';
        
        await expect(encryptStringNodeAnsibleVault(input, password)).rejects.toThrow(
            'data already encrypted and no force flag provided'
        );
    });

    it('should encrypt with force flag even if data is already encrypted', async () => {
        const input = '$ANSIBLE_VAULT;1.1;AES256\nencrypted_data';
        const password = 'test password';
        const encrypted = await encryptStringNodeAnsibleVault(input, password, true);
        
        expect(encrypted).toMatch(/^\$ANSIBLE_VAULT;1\.1;AES256/);
        expect(encrypted).toContain('\n');
    });

    it('should encrypt different data with same password differently', async () => {
        const password = 'test password';
        const encrypted1 = await encryptStringNodeAnsibleVault('test data 1', password);
        const encrypted2 = await encryptStringNodeAnsibleVault('test data 2', password);
        
        expect(encrypted1).not.toEqual(encrypted2);
    });

    it('should encrypt same data with different passwords differently', async () => {
        const input = 'test data';
        const encrypted1 = await encryptStringNodeAnsibleVault(input, 'password1');
        const encrypted2 = await encryptStringNodeAnsibleVault(input, 'password2');
        
        expect(encrypted1).not.toEqual(encrypted2);
    });

    it('should handle empty password', async () => {
        const input = 'test data';
        const password = '';
        
        await expect(encryptStringNodeAnsibleVault(input, password)).rejects.toThrow(
            'password is required for encryption'
        );
    });

    it('should handle special characters in password', async () => {
        const input = 'test data';
        const password = '!@#$%^&*()_+-=[]{}|;:,.<>?';
        const encrypted = await encryptStringNodeAnsibleVault(input, password);
        
        expect(encrypted).toMatch(/^\$ANSIBLE_VAULT;1\.1;AES256/);
        expect(encrypted).toContain('\n');
    });

    it('should handle binary data', async () => {
        const input = Buffer.from(Array.from({ length: 256 }, (_, i) => i)).toString('utf8');
        const password = 'binary test';
        const encrypted = await encryptStringNodeAnsibleVault(input, password);
        
        expect(encrypted).toMatch(/^\$ANSIBLE_VAULT;1\.1;AES256/);
        expect(encrypted).toContain('\n');
    });

    it('should handle very long input strings', async () => {
        const longInput = 'a'.repeat(10000);
        const password = 'test password';
        const encrypted = await encryptStringNodeAnsibleVault(longInput, password);
        
        expect(encrypted).toMatch(/^\$ANSIBLE_VAULT;1\.1;AES256/);
        expect(encrypted).toContain('\n');
    });

    it('should handle very long passwords', async () => {
        const input = 'test data';
        const longPassword = 'a'.repeat(1000);
        const encrypted = await encryptStringNodeAnsibleVault(input, longPassword);
        
        expect(encrypted).toMatch(/^\$ANSIBLE_VAULT;1\.1;AES256/);
        expect(encrypted).toContain('\n');
    });

    it('should handle repeated encryption with same input and password', async () => {
        const input = 'test data';
        const password = 'test password';
        const results = new Set();
        
        for (let i = 0; i < 10; i++) {
            const encrypted = await encryptStringNodeAnsibleVault(input, password);
            results.add(encrypted);
        }
        
        // Each encryption should produce a different result due to random salt
        expect(results.size).toBe(10);
    });
}); 