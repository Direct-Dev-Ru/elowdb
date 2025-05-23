import { defineConfig } from 'vitest/config'

// Common configuration for both environments
export const commonConfig = {
    globals: true,
    coverage: {
        provider: 'v8' as const,
        reporter: ['text', 'json', 'html'],
        exclude: [
            'node_modules/**',
            'dist/**',
            '**/*.test.{js,ts,jsx,tsx}',
            '**/*.spec.{js,ts,jsx,tsx}',
        ],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    isolate: true,
    env: {
        NODE_ENV: 'test',
    },
}

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.vi.test.ts'],
        exclude: ['node_modules', 'dist'],
        testTimeout: 100000,
    },
})
