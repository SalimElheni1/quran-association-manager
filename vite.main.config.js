import { defineConfig } from 'vite';
import pkg from './package.json';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        'sqlite3',
        '@journeyapps/sqlcipher',
        ...Object.keys(pkg.dependencies || {}),
      ],
    },
  },
});
