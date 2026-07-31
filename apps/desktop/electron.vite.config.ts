import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const workspace = (name: string) => resolve(__dirname, '../../packages', name, 'src/index.ts')

const workspaceAliases = {
  '@documind/shared': workspace('shared'),
  '@documind/domain': workspace('domain'),
  '@documind/core': workspace('core'),
  '@documind/ai': workspace('ai'),
  '@documind/ocr': workspace('ocr'),
  '@documind/document': workspace('document'),
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: workspaceAliases },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'tesseract-worker': resolve(__dirname, '../../packages/ocr/src/engine/tesseract-worker.ts'),
        },
        output: {
          inlineDynamicImports: false,
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: workspaceAliases },
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        ...workspaceAliases,
      },
    },
    plugins: [react()],
  },
})
