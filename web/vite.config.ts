import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../src/shared'),
    },
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss({
          content: [
            path.resolve(__dirname, './index.html'),
            path.resolve(__dirname, './src/**/*.{ts,tsx}'),
          ],
        }),
        autoprefixer(),
      ],
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5174',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
