import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
    plugins: [
        react()
    ],
    // Worker のビルド設定を「インライン」に強制
    worker: {
        format: 'es',
        plugins: () => [react()], // 必要に応じて
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '../view'),
            'monaco-editor': path.resolve(__dirname, '../node_modules/monaco-editor')
        },
    },

    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            output: {
                manualChunks: undefined,
                inlineDynamicImports: true,
                entryFileNames: 'assets/main.js',
                chunkFileNames: 'assets/[name].js',
                assetFileNames: 'assets/[name][extname]',
            },
        },
        commonjsOptions: {
            transformMixedEsModules: true // CJS/ESM混在環境での解決を助ける
        }
    },
    base: './',
})
