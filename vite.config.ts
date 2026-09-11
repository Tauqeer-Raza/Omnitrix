import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  css: { postcss: { plugins: [tailwindcss()] } },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target:
          loadEnv(mode, process.cwd(), '').BACKEND_PROXY_URL ||
          'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: { chunkSizeWarningLimit: 800 },
}));
