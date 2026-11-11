/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5210',
        changeOrigin: true,
      },
      '/hubs': {
        target: 'http://localhost:5210',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: '../KizTavlasi.Api/wwwroot',
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        // Uzun ömürlü vendor parçaları: uygulama kodu değiştiğinde tarayıcı önbelleği korunur.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/, priority: 30 },
            { name: 'motion', test: /node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/, priority: 20 },
            { name: 'signalr', test: /node_modules[\\/]@microsoft[\\/]signalr[\\/]/, priority: 20 },
            { name: 'vendor', test: /node_modules[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
