import crypto from "crypto";



/**
 * Decrypts text encrypted with Vigenère cipher.
 * @param encryptedTextWithHMAC - Encrypted text with HMAC.
 * @param key - Key (letters only, case insensitive).
 * @returns Decrypted text.
 */
export const decryptVigenere = (encryptedTextWithHMAC: string, key: string): string => {
  if (encryptedTextWithHMAC === '') return encryptedTextWithHMAC;

  if (!key) throw new Error("Decryption key must not be empty");
  if (!encryptedTextWithHMAC || typeof encryptedTextWithHMAC !== "string" || typeof key !== "string") {
    throw new Error("Text and decryption key must be strings");
  }

  // Split text and HMAC
  const [encryptedText, hmac] = encryptedTextWithHMAC.split("|");
  if (!encryptedText || !hmac) throw new Error("Invalid encrypted text format");

  // Verify HMAC
  const isValid = verifyHMAC(encryptedText, key, hmac);
  if (!isValid) throw new Error("Integrity check failed");

  // Clean key: keep only letters and convert to uppercase
  const cleanedKey = key.toUpperCase().replace(/[^A-Z]/g, "");
  if (!cleanedKey) throw new Error("Key must contain at least one letter");

  // Generate extended key
  const extendedKey = extendKey(cleanedKey, encryptedText.length);
  // console.log("decryption", extendedKey)
  let result = "";
  let keyIndex = 0;

  for (let i = 0; i < encryptedText.length; i++) {
    const char: string = encryptedText[i] as string;
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) throw new Error("Invalid character in text");

    // Определяем диапазон символа
    const range = getCharacterRange(char as string);
    if (range) {
      const { offset, alphabetSize } = range;
      const keyChar: string = extendedKey[keyIndex] as string;
      const shift = keyChar.charCodeAt(0) - 65; // A=0, B=1, ..., Z=25

      // Дешифруем символ
      const decryptedCharCode =
        ((codePoint - offset - shift + alphabetSize) % alphabetSize) + offset;
        // console.log(char, "decryptedCharCode", decryptedCharCode, "keyChar", String.fromCodePoint(decryptedCharCode), "original", codePoint, "shift", shift, "offset", offset, "alphabetSize", alphabetSize)
      result += String.fromCodePoint(decryptedCharCode);
      keyIndex++;
    } else {
      // Не-буквы остаются без изменений
      result += char;
    }
  }

  return result;
};

/**
 * Определяет диапазон символа.
 * @param char - Символ.
 * @returns Объект с `offset` и `alphabetSize`, если символ принадлежит известному диапазону, иначе `null`.
 */
export const getCharacterRange = (char: string): { offset: number; alphabetSize: number } | null => {
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return null;

  // Общий диапазон букв
  if (codePoint >= 48 && codePoint <= 1103) {
    return { offset: 48, alphabetSize: 1056 }; 
  }

  // // Латинские буквы
  // if (codePoint >= 65 && codePoint <= 90) {
  //   return { offset: 65, alphabetSize: 26 }; // A-Z
  // }
  // if (codePoint >= 97 && codePoint <= 122) {
  //   return { offset: 97, alphabetSize: 26 }; // a-z
  // }

  // // Кириллица
  // if (codePoint >= 1040 && codePoint <= 1071) {
  //   return { offset: 1040, alphabetSize: 32 }; // А-Я
  // }
  // if (codePoint >= 1072 && codePoint <= 1103) {
  //   return { offset: 1072, alphabetSize: 32 }; // а-я
  // }

  // // Цифры
  // if (codePoint >= 48 && codePoint <= 57) {
  //   return { offset: 48, alphabetSize: 10 }; // 0-9
  // }

  // // Греческие буквы (пример)
  // if (codePoint >= 913 && codePoint <= 937) {
  //   return { offset: 913, alphabetSize: 25 }; // Α-Ω
  // }
  // if (codePoint >= 945 && codePoint <= 969) {
  //   return { offset: 945, alphabetSize: 25 }; // α-ω
  // }

  // Другие диапазоны можно добавить здесь
  return null;
};

/**
 * Генерирует HMAC для проверки целостности.
 * @param text - Текст для хеширования.
 * @param key - Ключ для HMAC.
 * @returns HMAC в виде строки.
 */
export const generateHMAC = (text: string, key: string): string => {
  const hmac = crypto.createHmac("sha256", key);
  hmac.update(text);
  return hmac.digest("hex");
};

/**
 * Проверяет HMAC для текста.
 * @param text - Текст для проверки.
 * @param key - Ключ для HMAC.
 * @param hmac - HMAC для сравнения.
 * @returns true, если HMAC совпадает, иначе false.
 */
export const verifyHMAC = (text: string, key: string, hmac: string): boolean => {
  const generatedHMAC = generateHMAC(text, key);
  return crypto.timingSafeEqual(
    Buffer.from(generatedHMAC),
    Buffer.from(hmac)
  );
};

/**
 * Расширяет ключ до нужной длины.
 * @param key - Исходный ключ.
 * @param length - Требуемая длина.
 * @returns Расширенный ключ.
 */
export const extendKey = (key: string, length: number): string => {
  if (key.length >= length) return key.slice(0, length);

  let extendedKey = key;
  while (extendedKey.length < length) {
    extendedKey += key;
  }
  return extendedKey.slice(0, length);
};