const { defineConfig } = require('vite');
const pkg = require('./package.json');

// https://vitejs.dev/config
module.exports = defineConfig({
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
