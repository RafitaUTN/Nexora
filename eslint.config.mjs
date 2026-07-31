import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'

const nodeGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  fetch: 'readonly',
  URL: 'readonly',
  crypto: 'readonly',
  TextDecoder: 'readonly',
  TextEncoder: 'readonly',
  performance: 'readonly',
  globalThis: 'readonly',
  MessagePort: 'readonly',
  Worker: 'readonly',
  SharedArrayBuffer: 'readonly',
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  queueMicrotask: 'readonly',
  structuredClone: 'readonly',
}

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/out/**', '**/coverage/**', '**/.git/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      globals: nodeGlobals,
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-undef': 'off',
      'no-redeclare': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  {
    files: ['packages/domain/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@documind/core', '@documind/ai', '@documind/ocr', '@documind/document'],
              message:
                'La capa de dominio no puede importar infraestructura. Usa solo @documind/shared.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.{tsx,jsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['apps/desktop/src/renderer/src/main.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  prettier,
]
