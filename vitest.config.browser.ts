import { defineConfig } from 'vitest/config';

const commonConfig = {
    globals: true,
    coverage: {
        provider: 'v8' as const,
        reporter: ['text', 'json', 'html'],
        exclude: [
            'node_modules/**',
            'dist/**',
            '**/*.test.{js,ts,jsx,tsx}',
            '**/*.spec.{js,ts,jsx,tsx}'
        ]
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    isolate: true,
    env: {
        NODE_ENV: 'test'
    }
};
// Browser specific configuration
const browserConfig = defineConfig({
    test: {
        ...commonConfig,
        name: 'browser',
        include: ['**/*.spec.{js,ts,jsx,tsx}'],
        exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.{js,ts,jsx,tsx}'],
        environment: 'jsdom',
        browser: {
            provider: 'playwright',
            enabled: true,
            name: 'chromium',
            headless: true
        },
        setupFiles: ['./vitest.setup.ts']
    }
});


export default browserConfig; 