import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Important for Electron to load assets correctly
  css: {
    preprocessorOptions: {
      scss: {
        // Use the modern-compiler API: faster + lower-memory than the legacy
        // JS render path, and eliminates the legacy-js-api deprecation.
        api: 'modern-compiler',
        // The remaining deprecations originate from Bootstrap's own shipped
        // SCSS (node_modules/bootstrap/scss/*.scss) which we cannot edit.
        // Silence them so `npm run dev` and builds stay clean.
        silenceDeprecations: [
          'legacy-js-api',
          'import',
          'global-builtin',
          'color-functions',
          'if-function',
        ],
      },
    },
  },
  build: {
    outDir: 'dist/renderer',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          bootstrap: ['bootstrap', 'react-bootstrap'],
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
