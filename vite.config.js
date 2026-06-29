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
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    minify: 'terser',
    terserOptions: {
      compress: { drop_console: true, drop_debugger: true, passes: 2 },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('echarts')) return 'vendor-charts';
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('react-icons')) return 'vendor-icons';
          if (id.includes('react-dom') || id.includes('react-router') || id.includes('node_modules/react/')) return 'vendor-react';
          // مكونات ثقيلة → chunks منفصلة تُحمَّل عند الطلب فقط
          if (id.includes('FloatingAIAgent')) return 'comp-ai';
          if (id.includes('CloudTracker'))   return 'comp-cloud';
          if (id.includes('WeatherAlerts') || id.includes('forecastToNews') || id.includes('convection')) return 'comp-alerts';
          if (id.includes('weatherApi'))     return 'weather-api';
        },
      },
    },
  },
});