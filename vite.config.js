import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
            // Group all node_modules into a single vendor chunk
            return 'vendor';
          }
        },
      },
    },
  },
  server: {
    port: 3000, // Match the port in the Electron main process
  },
});
