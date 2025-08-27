import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Important for Electron to load assets correctly
  build: {
    outDir: 'dist/renderer', // Output to a 'renderer' subdirectory in 'dist'
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('exceljs')) {
              return 'exceljs';
            }
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react';
            }
            // All other node_modules into a vendor chunk
            return 'vendor';
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@renderer': path.resolve(__dirname, './src/renderer'),
      '@main': path.resolve(__dirname, './src/main'),
      '@db': path.resolve(__dirname, './src/db'),
    },
  },
  server: {
    port: 3000, // Match the port in the Electron main process
  },
});
