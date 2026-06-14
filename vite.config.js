import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: '/',  // <--- غير هذا السطر إلى '/' فقط

  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },

  server: {
    host: true,
    port: 5173,
    historyApiFallback: true,
  },

  build: {
    outDir: 'dist',
    sourcemap: true
  },
});