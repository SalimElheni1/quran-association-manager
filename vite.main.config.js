const { defineConfig } = require('vite');
const pkg = require('./package.json');

// https://vitejs.dev/config
module.exports = defineConfig({
  build: {
    lib: {
      formats: ['cjs'],
    },
    rollupOptions: {
      external: [
        'sqlite3',
        '@journeyapps/sqlcipher',
        ...Object.keys(pkg.dependencies || {}),
      ],
    },
  },
});
