import { extendKey, generateHMAC, getCharacterRange } from "../decrypt/decryptVigenere.js";

/**
 * Encrypts text using Vigenère cipher with support for multiple character ranges.
 * @param text - Plain text (case is preserved).
 * @param key - Key (letters only, case insensitive).
 * @returns Encrypted text with HMAC for integrity verification.
 */
export const encryptVigenere = (text: string, key: string): string => {
    if (!text || text.length === 0) return text;

    if (!key) throw new Error("Secret key must not be empty");
    if (typeof text !== "string" || typeof key !== "string") {
        throw new Error("Text and key must be strings");
    }

    // Clean key: keep only letters and convert to uppercase
    const cleanedKey = key.toUpperCase().replace(/[^A-Z]/g, "");
    if (!cleanedKey) throw new Error("Key must contain at least one letter");

    // Generate pseudorandom key if it's too short
    const extendedKey = extendKey(cleanedKey, text.length);
    let result = "";
    let keyIndex = 0;

    for (let i = 0; i < text.length; i++) {
        const char: string = text[i] as string;
        const codePoint = char.codePointAt(0);
        if (codePoint === undefined) throw new Error("Invalid character in text");

        // Определяем диапазон символа
        const range = getCharacterRange(char as string);
        if (range) {
            const { offset, alphabetSize } = range;
            const keyChar: string = extendedKey[keyIndex] as string;
            const shift = keyChar.charCodeAt(0) - 65; // A=0, B=1, ..., Z=25

            // Шифруем символ
            const encryptedCharCode =
                ((codePoint - offset + shift) % alphabetSize) + offset;
            // console.log(char,"encryptedCharCode", encryptedCharCode, "keyChar", String.fromCodePoint(encryptedCharCode), "original", codePoint, "shift", shift, "offset", offset, "alphabetSize", alphabetSize)
            result += String.fromCodePoint(encryptedCharCode);
            keyIndex++;
        } else {
            // Не-буквы остаются без изменений
            result += char;
        }
    }

    // Добавляем HMAC для проверки целостности
    const hmac = generateHMAC(result, key);
    return `${result}|${hmac}`;
};