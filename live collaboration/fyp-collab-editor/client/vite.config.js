import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  build: {
    outDir: '../server/dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'index.html'
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
})
