// Builds the browser app: the desktop renderer (src/renderer) with window.electronAPI provided
// by client/src/electronRenderer.js, plus the platform console, the invitation page and the
// home page. Output: web/dist, served by the web server.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// src/main/preload.js is the single list of the desktop API; it is bundled unchanged except for
// where contextBridge and ipcRenderer come from.
const preloadForBrowser = {
  name: 'qam-preload-for-browser',
  enforce: 'pre',
  transform(code, id) {
    if (!id.replace(/\\/g, '/').endsWith('/src/main/preload.js')) return null;
    const replaced = code.replace(
      "const { contextBridge, ipcRenderer } = require('electron');",
      "import { contextBridge, ipcRenderer } from '@web/electronRenderer';",
    );
    if (replaced === code)
      throw new Error('preload.js no longer requires electron the expected way.');
    return { code: replaced, map: null };
  },
};

export default defineConfig({
  root: path.join(here, 'client'),
  publicDir: path.join(root, 'public'),
  base: '/',
  plugins: [preloadForBrowser, react()],
  define: { __QAM_WEB__: 'true' },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
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
    outDir: path.join(here, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
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
      '@': path.join(root, 'src'),
      '@renderer': path.join(root, 'src', 'renderer'),
      '@main': path.join(root, 'src', 'main'),
      '@db': path.join(root, 'src', 'db'),
      '@web': path.join(here, 'client', 'src'),
    },
  },
  server: {
    port: 5173,
    fs: { allow: [root] },
    proxy: { '/api': 'http://localhost:8080' },
  },
});
