import { defineConfig } from 'vite';
import path from 'path';
import { builtinModules } from 'node:module';

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@renderer': path.resolve(__dirname, './src/renderer'),
      '@main': path.resolve(__dirname, './src/main'),
      '@db': path.resolve(__dirname, './src/db'),
    },
  },
  build: {
    rollupOptions: {
      external: [
        'electron',
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
        '@journeyapps/sqlcipher',
      ],
    },
  },
});
