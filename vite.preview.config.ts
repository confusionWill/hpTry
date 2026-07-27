import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('./preview', import.meta.url)),
  server: {
    host: '127.0.0.1',
    port: 5112,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 5112,
    strictPort: true,
  },
  build: {
    outDir: fileURLToPath(new URL('./dist-preview', import.meta.url)),
    emptyOutDir: true,
  },
})
