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
    sourcemap: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // تقسيم المكتبات الثقيلة إلى حِزم منفصلة تُحمَّل عند الحاجة فقط
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['echarts', 'echarts-for-react'],
          'vendor-motion': ['framer-motion'],
          'vendor-icons': ['react-icons'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
});