

import { extendKey, generateHMAC, getCharacterRange } from "../decrypt/decryptVigenere.js";

/**
 * Шифрует текст с использованием шифра Виженера с поддержкой нескольких диапазонов символов.
 * @param text - Открытый текст (регистр сохраняется).
 * @param key - Ключ (только буквы, регистр неважен).
 * @returns Зашифрованный текст с HMAC для проверки целостности.
 */
export const encryptVigenere = (text: string, key: string): string => {
    if (!text || text.length === 0) return text;

    if (!key) throw new Error("secret key must not be empty");
    if (typeof text !== "string" || typeof key !== "string") {
        throw new Error("text and key must be strings");
    }

    // Очистка ключа: оставляем только буквы и преобразуем в верхний регистр
    const cleanedKey = key.toUpperCase().replace(/[^A-Z]/g, "");
    if (!cleanedKey) throw new Error("Key must contain at least one letter");

    // Генерация псевдослучайного ключа, если он слишком короткий
    const extendedKey = extendKey(cleanedKey, text.length);
    // console.log("encryption", extendedKey)
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