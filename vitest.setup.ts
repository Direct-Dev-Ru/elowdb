// import { Crypto } from '@peculiar/webcrypto';

// Set up Web Crypto API
// global.crypto = new Crypto();

// Mock TextEncoder and TextDecoder
// global.TextEncoder = class {
//     readonly encoding = 'utf-8';
//     encode(str: string): Uint8Array {
//         const buf = new ArrayBuffer(str.length * 2);
//         const bufView = new Uint16Array(buf);
//         for (let i = 0; i < str.length; i++) {
//             bufView[i] = str.charCodeAt(i);
//         }
//         return new Uint8Array(bufView);
//     }
//     encodeInto(source: string, destination: Uint8Array): { read: number; written: number } {
//         const encoded = this.encode(source);
//         destination.set(encoded);
//         return { read: source.length, written: encoded.length };
//     }
// };

// global.TextDecoder = class {
//     readonly encoding = 'utf-8';
//     readonly fatal = false;
//     readonly ignoreBOM = false;
//     decode(buffer: ArrayBuffer | Uint8Array): string {
//         const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
//         return String.fromCharCode.apply(null, Array.from(view));
//     }
// }; 