import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@documind/shared': resolve(import.meta.dirname, 'packages/shared/src/index.ts'),
      '@documind/domain': resolve(import.meta.dirname, 'packages/domain/src/index.ts'),
      '@documind/core': resolve(import.meta.dirname, 'packages/core/src/index.ts'),
      '@documind/ai': resolve(import.meta.dirname, 'packages/ai/src/index.ts'),
      '@documind/ocr': resolve(import.meta.dirname, 'packages/ocr/src/index.ts'),
      '@documind/document': resolve(import.meta.dirname, 'packages/document/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/*.test.ts'],
    environment: 'node',
    pool: 'threads',
    coverage: {
      provider: 'v8',
      include: [
        'packages/domain/src/**',
        'packages/core/src/**',
        'packages/ai/src/**',
        'packages/ocr/src/**',
      ],
      exclude: [
        '**/index.ts',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/workers/**',
        '**/test/**',
        'packages/ocr/src/**',
      ],
      thresholds: { lines: 85, functions: 85, branches: 75, statements: 85 },
    },
  },
})
