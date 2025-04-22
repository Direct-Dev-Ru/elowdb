
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

// Node.js specific configuration
export const nodeConfig = defineConfig({
    test: {
        ...commonConfig,
        name: 'node',
        include: ['**/*.test.{js,ts,jsx,tsx}'],
        exclude: ['**/node_modules/**', '**/dist/**', '**/*.spec.{js,ts,jsx,tsx}'],
        environment: 'node'
    }
});



export default nodeConfig; 