import { WebStorage } from './WebStorage.js'

class cookieStorage implements Storage {

    getItem(key: string): string | null {
        const cookie = document.cookie
            .split('; ')
            .find(row => row.startsWith(`${key}=`));
        return cookie ? decodeURIComponent(cookie.split('=')[1] || '') : null;
    }

    setItem(key: string, value: string): void {
        document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; path=/`;
    }

    removeItem(key: string): void {
        document.cookie = `${encodeURIComponent(key)}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }

    clear(): void {
        document.cookie.split('; ').forEach(cookie => {
            const key = cookie.split('=')[0];
            this.removeItem(key || '');
        });
    }

    get length(): number {
        return document.cookie.split('; ').length;
    }

    key(index: number): string | null {
        const keys = document.cookie.split('; ').map(cookie => cookie.split('=')[0]);
        return keys[index] || null;
    }
}

export class CookieStorage<T> extends WebStorage<T> {
    constructor(key: string, options: {
        parse?: (str: string) => T
        stringify?: (data: T) => string
        _cypherKey?: string
        decrypt?: (encryptedText: string) => Promise<string | { error: string }>
        encrypt?: (
            secretkey: string,
            text: string,
        ) => Promise<string | { error: string }>
    } = {}) {
        super(key, new cookieStorage(), options)
    }
}

export default CookieStorage;