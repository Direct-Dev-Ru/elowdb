import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { decryptStringBrowserAnsibleVault } from './browser-decrypt.js';
import { encryptStringBrowserAnsibleVault } from '../encrypt/browser-encrypt.js';
// import { encryptStringBrowserAnsibleVault } from '../encrypt/browser-encrypt-common.js';

describe('browser-decrypt', () => {
    beforeEach(() => {
        // Reset any mocks or state before each test
    });

    afterEach(() => {
        // Clean up after each test
        vi.clearAllMocks();
    });

    it('should decrypt encrypted data', async () => {
        const input = 'test data';
        const password = 'test password';
        const encrypted = await encryptStringBrowserAnsibleVault(input, password);
        const decrypted = await decryptStringBrowserAnsibleVault(encrypted, password);
        
        expect(decrypted).toEqual(input);
    });

    it('should throw error for invalid password', async () => {
        const input = 'test data';
        const password = 'test password';
        const encrypted = await encryptStringBrowserAnsibleVault(input, password);
        
        await expect(decryptStringBrowserAnsibleVault(encrypted, 'wrong password')).rejects.toThrow(
            'HMAC verification failed: data may be tampered or password is incorrect'
        );
    });

    it('should throw error for invalid cipher', async () => {
        const invalidCipher = '$ANSIBLE_VAULT;1.1;INVALID\ninvalid_data';
        const password = 'test password';
        
        await expect(decryptStringBrowserAnsibleVault(invalidCipher, password)).rejects.toThrow(
            'Encrypted data is incomplete or invalid'
        );
    });

    it('should handle Windows line endings', async () => {
        const input = 'test data';
        const password = 'test password';
        const encrypted = await encryptStringBrowserAnsibleVault(input, password);
        const encryptedWithWindowsEndings = encrypted.replace(/\n/g, '\r\n');
        
        const decrypted = await decryptStringBrowserAnsibleVault(encryptedWithWindowsEndings, password);
        expect(decrypted).toEqual(input);
    });

    it('should handle empty strings', async () => {
        const input = '';
        const password = 'test password';
        const encrypted = await encryptStringBrowserAnsibleVault(input, password);
        const decrypted = await decryptStringBrowserAnsibleVault(encrypted, password);
        
        expect(decrypted).toEqual(input);
    });

    it('should handle special characters', async () => {
        const input = '!@#$%^&*()_+-=[]{}|;:,.<>?';
        const password = 'test password';
        const encrypted = await encryptStringBrowserAnsibleVault(input, password);
        const decrypted = await decryptStringBrowserAnsibleVault(encrypted, password);
        
        expect(decrypted).toEqual(input);
    });

    it('should handle Unicode characters', async () => {
        const input = '你好世界';
        const password = 'test password';
        const encrypted = await encryptStringBrowserAnsibleVault(input, password);
        const decrypted = await decryptStringBrowserAnsibleVault(encrypted, password);
        
        expect(decrypted).toEqual(input);
    });

    it('should handle emoji characters', async () => {
        const input = '😀🎉🌟';
        const password = 'test password';
        const encrypted = await encryptStringBrowserAnsibleVault(input, password);
        const decrypted = await decryptStringBrowserAnsibleVault(encrypted, password);
        
        expect(decrypted).toEqual(input);
    });

    it('should handle mixed content', async () => {
        const input = 'Hello 你好 😀';
        const password = 'test password';
        const encrypted = await encryptStringBrowserAnsibleVault(input, password);
        const decrypted = await decryptStringBrowserAnsibleVault(encrypted, password);
        
        expect(decrypted).toEqual(input);
    });

    it('should handle very long input', async () => {
        const input = 'a'.repeat(10000);
        const password = 'test password';
        const encrypted = await encryptStringBrowserAnsibleVault(input, password);
        const decrypted = await decryptStringBrowserAnsibleVault(encrypted, password);
        
        expect(decrypted).toEqual(input);
    });

    it('should handle very long password', async () => {
        const input = 'test data';
        const password = 'a'.repeat(1000);
        const encrypted = await encryptStringBrowserAnsibleVault(input, password);
        const decrypted = await decryptStringBrowserAnsibleVault(encrypted, password);
        
        expect(decrypted).toEqual(input);
    });

    it('should handle binary data', async () => {
        const input = new TextEncoder().encode(
            String.fromCharCode(...Array.from({ length: 256 }, (_, i) => i))
        ).toString();
        const password = 'test password';
        const encrypted = await encryptStringBrowserAnsibleVault(input, password);
        const decrypted = await decryptStringBrowserAnsibleVault(encrypted, password);
        
        expect(decrypted).toEqual(input);
    });

    it('should handle JSON data', async () => {
        const input = JSON.stringify({ key: 'value', array: [1, 2, 3] });
        const password = 'test password';
        const encrypted = await encryptStringBrowserAnsibleVault(input, password);
        console.log("encrypted :", encrypted);
        const decrypted = await decryptStringBrowserAnsibleVault(encrypted, password);
        console.log("decrypted :", decrypted);
        expect(decrypted).toEqual(input);
        expect(JSON.parse(decrypted)).toEqual(JSON.parse(input));
    });
}); 