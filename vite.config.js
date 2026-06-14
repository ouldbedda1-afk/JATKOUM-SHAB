import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// تحديد المسار الأساسي حسب بيئة النشر
const base = process.env.VERCEL ? '/' : '/JATKOUM-SHAB/';

export default defineConfig({
  base: base,

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